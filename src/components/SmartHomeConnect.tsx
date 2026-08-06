import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Zap, Cpu, Lightbulb, Wifi, ShieldCheck, RefreshCw, AlertCircle, Power, Lock,
  Play, Folder, Copy, Check, Plus, Trash2, ExternalLink, Home, Unlink, Sun, Palette,
  CheckCircle2, Settings, EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SmartRoutine } from '../types';
import {
  RecursosDoAparelho,
  brilhoEmPorcento,
  descreverComandos,
  ehFechadura,
  montarComandos,
  recursosDosDps
} from '../lib/tuyaDispositivos';

/**
 * PAINEL DO OSONE HOME — só aparelhos que existem de verdade.
 *
 * Este painel já foi um simulador com cara de painel real. Ele vinha com cinco aparelhos
 * inventados (inclusive uma "Fechadura Biométrica"), credenciais falsas de aparência plausível
 * gravadas no código (`secret_tuya_live_771`, um IP de bridge Hue, um token de usuário), botões de
 * vincular conta que esperavam 1,8s e anunciavam "conta vinculada e autorizada via OAuth", e um
 * rodapé escrito "Nuvem Sincronizada" piscando em verde sobre aparelhos que nunca chegaram perto
 * de nuvem nenhuma. Mexer num interruptor só pintava a tela.
 *
 * Nada disso existe mais. O que este painel mostra é o que a conta Tuya do usuário devolve, com o
 * estado lido do próprio aparelho; os controles mandam comandos de verdade; e quando a Tuya não
 * está configurada o painel diz isso e explica o que fazer, em vez de encher a tela de lâmpadas
 * que não existem.
 *
 * Philips Hue e SmartThings saíram junto: nunca houve backend para nenhum dos dois — os cartões
 * apenas gravavam um booleano e diziam "conectado com sucesso".
 *
 * A aba do Google Home entrou depois, pelo mesmo motivo que este painel existe: a ponte para o
 * Assistente já funcionava no servidor há tempo, mas não tinha onde ser vista. Quem preenchia as
 * credenciais em Configurações não tinha como saber se a conta chegou a ser vinculada, quais
 * aparelhos o Assistente ia enxergar, nem por que um deles não aparecia — três coisas que agora
 * são respondidas na tela, com dado lido do servidor.
 */

interface AparelhoReal {
  id: string;
  name: string;
  category: string;
  online: boolean;
  recursos: RecursosDoAparelho;
}

type EstadoDaConexao = 'carregando' | 'sem-credenciais' | 'erro' | 'pronto';

/** Como cada recurso que vai para o Google se chama para quem lê a tela. */
const NOME_DO_RECURSO: Record<string, { rotulo: string; icone: React.ReactNode }> = {
  OnOff: { rotulo: 'liga/desliga', icone: <Power size={11} /> },
  Brightness: { rotulo: 'brilho', icone: <Sun size={11} /> },
  ColorSetting: { rotulo: 'cor', icone: <Palette size={11} /> }
};

/**
 * Classes escritas por inteiro, e não montadas com `bg-${cor}-500`: o Tailwind lê o código como
 * texto para saber quais classes gerar, e a versão montada em tempo de execução nunca chega ao
 * CSS — o cartão sairia sem cor nenhuma justamente no estado que precisa chamar atenção.
 */
const ESTILO_DO_ESTADO = {
  pronto: { caixa: 'border-emerald-500/30', selo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icone: 'text-emerald-400' },
  atencao: { caixa: 'border-amber-500/30', selo: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icone: 'text-amber-400' },
  espera: { caixa: 'border-sky-500/30', selo: 'bg-sky-500/15 text-sky-300 border-sky-500/30', icone: 'text-sky-400' },
  falha: { caixa: 'border-red-500/30', selo: 'bg-red-500/15 text-red-300 border-red-500/30', icone: 'text-red-400' }
} as const;

/** Em que pé a ponte com o Google está, para a tela escolher o tom da resposta. */
function estadoDoGoogle(diagnostico: any): keyof typeof ESTILO_DO_ESTADO {
  if (diagnostico?.ok) return 'pronto';
  if (diagnostico?.etapa === 'vinculo') return 'espera';
  if (['tuya', 'rede', 'interno'].includes(diagnostico?.etapa)) return 'falha';
  return 'atencao';
}

