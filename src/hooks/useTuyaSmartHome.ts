import { useState, useRef, useEffect } from 'react';
import { PendingTuyaConfirmation } from '../components/TuyaConfirmModal';
import {
  ComandosOuFalha,
  RecursosDoAparelho,
  descreverComandos,
  ehFechadura,
  montarComandos,
  recursosDosDps,
  semAcento
} from '../lib/tuyaDispositivos';

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

  // Não deixa o timeout de 180s da confirmação pendente sobreviver ao unmount: sem isto, ele
  // rodaria mesmo com o componente dono já desmontado, chamando setPendingTuyaConfirmation numa
  // árvore que não existe mais e resolvendo uma promise cujo chamador pode já ter ido embora.
  useEffect(() => {
    return () => {
      if (pendingTuyaTimerRef.current) {
        clearTimeout(pendingTuyaTimerRef.current);
        pendingTuyaTimerRef.current = null;
      }
      pendingTuyaResolveRef.current = null;
    };
  }, []);

  const isTuyaLockCategoryClient = (category?: string): boolean => ehFechadura(category);

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
   * Lê do aparelho o que ele aceita. O 'ok' da resposta não pode ser ignorado: numa resposta de
   * erro o corpo é {error}, a lista de pontos de dados sai vazia, e isso fica indistinguível de
   * um aparelho que simplesmente não tem recurso nenhum — o que fazia "alternar" virar sempre
   * "ligar" e ser anunciado como sucesso.
   */
  const lerRecursosDoAparelho = async (deviceId: string): Promise<RecursosDoAparelho | null> => {
    try {
      const statusRes = await fetch(`/api/tuya/device/${encodeURIComponent(deviceId)}/status`);
      const statusData = await statusRes.json().catch(() => null);
      if (!statusRes.ok || !Array.isArray(statusData?.status)) return null;
      return recursosDosDps(statusData.status);
    } catch {
      return null;
    }
  };

  const buildTuyaCommandsForAction = async (deviceId: string, action: string, value: any, color: any): Promise<ComandosOuFalha> => {
    const recursos = await lerRecursosDoAparelho(deviceId);
    if (!recursos) {
      return { falha: "Não foi possível ler o estado atual do aparelho na Tuya, então não dá para saber quais comandos ele aceita. Nada foi enviado." };
    }
    return montarComandos(recursos, action, value, color);
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

  /**
   * Executa uma cena mandando comandos REAIS, um aparelho por vez.
   *
   * Antes esta função só reescrevia um JSON no navegador e respondia "rotina executada com
   * sucesso" — mesmo com a Tuya configurada, nenhum aparelho era tocado em momento nenhum. O
   * relatório agora conta o que de fato aconteceu, inclusive quando parte da cena falha.
   */
  const executeTuyaRoutine = async (routineName: string, isVoiceSession: boolean): Promise<{ message: string; ok: boolean }> => {
    let rotinas: any[] = [];
    try {
      rotinas = JSON.parse(localStorage.getItem('osone_smarthome_routines') || '[]');
    } catch { rotinas = []; }

    const alvo = semAcento(routineName);
    const cena = rotinas.find((r: any) => semAcento(r?.name) === alvo)
      || rotinas.find((r: any) => semAcento(r?.name).includes(alvo));
    if (!cena) {
      return { ok: false, message: `⚠️ Nenhuma cena chamada "${routineName}" foi encontrada. As cenas são criadas no painel do OSONE HOME.` };
    }

    const feitos: string[] = [];
    const falhas: string[] = [];
    for (const acao of (cena.actions || [])) {
      const r = await executeTuyaDeviceControl(acao.deviceId, acao.targetState ? 'turn_on' : 'turn_off', undefined, undefined, isVoiceSession);
      if (r.ok) feitos.push(acao.deviceId);
      else falhas.push(r.message.replace(/^[⚠️🔒✅\s]+/, ''));
    }

    if (feitos.length === 0) {
      return { ok: false, message: `⚠️ A cena "${cena.name}" não conseguiu ajustar nenhum aparelho. ${falhas.join(' ')}` };
    }
    return {
      ok: falhas.length === 0,
      message: falhas.length === 0
        ? `✨ Cena **"${cena.name}"**: ${feitos.length} aparelho(s) real(is) ajustado(s).`
        : `✨ Cena **"${cena.name}"**: ${feitos.length} ajustado(s), ${falhas.length} com problema — ${falhas.join(' ')}`
    };
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
    executeTuyaRoutine,
    getTuyaConnectedDevicesList
  };
}
