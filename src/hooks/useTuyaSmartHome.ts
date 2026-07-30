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

  const findTuyaDeviceByNameOrId = async (query: string): Promise<any | null> => {
    const term = (query || '').toLowerCase().trim();
    if (!term) return null;
    try {
      const res = await fetch('/api/tuya/devices');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return null;
      const devices: any[] = data.devices || [];
      return devices.find((d: any) => d.id === query)
        || devices.find((d: any) => (d.name || '').toLowerCase().includes(term))
        || null;
    } catch {
      return null;
    }
  };

  // Descobre o código real de liga/desliga do dispositivo consultando seu status atual.
  // Bulbo/luz (categoria "dj") normalmente usa "switch_led", tomadas/interruptores usam
  // "switch_1"/"switch". Enviar sempre "switch_1" hardcoded fazia o comando ser aceito pela
  // Tuya Cloud (sem erro) mas ignorado pelo dispositivo físico, porque esse DP nem existe nele
  // — por isso a luz "não fazia nada" mesmo com tudo conectado.
  const resolveTuyaSwitchDp = async (deviceId: string): Promise<{ code: string; currentValue: boolean } | null> => {
    try {
      const statusRes = await fetch(`/api/tuya/device/${encodeURIComponent(deviceId)}/status`);
      const statusData = await statusRes.json().catch(() => null);
      const dps: any[] = statusData?.status || [];

      const preferredOrder = ['switch_led', 'switch_1', 'switch', 'switch_one', 'power_switch_1'];
      for (const preferred of preferredOrder) {
        const match = dps.find((d: any) => d.code === preferred);
        if (match) return { code: match.code, currentValue: !!match.value };
      }

      const generic = dps.find((d: any) => /switch/i.test(d.code) && typeof d.value === 'boolean');
      if (generic) return { code: generic.code, currentValue: !!generic.value };
    } catch {
      // Se não conseguirmos consultar o status, cai no fallback abaixo.
    }
    return null;
  };

  const buildTuyaCommandsForAction = async (deviceId: string, action: string, value: any, color: any): Promise<Array<{ code: string; value: any }>> => {
    if (action === 'toggle' || action === 'turn_on' || action === 'turn_off') {
      const resolved = await resolveTuyaSwitchDp(deviceId);
      const switchCode = resolved?.code || 'switch_1';
      if (action === 'turn_off') return [{ code: switchCode, value: false }];
      if (action === 'toggle') return [{ code: switchCode, value: !resolved?.currentValue }];
      return [{ code: switchCode, value: true }]; // turn_on
    }
    if (action === 'set_value' && value !== undefined) {
      const clamped = Math.max(10, Math.min(1000, Math.round(Number(value) * 10)));
      return [{ code: 'bright_value', value: clamped }];
    }
    if (action === 'set_color' && color) {
      return [{ code: 'switch_led', value: true }];
    }
    // Qualquer ação não mapeada cai no comando genérico de ligar, resolvendo o DP real também.
    const resolved = await resolveTuyaSwitchDp(deviceId);
    return [{ code: resolved?.code || 'switch_1', value: true }];
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

    const commands = await buildTuyaCommandsForAction(device.id, action, value, color);

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
      return { ok: true, message: `✅ Dispositivo real **${device.name}** (Tuya) recebeu o comando com sucesso.` };
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
