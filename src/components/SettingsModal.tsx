import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Cpu, Palette, Key, Info, Activity, CheckCircle2, AlertCircle, Loader2, Home, UserCircle, Volume2, RefreshCw, Copy, Image, Eye, EyeOff, Fingerprint, Sparkles, KeyRound, DownloadCloud } from 'lucide-react';
import { cn } from '../lib/utils';
import { ApiKeys, OrbStyle, AppTheme, AIProfile, VoiceModulation } from '../types';
import { PERSONAS, Persona } from './PersonaSwitcher';
import { auth } from '../firebase';

const VOICE_DETAILS = [
  { id: 'Kore', name: 'Kore', desc: 'Feminina • Doce, expressiva e natural', category: 'Femininas' },
  { id: 'Puck', name: 'Puck', desc: 'Masculina • Divertida, enérgica e jovial', category: 'Masculinas' },
  { id: 'Charon', name: 'Charon', desc: 'Masculina • Amigável, casual e espontânea', category: 'Masculinas' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Masculina • Poderosa, profunda e imponente', category: 'Masculinas' },
  { id: 'Scarlet', name: 'Sensus (Scarlet)', desc: 'Quântica • Adaptativa, profunda e misteriosa', category: 'Especiais' }
];

type TabId = 'general' | 'elevenlabs' | 'interface' | 'profile' | 'automation' | 'atualizacao';
type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

/**
 * Os nomes das variáveis de cada grupo, para a hospedagem remota — onde não há campo para
 * digitar e o que a pessoa precisa é justamente saber o que cadastrar no painel do provedor.
 * Ficam aqui, e não vindos do servidor, porque naquele cenário ele responde 403 sem lista.
 */
const VARIAVEIS_POR_GRUPO: Record<string, string[]> = {
  'TUYA_': ['TUYA_CLIENT_ID', 'TUYA_CLIENT_SECRET', 'TUYA_BASE_URL', 'TUYA_USER_UID']
};

export const SettingsModal = ({ 
  isOpen, 
  onClose, 
  keys, 
  setKeys, 
  selectedVoice, 
  setSelectedVoice,
  voiceEngine,
  setVoiceEngine,
  isChatAutoSpeakActive = false,
  setIsChatAutoSpeakActive,
  voiceModulation,
  setVoiceModulation,
  orbStyle,
  setOrbStyle,
  orbSize = 100,
  setOrbSize,
  orbCenterMode = false,
  setOrbCenterMode,
  appTheme,
  setAppTheme,
  aiProfile,
  setAiProfile,
  onAddNotification,
  vocalProfileEscarlate,
  setVocalProfileEscarlate,
  selectedPersona,
  onPersonaChange,
  onOpenIdentityDossier,
  intimateAnswersCount,
  onOpenAiDossier,
  abaInicial
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Aba em que abrir. Quem manda daqui é quem sabe qual campo o usuário está indo preencher. */
  abaInicial?: string;
  keys: ApiKeys;
  setKeys: (keys: ApiKeys) => void;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  voiceEngine: 'gemini' | 'elevenlabs';
  setVoiceEngine: (engine: 'gemini' | 'elevenlabs') => void;
  isChatAutoSpeakActive?: boolean;
  setIsChatAutoSpeakActive?: (active: boolean) => void;
  voiceModulation: VoiceModulation;
  setVoiceModulation: (mod: VoiceModulation) => void;
  orbStyle: OrbStyle;
  setOrbStyle: (style: OrbStyle) => void;
  orbSize: number;
  setOrbSize: (size: number) => void;
  orbCenterMode?: boolean;
  setOrbCenterMode?: (centered: boolean) => void;
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
  aiProfile: AIProfile;
  setAiProfile: (profile: AIProfile) => void;
  onAddNotification?: (msg: string, type: 'success' | 'info' | 'error') => void;
  vocalProfileEscarlate: string;
  setVocalProfileEscarlate: (val: string) => void;
  selectedPersona: Persona;
  onPersonaChange: (persona: Persona) => void;
  onOpenIdentityDossier: () => void;
  intimateAnswersCount: number;
  onOpenAiDossier: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  // Só na ABERTURA. Reagir à aba em qualquer render prenderia o usuário nela: cada clique numa
  // outra aba seria desfeito no render seguinte.
  useEffect(() => {
    if (isOpen && abaInicial) setActiveTab(abaInicial as TabId);
  }, [isOpen, abaInicial]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [googlePairing, setGooglePairing] = useState<{ code: string; expiresAt: number; deviceCount: number } | null>(null);
  const [elVerificationStatus, setElVerificationStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [elVerificationMessage, setElVerificationMessage] = useState('');
  const [geminiVerificationStatus, setGeminiVerificationStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [geminiVerificationMessage, setGeminiVerificationMessage] = useState('');

  // Local Agent Test States
  const [showLocalAgentToken, setShowLocalAgentToken] = useState(false);
  const [localAgentStatus, setLocalAgentStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [isProvisioningToken, setIsProvisioningToken] = useState(false);
  const [localAgentMessage, setLocalAgentMessage] = useState('');

  // Tuya Cloud Integration Verification States
  const [tuyaStatus, setTuyaStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [tuyaMessage, setTuyaMessage] = useState('');
  const [tuyaDetails, setTuyaDetails] = useState<{ configured: boolean; env: Record<string, boolean> } | null>(null);

  // ====== ATUALIZAÇÃO DO APP ======
  interface EstadoDaAtualizacao {
    suportado: boolean;
    versaoAtual: string;
    fase: 'ocioso' | 'procurando' | 'disponivel' | 'baixando' | 'baixada' | 'atualizado' | 'erro';
    versaoNova: string | null;
    progresso: number;
    mensagem: string;
    ultimaChecagem: string | null;
  }
  const [atualizacao, setAtualizacao] = useState<EstadoDaAtualizacao | null>(null);
  const [checandoAtualizacao, setChecandoAtualizacao] = useState(false);

  const lerEstadoDaAtualizacao = async () => {
    try {
      const res = await fetch('/api/atualizacao/estado');
      const dados = await res.json().catch(() => null);
      if (dados) setAtualizacao(dados);
    } catch { /* servidor ainda subindo: a próxima leitura resolve */ }
  };

  /**
   * Enquanto o download corre, o estado é relido de dois em dois segundos.
   *
   * Sem isso a barra de progresso ficaria parada no número do instante em que o botão foi clicado,
   * e uma atualização de 200 MB pareceria travada — que é exatamente a impressão que a atualização
   * silenciosa já dava antes desta tela existir.
   */
  useEffect(() => {
    if (!isOpen || activeTab !== 'atualizacao') return;
    lerEstadoDaAtualizacao();
    const fase = atualizacao?.fase;
    if (fase !== 'procurando' && fase !== 'baixando' && fase !== 'disponivel') return;
    const id = setInterval(lerEstadoDaAtualizacao, 2000);
    return () => clearInterval(id);
  }, [isOpen, activeTab, atualizacao?.fase]);

  const procurarAtualizacao = async () => {
    setChecandoAtualizacao(true);
    try {
      const res = await fetch('/api/atualizacao/checar', { method: 'POST' });
      const dados = await res.json().catch(() => null);
      if (dados) setAtualizacao(dados);
    } catch (err: any) {
      if (onAddNotification) onAddNotification(`Não foi possível procurar atualização: ${err?.message || err}`, 'error');
    } finally {
      setChecandoAtualizacao(false);
    }
  };

  const instalarAtualizacao = async () => {
    try {
      const res = await fetch('/api/atualizacao/instalar', { method: 'POST' });
      const dados = await res.json().catch(() => null);
      if (!res.ok) {
        if (onAddNotification) onAddNotification(dados?.error || 'Não foi possível instalar agora.', 'error');
        return;
      }
      if (onAddNotification) onAddNotification(dados?.mensagem || 'Reiniciando para instalar...', 'info');
    } catch (err: any) {
      if (onAddNotification) onAddNotification(`Falha ao instalar: ${err?.message || err}`, 'error');
    }
  };

  const handleTestTuya = async () => {
    setTuyaStatus('testing');
    setTuyaMessage('Consultando variáveis do servidor (/api/tuya/status)...');
    try {
      const res = await fetch('/api/tuya/status');
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setTuyaDetails(data);
        if (data.configured) {
          setTuyaStatus('success');
          setTuyaMessage('Backend 100% configurado com a Tuya OpenAPI! Chaves do servidor ativas para hardware físico.');
          if (onAddNotification) onAddNotification('Integração Tuya Cloud verificada com sucesso!', 'success');
        } else {
          setTuyaStatus('error');
          setTuyaMessage('Variáveis de ambiente da Tuya incompletas no servidor (.env).');
          if (onAddNotification) onAddNotification('Configuração da Tuya incompleta no servidor.', 'error');
        }
      } else {
        setTuyaStatus('error');
        setTuyaMessage(data?.error || 'Erro ao consultar rota do servidor Tuya.');
      }
    } catch (err: any) {
      setTuyaStatus('error');
      setTuyaMessage('Erro de rede ao verificar status da Tuya no servidor.');
    }
  };

  /**
   * Busca o token do Agente Local direto do servidor que já está rodando nesta máquina,
   * preenchendo o campo automaticamente. Antes, o usuário precisava localizar o config.json à
   * mão — no app instalado (.exe) esse arquivo fica na pasta de dados do sistema e quase
   * ninguém encontra, o que fazia o Agente Local parecer quebrado fora do modo de
   * desenvolvimento. O endpoint só responde ao próprio computador (loopback).
   */
  const handleProvisionLocalAgentToken = async () => {
    setIsProvisioningToken(true);
    setLocalAgentStatus('testing');
    setLocalAgentMessage('Obtendo o token desta instalação...');
    try {
      const res = await fetch('/api/agent/provision-token');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        setLocalAgentStatus('error');
        const errMsg = data?.error || `Não foi possível obter o token (HTTP ${res.status}).`;
        setLocalAgentMessage(errMsg);
        if (onAddNotification) onAddNotification(errMsg, 'error');
        return;
      }
      setKeys({ ...keys, localAgentToken: data.token });
      setLocalAgentStatus('success');
      setLocalAgentMessage(`Token gerado e preenchido automaticamente${data.platform ? ` (sistema: ${data.platform})` : ''}. O Agente Local já está pronto para uso.`);
      if (onAddNotification) onAddNotification('Token do Agente Local gerado automaticamente!', 'success');
    } catch (err: any) {
      setLocalAgentStatus('error');
      setLocalAgentMessage('Erro de rede ao obter o token do Agente Local.');
    } finally {
      setIsProvisioningToken(false);
    }
  };

  const handleTestLocalAgent = async () => {
    const token = (keys.localAgentToken || '').trim();
    if (!token) {
      setLocalAgentStatus('error');
      setLocalAgentMessage("Nenhum token configurado. Clique em 'Gerar Token Automaticamente' acima.");
      return;
    }

    setLocalAgentStatus('testing');
    setLocalAgentMessage('Conectando ao Agente Local Unificado (/api/agent/status)...');

    try {
      const res = await fetch('/api/agent/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json().catch(() => null);
      if (res.ok) {
        setLocalAgentStatus('success');
        const msg = `Agente Local Ativo e Unificado no Servidor! ${data?.platform ? `Plataforma: ${data.platform}.` : ''} ${data?.availableApps ? `${data.availableApps.length} app(s) disponível(is).` : ''}`;
        setLocalAgentMessage(msg);
        if (onAddNotification) onAddNotification('Conexão com o Agente Local estabelecida com sucesso no servidor!', 'success');
      } else {
        setLocalAgentStatus('error');
        const errMsg = data?.error || `Erro HTTP ${res.status} ao conectar ao Agente Local.`;
        setLocalAgentMessage(errMsg);
        if (onAddNotification) onAddNotification(errMsg, 'error');
      }
    } catch (err: any) {
      setLocalAgentStatus('error');
      const errMsg = 'Não foi possível conectar ao Agente Local na rota /api/agent/status.';
      setLocalAgentMessage(errMsg);
      if (onAddNotification) onAddNotification(errMsg, 'error');
    }
  };

  /**
   * CAMPOS DE CREDENCIAL — o que faltava para o checklist deixar de ser um beco sem saída.
   *
   * A tela mostrava "❌ TUYA_CLIENT_ID" e mandava definir a variável de ambiente do servidor, sem
   * oferecer um campo para digitar. No app instalado não há .env que a pessoa possa abrir, então a
   * instrução era impossível de cumprir. Os valores vão para o servidor e ficam lá: o segredo da
   * Tuya assina as requisições e nunca volta para o navegador — daqui só sobe.
   */
  const [credenciais, setCredenciais] = useState<any[]>([]);
  const [credenciaisDisponivel, setCredenciaisDisponivel] = useState<boolean>(true);
  const [rascunhoCredenciais, setRascunhoCredenciais] = useState<Record<string, string>>({});
  const [salvandoCredenciais, setSalvandoCredenciais] = useState(false);
  const [mostrarSegredo, setMostrarSegredo] = useState<Record<string, boolean>>({});

  const carregarCredenciais = async () => {
    try {
      const res = await fetch('/api/credenciais');
      if (res.status === 403) {
        // Hospedagem remota: lá as credenciais entram pelo painel do provedor, e não por aqui.
        setCredenciaisDisponivel(false);
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.campos) {
        setCredenciais(data.campos);
        setCredenciaisDisponivel(true);
      }
    } catch {
      setCredenciaisDisponivel(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'automation') carregarCredenciais();
  }, [isOpen, activeTab]);

  /**
   * Salva o que foi digitado. O `prefixo` existe porque os campos passaram a viver cada um no
   * SEU cartão — o botão do cartão da Tuya não pode levar junto um Client ID do Google digitado
   * pela metade logo abaixo, e vice-versa.
   */
  const salvarCredenciaisNoServidor = async (prefixo?: string) => {
    const paraSalvar = prefixo
      ? Object.fromEntries(Object.entries(rascunhoCredenciais).filter(([nome]) => nome.startsWith(prefixo)))
      : rascunhoCredenciais;
    if (Object.keys(paraSalvar).length === 0) return;
    setSalvandoCredenciais(true);
    try {
      const res = await fetch('/api/credenciais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paraSalvar)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onAddNotification?.(data?.error || 'Não foi possível salvar as credenciais.', 'error');
        return;
      }
      setCredenciais(data.campos || []);
      setRascunhoCredenciais(prev => {
        const resto = { ...prev };
        for (const nome of Object.keys(paraSalvar)) delete resto[nome];
        return resto;
      });
      // Vale na hora: a instrução antiga terminava em "e reinicie o OSONE", e no app instalado
      // isso significava fechar tudo só para descobrir se o valor colado estava certo.
      onAddNotification?.(
        `Credenciais salvas e já valendo${data.salvos?.length ? ` (${data.salvos.length} campo(s))` : ''}. Nenhum reinício necessário.`,
        'success'
      );
    } catch (err: any) {
      onAddNotification?.(`Falha ao salvar: ${err?.message || err}`, 'error');
    } finally {
      setSalvandoCredenciais(false);
    }
  };

  /**
   * O teste percorre a corrente inteira, e não só o par de credenciais.
   *
   * A versão anterior dizia "Configurado no Servidor" em verde assim que os dois campos
   * existiam — e essa é a metade fácil. Quem preenchia os dois e nunca concluía o "Vincular
   * conta" no app Google Home via o verde e ficava sem entender por que o Assistente respondia
   * que não achava nenhum aparelho. Agora o resultado vem do diagnóstico de ponta a ponta, que
   * para no primeiro elo que falta e diz o que fazer nele.
   */
  const ativarGoogleHomeNoInstalavel = async () => {
    setConnectionStatus('testing');
    setConnectionMessage('Validando sua conta Tuya na ponte segura do OSONE...');
    setGooglePairing(null);
    try {
      const firebaseUser = auth?.currentUser;
      if (!firebaseUser?.getIdToken) throw new Error('Entre com sua conta Google no OSONE antes de ativar.');
      const firebaseToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/google-home/cloud/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseToken })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'A ponte pública não aceitou a ativação.');
      setGooglePairing({
        code: String(data.code || ''),
        expiresAt: Number(data.expiresAt || 0),
        deviceCount: Number(data.deviceCount || 0)
      });
      setConnectionStatus('connected');
      setConnectionMessage(`${Number(data.deviceCount || 0)} aparelho(s) preparados. Use o código abaixo no vínculo do Google Home; ele vale por 10 minutos.`);
    } catch (error: any) {
      setConnectionStatus('error');
      setConnectionMessage(error?.message || String(error));
    }
  };

  /**
   * O formulário de um grupo de credenciais, desenhado dentro do cartão do serviço a que ele
   * pertence.
   *
   * Os seis campos ficavam empilhados num bloco só, dentro do cartão da Tuya e sob o título
   * "Credenciais da Casa Inteligente". Quem vinha do guia do Google procurando onde colar o
   * Client ID tinha de achá-lo abaixo de um cartão que falava de outra coisa — e o guia, no
   * mesmo instante, mandava definir variável de ambiente e reiniciar, uma instrução que já não
   * valia e era impossível de cumprir no app instalado.
   */
  const blocoDeCredenciais = (prefixo: string, descricao: React.ReactNode) => {
    /**
     * HOSPEDAGEM REMOTA: a tela dizia "defina nas variáveis de ambiente do provedor" e parava
     * aí. Quem estava na Vercel ficava sem saber QUAIS variáveis, e sem saber que variável nova
     * só entra em deploy novo — salvava as quatro, recarregava, e o painel continuava vazio,
     * com toda a aparência de a instrução não funcionar. Aqui vão os nomes, prontos para copiar,
     * e o passo do redeploy.
     */
    if (!credenciaisDisponivel) {
      const variaveis = VARIAVEIS_POR_GRUPO[prefixo] || [];
      return (
        <div className="p-4 rounded-2xl bg-sky-500/[0.06] border border-sky-500/20 space-y-3 text-[10px] text-sky-200/80 leading-relaxed font-sans">
          <p>
            <strong className="text-sky-200">Hospedagem remota (Vercel e afins).</strong> Aqui a credencial não pode
            ser digitada na tela: esta página está aberta na internet, e o disco desta hospedagem é temporário — o
            valor salvo sumiria no próximo deploy. Nela, as credenciais entram como variáveis de ambiente.
          </p>

          <div className="space-y-1.5">
            <span className="text-[9px] uppercase tracking-wider text-sky-300/70 font-bold">Defina estas variáveis</span>
            {variaveis.map((nome) => (
              <div key={nome} className="flex items-center gap-2">
                <code className="flex-1 text-[10px] font-mono text-her-ink/80 bg-black/40 px-3 py-1.5 rounded-xl truncate">{nome}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(nome)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-her-muted hover:text-white transition-all shrink-0 cursor-pointer"
                  title="Copiar nome da variável"
                >
                  <Copy size={11} />
                </button>
              </div>
            ))}
          </div>

          <p>
            <strong className="text-sky-200">Onde:</strong> Vercel &gt; seu projeto &gt; Settings &gt; Environment
            Variables &gt; Add. <strong className="text-sky-200">Depois de salvar, refaça o deploy</strong>
            {' '}(Deployments &gt; ⋯ &gt; Redeploy) — variável nova só passa a valer num deploy novo.
          </p>

          <p className="text-amber-300/80">
            Prefere o caminho curto? Rodando o OSONE no seu próprio computador (ou pelo app instalado), estes campos
            viram caixas de texto aqui mesmo e valem na hora, sem deploy nenhum.
          </p>
        </div>
      );
    }

    const doGrupo = credenciais.filter((c: any) => String(c.nome).startsWith(prefixo));
    const pendentes = Object.keys(rascunhoCredenciais).filter(nome => nome.startsWith(prefixo)).length;

    return (
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <p className="text-[10px] text-her-muted/70 leading-relaxed">{descricao}</p>

        <div className="space-y-2.5">
          {doGrupo.map((campo: any) => {
            const emEdicao = campo.nome in rascunhoCredenciais;
            const revelar = !!mostrarSegredo[campo.nome];
            return (
              <div key={campo.nome}>
                <label className="flex items-center justify-between text-[9px] uppercase tracking-[0.15em] text-her-muted font-bold mb-1 pl-1">
                  <span>{campo.rotulo}</span>
                  {campo.preenchido && !emEdicao && (
                    <span className={cn(
                      "normal-case tracking-normal font-mono text-[9px] px-1.5 py-0.5 rounded",
                      campo.origem === 'painel'
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-sky-500/10 text-sky-400"
                    )}>
                      {campo.origem === 'painel' ? 'salvo aqui' : 'vem do ambiente'}
                    </span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={campo.segredo && !revelar ? 'password' : 'text'}
                    value={rascunhoCredenciais[campo.nome] ?? ''}
                    onChange={(e) => setRascunhoCredenciais(prev => ({ ...prev, [campo.nome]: e.target.value }))}
                    placeholder={campo.preenchido ? campo.amostra : 'Não preenchido'}
                    className={cn(
                      "w-full bg-white/[0.02] border rounded-xl px-4 py-2.5 focus:outline-none transition-all text-[11px] font-mono text-white placeholder:text-her-muted/30",
                      campo.preenchido ? "border-emerald-500/20 focus:border-emerald-500/40" : "border-white/[0.06] focus:border-white/20"
                    )}
                  />
                  {campo.segredo && (
                    <button
                      type="button"
                      onClick={() => setMostrarSegredo(prev => ({ ...prev, [campo.nome]: !prev[campo.nome] }))}
                      className="absolute right-3 p-1 text-her-muted/50 hover:text-white transition-colors cursor-pointer"
                      title={revelar ? 'Ocultar' : 'Mostrar o que estou digitando'}
                    >
                      {revelar ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-her-muted/50 leading-relaxed mt-1 pl-1 font-sans">{campo.dica}</p>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => salvarCredenciaisNoServidor(prefixo)}
            disabled={salvandoCredenciais || pendentes === 0}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[10px] uppercase tracking-wider transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
          >
            {salvandoCredenciais ? 'Salvando...' : 'Salvar'}
          </button>
          <span className="text-[9px] text-her-muted/50 font-sans leading-tight">
            Vale na hora, sem reiniciar. Campo deixado em branco e salvo apaga o valor guardado.
          </span>
        </div>
      </div>
    );
  };

  const handleVerifyGemini = async () => {
    if (!keys.gemini || !keys.gemini.trim()) {
      setGeminiVerificationStatus('error');
      setGeminiVerificationMessage('Por favor, configure sua chave de API Gemini nos ajustes antes de validar.');
      return;
    }
    setGeminiVerificationStatus('testing');
    setGeminiVerificationMessage('Handshake ativo. Testando cognição do Gemini...');
    try {
      const response = await fetch('/api/gemini/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          geminiApiKey: keys.gemini
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setGeminiVerificationStatus('success');
        setGeminiVerificationMessage(data.message);
        if (onAddNotification) {
          onAddNotification('Handshake Gemini validado com sucesso!', 'success');
        }
      } else {
        setGeminiVerificationStatus('error');
        setGeminiVerificationMessage(data.message || 'Chave do Gemini rejeitada pelos servidores do Google.');
        if (onAddNotification) {
          onAddNotification(data.message || 'Falha ao validar chave API do Gemini.', 'error');
        }
      }
    } catch (err: any) {
      setGeminiVerificationStatus('error');
      setGeminiVerificationMessage('Erro de rede: sem resposta dos servidores do Gemini.');
    }
  };

  const handleVerifyElevenLabs = async () => {
    if (!keys.elevenLabsApiKey || !keys.elevenLabsApiKey.trim()) {
      setElVerificationStatus('error');
      setElVerificationMessage('Por favor, configure sua chave de API ElevenLabs nas configurações antes de validar.');
      return;
    }
    setElVerificationStatus('testing');
    setElVerificationMessage('Handshake local ativo. Solicitando dados detalhados para Elevenlabs...');
    try {
      const response = await fetch('/api/elevenlabs/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          elevenLabsApiKey: keys.elevenLabsApiKey,
          elevenLabsVoiceId: keys.elevenLabsVoiceId
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setElVerificationStatus('success');
        setElVerificationMessage(data.message);
        if (onAddNotification) {
          onAddNotification('Handshake ElevenLabs validado com sucesso!', 'success');
        }
      } else {
        setElVerificationStatus('error');
        setElVerificationMessage(data.message || 'Chave de API ou Voice ID recusados pelo servidor.');
        if (onAddNotification) {
          onAddNotification(data.message || 'Falha ao validar credenciais ElevenLabs.', 'error');
        }
      }
    } catch (err: any) {
      setElVerificationStatus('error');
      setElVerificationMessage('Erro de rede: sem resposta dos servidores de validação.');
    }
  };

  const tabs = [
    { id: 'general', label: 'Chaves', icon: Key },
    { id: 'elevenlabs', label: 'ElevenLabs', icon: Volume2 },
    { id: 'interface', label: 'Interface', icon: Palette },
    { id: 'profile', label: 'Perfil', icon: UserCircle },
    { id: 'automation', label: 'Automação', icon: Cpu },
    { id: 'atualizacao', label: 'Atualizar', icon: DownloadCloud },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-md p-0 sm:p-4"
        >
          <motion.div 
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-her-bg w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl border border-white/[0.05] backdrop-blur-2xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-8 pb-4 flex justify-between items-center bg-white/[0.02] border-b border-white/[0.05]">
              <div className="space-y-1">
                <h2 className="text-xl font-serif italic font-light">Configurações</h2>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                  <span className="text-[10px] text-her-muted uppercase tracking-[0.2em] font-medium">Osone System v3.0</span>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-3 hover:bg-white/[0.03] rounded-full transition-all text-her-muted active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs Navigation */}
            <div className="grid grid-cols-3 gap-1 p-3 bg-white/[0.01] border-b border-white/[0.05]">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabId)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 transition-all relative rounded-xl border border-transparent cursor-pointer",
                      isActive 
                        ? "text-her-accent bg-her-accent/5 border-her-accent/10 font-bold" 
                        : "text-her-muted opacity-50 hover:opacity-100 hover:bg-white/[0.02]"
                    )}
                  >
                    <Icon size={14} className={isActive ? "animate-pulse mt-0.5" : "mt-0.5"} />
                    <span className="text-[9px] font-bold uppercase tracking-wider">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              <AnimatePresence mode="wait">
                {activeTab === 'general' && (
                  <motion.div
                    key="general"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-6"
                  >
                    {/* Security & Storage Notice */}
                    <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl flex items-start gap-3">
                      <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">Aviso de Segurança & Privacidade</span>
                        <p className="text-[10px] text-her-muted/80 leading-relaxed font-light">
                          Suas chaves ficam neste aparelho (<code className="text-amber-300 font-mono">localStorage</code>) e também na sua conta Google, para voltarem sozinhas quando você entrar de novo ou usar outro computador. Na nuvem elas ficam num documento que só a sua conta autenticada consegue abrir. O token do Agente Local é o único que não viaja: ele pertence a esta instalação e é gerado sozinho em cada máquina. Nunca compartilhe a tela em transmissões públicas com as chaves abertas.
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Key size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Gemini API Key</label>
                      </div>
                      <input 
                        type="password"
                        value={keys.gemini}
                        onChange={(e) => setKeys({ ...keys, gemini: e.target.value })}
                        className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-her-accent/30 transition-all text-base md:text-sm font-light text-her-ink/80 placeholder:text-her-muted/20"
                        placeholder="Insira sua chave Gemini..."
                      />
                      <button
                        onClick={handleVerifyGemini}
                        disabled={geminiVerificationStatus === 'testing'}
                        className={cn(
                          "w-full mt-3 py-3.5 rounded-2xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center gap-2 group cursor-pointer",
                          geminiVerificationStatus === 'testing' ? "bg-white/5 text-her-muted cursor-wait" :
                          geminiVerificationStatus === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          geminiVerificationStatus === 'error' ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                          "bg-her-accent/10 text-her-accent border border-her-accent/20 hover:bg-her-accent/20 active:scale-[0.98]"
                        )}
                      >
                        {geminiVerificationStatus === 'testing' ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-her-accent" />
                            Validando conexão Gemini...
                          </>
                        ) : geminiVerificationStatus === 'success' ? (
                          <>
                            <CheckCircle2 size={13} className="text-emerald-400" />
                            Handshake Gemini Concluído com Sucesso
                          </>
                        ) : geminiVerificationStatus === 'error' ? (
                          <>
                            <AlertCircle size={13} className="text-red-500" />
                            Falha no Handshake. Tentar Novamente
                          </>
                        ) : (
                          <>
                            <RefreshCw size={13} className="text-her-accent group-hover:rotate-180 transition-transform duration-500" />
                            Testar Handshake Gemini
                          </>
                        )}
                      </button>

                      {geminiVerificationMessage && (
                        <p className={cn(
                          "mt-2 text-[10px] font-mono leading-relaxed p-3 rounded-xl border",
                          geminiVerificationStatus === 'success' ? "bg-emerald-500/5 text-emerald-400/80 border-emerald-500/10" :
                          geminiVerificationStatus === 'error' ? "bg-red-500/5 text-red-400/80 border-red-500/10" :
                          "bg-white/[0.01] text-her-muted border-white/5"
                        )}>
                          {geminiVerificationMessage}
                        </p>
                      )}

                      <p className="mt-3 text-[10px] text-her-muted/40 italic leading-relaxed">
                        Chave necessária para o processamento de linguagem natural, transcrição de voz e visão computacional integrada do OSONE.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Cpu size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Modelo de Inteligência</label>
                      </div>
                      <div className="grid grid-cols-3 gap-2 bg-white/[0.01] border border-white/[0.05] p-1.5 rounded-2xl">
                        <button
                          type="button"
                          onClick={() => setKeys({ ...keys, geminiModel: 'gemini-3.6-flash' })}
                          className={cn(
                            "py-2.5 px-2 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5",
                            (keys.geminiModel === 'gemini-3.6-flash' || !keys.geminiModel)
                              ? "bg-white/[0.08] text-white shadow-lg border border-white/[0.1] font-bold"
                              : "text-her-muted hover:text-white/80 hover:bg-white/[0.03] border border-transparent font-medium"
                          )}
                        >
                          Gemini 3.6 Flash
                          {(keys.geminiModel === 'gemini-3.6-flash' || !keys.geminiModel) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setKeys({ ...keys, geminiModel: 'gemini-3.5-flash-lite' })}
                          className={cn(
                            "py-2.5 px-2 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5",
                            keys.geminiModel === 'gemini-3.5-flash-lite'
                              ? "bg-white/[0.08] text-white shadow-lg border border-white/[0.1] font-bold"
                              : "text-her-muted hover:text-white/80 hover:bg-white/[0.03] border border-transparent font-medium"
                          )}
                        >
                          Gemini 3.5 Lite
                          {keys.geminiModel === 'gemini-3.5-flash-lite' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setKeys({ ...keys, geminiModel: 'gemini-3.1-flash-lite' })}
                          className={cn(
                            "py-2.5 px-2 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5",
                            keys.geminiModel === 'gemini-3.1-flash-lite'
                              ? "bg-white/[0.08] text-white shadow-lg border border-white/[0.1] font-bold"
                              : "text-her-muted hover:text-white/80 hover:bg-white/[0.03] border border-transparent font-medium"
                          )}
                        >
                          Gemini 3.1 Lite
                          {keys.geminiModel === 'gemini-3.1-flash-lite' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                          )}
                        </button>
                      </div>
                      <p className="mt-3 text-[10px] text-her-muted/40 italic leading-relaxed">
                        Escolha o modelo de inteligência preferencial para geração de código, sugestão de melhorias e chats integrados do OSONE.
                      </p>
                    </div>

                    <div className="mt-5 border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Image size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Geração de Imagens (Text-to-Image)</label>
                      </div>
                      <div className="p-3 rounded-2xl bg-white/[0.01] border border-white/[0.05] flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white">Nano Banana 2</p>
                          <p className="text-[10px] text-her-muted/60 font-mono">gemini-3.6-flash</p>
                        </div>
                        <span className="p-1 px-2.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-widest border border-emerald-500/25 flex items-center gap-1.5 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Padrão Ativo
                        </span>
                      </div>
                      <p className="mt-2 text-[10px] text-her-muted/40 italic leading-relaxed">
                        Este é o modelo generativo multimídia mais avançado do ecossistema Gemini para criação e edição de imagens de alta fidelidade e resolução.
                      </p>
                    </div>

                    {/* Google Custom Search Section */}
                    <div className="mt-5 border-t border-white/5 pt-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Key size={12} className="text-purple-400" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Google Custom Search API</label>
                      </div>
                      <p className="text-[10px] text-her-muted/60 leading-relaxed font-sans">
                        Configure o Custom Search para habilitar buscas na web em tempo real localmente sem depender exclusivamente da pesquisa geradora padrão do Gemini.
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[9px] uppercase tracking-wider text-her-muted/60 mb-1.5 font-bold">Developer Key</label>
                          <input 
                            type="password"
                            value={keys.googleCustomSearchApiKey || ''}
                            onChange={(e) => setKeys({ ...keys, googleCustomSearchApiKey: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-purple-500/30 transition-all text-xs font-mono text-white placeholder:text-her-muted/20"
                            placeholder="Ex: AQ.Ab8... ou AIzaSyD..."
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase tracking-wider text-her-muted/60 mb-1.5 font-bold">Search Engine ID (CX)</label>
                          <input 
                            type="text"
                            value={keys.googleCustomSearchCx || ''}
                            onChange={(e) => setKeys({ ...keys, googleCustomSearchCx: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-purple-500/30 transition-all text-xs font-mono text-white placeholder:text-her-muted/20"
                            placeholder="Ex: d18bde89..."
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tavily Search Section */}
                    <div className="mt-5 border-t border-white/5 pt-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Key size={12} className="text-cyan-400" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Tavily Search Agent Web API</label>
                      </div>
                      <p className="text-[10px] text-her-muted/60 leading-relaxed font-sans">
                        Habilite o Tavily Search para respostas dinâmicas focadas em agentes de IA. Perfeito para pesquisas técnicas rápidas e busca em tempo real.
                      </p>
                      <div>
                        <label className="block text-[9px] uppercase tracking-wider text-her-muted/60 mb-1.5 font-bold">Tavily API Key (Opcional)</label>
                        <input 
                          type="password"
                          value={keys.tavilyApiKey || ''}
                          onChange={(e) => setKeys({ ...keys, tavilyApiKey: e.target.value })}
                          className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-cyan-500/30 transition-all text-xs font-mono text-white placeholder:text-her-muted/20"
                          placeholder="Ex: tvly-..."
                        />
                      </div>
                    </div>

                    {/* OSONE Local Agent Section */}
                    <div className="mt-5 border-t border-white/5 pt-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Cpu size={14} className="text-emerald-400" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">
                          Token do Agente Local (OSONE Local Agent - Unificado)
                        </label>
                      </div>
                      <p className="text-[10px] text-her-muted/60 leading-relaxed font-sans">
                        O Agente Local agora é integrado diretamente ao servidor principal do OSONE (<code className="font-mono text-emerald-400">/api/agent</code>). Cada instalação gera automaticamente o seu próprio token único e forte na primeira vez que o servidor liga — copie o valor do campo <code className="font-mono text-emerald-400">token</code> dentro do arquivo <code className="font-mono text-emerald-400">config.json</code> (na pasta do OSONE) e cole abaixo. Você também pode acessar o painel completo na aba <strong>Automação</strong>.
                      </p>
                      <div className="space-y-3">
                        <div className="relative flex items-center">
                          <input
                            type={showLocalAgentToken ? "text" : "password"}
                            value={keys.localAgentToken || ''}
                            onChange={(e) => setKeys({ ...keys, localAgentToken: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 pr-12 focus:outline-none focus:border-emerald-500/30 transition-all text-xs font-mono text-white placeholder:text-her-muted/20"
                            placeholder="Cole aqui o token gerado em config.json..."
                          />
                          <button
                            type="button"
                            onClick={() => setShowLocalAgentToken(!showLocalAgentToken)}
                            className="absolute right-3 p-1.5 text-her-muted/50 hover:text-white transition-colors cursor-pointer"
                            title={showLocalAgentToken ? "Ocultar Token" : "Mostrar Token"}
                          >
                            {showLocalAgentToken ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={handleTestLocalAgent}
                          disabled={localAgentStatus === 'testing'}
                          className={cn(
                            "w-full py-3 rounded-2xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                            localAgentStatus === 'testing' ? "bg-white/5 text-her-muted cursor-wait" :
                            localAgentStatus === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            localAgentStatus === 'error' ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                            "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-[0.98]"
                          )}
                        >
                          {localAgentStatus === 'testing' ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-emerald-400" />
                              Testando Conexão com Agente Local...
                            </>
                          ) : localAgentStatus === 'success' ? (
                            <>
                              <CheckCircle2 size={13} className="text-emerald-400" />
                              Agente Local Online
                            </>
                          ) : (
                            <>
                              <Activity size={13} />
                              Testar Conexão
                            </>
                          )}
                        </button>

                        {localAgentMessage && (
                          <div className={cn(
                            "px-4 py-2.5 rounded-xl text-[10px] flex items-start gap-2 animate-in fade-in slide-in-from-top-1",
                            localAgentStatus === 'success' ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" :
                            localAgentStatus === 'error' ? "bg-red-500/10 text-red-300 border border-red-500/20" :
                            "bg-white/5 text-her-muted"
                          )}>
                            {localAgentStatus === 'error' ? <AlertCircle size={13} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
                            <span className="leading-relaxed font-sans">{localAgentMessage}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'elevenlabs' && (
                  <motion.div
                    key="elevenlabs"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-6"
                  >
                    <div className="p-5 bg-white/[0.02] border border-white/[0.05] rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-her-accent font-medium">
                          <Volume2 size={15} />
                          <span className="text-xs font-serif italic">Canal de Voz ElevenLabs</span>
                        </div>
                        <button
                          onClick={() => {
                            const nextEngine = voiceEngine === 'elevenlabs' ? 'gemini' : 'elevenlabs';
                            setVoiceEngine(nextEngine);
                            if (onAddNotification) {
                              onAddNotification(nextEngine === 'elevenlabs' ? "Motor ElevenLabs ativado como canal principal de voz" : "Gemini 3.1 TTS ativado", "info");
                            }
                          }}
                          className={cn(
                            "w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer",
                            voiceEngine === 'elevenlabs' ? "bg-her-accent" : "bg-white/10"
                          )}
                        >
                          <span className={cn(
                            "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm",
                            voiceEngine === 'elevenlabs' ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>
                      <p className="text-[10px] sm:text-xs text-her-muted/80 leading-relaxed font-light">
                        Ative o motor de síntese de fala mais avançado e realista do mundo para as interações. O handshaking e a latência de resposta dependem do modelo de latência selecionado abaixo.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Chave de API ElevenLabs</label>
                          <span 
                            className="text-[9.5px] text-her-accent font-medium hover:underline cursor-pointer flex items-center gap-1"
                            onClick={() => window.open('https://elevenlabs.io', '_blank')}
                          >
                            Obter Chave <Info size={10} />
                          </span>
                        </div>
                        <input 
                          type="password"
                          value={keys.elevenLabsApiKey || ''}
                          onChange={(e) => setKeys({ ...keys, elevenLabsApiKey: e.target.value })}
                          className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3.5 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80 placeholder:text-her-muted/20"
                          placeholder="Insira sua xi-api-key da Elevenlabs..."
                        />
                      </div>

                      <div className="bg-white/[0.01] border border-white/[0.05] p-4 rounded-3xl space-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="block text-[10px] uppercase tracking-widest text-her-muted font-bold select-none text-left">Selecione a Voz Ativa (ElevenLabs)</label>
                          <div className="grid grid-cols-3 gap-2 p-1 bg-black/40 rounded-2xl border border-white/[0.05]">
                            {(['voice1', 'voice2', 'voice3'] as const).map((v, i) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setKeys({ ...keys, elevenLabsActiveVoice: v })}
                                className={cn(
                                  "py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer",
                                  (keys.elevenLabsActiveVoice || 'voice1') === v 
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold" 
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                                )}
                              >
                                Voz {i + 1}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[10px] uppercase tracking-widest text-zinc-400 font-bold select-none text-left">ID da Voz 1 (Principal)</label>
                              <span className="text-[9px] text-her-muted/40 font-mono">Rachel se em branco</span>
                            </div>
                            <input 
                              type="text"
                              value={keys.elevenLabsVoiceId || ''}
                              onChange={(e) => setKeys({ ...keys, elevenLabsVoiceId: e.target.value })}
                              className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-500/30 transition-all text-xs font-mono text-zinc-300 placeholder:text-her-muted/25"
                              placeholder="Ex: 21m00Tcm4TlvDq8ikWAM..."
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[10px] uppercase tracking-widest text-zinc-400 font-bold select-none text-left">ID da Voz 2</label>
                              <span className="text-[9px] text-her-muted/40 font-mono">Opcional</span>
                            </div>
                            <input 
                              type="text"
                              value={keys.elevenLabsVoiceId2 || ''}
                              onChange={(e) => setKeys({ ...keys, elevenLabsVoiceId2: e.target.value })}
                              className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-500/30 transition-all text-xs font-mono text-zinc-300 placeholder:text-her-muted/25"
                              placeholder="ID da segunda voz clone..."
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[10px] uppercase tracking-widest text-zinc-400 font-bold select-none text-left">ID da Voz 3</label>
                              <span className="text-[9px] text-her-muted/40 font-mono">Opcional</span>
                            </div>
                            <input 
                              type="text"
                              value={keys.elevenLabsVoiceId3 || ''}
                              onChange={(e) => setKeys({ ...keys, elevenLabsVoiceId3: e.target.value })}
                              className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-500/30 transition-all text-xs font-mono text-zinc-300 placeholder:text-her-muted/25"
                              placeholder="ID da terceira voz clone..."
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleVerifyElevenLabs}
                        disabled={elVerificationStatus === 'testing'}
                        className={cn(
                          "w-full py-3.5 rounded-2xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center gap-2 group",
                          elVerificationStatus === 'testing' ? "bg-white/5 text-her-muted cursor-wait" :
                          elVerificationStatus === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          elVerificationStatus === 'error' ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                          "bg-her-accent/10 text-her-accent border border-her-accent/20 hover:bg-her-accent/20 active:scale-[0.98]"
                        )}
                      >
                        {elVerificationStatus === 'testing' ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-her-accent" />
                            Validando conexão ElevenLabs...
                          </>
                        ) : elVerificationStatus === 'success' ? (
                          <>
                            <CheckCircle2 size={13} className="text-emerald-400" />
                            Conexão Estabelecida com Sucesso
                          </>
                        ) : elVerificationStatus === 'error' ? (
                          <>
                            <AlertCircle size={13} className="text-red-500" />
                            Falha na Conexão. Tentar Novamente
                          </>
                        ) : (
                          <>
                            <Activity size={13} className="group-hover:animate-pulse" />
                            Testar e Validar Conexão
                          </>
                        )}
                      </button>

                      {elVerificationStatus !== 'idle' && (
                        <div className={cn(
                          "p-4 rounded-2xl text-xs leading-relaxed font-light flex items-start gap-3 border animate-in fade-in slide-in-from-top-2 duration-200",
                          elVerificationStatus === 'success' ? "bg-emerald-500/5 text-emerald-300/90 border-emerald-500/10" :
                          "bg-red-500/5 text-red-300/95 border-red-500/10"
                        )}>
                          {elVerificationStatus === 'success' ? (
                            <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-400" />
                          ) : (
                            <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
                          )}
                          <div className="space-y-1">
                            <p className="font-medium text-[11px] uppercase tracking-wider">
                              {elVerificationStatus === 'success' ? 'Sucesso de Handshake' : 'Verificação Recusada'}
                            </p>
                            <p className="font-sans text-[11px] opacity-80">{elVerificationMessage}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Parâmetros de Ajuste Vocal</label>
                        <button 
                          onClick={() => setKeys({ 
                            ...keys, 
                            elevenLabsStability: 0.5, 
                            elevenLabsSimilarityBoost: 0.75, 
                            elevenLabsStyle: 0.0,
                            elevenLabsSpeakerBoost: true,
                            elevenLabsModel: 'eleven_multilingual_v2'
                          })}
                          className="text-[9px] uppercase tracking-widest text-her-accent hover:underline font-bold"
                        >
                          Resetar Ajustes
                        </button>
                      </div>
 
                      <div className="space-y-1.5">
                        <label className="block text-[8px] uppercase tracking-wider text-her-muted/60 font-bold">Modelo Língua & Latência</label>
                        <select 
                          value={keys.elevenLabsModel || 'eleven_multilingual_v2'}
                          onChange={(e) => setKeys({ ...keys, elevenLabsModel: e.target.value })}
                          className="w-full bg-[#111111] border border-white/[0.05] rounded-xl px-4 py-3 focus:outline-none focus:border-her-accent/30 text-xs text-zinc-300 custom-select"
                        >
                          <option value="eleven_turbo_v2_5" className="bg-[#111111]">Eleven Turbo v2.5 (Bilateral - Recom. Baixa Latência)</option>
                          <option value="eleven_flash_v2_5" className="bg-[#111111]">Eleven Flash v2.5 (Altíssima Velocidade)</option>
                          <option value="eleven_multilingual_v2" className="bg-[#111111]">Eleven Multilingual v2 (Premium Riqueza Tonal)</option>
                          <option value="eleven_turbo_v2" className="bg-[#111111]">Eleven Turbo v2 (Clássico Rápido)</option>
                        </select>
                      </div>

                      <div className="space-y-4 p-5 bg-white/[0.01] border border-white/[0.03] rounded-3xl">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] text-her-muted/70 uppercase font-medium">
                            <span>Estabilidade (Stability)</span>
                            <span className="text-her-accent font-mono">{(keys.elevenLabsStability ?? 0.5).toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0.0" max="1.0" step="0.05"
                            value={keys.elevenLabsStability ?? 0.5}
                            onChange={(e) => setKeys({ ...keys, elevenLabsStability: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                          <p className="text-[8.5px] text-her-muted/40 italic">Valores menores geram vozes mais expressivas e dinâmicas, porém menos consistentes.</p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/[0.02]">
                          <div className="flex justify-between text-[10px] text-her-muted/70 uppercase font-medium">
                            <span>Fidelidade (Similarity Boost)</span>
                            <span className="text-her-accent font-mono">{(keys.elevenLabsSimilarityBoost ?? 0.75).toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0.0" max="1.0" step="0.05"
                            value={keys.elevenLabsSimilarityBoost ?? 0.75}
                            onChange={(e) => setKeys({ ...keys, elevenLabsSimilarityBoost: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                          <p className="text-[8.5px] text-her-muted/40 italic">Aumente para reforçar a similaridade exata com o clone de voz original cadastrado.</p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/[0.02]">
                          <div className="flex justify-between text-[10px] text-her-muted/70 uppercase font-medium">
                            <span>Exagero de Estilo (Style Out)</span>
                            <span className="text-her-accent font-mono">{(keys.elevenLabsStyle ?? 0.0).toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0.0" max="1.0" step="0.05"
                            value={keys.elevenLabsStyle ?? 0.0}
                            onChange={(e) => setKeys({ ...keys, elevenLabsStyle: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-white/[0.02]">
                          <div className="flex flex-col text-left space-y-0.5">
                            <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider">Impulso de Locução (Speaker Boost)</span>
                            <span className="text-[8.5px] text-her-muted/60 leading-normal">Oferece um boost adicional na inteligibilidade fonética</span>
                          </div>
                          <button
                            onClick={() => setKeys({ ...keys, elevenLabsSpeakerBoost: !(keys.elevenLabsSpeakerBoost ?? true) })}
                            className={cn(
                              "w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer",
                              (keys.elevenLabsSpeakerBoost ?? true) ? "bg-her-accent" : "bg-white/10"
                            )}
                          >
                            <span className={cn(
                              "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm",
                              (keys.elevenLabsSpeakerBoost ?? true) ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'interface' && (
                  <motion.div
                    key="interface"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-8"
                  >
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Voz do Sistema (Frequência Gemini Live)</label>
                        
                        <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1.5 custom-scrollbar">
                          {['Femininas', 'Masculinas', 'Especiais'].map((cat) => {
                            const catVoices = VOICE_DETAILS.filter(v => v.category === cat);
                            if (catVoices.length === 0) return null;
                            return (
                              <div key={cat} className="space-y-2 text-left">
                                <span className="block text-[8.5px] uppercase tracking-[0.15em] text-her-muted/65 font-bold mb-1.5 select-none">{cat}</span>
                                <div className="grid grid-cols-2 gap-2">
                                  {catVoices.map((v) => (
                                    <button
                                      key={v.id}
                                      onClick={() => setSelectedVoice(v.id)}
                                      className={cn(
                                        "px-4 py-3 rounded-2xl transition-all border text-left flex flex-col gap-1.5 group relative overflow-hidden cursor-pointer",
                                        selectedVoice === v.id 
                                          ? "bg-her-accent/10 text-her-accent border-her-accent/30" 
                                          : "bg-white/[0.02] text-her-muted border-white/[0.05] hover:bg-white/[0.05]",
                                        v.id === 'Scarlet' && selectedVoice !== 'Scarlet' && "border-cyan-950/20 hover:border-cyan-500/20 hover:bg-cyan-950/5",
                                        v.id === 'Scarlet' && selectedVoice === 'Scarlet' && "bg-cyan-950/20 text-cyan-400 border-cyan-500/40"
                                      )}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span className={cn(
                                          "text-[11px] font-semibold tracking-wide",
                                          v.id === 'Scarlet' ? "text-cyan-400 font-medium" : "text-zinc-250 transition-colors",
                                          selectedVoice === v.id && (v.id === 'Scarlet' ? "text-cyan-300" : "text-her-accent")
                                        )}>
                                          {v.name}
                                        </span>
                                        {selectedVoice === v.id && (
                                          <div className={cn(
                                            "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(var(--her-accent),0.5)]",
                                            v.id === 'Scarlet' ? "bg-cyan-500 shadow-cyan-500/50" : "bg-her-accent"
                                          )} />
                                        )}
                                      </div>
                                      <span className="text-[9px] text-zinc-400 transition-colors leading-normal font-sans select-none">
                                        {v.desc}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {selectedVoice === 'Scarlet' && (
                          <div className="mt-3 p-4 bg-cyan-950/10 border border-cyan-900/30 rounded-2xl space-y-2 animate-fadeIn text-left">
                            <label className="block text-[9px] uppercase tracking-[0.15em] text-cyan-400 font-bold select-none">
                              Perfil Vocal do Modo Sensus (Quantum)
                            </label>
                            <textarea
                              value={vocalProfileEscarlate}
                              onChange={(e) => setVocalProfileEscarlate(e.target.value)}
                              rows={2}
                              placeholder="Ex: voz profunda, ressonante, pausada, de sabedoria cósmica, misteriosa... "
                              className="w-full bg-[#0a0a0a]/80 border border-cyan-900/20 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500 text-xs text-cyan-100 placeholder-cyan-900/40 resize-none font-sans"
                            />
                            <p className="text-[8.5px] text-cyan-850/80 leading-normal font-sans">
                              Descreva os atributos acústicos do Osone Sensus. O motor neural adaptará a pronúncia por inteligência quântica para ressoar as características fornecidas acima.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Chat Auto Speak Option */}
                      <div className="flex items-center justify-between bg-white/[0.01]/10 p-4 rounded-3xl border border-white/5">
                        <div className="flex flex-col text-left space-y-0.5">
                          <span className="text-xs text-zinc-300 font-medium select-none flex items-center gap-1.5 align-middle">
                            <Volume2 size={13} className="text-her-accent" />
                            Auto-Leitura de Mensagens
                          </span>
                          <span className="text-[10px] text-her-muted select-none leading-normal">
                            Fala respostas da IA automaticamente no chat principal usando o motor atual
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            if (setIsChatAutoSpeakActive) {
                              const newState = !isChatAutoSpeakActive;
                              setIsChatAutoSpeakActive(newState);
                              if (onAddNotification) {
                                onAddNotification(newState ? "Auto-leitura do chat ativada" : "Auto-leitura do chat desativada", "info");
                              }
                            }
                          }}
                          className={cn(
                            "w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer",
                            isChatAutoSpeakActive ? "bg-her-accent" : "bg-white/10"
                          )}
                        >
                          <span className={cn(
                            "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm",
                            isChatAutoSpeakActive ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted mb-4 font-bold">Estilo do Orb de IA</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'classic', name: 'Clássico (Esfera)' },
                            { id: 'wave', name: 'Fluidos (Alabastro)' },
                            { id: 'neural', name: 'Constelação Neural (Padrão)' },
                            { id: 'jarvis', name: 'Jarvis (HUD 3D)' },
                            { id: 'smoke', name: 'Nuvem de Fumaça (Virtual)' },
                            { id: 'shadow', name: 'Osone Sensus (Quântico)' },
                          ].map((styleOption) => (
                            <button
                              key={styleOption.id}
                              onClick={() => setOrbStyle(styleOption.id as OrbStyle)}
                              className={cn(
                                "px-4 py-3 rounded-2xl text-[10px] sm:text-xs font-light transition-all border text-left flex items-center justify-between group",
                                orbStyle === styleOption.id 
                                  ? "bg-her-accent/10 text-her-accent border-her-accent/30" 
                                  : "bg-white/[0.02] text-her-muted border-white/[0.05] hover:bg-white/[0.05]"
                              )}
                            >
                              <span>{styleOption.name}</span>
                              {orbStyle === styleOption.id && (
                                <div className="w-1.5 h-1.5 rounded-full bg-her-accent shadow-[0_0_8px_rgba(var(--her-accent),0.5)]" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-6 pt-6 border-t border-white/[0.03] space-y-3">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-her-muted tracking-[0.2em]">
                          <span>Calibrador de Tamanho do Orb</span>
                          <span className="text-her-accent font-mono tracking-normal lowercase">{orbSize}%</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] text-her-muted/50 font-light font-mono">50%</span>
                          <input 
                            type="range"
                            min="50"
                            max="250"
                            step="5"
                            value={orbSize}
                            onChange={(e) => setOrbSize(Number(e.target.value))}
                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-her-accent focus:outline-none"
                          />
                          <span className="text-[10px] text-her-muted/50 font-light font-mono">250%</span>
                        </div>
                        <p className="text-[10px] text-her-muted/40 font-light leading-normal">
                          Deslize para calibrar e redimensionar o tamanho físico de todas as interfaces e renderizações do Orb do OSONE.
                        </p>
                      </div>

                      <div className="mt-6 pt-6 border-t border-white/[0.03] space-y-3">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-her-muted tracking-[0.2em]">
                          <span>Centralização do Orb</span>
                          <span className={cn("font-mono tracking-normal text-[10px] uppercase", orbCenterMode ? "text-her-accent" : "text-her-muted/50")}>
                            {orbCenterMode ? "Sempre Centralizado" : "Minimizado no Topo"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 bg-white/[0.01] border border-white/[0.03] p-3 rounded-2xl">
                          <div className="space-y-0.5">
                            <span className="block text-[10px] text-zinc-300 font-medium">Manter Orb no Centro</span>
                            <span className="block text-[9px] text-her-muted/40 font-light leading-normal">
                              Evita que o Orb seja ocultado no topo ao interagir pelo chat de texto.
                            </span>
                          </div>
                          <button
                            onClick={() => setOrbCenterMode && setOrbCenterMode(!orbCenterMode)}
                            className={cn(
                              "w-10 h-5 rounded-full relative transition-colors focus:outline-none cursor-pointer shrink-0",
                              orbCenterMode ? "bg-her-accent" : "bg-white/10"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all",
                              orbCenterMode ? "left-55" : "left-0.5"
                            ).replace('left-55', 'left-5.5')} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 bg-white/[0.01] border border-white/[0.03] rounded-3xl space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Modulador de Voz</label>
                        <button 
                          onClick={() => setVoiceModulation({ pitch: 1.0, rate: 1.0, distortion: 0 })}
                          className="text-[8px] uppercase tracking-widest text-her-accent hover:underline"
                        >
                          Resetar
                        </button>
                      </div>

                      <div className="space-y-5">
                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] text-her-muted/60 uppercase font-medium">
                            <span>Tonalidade (Pitch)</span>
                            <span className="text-her-accent">{voiceModulation.pitch.toFixed(2)}x</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="2.0" step="0.05"
                            value={voiceModulation.pitch}
                            onChange={(e) => setVoiceModulation({ ...voiceModulation, pitch: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] text-her-muted/60 uppercase font-medium">
                            <span>Velocidade (Rate)</span>
                            <span className="text-her-accent">{voiceModulation.rate.toFixed(2)}x</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="2.0" step="0.05"
                            value={voiceModulation.rate}
                            onChange={(e) => setVoiceModulation({ ...voiceModulation, rate: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] text-her-muted/60 uppercase font-medium">
                            <span>Distorção / Ruído</span>
                            <span className="text-her-accent">{Math.round(voiceModulation.distortion * 100)}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="1" step="0.01"
                            value={voiceModulation.distortion}
                            onChange={(e) => setVoiceModulation({ ...voiceModulation, distortion: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'profile' && (
                  <motion.div
                    key="profile"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-6"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Personalidade Pré-definida</label>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {PERSONAS.map((persona) => (
                          <button
                            key={persona.id}
                            onClick={() => onPersonaChange(persona)}
                            className={cn(
                              "flex flex-col items-start px-3.5 py-2.5 rounded-xl text-left transition-all border",
                              selectedPersona.id === persona.id
                                ? persona.id === 'shadow'
                                  ? "bg-cyan-950/30 text-cyan-400 border-cyan-900/40"
                                  : "bg-her-accent/10 text-her-accent border-her-accent/20"
                                : "text-her-muted border-white/[0.05] hover:bg-white/5 hover:text-her-ink"
                            )}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {persona.icon}
                              <span className="text-[11px] font-medium tracking-wide">{persona.name}</span>
                            </div>
                            <span className="text-[9px] opacity-50 font-light truncate w-full">{persona.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Fingerprint size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Dossiês</label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          onClick={onOpenIdentityDossier}
                          className="w-full py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          <Fingerprint size={13} />
                          <span>Dossiê de Identidade ({intimateAnswersCount}/55)</span>
                        </button>
                        <button
                          onClick={onOpenAiDossier}
                          className="w-full py-2.5 px-3 rounded-xl bg-her-accent/10 hover:bg-her-accent/20 text-her-accent border border-her-accent/20 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          <Sparkles size={13} />
                          <span>Dossiê da IA</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <UserCircle size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Identidade da Inteligência</label>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] text-her-muted/60 mb-2 ml-1">Nome da IA</label>
                          <input 
                            type="text"
                            value={aiProfile.name}
                            onChange={(e) => setAiProfile({ ...aiProfile, name: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80"
                            placeholder="Ex: OSONE, EREBUS, JARVIS..."
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-her-muted/60 mb-2 ml-1">Personalidade e Essência</label>
                          <textarea 
                            value={aiProfile.personality}
                            onChange={(e) => setAiProfile({ ...aiProfile, personality: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80 min-h-[100px] resize-none"
                            placeholder="Descreva como a IA deve se comportar..."
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-her-muted/60 mb-2 ml-1">Jeito de Escrever / Tom de Voz</label>
                          <textarea 
                            value={aiProfile.writingStyle}
                            onChange={(e) => setAiProfile({ ...aiProfile, writingStyle: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80 min-h-[80px] resize-none"
                            placeholder="Ex: Respostas curtas, uso de gírias, tom acadêmico..."
                          />
                        </div>

                        {/* Obsidian Integration */}
                        <div className="pt-4 border-t border-white/5">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-5 h-5 rounded bg-[#7C3AED]/20 flex items-center justify-center">
                              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-[#7C3AED]" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 0L2.5 4.5V19.5L12 24L21.5 19.5V4.5L12 0ZM19.5 18.25L12 21.75L4.5 18.25V5.75L12 2.25L19.5 5.75V18.25Z" />
                                <path d="M12 5.5L7.5 8V16L12 18.5L16.5 16V8L12 5.5ZM15 15.25L12 17L9 15.25V8.75L12 7L15 8.75V15.25Z" />
                              </svg>
                            </div>
                            <span className="text-[10px] uppercase tracking-widest text-her-accent font-bold">Obsidian Local Sync</span>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-[9px] text-her-muted/50 mb-1 ml-1 uppercase">API Url (Local REST API)</label>
                              <input 
                                type="text"
                                value={aiProfile.obsidianConfig?.baseUrl || ''}
                                onChange={(e) => setAiProfile({ 
                                  ...aiProfile, 
                                  obsidianConfig: { ...(aiProfile.obsidianConfig || { apiKey: '' }), baseUrl: e.target.value } 
                                })}
                                className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-2 focus:outline-none focus:border-her-accent/20 transition-all text-[11px] font-mono"
                                placeholder="http://127.0.0.1:27123"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] text-her-muted/50 mb-1 ml-1 uppercase">API Key</label>
                              <input 
                                type="password"
                                value={aiProfile.obsidianConfig?.apiKey || ''}
                                onChange={(e) => setAiProfile({ 
                                  ...aiProfile, 
                                  obsidianConfig: { ...(aiProfile.obsidianConfig || { baseUrl: '' }), apiKey: e.target.value } 
                                })}
                                className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-2 focus:outline-none focus:border-her-accent/20 transition-all text-[11px] font-mono"
                                placeholder="Sua chave secreta..."
                              />
                            </div>
                            <p className="text-[9px] text-her-muted/40 italic">
                              Habilite o plugin "Local REST API" no Obsidian para obter estes dados.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'automation' && (
                  <motion.div
                    key="automation"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-8"
                  >
                    {/* OSONE LOCAL AGENT (UNIFIED LOCAL AUTOMATION) CARD */}
                    <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-[2rem] space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
                            <Cpu size={22} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white">OSONE Local Agent</h3>
                            <p className="text-[10px] text-emerald-400/80 uppercase tracking-widest font-mono">Automação de Sistema Operacional & Arquivos</p>
                          </div>
                        </div>
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wider font-bold border",
                          localAgentStatus === 'success' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          localAgentStatus === 'error' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                        )}>
                          {localAgentStatus === 'success' ? "Online & Unificado" : localAgentStatus === 'error' ? "Pendente" : "Servidor Unificado (Porta 3000)"}
                        </span>
                      </div>

                      <p className="text-xs text-her-muted leading-relaxed font-light">
                        O Agente Local agora roda <strong>unificado</strong> dentro do próprio servidor principal do OSONE (porta 3000, rota <code className="font-mono text-emerald-400">/api/agent</code>). Ele permite abrir qualquer app/arquivo/pasta/URL, ajustar volume, checar a saúde do PC, rodar comandos de terminal e organizar arquivos locais — sempre protegido por um token único gerado automaticamente para esta instalação.
                      </p>

                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold mb-1.5 pl-1">
                            Token do Agente Local (Authorization Bearer)
                          </label>
                          <p className="text-[10px] text-her-muted/60 leading-relaxed font-sans mb-2 pl-1">
                            O token é gerado automaticamente para esta instalação. Clique em <strong className="text-emerald-400">Gerar Token Automaticamente</strong> — não é necessário abrir nenhum arquivo.
                          </p>
                          <div className="relative flex items-center">
                            <input
                              type={showLocalAgentToken ? "text" : "password"}
                              value={keys.localAgentToken || ''}
                              onChange={(e) => setKeys({ ...keys, localAgentToken: e.target.value })}
                              className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 pr-12 focus:outline-none focus:border-emerald-500/30 transition-all text-xs font-mono text-white placeholder:text-her-muted/20"
                              placeholder="Clique no botão abaixo para gerar automaticamente..."
                            />
                            <button
                              type="button"
                              onClick={() => setShowLocalAgentToken(!showLocalAgentToken)}
                              className="absolute right-3 p-1.5 text-her-muted/50 hover:text-white transition-colors cursor-pointer"
                              title={showLocalAgentToken ? "Ocultar Token" : "Mostrar Token"}
                            >
                              {showLocalAgentToken ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleProvisionLocalAgentToken}
                          disabled={isProvisioningToken}
                          className={cn(
                            "w-full py-3 rounded-2xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                            isProvisioningToken
                              ? "bg-white/5 text-her-muted cursor-wait"
                              : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25"
                          )}
                        >
                          <KeyRound size={13} />
                          {isProvisioningToken ? "Gerando..." : "Gerar Token Automaticamente"}
                        </button>

                        <button
                          type="button"
                          onClick={handleTestLocalAgent}
                          disabled={localAgentStatus === 'testing'}
                          className={cn(
                            "w-full py-3 rounded-2xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                            localAgentStatus === 'testing' ? "bg-white/5 text-her-muted cursor-wait" :
                            localAgentStatus === 'success' ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                            localAgentStatus === 'error' ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25" :
                            "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                          )}
                        >
                          {localAgentStatus === 'testing' ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-emerald-400" />
                              Testando Conexão com /api/agent/status...
                            </>
                          ) : localAgentStatus === 'success' ? (
                            <>
                              <CheckCircle2 size={13} className="text-emerald-400" />
                              Agente Local Online
                            </>
                          ) : (
                            <>
                              <Activity size={13} />
                              Testar Conexão do Agente Local
                            </>
                          )}
                        </button>

                        {localAgentMessage && (
                          <div className={cn(
                            "px-4 py-3 rounded-2xl text-[11px] flex items-start gap-2 animate-in fade-in slide-in-from-top-1 border",
                            localAgentStatus === 'success' ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
                            localAgentStatus === 'error' ? "bg-red-500/10 text-red-300 border-red-500/20" :
                            "bg-white/5 text-her-muted border-white/10"
                          )}>
                            {localAgentStatus === 'success' ? (
                              <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                            )}
                            <span className="leading-relaxed font-medium">{localAgentMessage}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* TUYA CLOUD OPENAPI INTEGRATION CARD */}
                    <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-[2rem] space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
                            <Cpu size={22} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white">Tuya Cloud IoT Platform</h3>
                            <p className="text-[10px] text-amber-400/80 uppercase tracking-widest font-mono">Obrigatório • O caminho até os aparelhos</p>
                          </div>
                        </div>
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wider font-bold border",
                          tuyaStatus === 'success' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          tuyaStatus === 'error' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          "bg-amber-500/10 text-amber-300 border-amber-500/20"
                        )}>
                          {tuyaStatus === 'success' ? "Configurado" : tuyaStatus === 'error' ? "Pendente" : "Segurança Backend"}
                        </span>
                      </div>

                      {/*
                        O que a Tuya É vinha faltando aqui, e a falta custava caro: com um cartão
                        de Google Home logo abaixo, quem não conhece o nome conclui que a Tuya é
                        uma etapa de dentro do Google. É o contrário — a Tuya é a nuvem do
                        fabricante das lâmpadas, o único caminho até elas, e o Google é opcional.
                      */}
                      <p className="text-xs text-her-muted leading-relaxed font-light">
                        <strong className="text-amber-300">É por aqui que o OSONE mexe nos seus aparelhos.</strong> A Tuya
                        é a nuvem do fabricante das suas lâmpadas e tomadas — a mesma que o app Smart Life usa no
                        celular. Sem esta conta o OSONE não alcança aparelho nenhum, e nenhuma outra integração
                        substitui isso. O Access Secret fica guardado só do lado do servidor e nunca volta para o navegador.
                      </p>

                      <button
                        type="button"
                        onClick={handleTestTuya}
                        disabled={tuyaStatus === 'testing'}
                        className={cn(
                          "w-full py-3 rounded-2xl text-[10px] uppercase tracking-[0.2em] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                          tuyaStatus === 'testing' ? "bg-white/5 text-her-muted" :
                          tuyaStatus === 'success' ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                          tuyaStatus === 'error' ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25" :
                          "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
                        )}
                      >
                        {tuyaStatus === 'testing' ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Verificando Backend...
                          </>
                        ) : (
                          <>
                            <Activity size={14} />
                            Verificar Configuração Tuya
                          </>
                        )}
                      </button>

                      {/*
                        OS CAMPOS. Ficam ACIMA do checklist de propósito: o checklist diz o que
                        falta, e o que falta precisa ter onde ser preenchido logo em seguida.
                      */}
                      {blocoDeCredenciais(
                        'TUYA_',
                        <>Os quatro valores saem do seu projeto em <strong className="text-amber-300">iot.tuya.com</strong>. Ficam guardados no servidor desta máquina — o Access Secret assina cada requisição e nunca volta para o navegador.</>
                      )}

                      {tuyaStatus !== 'idle' && (
                        <div className={cn(
                          "p-4 rounded-2xl text-xs space-y-2 border",
                          tuyaStatus === 'success' ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
                          tuyaStatus === 'error' ? "bg-red-500/10 text-red-300 border-red-500/20" :
                          "bg-white/5 text-her-muted border-white/10"
                        )}>
                          <p className="font-medium text-[11px] flex items-center gap-2">
                            {tuyaStatus === 'success' ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertCircle size={14} className="text-amber-400" />}
                            {tuyaMessage}
                          </p>
                          {tuyaDetails?.env && (
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-2 border-t border-white/10">
                              <span className="flex items-center gap-1.5">
                                {tuyaDetails.env.clientId ? '✅' : '❌'} TUYA_CLIENT_ID
                              </span>
                              <span className="flex items-center gap-1.5">
                                {tuyaDetails.env.clientSecret ? '✅' : '❌'} TUYA_CLIENT_SECRET
                              </span>
                              <span className="flex items-center gap-1.5">
                                {tuyaDetails.env.baseUrl ? '✅' : '❌'} TUYA_BASE_URL
                              </span>
                              <span className="flex items-center gap-1.5">
                                {tuyaDetails.env.userUid ? '✅' : '❌'} TUYA_USER_UID
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/*
                      GOOGLE HOME — depois da Tuya de propósito: o Assistente comanda os aparelhos
                      DA TUYA, então sem aquela conta este cartão não teria o que oferecer. A ordem
                      na tela é a ordem em que as coisas precisam ser feitas.
                    */}
                    <div className="p-6 bg-sky-500/5 border border-sky-500/20 rounded-lg space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-sky-500/10 rounded-lg text-sky-400">
                            <Home size={22} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white">Google Home</h3>
                            <p className="text-[10px] text-sky-400/80 uppercase tracking-widest font-mono">Opcional • Só para caixinhas do Google</p>
                          </div>
                        </div>
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wider font-bold border shrink-0",
                          connectionStatus === 'connected' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          connectionStatus === 'error' ? "bg-amber-500/10 text-amber-300 border-amber-500/20" :
                          "bg-sky-500/10 text-sky-300 border-sky-500/20"
                        )}>
                          {googlePairing ? "Código pronto" : connectionStatus === 'error' ? "Pendente" : "Opcional"}
                        </span>
                      </div>

                      <p className="text-xs text-her-muted leading-relaxed font-light">
                        Use os aparelhos da sua conta Tuya pelo Google Assistente. A ponte segura do OSONE funciona
                        pela internet mesmo quando este computador estiver desligado; fechaduras nunca são expostas.
                      </p>

                      <button
                        type="button"
                        onClick={ativarGoogleHomeNoInstalavel}
                        disabled={connectionStatus === 'testing'}
                        className={cn(
                          "w-full py-3 rounded-lg text-[10px] uppercase tracking-[0.2em] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                          connectionStatus === 'testing' ? "bg-white/5 text-her-muted" :
                          connectionStatus === 'connected' ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                          connectionStatus === 'error' ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25" :
                          "bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30"
                        )}
                      >
                        {connectionStatus === 'testing' ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Preparando a ponte...
                          </>
                        ) : (
                          <>
                            <Home size={14} />
                            Ativar no Google Home
                          </>
                        )}
                      </button>

                      {connectionStatus !== 'idle' && connectionMessage && (
                        <div className={cn(
                          "p-4 rounded-lg text-[11px] flex items-start gap-2 border leading-relaxed",
                          connectionStatus === 'connected' ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
                          connectionStatus === 'error' ? "bg-amber-500/10 text-amber-200 border-amber-500/20" :
                          "bg-white/5 text-her-muted border-white/10"
                        )}>
                          {connectionStatus === 'connected'
                            ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                            : <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />}
                          <span className="font-medium">{connectionMessage}</span>
                        </div>
                      )}

                      {googlePairing && (
                        <div className="bg-black/30 p-4 rounded-lg border border-emerald-500/25 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-[9px] uppercase tracking-widest text-emerald-300/70 font-bold">Código de vínculo</span>
                              <div className="text-2xl font-mono font-bold text-white mt-1">{googlePairing.code}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(googlePairing.code)}
                              className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
                              title="Copiar código"
                            >
                              <Copy size={16} />
                            </button>
                          </div>
                          <p className="text-[10px] text-zinc-400 leading-relaxed">
                            No celular, abra Google Home &gt; Adicionar dispositivo &gt; Funciona com Google Home &gt;
                            OSONE. Digite este código quando a tela de autorização abrir.
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'atualizacao' && (
                  <motion.div
                    key="atualizacao"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-5"
                  >
                    <div className="p-5 bg-white/[0.01] border border-white/[0.04] rounded-3xl space-y-1">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Versão instalada</span>
                      <p className="text-2xl font-light text-her-ink">{atualizacao?.versaoAtual || '...'}</p>
                      {atualizacao?.ultimaChecagem && (
                        <p className="text-[10px] text-her-muted/70 font-mono">
                          Última procura: {new Date(atualizacao.ultimaChecagem).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>

                    {atualizacao && !atualizacao.suportado ? (
                      // Fora do app instalado não existe release para comparar — e dizer isso é
                      // melhor do que um botão que nunca vai encontrar nada.
                      <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] flex items-start gap-3">
                        <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-her-muted leading-relaxed">{atualizacao.mensagem}</p>
                      </div>
                    ) : (
                      <>
                        <div className="p-5 bg-white/[0.01] border border-white/[0.04] rounded-3xl space-y-4">
                          {atualizacao?.fase === 'baixada' ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-emerald-400">
                                <CheckCircle2 size={15} />
                                <span className="text-xs font-bold">Versão {atualizacao.versaoNova} pronta para instalar</span>
                              </div>
                              <p className="text-[11px] text-her-muted leading-relaxed">
                                Ela já foi baixada. O OSONE vai fechar, instalar e abrir de novo sozinho — leva alguns segundos.
                                O ícone, o atalho e a pasta continuam os mesmos.
                              </p>
                              <button
                                type="button"
                                onClick={instalarAtualizacao}
                                className="w-full p-3 rounded-2xl border border-emerald-500/25 hover:border-emerald-500/50 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.15] text-emerald-300 text-xs font-bold transition-all cursor-pointer"
                              >
                                Reiniciar e instalar agora
                              </button>
                            </div>
                          ) : atualizacao?.fase === 'baixando' || atualizacao?.fase === 'disponivel' ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-her-accent">
                                <Loader2 size={14} className="animate-spin" />
                                <span className="text-xs font-bold">
                                  Baixando a versão {atualizacao.versaoNova} — {atualizacao.progresso}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-her-accent transition-all duration-500" style={{ width: `${Math.max(3, atualizacao.progresso)}%` }} />
                              </div>
                              <p className="text-[10px] text-her-muted/70">Pode continuar usando o OSONE; o download corre por baixo.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-[11px] text-her-muted leading-relaxed">
                                {atualizacao?.fase === 'atualizado'
                                  ? 'Você está na versão mais recente publicada.'
                                  : 'O OSONE procura atualização sozinho ao abrir e a cada 6 horas, e instala ao fechar. Aqui você força a procura na hora.'}
                              </p>
                              <button
                                type="button"
                                onClick={procurarAtualizacao}
                                disabled={checandoAtualizacao || atualizacao?.fase === 'procurando'}
                                className="w-full p-3 rounded-2xl border border-white/10 hover:border-her-accent/40 bg-white/[0.02] hover:bg-her-accent/[0.06] text-her-ink text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                              >
                                {(checandoAtualizacao || atualizacao?.fase === 'procurando')
                                  ? <><Loader2 size={14} className="animate-spin" /> Procurando...</>
                                  : <><RefreshCw size={14} /> Procurar atualização</>}
                              </button>
                            </div>
                          )}
                        </div>

                        {atualizacao?.fase === 'erro' && atualizacao.mensagem && (
                          <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/[0.04] space-y-1">
                            <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-widest">
                              <AlertCircle size={12} /> A procura falhou
                            </div>
                            {/* O motivo vai inteiro: é ele que distingue "sem internet" de
                                "release publicada sem o manifesto", que exigem coisas diferentes. */}
                            <p className="text-[11px] text-red-200/80 leading-relaxed">{atualizacao.mensagem}</p>
                          </div>
                        )}
                      </>
                    )}

                    <p className="text-[10px] text-her-muted/60 leading-relaxed">
                      A atualização substitui o programa no lugar onde ele já está: o nome do aplicativo, o atalho e a
                      pasta de instalação não mudam. Suas conversas, chaves e configurações continuam como estão.
                    </p>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
            
            <div className="p-8 pt-4 bg-white/[0.02] border-t border-white/[0.05]">
              <button 
                onClick={onClose}
                className="group relative w-full bg-her-accent text-white rounded-2xl py-4 font-bold text-xs uppercase tracking-[0.2em] overflow-hidden shadow-lg shadow-her-accent/20 active:scale-95 transition-all"
              >
                <span className="relative z-10">Consolidar Parâmetros</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
              <div className="mt-4 text-center">
                <span className="text-[8px] text-her-muted opacity-30 uppercase tracking-[0.3em]">Quantum Encrypted Tunnel Active</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