export const SmartHomeConnect: React.FC<{
  onClose?: () => void;
  onNotification?: (msg: string, type: 'info' | 'success' | 'error') => void;
  /** Leva direto aos campos de credencial. Sem isto, a tela diz o que falta e não diz onde. */
  onOpenSettings?: () => void;
}> = ({ onClose, onNotification, onOpenSettings }) => {
  const [activeTab, setActiveTab] = useState<'devices' | 'routines' | 'google' | 'pc_organizer'>('devices');
  const [estado, setEstado] = useState<EstadoDaConexao>('carregando');
  const [erro, setErro] = useState<string>('');
  const [comoResolver, setComoResolver] = useState<string>('');
  const [devices, setDevices] = useState<AparelhoReal[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

  const [routines, setRoutines] = useState<SmartRoutine[]>(() => {
    try {
      const saved = localStorage.getItem('osone_smarthome_routines');
      // As rotinas de fábrica apontavam para os aparelhos inventados ('dev-1'...'dev-5'). Guardadas
      // no navegador de quem já abriu o painel, elas sobreviveriam à remoção e continuariam
      // aparecendo como cenas prontas que não comandam nada. Por isso são descartadas na leitura.
      const lidas = saved ? JSON.parse(saved) : [];
      return Array.isArray(lidas) ? lidas.filter((r: any) => !/^rot-[123]$/.test(r?.id)) : [];
    } catch { return []; }
  });
  const [novaRotina, setNovaRotina] = useState<string>('');

  useEffect(() => {
    try {
      localStorage.setItem('osone_smarthome_routines', JSON.stringify(routines));
    } catch { /* sem espaço no navegador: as rotinas seguem valendo nesta sessão */ }
  }, [routines]);

  /**
   * Carrega os aparelhos da conta e, de cada um, o estado real.
   *
   * O estado vem do aparelho, e não de uma cópia guardada aqui: um interruptor apertado na parede
   * ou pelo app Smart Life precisa aparecer certo quando o painel abre.
   */
  const carregar = useCallback(async () => {
    setEstado('carregando');
    try {
      const statusRes = await fetch('/api/tuya/status');
      const statusData = await statusRes.json().catch(() => null);
      if (!statusData?.configured) {
        setEstado('sem-credenciais');
        return;
      }

      const res = await fetch('/api/tuya/devices');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error || 'A Tuya recusou a conexão.');
        // O diagnóstico já existe no servidor e diz, em português, o que fazer — é bem melhor
        // do que repetir na tela o código de erro cru que a Tuya devolve.
        const diag = await fetch('/api/tuya/diagnostico').then(r => r.json()).catch(() => null);
        setComoResolver(diag?.comoResolver || '');
        setEstado('erro');
        return;
      }

      const lista: any[] = data?.devices || [];
      const comEstado = await Promise.all(lista.map(async (d: any) => {
        // A lista de aparelhos da Tuya já costuma trazer os pontos de dados; quando não traz,
        // vale a consulta por aparelho. Assim o caso comum custa uma chamada só.
        let dps: any[] = Array.isArray(d.status) ? d.status : [];
        if (dps.length === 0) {
          const st = await fetch(`/api/tuya/device/${encodeURIComponent(d.id)}/status`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
          dps = Array.isArray(st?.status) ? st.status : [];
        }
        return {
          id: d.id,
          name: d.name || d.id,
          category: d.category || '',
          online: d.online !== false,
          recursos: recursosDosDps(dps)
        } as AparelhoReal;
      }));

      setDevices(comEstado);
      setEstado('pronto');
    } catch (e: any) {
      setErro(e?.message || String(e));
      setEstado('erro');
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  /**
   * Manda um comando de verdade e só então atualiza a tela.
   *
   * A ordem importa: pintar o botão primeiro e mandar depois é o que fazia o painel antigo
   * parecer que funcionava. Se o aparelho recusar, o botão não pode ter mudado.
   */
  const comandar = async (dev: AparelhoReal, action: string, value?: any, color?: any) => {
    const montagem = montarComandos(dev.recursos, action, value, color);
    if ('falha' in montagem) {
      onNotification?.(`${dev.name}: ${montagem.falha}`, 'error');
      return;
    }

    // Fechadura não é acionada por um toque no painel: a confirmação explícita vive no fluxo do
    // chat (TuyaConfirmModal), que é onde a ação passa por uma pergunta antes de acontecer.
    if (ehFechadura(dev.category)) {
      onNotification?.(
        `${dev.name} é uma fechadura. Por segurança, peça a ação no chat do OSONE, onde ela passa por uma confirmação explícita.`,
        'info'
      );
      return;
    }

    setOcupado(dev.id);
    try {
      const res = await fetch('/api/tuya/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: dev.id, commands: montagem.comandos, confirmed: false })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onNotification?.(`${dev.name}: ${data?.error || res.statusText}`, 'error');
        return;
      }
      onNotification?.(`${dev.name}: ${descreverComandos(montagem.comandos)}.`, 'success');
      // Relê o estado do aparelho em vez de deduzi-lo: é o aparelho que tem a palavra final.
      const st = await fetch(`/api/tuya/device/${encodeURIComponent(dev.id)}/status`)
        .then(r => r.ok ? r.json() : null).catch(() => null);
      if (Array.isArray(st?.status)) {
        const recursos = recursosDosDps(st.status);
        setDevices(prev => prev.map(d => d.id === dev.id ? { ...d, recursos } : d));
      }
    } catch (e: any) {
      onNotification?.(`${dev.name}: falha de conexão (${e?.message || e}).`, 'error');
    } finally {
      setOcupado(null);
    }
  };

  const criarRotina = () => {
    const nome = novaRotina.trim();
    if (!nome) return;
    // A rotina guarda o estado ATUAL dos aparelhos reais — é uma foto do que está ligado agora.
    const acoes = devices
      .filter(d => d.recursos.liga)
      .map(d => ({ deviceId: d.id, targetState: !!d.recursos.liga?.ligado }));
    if (acoes.length === 0) {
      onNotification?.('Nenhum aparelho com liga/desliga para guardar numa cena.', 'error');
      return;
    }
    setRoutines(prev => [...prev, { id: 'rot-' + Date.now(), name: nome, icon: '✨', actions: acoes }]);
    setNovaRotina('');
    onNotification?.(`Cena "${nome}" guardada com o estado atual de ${acoes.length} aparelho(s).`, 'success');
  };

  const executarRotina = async (rot: SmartRoutine) => {
    let feitos = 0;
    const falhas: string[] = [];
    for (const acao of rot.actions) {
      const dev = devices.find(d => d.id === acao.deviceId);
      if (!dev) { falhas.push('um aparelho da cena não está mais na conta'); continue; }
      if (ehFechadura(dev.category)) { falhas.push(`${dev.name} é fechadura e não entra em cena automática`); continue; }
      const montagem = montarComandos(dev.recursos, acao.targetState ? 'turn_on' : 'turn_off');
      if ('falha' in montagem) { falhas.push(`${dev.name}: ${montagem.falha}`); continue; }
      const res = await fetch('/api/tuya/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: dev.id, commands: montagem.comandos, confirmed: false })
      }).catch(() => null);
      if (res && res.ok) feitos++;
      else falhas.push(`${dev.name} não aceitou o comando`);
    }
    // O relatório conta o que aconteceu de fato. Antes, qualquer rotina respondia "executada com
    // sucesso" sem nunca ter falado com aparelho nenhum.
    onNotification?.(
      falhas.length === 0
        ? `Cena "${rot.name}": ${feitos} aparelho(s) ajustado(s).`
        : `Cena "${rot.name}": ${feitos} ajustado(s), ${falhas.length} com problema — ${falhas.join('; ')}.`,
      falhas.length === 0 ? 'success' : 'error'
    );
    carregar();
  };

  // ==========================================================================================
  // GOOGLE HOME — o mesmo levantamento que o servidor entrega ao Assistente, mostrado na tela.
  // ==========================================================================================
  const [google, setGoogle] = useState<any>(null);
  const [googleCarregando, setGoogleCarregando] = useState(false);
  const [confirmandoDesvinculo, setConfirmandoDesvinculo] = useState(false);
  const [urlCopiada, setUrlCopiada] = useState<string>('');

  const carregarGoogle = useCallback(async () => {
    setGoogleCarregando(true);
    try {
      const res = await fetch('/api/google-home/diagnostico');
      const data = await res.json().catch(() => null);
      setGoogle(data || { ok: false, etapa: 'interno', resumo: 'O servidor respondeu algo que não dá para ler.' });
    } catch (e: any) {
      setGoogle({ ok: false, etapa: 'rede', resumo: 'Não foi possível falar com o servidor do OSONE.', erroTecnico: String(e?.message || e) });
    } finally {
      setGoogleCarregando(false);
    }
  }, []);

  useEffect(() => { if (activeTab === 'google') carregarGoogle(); }, [activeTab, carregarGoogle]);

  /**
   * As URLs saem do endereço em que o app está sendo aberto AGORA, e não de um valor guardado:
   * é esse endereço que o Google vai ter de alcançar, e digitá-lo à mão é onde o vínculo
   * costuma quebrar.
   */
  const urlsDoGoogle = useMemo(() => {
    const origem = typeof window !== 'undefined' ? window.location.origin : '';
    return [
      { rotulo: 'Authorization URL', valor: `${origem}/api/google-home/authorize` },
      { rotulo: 'Token URL', valor: `${origem}/api/google-home/token` },
      { rotulo: 'Fulfillment URL', valor: `${origem}/api/google-home/fulfillment` }
    ];
  }, []);

  const enderecoAlcancavelPeloGoogle = useMemo(() => {
    if (typeof window === 'undefined') return true;
    const { protocol, hostname } = window.location;
    return protocol === 'https:' && !/^(localhost|127\.|\[?::1)/.test(hostname);
  }, []);

  const copiarUrl = (valor: string) => {
    navigator.clipboard?.writeText(valor);
    setUrlCopiada(valor);
    setTimeout(() => setUrlCopiada(''), 2000);
  };

  const desvincularGoogle = async () => {
    try {
      const res = await fetch('/api/google-home/revoke', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onNotification?.(data?.error || 'Não foi possível desvincular a conta.', 'error');
        return;
      }
      onNotification?.(data?.message || 'Conta do Google desvinculada.', 'success');
      carregarGoogle();
    } catch (e: any) {
      onNotification?.(`Falha ao desvincular: ${e?.message || e}`, 'error');
    } finally {
      setConfirmandoDesvinculo(false);
    }
  };

  const pythonScriptText = `# Script de Organização Automática de Arquivos do PC
# Gerado pelo OSONE Studio para organizar seu computador físico
import os
import shutil
from pathlib import Path

# Defina a pasta que deseja organizar (Exemplo: Downloads ou Documentos)
TARGET_DIR = Path.home() / "Downloads"

CATEGORIES = {
    "Documentos": [".pdf", ".docx", ".doc", ".txt", ".xlsx", ".pptx", ".csv"],
    "Imagens": [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".psd"],
    "Vídeos": [".mp4", ".mkv", ".avi", ".mov"],
    "Áudios": [".mp3", ".wav", ".flac", ".ogg"],
    "Compactados": [".zip", ".rar", ".7z", ".tar", ".gz"],
    "Programas": [".exe", ".msi", ".dmg", ".iso"],
    "Código": [".js", ".py", ".html", ".css", ".json", ".ts"]
}

def organize():
    print(f"Organizando arquivos em: {TARGET_DIR}")
    for item in TARGET_DIR.iterdir():
        if item.is_file():
            ext = item.suffix.lower()
            moved = False
            for category, extensions in CATEGORIES.items():
                if ext in extensions:
                    dest_folder = TARGET_DIR / category
                    dest_folder.mkdir(exist_ok=True)
                    shutil.move(str(item), str(dest_folder / item.name))
                    print(f"Movido: {item.name} -> {category}/")
                    moved = True
                    break
            if not moved and ext:
                dest_folder = TARGET_DIR / "Outros"
                dest_folder.mkdir(exist_ok=True)
                shutil.move(str(item), str(dest_folder / item.name))

if __name__ == "__main__":
    organize()
    print("✓ Organização concluída com sucesso!")`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(pythonScriptText);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const iconeDaCategoria = (cat: string) => {
    const c = (cat || '').toLowerCase();
    if (ehFechadura(c)) return <Lock size={22} />;
    if (c === 'dj' || c === 'dd' || c === 'dc' || c === 'xdd') return <Lightbulb size={22} />;
    if (c === 'cz' || c === 'pc') return <Zap size={22} />;
    if (c === 'wk' || c === 'ktkzq') return <Cpu size={22} />;
    return <Power size={22} />;
  };

  const abas: Array<{ id: typeof activeTab; rotulo: string; icone: React.ReactNode }> = [
    { id: 'devices', rotulo: 'Aparelhos', icone: <Wifi size={14} /> },
    { id: 'routines', rotulo: 'Cenas', icone: <Play size={14} /> },
    { id: 'google', rotulo: 'Google Home', icone: <Home size={14} /> },
    { id: 'pc_organizer', rotulo: 'Organizar PC', icone: <Folder size={14} /> }
  ];

  return (
    <div className="w-full flex-1 flex flex-col bg-[#07090e] text-zinc-100 min-h-0 overflow-hidden font-sans relative">

      {/* Top Bar Header */}
      <div className="h-16 border-b border-white/5 bg-[#0a0d14]/90 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/40">
            <Zap size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              OSONE HOME
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/30 font-normal">
                Tuya / Smart Life
              </span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30 font-normal">
                Google Home
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Aparelhos reais da sua conta Tuya. Controle pelo painel, pelo chat, por voz ou pelo Google Assistente.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-black/50 p-1.5 rounded-2xl border border-white/10">
          {abas.map(aba => (
            <button
              key={aba.id}
              onClick={() => setActiveTab(aba.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all flex items-center gap-2 cursor-pointer",
                activeTab === aba.id ? "bg-cyan-500 text-black" : "text-zinc-400 hover:text-white"
              )}
            >
              {aba.icone}
              <span>{aba.rotulo}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar">

        {/* ABA 1: APARELHOS REAIS */}
        {activeTab === 'devices' && (
          <div className="space-y-6">

            {estado === 'carregando' && (
              <div className="p-10 rounded-3xl bg-[#0c0f18] border border-white/5 flex items-center justify-center gap-3 text-zinc-400 text-sm font-mono">
                <RefreshCw size={16} className="animate-spin" />
                <span>Consultando os aparelhos da sua conta Tuya...</span>
              </div>
            )}

            {/*
              Sem credenciais, a tela DIZ isso. Antes ela se enchia de aparelhos inventados, e o
              usuário não tinha como saber que estava olhando uma demonstração.

              E DIZ POR QUÊ. Esta tela pedia a credencial da Tuya sem nunca explicar o que a Tuya
              é, enquanto a aba do lado falava de Google Home — e a conclusão natural de quem lê
              as duas é que o OSONE fala com o Google, que fala com a Tuya, que fala com as
              lâmpadas. É o contrário: a Tuya é o único caminho até o aparelho, e o Google é uma
              porta a mais, opcional, que ninguém precisa abrir. Quem entendeu ao contrário
              conectou o Google primeiro e ficou sem entender por que o painel continuava vazio.
            */}
            {estado === 'sem-credenciais' && (
              <div className="p-8 rounded-3xl bg-[#0c0e17] border border-amber-500/30 space-y-5 max-w-3xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white font-mono">Falta conectar a conta Tuya</h3>
                    <p className="text-xs text-amber-200/70">É ela que dá ao OSONE acesso aos seus aparelhos.</p>
                  </div>
                </div>

                <p className="text-sm text-zinc-300 leading-relaxed">
                  <strong className="text-white">Tuya</strong> é a nuvem do fabricante das suas lâmpadas e tomadas —
                  a mesma que o app <strong className="text-white">Smart Life</strong> usa no seu celular. É por ela
                  que qualquer coisa liga e desliga, inclusive quando você aperta o botão no próprio app. Sem essa
                  conta, o OSONE não tem por onde alcançar aparelho nenhum, e este painel fica vazio de propósito:
                  aparelho que aparece aqui é aparelho que existe.
                </p>

                {/* O DESENHO DO CAMINHO. Uma linha resolve a confusão que dois parágrafos não
                    resolviam: o Google não está no meio de nada. */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">OSONE</span>
                    <span className="text-zinc-600">→</span>
                    <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/30 font-bold">Tuya</span>
                    <span className="text-zinc-600">→</span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">seus aparelhos</span>
                    <span className="text-[10px] text-zinc-500 ml-1">← este é o caminho, e é o único</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    O <strong className="text-zinc-400">Google Home não entra nessa linha</strong>. Ele é uma porta
                    a mais, opcional, para quando você quiser mandar comando por uma caixinha do Google — e nem
                    assim o OSONE passa por ele: o Google fala com o OSONE, e o OSONE fala com a Tuya. Conectar o
                    Google sem a Tuya não liga nada, porque não existe aparelho do outro lado.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/5 text-xs text-zinc-400 font-mono space-y-1.5">
                  <p className="text-zinc-300 font-bold">Para conectar:</p>
                  <p>1. Crie um projeto em <span className="text-cyan-300">iot.tuya.com</span> (Cloud &gt; Development).</p>
                  <p>2. Copie o <span className="text-cyan-300">Access ID</span> e o <span className="text-cyan-300">Access Secret</span> da aba Overview.</p>
                  <p>3. Vincule o app Smart Life em <span className="text-cyan-300">Devices &gt; Link App Account</span> e copie o UID.</p>
                  {/* Este passo mandava editar o .env.local e reiniciar — arquivo que não existe
                      no app instalado. Os campos estão a um clique daqui. A ressalva da
                      hospedagem vem junto porque lá a tela é outra, e prometer "vale na hora"
                      para quem está na Vercel seria mandar a pessoa procurar um campo que não
                      existe naquele contexto. */}
                  <p>4. Cole os quatro em <span className="text-cyan-300">Configurações &gt; Automação &gt; Tuya</span>.</p>
                  <p className="text-zinc-500 normal-case">
                    No seu computador vale na hora, sem reiniciar. Numa hospedagem (Vercel), a própria tela mostra
                    quais variáveis cadastrar lá.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onOpenSettings && (
                    <button
                      onClick={onOpenSettings}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono transition-all cursor-pointer"
                    >
                      <Settings size={14} />
                      <span>Preencher as credenciais da Tuya</span>
                    </button>
                  )}
                  <a
                    href="https://iot.tuya.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/90 hover:bg-orange-400 text-black font-bold text-xs font-mono transition-all"
                  >
                    <ExternalLink size={14} />
                    <span>Abrir o painel da Tuya</span>
                  </a>
                </div>
              </div>
            )}

            {estado === 'erro' && (
              <div className="p-8 rounded-3xl bg-[#0c0e17] border border-red-500/30 space-y-4 max-w-3xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white font-mono">A Tuya recusou a conexão</h3>
                    <p className="text-xs text-red-200/70 font-mono">{erro}</p>
                  </div>
                </div>
                {comoResolver && (
                  <p className="text-sm text-zinc-300 leading-relaxed p-4 rounded-2xl bg-black/40 border border-white/5">{comoResolver}</p>
                )}
                <button
                  onClick={carregar}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs font-mono transition-all cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>Tentar de novo</span>
                </button>
              </div>
            )}

            {estado === 'pronto' && devices.length === 0 && (
              <div className="p-8 rounded-3xl bg-[#0c0f18] border border-white/5 max-w-3xl space-y-2">
                <h3 className="text-base font-bold text-white font-mono">Conta conectada, nenhum aparelho</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  A conexão com a Tuya funciona, mas esta conta não tem aparelhos. Confirme no app Smart
                  Life que os aparelhos estão na MESMA conta vinculada ao projeto na Tuya.
                </p>
              </div>
            )}

            {estado === 'pronto' && devices.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-4 bg-[#0c0f18] p-4 rounded-3xl border border-white/5">
                  <span className="text-xs font-mono text-zinc-400">
                    <strong className="text-emerald-400">{devices.length}</strong> aparelho(s) reais na sua conta Tuya
                  </span>
                  <button
                    onClick={carregar}
                    className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-mono transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw size={13} />
                    <span>Atualizar estado</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {devices.map(dev => {
                    const ligado = !!dev.recursos.liga?.ligado;
                    const brilho = brilhoEmPorcento(dev.recursos.brilho);
                    const fechadura = ehFechadura(dev.category);
                    return (
                      <div
                        key={dev.id}
                        className={cn(
                          "p-5 rounded-3xl border transition-all relative overflow-hidden flex flex-col justify-between space-y-4",
                          ligado ? "bg-[#0d121f] border-cyan-500/30 shadow-xl shadow-cyan-950/20" : "bg-[#090b10] border-white/5"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "w-11 h-11 rounded-2xl flex items-center justify-center border transition-all shrink-0",
                              ligado ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-white/5 text-zinc-500 border-white/10"
                            )}>
                              {iconeDaCategoria(dev.category)}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white font-mono leading-tight truncate">{dev.name}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border",
                                  dev.online
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                    : "bg-zinc-800 text-zinc-500 border-white/10"
                                )}>
                                  {dev.online ? 'online' : 'offline'}
                                </span>
                                {fechadura && (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/30">
                                    fechadura
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {dev.recursos.liga && !fechadura && (
                            <button
                              onClick={() => comandar(dev, 'toggle')}
                              disabled={ocupado === dev.id}
                              title={ligado ? 'Desligar' : 'Ligar'}
                              className={cn(
                                "w-12 h-7 rounded-full p-1 transition-colors duration-300 relative flex items-center cursor-pointer shrink-0 disabled:opacity-40",
                                ligado ? "bg-cyan-500" : "bg-zinc-800"
                              )}
                            >
                              <motion.div
                                layout
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className={cn("w-5 h-5 rounded-full bg-black shadow-md", ligado ? "ml-auto" : "ml-0")}
                              />
                            </button>
                          )}
                        </div>

                        {/* A barra só existe quando o aparelho TEM brilho, e parte do valor real dele. */}
                        {dev.recursos.brilho && (
                          <div className="space-y-1 pt-2 border-t border-white/5">
                            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                              <span>Brilho:</span>
                              <span className="text-cyan-400 font-bold">{brilho}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              defaultValue={brilho}
                              disabled={ocupado === dev.id}
                              onMouseUp={(e) => comandar(dev, 'set_value', Number((e.target as HTMLInputElement).value))}
                              onTouchEnd={(e) => comandar(dev, 'set_value', Number((e.target as HTMLInputElement).value))}
                              className="w-full accent-cyan-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
                            />
                          </div>
                        )}

                        {/* Idem para a cor: sem luz colorida, não há seletor prometendo o que não dá. */}
                        {dev.recursos.cor && (
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] font-mono text-zinc-400">
                            <span>Cor:</span>
                            <input
                              type="color"
                              disabled={ocupado === dev.id}
                              onChange={(e) => comandar(dev, 'set_color', undefined, e.target.value)}
                              className="w-6 h-6 rounded-lg bg-transparent cursor-pointer border-0"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] font-mono text-zinc-500">
                          <span className="truncate">{dev.category ? `categoria ${dev.category}` : 'sem categoria'}</span>
                          {ocupado === dev.id && <RefreshCw size={11} className="animate-spin text-cyan-400 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ABA 2: CENAS SOBRE APARELHOS REAIS */}
        {activeTab === 'routines' && (
          <div className="space-y-4">
            <div className="p-4 bg-[#0c0f18] rounded-3xl border border-white/5 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white font-mono">Cenas</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Uma cena guarda o estado atual dos seus aparelhos e o repõe depois, com comandos reais.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={novaRotina}
                  onChange={(e) => setNovaRotina(e.target.value)}
                  placeholder="Nome da cena (ex: Boa Noite)..."
                  disabled={estado !== 'pronto'}
                  className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none font-mono disabled:opacity-40"
                />
                <button
                  onClick={criarRotina}
                  disabled={estado !== 'pronto'}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-30"
                >
                  <Plus size={14} />
                  <span>Guardar estado atual</span>
                </button>
              </div>
            </div>

            {routines.length === 0 && (
              <div className="p-8 rounded-3xl bg-[#0a0c14] border border-white/5 text-sm text-zinc-400 leading-relaxed max-w-3xl">
                Nenhuma cena guardada. Deixe os aparelhos como você quer e clique em
                "Guardar estado atual" — a cena passa a repor exatamente essa configuração.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {routines.map(rot => (
                <div key={rot.id} className="p-5 rounded-3xl bg-[#0a0c14] border border-cyan-500/20 hover:border-cyan-500/40 transition-all space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl p-2 rounded-2xl bg-black/40 border border-white/5">{rot.icon}</span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white font-mono truncate">{rot.name}</h4>
                        <span className="text-[10px] font-mono text-cyan-400">{rot.actions.length} aparelho(s)</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setRoutines(prev => prev.filter(r => r.id !== rot.id))}
                      className="text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                      title="Apagar cena"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <button
                    onClick={() => executarRotina(rot)}
                    disabled={estado !== 'pronto'}
                    className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-30"
                  >
                    <Play size={14} />
                    <span>Executar cena</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 3: GOOGLE HOME — a mesma casa, comandada pelo Assistente */}
        {activeTab === 'google' && (
          <div className="space-y-5 max-w-4xl">

            {/*
              ESTA ABA É OPCIONAL, E ISSO PRECISA VIR ANTES DE TUDO.
              Existindo lado a lado com a aba de aparelhos, ela passava a impressão de ser um
              passo do caminho — como se o OSONE falasse com o Google para chegar aos aparelhos.
              Não é: o Google é uma porta de ENTRADA a mais, e a seta aponta para cá.
            */}
            <div className="p-5 rounded-3xl bg-[#0a0c14] border border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold px-2 py-0.5 rounded-lg bg-white/5 border border-white/10">
                  Opcional
                </span>
                <h3 className="text-sm font-bold text-white font-mono">Você não precisa disto para usar o OSONE HOME</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                O OSONE já comanda seus aparelhos sozinho, pela conta Tuya — no painel, no chat e por voz.
                Esta aba serve para <strong className="text-zinc-300">uma coisa só</strong>: poder falar com uma
                caixinha ou celular do Google e o comando chegar até aqui. Se você não usa Assistente do Google,
                pode ignorar esta aba inteira sem perder nada.
              </p>
              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">OSONE</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/30 font-bold">Tuya</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">aparelhos</span>
                  <span className="text-[10px] text-zinc-500 font-sans ml-1">sempre, com ou sem Google</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold">Google</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">OSONE</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/30 font-bold">Tuya</span>
                  <span className="text-[10px] text-zinc-500 font-sans ml-1">só se você ligar esta aba</span>
                </div>
              </div>
            </div>

            {/* ESTADO DA PONTE. Os dois degraus aparecem separados de propósito: credencial
                preenchida e conta vinculada são coisas diferentes, e confundi-las era o que
                fazia a tela dizer "configurado" para quem o Assistente não atendia. */}
            <div className={cn("p-6 rounded-3xl bg-[#0c0f18] border space-y-4", ESTILO_DO_ESTADO[estadoDoGoogle(google)].caixa)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0",
                    ESTILO_DO_ESTADO[estadoDoGoogle(google)].icone
                  )}>
                    {googleCarregando ? <RefreshCw size={22} className="animate-spin" /> : google?.ok ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white font-mono">Google Assistente</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {googleCarregando ? 'Conferindo a ponte de ponta a ponta...' : (google?.resumo || 'Sem informação do servidor.')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={carregarGoogle}
                  disabled={googleCarregando}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-mono transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-40"
                >
                  <RefreshCw size={13} className={cn(googleCarregando && "animate-spin")} />
                  <span>Reconferir</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Credenciais</span>
                  <p className={cn("text-xs font-mono font-bold mt-1", google?.configurado ? "text-emerald-400" : "text-amber-400")}>
                    {google?.configurado ? 'Client ID e Secret preenchidos' : 'Faltando'}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Conta do Google</span>
                  <p className={cn("text-xs font-mono font-bold mt-1", google?.vinculado ? "text-emerald-400" : "text-sky-400")}>
                    {google?.vinculado
                      ? `Vinculada${google?.vinculadoEm ? ` em ${new Date(google.vinculadoEm).toLocaleDateString('pt-BR')}` : ''}`
                      : 'Ainda não vinculada'}
                  </p>
                </div>
              </div>

              {google?.comoResolver && (
                <p className="text-sm text-zinc-300 leading-relaxed p-4 rounded-2xl bg-black/40 border border-white/5">
                  {google.comoResolver}
                </p>
              )}

              {google?.erroTecnico && (
                <p className="text-[11px] text-red-300/70 font-mono leading-relaxed break-words">{google.erroTecnico}</p>
              )}

              {!google?.configurado && onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono transition-all cursor-pointer"
                >
                  <Settings size={14} />
                  <span>Preencher as credenciais</span>
                </button>
              )}
            </div>

            {/*
              O Google não alcança um endereço que só existe nesta máquina — mas o aviso começava
              por essa má notícia, e quem o lia entendia que a casa inteira dependia de publicar o
              OSONE na Vercel. Não depende: só a ponte do Google depende. A ordem das frases é o
              conserto, porque é a primeira que fica.
            */}
            {!enderecoAlcancavelPeloGoogle && (
              <div className="p-5 rounded-3xl bg-amber-500/[0.06] border border-amber-500/25 flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-100/80 leading-relaxed space-y-2">
                  <p className="font-bold text-amber-300">Seus aparelhos funcionam aqui normalmente.</p>
                  <p>
                    O painel, o chat e a voz do OSONE falam com a Tuya direto desta máquina e não passam
                    pelo Google em momento nenhum. Rodando em
                    <code className="mx-1 px-1.5 py-0.5 rounded bg-black/40 font-mono text-amber-200">localhost</code>
                    você controla tudo igual — nada disso precisa de Vercel.
                  </p>
                  <p>
                    O que <strong className="text-amber-300">só</strong> falta neste endereço é o vínculo desta aba:
                    para as caixinhas do Google mandarem comando, o Google precisa ALCANÇAR o OSONE de fora, e ele
                    só entra em endereço público com HTTPS. Se quiser essa porta, publique o OSONE num domínio
                    (a Vercel serve) ou exponha esta máquina por um túnel (ngrok, Cloudflare Tunnel). Se não quiser,
                    ignore esta aba: não falta nada.
                  </p>
                </div>
              </div>
            )}

            {/* AS TRÊS URLs, tiradas do endereço atual. */}
            <div className="p-5 rounded-3xl bg-[#0c0f18] border border-white/5 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white font-mono">URLs para colar no Actions on Google</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Em <span className="text-cyan-300">Account Linking</span>, no seu projeto do console do Google.
                </p>
              </div>
              {urlsDoGoogle.map(item => (
                <div key={item.rotulo} className="space-y-1">
                  <span className="text-[9px] uppercase tracking-[0.15em] text-zinc-500 font-bold">{item.rotulo}</span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] font-mono text-zinc-300 bg-black/50 px-3 py-2 rounded-xl truncate border border-white/5">{item.valor}</code>
                    <button
                      onClick={() => copiarUrl(item.valor)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all shrink-0 cursor-pointer"
                      title="Copiar"
                    >
                      {urlCopiada === item.valor ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* O QUE O ASSISTENTE VAI ENXERGAR — com os recursos que cada aparelho leva junto.
                É a resposta para "por que 'põe a sala em 30%' não funciona": ou o aparelho tem
                brilho e ele aparece aqui, ou não tem e o Assistente nunca vai conseguir. */}
            {Array.isArray(google?.expostos) && google.expostos.length > 0 && (
              <div className="p-5 rounded-3xl bg-[#0c0f18] border border-white/5 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono">
                    O Assistente enxerga {google.expostos.length} aparelho(s)
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Cada um leva só o que ele realmente aceita — nada é prometido ao Google por suposição.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {google.expostos.map((ap: any) => (
                    <div key={ap.id} className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white font-mono truncate">{ap.nome}</span>
                        <span className="text-[9px] font-mono text-zinc-500 shrink-0">{ap.tipo}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(ap.traits || []).map((t: string) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-lg text-[9px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 flex items-center gap-1"
                          >
                            {NOME_DO_RECURSO[t]?.icone}
                            {NOME_DO_RECURSO[t]?.rotulo || t}
                          </span>
                        ))}
                        {!ap.online && (
                          <span className="px-2 py-0.5 rounded-lg text-[9px] font-mono bg-zinc-800 text-zinc-500 border border-white/10">
                            offline
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* O QUE FICOU DE FORA, E POR QUÊ. Sem esta lista, um aparelho que não aparece no
                Google Home some sem explicação e parece defeito. */}
            {Array.isArray(google?.ignorados) && google.ignorados.length > 0 && (
              <div className="p-5 rounded-3xl bg-[#0a0c14] border border-white/5 space-y-3">
                <div className="flex items-center gap-2">
                  <EyeOff size={14} className="text-zinc-500" />
                  <h3 className="text-sm font-bold text-white font-mono">
                    {google.ignorados.length} aparelho(s) fora do Assistente
                  </h3>
                </div>
                <div className="space-y-2">
                  {google.ignorados.map((ap: any) => (
                    <div key={ap.id} className="p-3 rounded-2xl bg-black/40 border border-white/5">
                      <span className="text-xs font-bold text-zinc-300 font-mono">{ap.nome}</span>
                      <p className="text-[11px] text-zinc-500 leading-relaxed mt-1">{ap.motivo}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* O GUIA. Os passos que só o usuário pode dar, no console do Google. */}
            <div className="p-5 rounded-3xl bg-[#0a0c14] border border-white/5 space-y-3">
              <h3 className="text-sm font-bold text-white font-mono">Como vincular, passo a passo</h3>
              <ol className="space-y-2.5 text-xs text-zinc-400 leading-relaxed">
                {[
                  <>Crie um projeto em <span className="text-cyan-300">console.actions.google.com</span> e escolha o tipo <strong className="text-zinc-300">Smart Home</strong>.</>,
                  <>Invente um Client ID e um Client Secret — eles são <strong className="text-zinc-300">seus</strong>, não do Google. Preencha os dois em Configurações &gt; Automação e cole exatamente os mesmos em <span className="text-cyan-300">Account Linking</span>.</>,
                  <>Ainda em Account Linking, cole as três URLs desta tela nos campos correspondentes.</>,
                  <>Habilite a <span className="text-cyan-300">HomeGraph API</span> no projeto do Google Cloud vinculado.</>,
                  <>No app Google Home do celular: <strong className="text-zinc-300">+ &gt; Configurar dispositivo &gt; "Funciona com o Google"</strong>, procure o seu projeto de teste e autorize na tela que o OSONE abrir.</>,
                  <>Volte aqui e clique em <strong className="text-zinc-300">Reconferir</strong>: o cartão de cima passa a dizer "Vinculada".</>
                ].map((texto, i) => (
                  <li key={i} className="flex gap-3 border-l border-white/10 pl-3">
                    <span className="text-cyan-400 font-mono font-bold shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    <span>{texto}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* DESVINCULAR. Em dois toques: é uma ação que derruba o acesso do Assistente à casa
                inteira e não tem desfazer — refazer exige o app do celular de novo. */}
            {google?.vinculado && (
              <div className="p-5 rounded-3xl bg-[#0a0c14] border border-red-500/20 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono">Desvincular a conta do Google</h3>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    O Assistente perde o acesso na hora. Seus aparelhos e a conta Tuya não são tocados —
                    o painel, o chat e a voz do OSONE continuam funcionando igual.
                  </p>
                </div>
                {confirmandoDesvinculo ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={desvincularGoogle}
                      className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-black font-bold text-xs font-mono transition-all cursor-pointer"
                    >
                      Confirmar e desvincular
                    </button>
                    <button
                      onClick={() => setConfirmandoDesvinculo(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-mono transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmandoDesvinculo(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-red-500/15 border border-red-500/25 text-red-300 text-xs font-mono font-bold transition-all cursor-pointer"
                  >
                    <Unlink size={13} />
                    <span>Desvincular</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PC FILE ORGANIZER SCRIPT GENERATOR */}
        {activeTab === 'pc_organizer' && (
          <div className="p-6 rounded-3xl bg-[#0c0e17] border border-emerald-500/30 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Folder size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-mono">Organizador Automático do PC Físico</h3>
                  <p className="text-xs text-emerald-200/70">Script de Organização de Arquivos do Computador</p>
                </div>
              </div>

              <button 
                onClick={handleCopyScript}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
              >
                {copiedScript ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedScript ? 'Copiado!' : 'Copiar Script Python'}</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-200/90 leading-relaxed font-sans space-y-2">
              <strong className="text-emerald-400 font-mono font-bold block">💡 Como organizar seu computador físico com o OSONE:</strong>
              <p>
                Navegadores de internet rodam dentro de um container isolado ("sandbox") por privacidade e segurança, impedindo que sites explorem pastas do seu disco rígido sem sua autorização. 
              </p>
              <p>
                Para organizar o seu computador físico instantaneamente, o OSONE gerou este script Python abaixo. Você só precisa salvar este código no seu PC como <code className="text-cyan-300 bg-black/60 px-1.5 py-0.5 rounded font-mono">organizar.py</code> e executá-lo! Ele moverá automaticamente PDFs, planilhas, fotos, vídeos e instaladores para subpastas limpas e ordenadas na sua pasta Downloads/Documentos.
              </p>
            </div>

            <div className="relative rounded-2xl bg-black/80 border border-white/10 p-4 font-mono text-xs text-emerald-300 leading-relaxed overflow-x-auto max-h-80 custom-scrollbar">
              <pre>{pythonScriptText}</pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
