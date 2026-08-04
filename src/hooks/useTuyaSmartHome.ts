import { useState, useRef, useEffect } from 'react';
import { PendingTuyaConfirmation } from '../components/TuyaConfirmModal';

/**
 * Controle de dispositivos Tuya reais via /api/tuya/*. Fechaduras exigem confirmação
 * humana explícita no painel (texto) e são totalmente bloqueadas em sessões de voz.
 */
export function useTuyaSmartHome() {
  const [isTuyaConfigured, setIsTuyaConfigured] = useState(false);
  const [pendingTuyaConfirmation, setPendingTuyaConfirmation] = useState<PendingTuyaConfirmation | null>(null);
  const pendingTuyaResolveRef = useRef<((value: any) => void) | null>(null);
  const pendingTuyaTimerRef = useRef<any>(null);

  useEffect(() => {
    fetch('/api/tuya/status')
      .then(res => res.json())
      .then(data => setIsTuyaConfigured(!!data?.configured))
      .catch(() => setIsTuyaConfigured(false));
  }, []);

  const isTuyaLockCategoryClient = (category?: string): boolean => {
    if (!category) return false;
    const cat = category.toLowerCase().trim();
    const lockCategories = ['ms', 'jtmspro', 'mk', 'jdms', 'lck', 'lock', 'fechadura'];
    if (lockCategories.includes(cat)) return true;
    return cat.includes('lock') || cat.includes('fechadura') || cat.includes('door') || cat.includes('latch');
  };

  /**
   * Compara nomes SEM acento. Os aparelhos se chamam "Lâmpada da Sala" no app Smart Life, e o
   * modelo escreve o que o usuário falou — que vem tanto com acento quanto sem. Comparando o
   * texto cru, "lampada" não encontrava "Lâmpada", e a resposta era "nenhum dispositivo
   * encontrado" com o aparelho ali, cadastrado e online.
   */
  const semAcento = (t: string) =>
    (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const findTuyaDeviceByNameOrId = async (query: string): Promise<any | null> => {
    const term = semAcento(query);
    if (!term) return null;
    try {
      const res = await fetch('/api/tuya/devices');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return null;
      const devices: any[] = data.devices || [];
      return devices.find((d: any) => d.id === query)
        // Nome exato antes de nome parecido: com "Luz" e "Luz da Varanda" cadastradas, pedir
        // "luz" tem de acender a "Luz", e não a primeira que por acaso contenha essas letras.
        || devices.find((d: any) => semAcento(d.name) === term)
        || devices.find((d: any) => semAcento(d.name).includes(term))
        || null;
    } catch {
      return null;
    }
  };

  /**
   * O QUE O APARELHO REALMENTE ACEITA, lido do próprio aparelho.
   *
   * Nenhum código de comando é adivinhado aqui, e a razão está no histórico: mandar sempre
   * "switch_1" fazia a Tuya Cloud ACEITAR o comando (sem erro nenhum) e o aparelho ignorá-lo,
   * porque esse ponto de dados nem existe nele. Era a luz que "não fazia nada" com tudo
   * conectado. O status do aparelho lista os pontos que ele de fato tem, então é dele que sai
   * cada código usado — para o brilho e para a cor também, que sofriam do mesmo mal.
   */
  interface RecursosDoAparelho {
    liga?: { code: string; ligado: boolean };
    /** As duas gerações de brilho da Tuya têm FAIXAS diferentes, e mandar na escala errada
     *  apaga a luz quando o pedido era diminuí-la. Por isso a faixa anda junto do código. */
    brilho?: { code: string; min: number; max: number };
    cor?: { code: string };
    modo?: { code: string };
  }

  const FAIXA_DE_BRILHO: Record<string, { min: number; max: number }> = {
    bright_value_v2: { min: 10, max: 1000 },
    bright_value: { min: 25, max: 255 }
  };

  const lerRecursosDoAparelho = async (deviceId: string): Promise<RecursosDoAparelho | null> => {
    let dps: any[];
    try {
      const statusRes = await fetch(`/api/tuya/device/${encodeURIComponent(deviceId)}/status`);
      const statusData = await statusRes.json().catch(() => null);
      // O 'ok' era ignorado: numa resposta de erro o corpo é {error}, statusData.status vem
      // indefinido e a lista saía vazia — indistinguível de um aparelho sem nenhum recurso.
      if (!statusRes.ok || !Array.isArray(statusData?.status)) return null;
      dps = statusData.status;
    } catch {
      return null;
    }

    const achar = (codigos: string[]) => {
      for (const codigo of codigos) {
        const dp = dps.find((d: any) => d.code === codigo);
        if (dp) return dp;
      }
      return undefined;
    };

    const recursos: RecursosDoAparelho = {};

    const liga = achar(['switch_led', 'switch_1', 'switch', 'switch_one', 'power_switch_1'])
      || dps.find((d: any) => /switch/i.test(d.code) && typeof d.value === 'boolean');
    if (liga) recursos.liga = { code: liga.code, ligado: !!liga.value };

    const brilho = achar(['bright_value_v2', 'bright_value']);
    if (brilho) recursos.brilho = { code: brilho.code, ...(FAIXA_DE_BRILHO[brilho.code] || { min: 10, max: 1000 }) };

    const cor = achar(['colour_data_v2', 'colour_data']);
    if (cor) recursos.cor = { code: cor.code };

    const modo = achar(['work_mode']);
    if (modo) recursos.modo = { code: modo.code };

    return recursos;
  };

  /** Cores por nome, em português, porque é assim que o modelo as recebe de quem fala. */
  const CORES_POR_NOME: Record<string, string> = {
    vermelho: '#FF0000', vermelha: '#FF0000',
    verde: '#00FF00',
    azul: '#0000FF',
    amarelo: '#FFFF00', amarela: '#FFFF00',
    ciano: '#00FFFF', turquesa: '#00FFFF',
    magenta: '#FF00FF',
    rosa: '#FF3399',
    laranja: '#FF8000',
    roxo: '#8000FF', violeta: '#8000FF', lilas: '#B060FF',
    dourado: '#FFC000',
    branco: '#FFFFFF', branca: '#FFFFFF'
  };

  /** Converte cor (hex ou nome) para o formato HSV que a Tuya usa: h 0-360, s/v 0-1000. */
  const corParaHsvDaTuya = (bruta: any): { h: number; s: number; v: number } | null => {
    const texto = String(bruta || '').trim();
    if (!texto) return null;

    const hex = /^#?[0-9a-f]{6}$/i.test(texto)
      ? texto.replace('#', '')
      : (CORES_POR_NOME[semAcento(texto)] || '').replace('#', '');
    if (!hex) return null;

    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }

    return { h, s: Math.round((max === 0 ? 0 : d / max) * 1000), v: Math.round(max * 1000) };
  };

  type ComandosOuFalha =
    | { comandos: Array<{ code: string; value: any }> }
    | { falha: string };

  /** Descreve em português o que foi realmente mandado ao aparelho. */
  const descreverComandos = (comandos: Array<{ code: string; value: any }>): string =>
    comandos.map(c => {
      if (typeof c.value === 'boolean') return c.value ? 'ligar' : 'desligar';
      if (/^bright_value/.test(c.code)) {
        const faixa = FAIXA_DE_BRILHO[c.code] || { min: 10, max: 1000 };
        const pct = Math.round(((Number(c.value) - faixa.min) / (faixa.max - faixa.min)) * 100);
        return `brilho em ${pct}%`;
      }
      if (/^colour_data/.test(c.code)) {
        const h = (() => { try { return JSON.parse(String(c.value)).h; } catch { return null; } })();
        return h === null ? 'cor ajustada' : `cor ajustada (matiz ${h}°)`;
      }
      if (c.code === 'work_mode') return `modo ${c.value}`;
      return `${c.code} = ${JSON.stringify(c.value)}`;
    }).join(', ');

  /**
   * Traduz a ação pedida nos comandos que ESTE aparelho entende.
   *
   * Quando o aparelho não tem o recurso, a resposta é uma falha explicada, e não um comando
   * aproximado. Antes, pedir uma cor devolvia apenas "ligar" — a cor era descartada no caminho e
   * o OSONE ainda anunciava "comando recebido com sucesso". Quem pediu luz azul via a luz acender
   * branca e ouvia que tinha dado certo. Dizer que não dá é melhor do que fazer outra coisa e
   * chamar de sucesso.
   */
  const buildTuyaCommandsForAction = async (deviceId: string, action: string, value: any, color: any): Promise<ComandosOuFalha> => {
    const recursos = await lerRecursosDoAparelho(deviceId);
    if (!recursos) {
      return { falha: "Não foi possível ler o estado atual do aparelho na Tuya, então não dá para saber quais comandos ele aceita. Nada foi enviado." };
    }

    if (action === 'turn_on' || action === 'turn_off' || action === 'toggle') {
      if (!recursos.liga) return { falha: "Este aparelho não expõe um comando de liga/desliga que o OSONE saiba usar." };
      // 'toggle' depende de saber o estado atual — que agora é lido de verdade. Antes, quando a
      // leitura falhava, o inverso de "desconhecido" dava sempre LIGAR: pedir para alternar uma
      // luz acesa não fazia nada, e ainda assim era anunciado como sucesso.
      const ligado = action === 'turn_on' ? true : action === 'turn_off' ? false : !recursos.liga.ligado;
      return { comandos: [{ code: recursos.liga.code, value: ligado }] };
    }

    if (action === 'set_value') {
      const numero = Number(value);
      if (!Number.isFinite(numero)) return { falha: "O nível pedido não é um número válido (esperado de 0 a 100)." };
      if (!recursos.brilho) return { falha: "Este aparelho não tem controle de brilho." };
      const { code, min, max } = recursos.brilho;
      const proporcao = Math.max(0, Math.min(100, numero)) / 100;
      const escalado = Math.round(min + proporcao * (max - min));
      const comandos: Array<{ code: string; value: any }> = [{ code, value: escalado }];
      // Brilho em aparelho apagado não se vê. Quem pede "põe em 30%" quer a luz acesa em 30%.
      if (recursos.liga && !recursos.liga.ligado) comandos.unshift({ code: recursos.liga.code, value: true });
      return { comandos };
    }

    if (action === 'set_color') {
      const hsv = corParaHsvDaTuya(color);
      if (!hsv) return { falha: `Não reconheci a cor "${color}". Use um nome de cor comum ou um valor hexadecimal (#RRGGBB).` };
      if (!recursos.cor) return { falha: "Este aparelho não tem luz colorida — só liga, desliga e (às vezes) brilho." };
      const comandos: Array<{ code: string; value: any }> = [];
      if (recursos.liga) comandos.push({ code: recursos.liga.code, value: true });
      // Sem entrar no modo colorido, a lâmpada aceita a cor e continua acesa em branco.
      if (recursos.modo) comandos.push({ code: recursos.modo.code, value: 'colour' });
      comandos.push({ code: recursos.cor.code, value: JSON.stringify(hsv) });
      return { comandos };
    }

    return { falha: `Ação "${action}" não é suportada pelo controle Tuya do OSONE.` };
  };

  const executeTuyaDeviceControl = async (
    deviceName: string,
    action: string,
    value: any,
    color: any,
    isVoiceSession: boolean
  ): Promise<{ message: string; ok: boolean }> => {
    const device = await findTuyaDeviceByNameOrId(deviceName);
    if (!device) {
      return { ok: false, message: `⚠️ Nenhum dispositivo Tuya real encontrado correspondente a "${deviceName}".` };
    }

    const isLock = isTuyaLockCategoryClient(device.category);

    if (isLock && isVoiceSession) {
      return {
        ok: false,
        message: `🔒 Bloqueado: comandos em fechaduras ("${device.name}") não podem ser executados por voz, por segurança. Peça ao usuário para usar o chat de texto do OSONE.`
      };
    }

    const montagem = await buildTuyaCommandsForAction(device.id, action, value, color);
    if ('falha' in montagem) {
      return { ok: false, message: `⚠️ "${device.name}": ${montagem.falha}` };
    }
    const commands = montagem.comandos;

    const sendCommand = async (confirmed: boolean) => {
      const res = await fetch('/api/tuya/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, commands, confirmed })
      });
      const data = await res.json().catch(() => null);
      return { res, data };
    };

    if (!isLock) {
      const { res, data } = await sendCommand(false);
      if (!res.ok) {
        return { ok: false, message: `Erro ao controlar "${device.name}" via Tuya Cloud: ${data?.error || res.statusText}` };
      }
      // A mensagem diz o que FOI ENVIADO, e não um "sucesso" genérico: é dela que o modelo tira
      // o que contar ao usuário, e uma frase vaga o deixava livre para descrever o que imaginou
      // ter pedido — inclusive uma cor que nunca chegou a ser mandada.
      return {
        ok: true,
        message: `✅ Dispositivo real **${device.name}** (Tuya) executou: ${descreverComandos(commands)}.`
      };
    }

    // Dispositivo de fechadura em sessão de texto: exige confirmação humana explícita no painel.
    if (pendingTuyaResolveRef.current) {
      if (pendingTuyaTimerRef.current) clearTimeout(pendingTuyaTimerRef.current);
      pendingTuyaResolveRef.current({ ok: false, message: "Confirmação anterior de fechadura cancelada: uma nova ação foi solicitada." });
      pendingTuyaResolveRef.current = null;
    }

    return new Promise((resolve) => {
      const resolveOnce = (val: { ok: boolean; message: string }) => {
        if (pendingTuyaTimerRef.current) {
          clearTimeout(pendingTuyaTimerRef.current);
          pendingTuyaTimerRef.current = null;
        }
        setPendingTuyaConfirmation(null);
        if (pendingTuyaResolveRef.current === resolveOnce) {
          pendingTuyaResolveRef.current = null;
        }
        resolve(val);
      };

      pendingTuyaResolveRef.current = resolveOnce;

      // Timeout de segurança: 180s sem resposta do usuário cancela a ação.
      pendingTuyaTimerRef.current = setTimeout(() => {
        resolveOnce({ ok: false, message: "⏱️ A confirmação da fechadura expirou por tempo limite (3 minutos sem resposta do usuário no painel)." });
      }, 180000);

      setPendingTuyaConfirmation({
        id: Math.random().toString(36).substring(2, 9),
        deviceId: device.id,
        deviceName: device.name,
        category: device.category,
        code: commands[0]?.code || '',
        value: commands[0]?.value,
        onConfirm: async () => {
          try {
            const { res, data } = await sendCommand(true);
            if (!res.ok) {
              resolveOnce({ ok: false, message: `Erro ao acionar fechadura "${device.name}": ${data?.error || res.statusText}` });
            } else {
              resolveOnce({ ok: true, message: `🔓 Fechadura **${device.name}** acionada com sucesso após confirmação humana no painel.` });
            }
          } catch {
            resolveOnce({ ok: false, message: `Erro de conexão ao acionar fechadura "${device.name}".` });
          }
        },
        onCancel: () => {
          resolveOnce({ ok: false, message: `Ação na fechadura "${device.name}" foi cancelada pelo usuário no painel de confirmação.` });
        }
      });
    });
  };

  const getTuyaConnectedDevicesList = async (): Promise<{ text: string; raw: any[] }> => {
    try {
      const res = await fetch('/api/tuya/devices');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        return { text: "", raw: [] };
      }
      const devices: any[] = data.devices || [];
      return { text: JSON.stringify(devices), raw: devices };
    } catch {
      return { text: "", raw: [] };
    }
  };

  return {
    isTuyaConfigured,
    pendingTuyaConfirmation,
    isTuyaLockCategoryClient,
    executeTuyaDeviceControl,
    getTuyaConnectedDevicesList
  };
}
