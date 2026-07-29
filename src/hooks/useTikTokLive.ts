import { useState, useEffect, useRef } from 'react';

/**
 * Estado e polling do Co-piloto de TikTok Live (/api/tiktok/*). Faz polling do estado da
 * webcast a cada 3s enquanto o workspace 'tiktok' estiver ativo ou a live estiver conectada,
 * narrando comentários/presentes novos via Web Speech Synthesis quando o narrador está ligado.
 */
export function useTikTokLive(
  workspaceMode: string,
  addNotification: (msg: string, type: 'success' | 'info' | 'error') => void
) {
  const [tiktokUser, setTiktokUser] = useState(() => localStorage.getItem('osone_tiktok_user') || '');
  const [tiktokSessionId, setTiktokSessionId] = useState(() => localStorage.getItem('osone_tiktok_session_id') || '');
  const [tiktokTargetIdc, setTiktokTargetIdc] = useState(() => localStorage.getItem('osone_tiktok_target_idc') || '');
  const [tiktokState, setTiktokState] = useState<any>({
    status: 'disconnected',
    username: '',
    isAutoRespondActive: false,
    viewerCount: 0,
    likeCount: 0,
    logs: []
  });
  const [tiktokLoading, setTiktokLoading] = useState(false);
  const [isLiveNarratorActive, setIsLiveNarratorActive] = useState(() => localStorage.getItem('osone_tiktok_live_narrator_active') === 'true');
  const [liveNarratorVoice, setLiveNarratorVoice] = useState(() => localStorage.getItem('osone_tiktok_live_narrator_voice') || 'default');

  useEffect(() => {
    localStorage.setItem('osone_tiktok_user', tiktokUser);
  }, [tiktokUser]);

  useEffect(() => {
    localStorage.setItem('osone_tiktok_session_id', tiktokSessionId);
  }, [tiktokSessionId]);

  useEffect(() => {
    localStorage.setItem('osone_tiktok_target_idc', tiktokTargetIdc);
  }, [tiktokTargetIdc]);

  useEffect(() => {
    localStorage.setItem('osone_tiktok_live_narrator_active', String(isLiveNarratorActive));
  }, [isLiveNarratorActive]);

  useEffect(() => {
    localStorage.setItem('osone_tiktok_live_narrator_voice', liveNarratorVoice);
  }, [liveNarratorVoice]);

  const processedLogsRef = useRef<Set<string>>(new Set());
  const isFirstPollRef = useRef<boolean>(true);

  // Poll TikTok Live webcast status and events
  useEffect(() => {
    let interval: any = null;
    const fetchTiktokState = async () => {
      try {
        const res = await fetch('/api/tiktok/state');
        if (res.ok) {
          const data = await res.json();
          setTiktokState(data);

          if (data.username && !tiktokUser) {
            setTiktokUser(data.username);
          }
          if (data.sessionId && !tiktokSessionId) {
            setTiktokSessionId(data.sessionId);
          }
          if (data.targetIdc && !tiktokTargetIdc) {
            setTiktokTargetIdc(data.targetIdc);
          }

          // Handle Speech synthesis of new comments/gifts in real-time
          if (data.status === 'connected' && data.logs && data.logs.length > 0) {
            if (isFirstPollRef.current) {
              // Populate the initial logs so we do not speak historic stream messages from the past
              data.logs.forEach((log: any) => {
                processedLogsRef.current.add(log.id);
              });
              isFirstPollRef.current = false;
            } else {
              // Find brand new comments/events
              const newLogs = [...data.logs]
                .filter((log: any) => !processedLogsRef.current.has(log.id))
                .reverse(); // Reverse to read oldest new messages to newest new messages

              newLogs.forEach((log: any) => {
                processedLogsRef.current.add(log.id);

                if (isLiveNarratorActive && (log.type === 'chat' || log.type === 'gift')) {
                  // Speak using Web Speech Synthesis
                  if (typeof window !== 'undefined' && window.speechSynthesis) {
                    let text = '';
                    if (log.type === 'chat') {
                      text = `${log.user} comentou: ${log.message}`;
                    } else if (log.type === 'gift') {
                      text = `${log.user} enviou o presente: ${log.message}`;
                    }
                    if (text) {
                      const utterance = new SpeechSynthesisUtterance(text);
                      utterance.lang = 'pt-BR';
                      if (liveNarratorVoice && liveNarratorVoice !== 'default') {
                        const voices = window.speechSynthesis.getVoices();
                        const matched = voices.find(v => v.name === liveNarratorVoice);
                        if (matched) utterance.voice = matched;
                      }
                      window.speechSynthesis.speak(utterance);
                    }
                  }
                }
              });
            }
          } else if (data.status === 'disconnected') {
            isFirstPollRef.current = true;
            processedLogsRef.current.clear();
          }
        }
      } catch (err) {
        console.warn('TikTok live state polling paused of active offline status:', err);
      }
    };

    if (workspaceMode === 'tiktok' || tiktokState?.status === 'connected') {
      fetchTiktokState();
      interval = setInterval(fetchTiktokState, 3000); // Poll TikTok events every 3 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [tiktokUser, tiktokSessionId, tiktokTargetIdc, isLiveNarratorActive, liveNarratorVoice, workspaceMode, tiktokState?.status]);

  const handleTiktokConnect = async (simulate = false) => {
    setTiktokLoading(true);
    try {
      const res = await fetch('/api/tiktok/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: tiktokUser,
          simulate,
          sessionId: tiktokSessionId,
          targetIdc: tiktokTargetIdc
        })
      });

      const data = await res.json();
      if (res.ok) {
        addNotification(data.message || 'Ponte Estabelecida!', 'success');
        // Instantly refresh state
        const stateRes = await fetch('/api/tiktok/state');
        if (stateRes.ok) {
          const freshData = await stateRes.json();
          setTiktokState(freshData);
          isFirstPollRef.current = true; // reset first poll so new comments are queued properly
        }
      } else {
        addNotification(data.error || 'Falha ao conectar ao TikTok.', 'error');
      }
    } catch (err) {
      addNotification('Erro de tráfego de rede.', 'error');
    } finally {
      setTiktokLoading(false);
    }
  };

  const handleTiktokDisconnect = async () => {
    setTiktokLoading(true);
    try {
      const res = await fetch('/api/tiktok/disconnect', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        addNotification(data.message, 'info');
        // Instantly refresh state
        const stateRes = await fetch('/api/tiktok/state');
        if (stateRes.ok) {
          setTiktokState(await stateRes.json());
          isFirstPollRef.current = true;
          processedLogsRef.current.clear();
        }
      }
    } catch (err) {
      addNotification('Erro de rede ao desconectar.', 'error');
    } finally {
      setTiktokLoading(false);
    }
  };

  const handleTiktokToggleAutoRespond = async (active: boolean) => {
    try {
      const res = await fetch('/api/tiktok/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAutoRespondActive: active })
      });
      if (res.ok) {
        addNotification(active ? 'Co-piloto Automático Ativado!' : 'Co-piloto Automático Desativado.', 'info');
        setTiktokState((prev: any) => ({ ...prev, isAutoRespondActive: active }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTiktokClearLogs = async () => {
    try {
      const res = await fetch('/api/tiktok/clear-logs', { method: 'POST' });
      if (res.ok) {
        addNotification('Terminal do TikTok limpo.', 'info');
        setTiktokState((prev: any) => ({
          ...prev,
          logs: [{
            id: 'clear',
            type: 'system',
            user: 'Sistema',
            message: 'Histórico de eventos do TikTok Live limpo com segurança.',
            timestamp: Date.now()
          }]
        }));
        processedLogsRef.current.clear();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return {
    tiktokUser,
    setTiktokUser,
    tiktokSessionId,
    setTiktokSessionId,
    tiktokTargetIdc,
    setTiktokTargetIdc,
    tiktokState,
    tiktokLoading,
    isLiveNarratorActive,
    setIsLiveNarratorActive,
    liveNarratorVoice,
    setLiveNarratorVoice,
    handleTiktokConnect,
    handleTiktokDisconnect,
    handleTiktokToggleAutoRespond,
    handleTiktokClearLogs
  };
}
