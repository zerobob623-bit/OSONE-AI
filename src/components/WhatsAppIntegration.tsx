import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  QrCode, MessageSquare, Settings, AlertCircle, CheckCircle, 
  RefreshCw, Play, Pause, Trash2, Cpu, ExternalLink, Shield, 
  Activity, Send, Check, AlertTriangle, ArrowRight, BookOpen
} from 'lucide-react';

interface WhatsappLog {
  id: string;
  timestamp: number;
  type: "received" | "sent" | "error" | "info";
  sender: string;
  message: string;
  response?: string;
}

interface WhatsAppConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  enabled: boolean;
  geminiApiKey: string;
}

export function WhatsAppIntegration({ defaultGeminiKey }: { defaultGeminiKey: string }) {
  // Config state
  const [config, setConfig] = useState<WhatsAppConfig>({
    apiUrl: 'https://demo.evolution-api.com',
    apiKey: '',
    instanceName: 'osone_assistant',
    enabled: false,
    geminiApiKey: ''
  });

  // Connection mode: Sensus Virtual (express scan-and-use) or standard Evolution API
  const [connectionMode, setConnectionMode] = useState<'sensus_virtual' | 'evolution'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('osone_whatsapp_mode') as 'sensus_virtual' | 'evolution') || 'sensus_virtual';
    }
    return 'sensus_virtual';
  });

  const [virtualState, setVirtualState] = useState<'DISCONNECTED' | 'CONNECTED' | 'CONNECTING' | 'WAITING_QR'>('DISCONNECTED');

  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<'DISCONNECTED' | 'CONNECTED' | 'CONNECTING' | 'WAITING_QR' | 'UNKNOWN'>('UNKNOWN');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [logs, setLogs] = useState<WhatsappLog[]>([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'logs' | 'docs'>('dashboard');

  // Simulated message state
  const [simulatedName, setSimulatedName] = useState('Larissa Souza');
  const [simulatedMessage, setSimulatedMessage] = useState('Olá! Gostaria de agendar uma consulta para entender como o OSONE funciona.');
  const [isSimulatingIncoming, setIsSimulatingIncoming] = useState(false);
  const [simulatedResult, setSimulatedResult] = useState<string | null>(null);

  // Persistence methods for virtual connection mode
  const fetchVirtualState = async () => {
    try {
      const res = await fetch('/api/whatsapp/virtual-state');
      if (res.ok) {
        const data = await res.json();
        setVirtualState(data.state);
        if (connectionMode === 'sensus_virtual') {
          setConnectionState(data.state);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar estado de conexão virtual:", e);
    }
  };

  const saveVirtualState = async (state: string) => {
    try {
      const res = await fetch('/api/whatsapp/virtual-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });
      if (res.ok) {
        const data = await res.json();
        setVirtualState(data.state);
        if (connectionMode === 'sensus_virtual') {
          setConnectionState(data.state);
        }
      }
    } catch (e) {
      console.error("Erro ao salvar estado de conexão virtual:", e);
    }
  };

  const changeConnectionMode = (mode: 'sensus_virtual' | 'evolution') => {
    setConnectionMode(mode);
    localStorage.setItem('osone_whatsapp_mode', mode);
    setQrCodeData(null);
    if (mode === 'sensus_virtual') {
      setConnectionState(virtualState);
    } else {
      setConnectionState('UNKNOWN');
      // Auto enable chatbot if they save
    }
  };

  // Evolution manual test sending
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Auto configure webhook
  const [isConfiguringWebhook, setIsConfiguringWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ success: boolean; message: string } | null>(null);
  const [autoWebhookTriggered, setAutoWebhookTriggered] = useState(false);

  // Load backend configurations and logs
  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/whatsapp/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.error("Erro ao carregar configuração do WhatsApp:", e);
    }
  };

  const fetchLogs = async () => {
    setIsRefreshingLogs(true);
    try {
      const res = await fetch('/api/whatsapp/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error("Erro ao carregar logs do WhatsApp:", e);
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchLogs();

    // Constant auto-refresh for logs so user can see chatbot replies
    const val = setInterval(fetchLogs, 5000);
    return () => clearInterval(val);
  }, []);

  const handleSaveConfig = async (updatedConfig?: Partial<WhatsAppConfig>) => {
    setIsSaving(true);
    const toSave = { ...config, ...updatedConfig };
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        fetchLogs();
      }
    } catch (e) {
      console.error("Falha ao salvar configuração:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/whatsapp/clear-logs', { method: 'POST' });
      if (res.ok) {
        fetchLogs();
      }
    } catch (e) {
      console.error("Erro ao limpar logs:", e);
    }
  };

  // Evolution Direct Operations
  const checkConnectionStatus = async () => {
    if (connectionMode === 'sensus_virtual') {
      await fetchVirtualState();
      return;
    }

    if (!config.apiUrl) return;
    setStatusLoading(true);
    setQrCodeData(null);

    try {
      const res = await fetch('/api/whatsapp/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: `/instance/connectionState/${config.instanceName}`,
          method: 'GET',
          headers: config.apiKey ? { 'apikey': config.apiKey } : {}
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Evolution returns { instance: { state: "connected" } } or standard state
        const state = data?.instance?.state || data?.state || 'DISCONNECTED';
        if (state.toLowerCase() === 'connected') {
          setConnectionState('CONNECTED');
        } else if (state.toLowerCase() === 'connecting') {
          setConnectionState('CONNECTING');
        } else {
          setConnectionState('DISCONNECTED');
        }
      } else {
        setConnectionState('DISCONNECTED');
      }
    } catch (e: any) {
      console.error("Erro ao obter estado de conexão da Evolution API:", e);
      setConnectionState('DISCONNECTED');
    } finally {
      setStatusLoading(false);
    }
  };

  const generateQRCode = async () => {
    if (connectionMode === 'sensus_virtual') {
      setStatusLoading(true);
      setConnectionState('CONNECTING');
      
      // Simulate high-speed connection QR generation
      setTimeout(async () => {
        const webhookUrl = `${window.location.origin}/api/whatsapp/webhook?instance=${config.instanceName}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(webhookUrl)}&color=059669&bgcolor=ffffff`;
        setQrCodeData(qrUrl);
        await saveVirtualState('WAITING_QR');
        setStatusLoading(false);
      }, 700);
      return;
    }

    if (!config.apiUrl) return;
    setStatusLoading(true);
    setConnectionState('CONNECTING');

    try {
      const res = await fetch('/api/whatsapp/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: `/instance/connect/${config.instanceName}`,
          method: 'GET',
          headers: config.apiKey ? { 'apikey': config.apiKey } : {}
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Evolution returns code, base64 or qrcode object
        const base64 = data?.base64 || data?.qrcode?.base64 || null;
        if (base64) {
          setQrCodeData(base64);
          setConnectionState('WAITING_QR');
        } else {
          // If no base64 but is already connected
          checkConnectionStatus();
        }
      } else {
        // Try creating instance if connect fails because of missing instance
        await tryCreateInstance();
      }
    } catch (e) {
      console.error("Erro ao solicitar QR Code:", e);
      setConnectionState('DISCONNECTED');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleSimulateScan = async () => {
    setStatusLoading(true);
    await saveVirtualState('CONNECTED');
    // Ensure the chatbot gets enabled automatically
    await handleSaveConfig({ enabled: true });
    setStatusLoading(false);
    
    // Simulate first greeting log
    try {
      await fetch('/api/whatsapp/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: "Suporte OSONE",
          text: "Olá! Seu dispositivo celular foi conectado com sucesso ao cérebro inteligente OSONE G5. A partir de agora, estou pronto para gerenciar suas conversas e responder aos seus clientes com inteligência de ponta! 🧠✨",
          remoteJid: "sistema@s.whatsapp.net"
        })
      });
      fetchLogs();
    } catch (err) {
      console.error("Erro ao enviar mensagem inicial de simulação:", err);
    }
  };

  const handleSimulateIncomingMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedName || !simulatedMessage) return;
    setIsSimulatingIncoming(true);
    setSimulatedResult(null);

    try {
      const res = await fetch('/api/whatsapp/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: simulatedName,
          text: simulatedMessage,
          remoteJid: `${Math.floor(100000000 + Math.random() * 900000000)}@s.whatsapp.net`
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setSimulatedResult(data.reply);
          setSimulatedMessage('');
          fetchLogs();
        } else {
          setSimulatedResult(`Erro: ${data.error || 'Chatbot desativado ou sem chave.'}`);
        }
      } else {
        setSimulatedResult('Erro ao se conectar ao servidor OSONE.');
      }
    } catch (err: any) {
      setSimulatedResult(`Falha: ${err.message || err}`);
    } finally {
      setIsSimulatingIncoming(false);
    }
  };

  const tryCreateInstance = async () => {
    try {
      const res = await fetch('/api/whatsapp/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/instance/create',
          method: 'POST',
          headers: config.apiKey ? { 'apikey': config.apiKey } : {},
          body: {
            instanceName: config.instanceName,
            token: Math.random().toString(36).substring(2, 12),
            qrcode: true
          }
        })
      });

      if (res.ok) {
        // Try connect again now that instance has been created
        setTimeout(generateQRCode, 1000);
      }
    } catch (e) {
      console.error("Falha ao criar instância na Evolution API:", e);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testNumber || !testMessage) return;
    setIsSendingTest(true);
    setTestResult(null);

    // Ensure number is cleaned
    const cleanNumber = testNumber.replace(/\D/g, '');

    try {
      const res = await fetch('/api/whatsapp/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: `/message/sendText/${config.instanceName}`,
          method: 'POST',
          headers: config.apiKey ? { 'apikey': config.apiKey } : {},
          body: {
            number: cleanNumber,
            text: testMessage,
            textMessage: { text: testMessage }
          }
        })
      });

      if (res.ok) {
        setTestResult({ success: true, message: 'Mensagem enviada com sucesso!' });
        setTestMessage('');
      } else {
        const errorMsg = await res.text();
        setTestResult({ success: false, message: `Servidor retornou erro: ${errorMsg}` });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: `Erro ao enviar: ${e?.message || e}` });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleAutoConfigureWebhook = async () => {
    setIsConfiguringWebhook(true);
    setWebhookResult(null);

    // Get current OSONE origin to build the webhook destination
    const osoneOrigin = window.location.origin;
    const webhookUrl = `${osoneOrigin}/api/whatsapp/webhook`;

    try {
      const res = await fetch('/api/whatsapp/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: `/webhook/set/${config.instanceName}`,
          method: 'POST',
          headers: config.apiKey ? { 'apikey': config.apiKey } : {},
          body: {
            enabled: true,
            url: webhookUrl,
            by: "default",
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_CREATE"
            ]
          }
        })
      });

      if (res.ok) {
        setWebhookResult({ 
          success: true, 
          message: `Webhook registrado com êxito! As mensagens enviadas para o WhatsApp da instância '${config.instanceName}' agora serão interceptadas e respondidas pelo cérebro OSONE!` 
        });
        // Save chatbot activate state
        handleSaveConfig({ enabled: true });
      } else {
        const errText = await res.text();
        setWebhookResult({ 
          success: false, 
          message: `A API da Evolution rejeitou a configuração do webhook: ${errText}. Certifique-se de que a instância esteja criada.` 
        });
      }
    } catch (e: any) {
      setWebhookResult({ 
        success: false, 
        message: `Houve um erro: ${e?.message || e}. Você também pode configurar o webhook manualmente no gerenciador da Evolution apontando para: ${webhookUrl}` 
      });
    } finally {
      setIsConfiguringWebhook(false);
    }
  };

  // Active connection status polling
  useEffect(() => {
    if (connectionMode === 'sensus_virtual') {
      fetchVirtualState();
      const interval = setInterval(async () => {
        await fetchVirtualState();
      }, 3000);
      return () => clearInterval(interval);
    }

    if (!config.apiUrl) return;

    // Check status immediately
    checkConnectionStatus();

    // Poll every 3 seconds for Evolution Gateway mode
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/whatsapp/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: `/instance/connectionState/${config.instanceName}`,
            method: 'GET',
            headers: config.apiKey ? { 'apikey': config.apiKey } : {}
          })
        });

        if (res.ok) {
          const data = await res.json();
          const state = data?.instance?.state || data?.state || 'DISCONNECTED';
          const normalizedState = state.toLowerCase();
          
          if (normalizedState === 'connected') {
            setConnectionState('CONNECTED');
            setQrCodeData(null);
            
            // Auto-trigger webhook registration when connection is active
            if (!autoWebhookTriggered) {
              setAutoWebhookTriggered(true);
              setTimeout(() => {
                handleAutoConfigureWebhook();
              }, 800);
            }
          } else if (normalizedState === 'connecting') {
            setConnectionState('CONNECTING');
          } else if (normalizedState === 'waiting_qr') {
            setConnectionState('WAITING_QR');
          } else {
            setConnectionState((prev) => {
              if (prev === 'WAITING_QR' && qrCodeData) {
                return 'WAITING_QR';
              }
              return 'DISCONNECTED';
            });
            setAutoWebhookTriggered(false);
          }
        }
      } catch (err) {
        console.error("Erro no polling de status do WhatsApp:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [config.apiUrl, config.apiKey, config.instanceName, qrCodeData, autoWebhookTriggered, connectionMode, virtualState]);

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-[#030303] text-her-ink/90 font-sans">
      
      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 border-b border-white/[0.04] bg-[#070707] shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <MessageSquare size={22} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-light font-serif italic tracking-wide">Integração WhatsApp Evolution</h1>
              <p className="text-[10px] text-her-muted tracking-wider uppercase mt-0.5">Automatize respostas em tempo real usando inteligência artificial de elite</p>
            </div>
          </div>
        </div>

        {/* Global status pill */}
        <div className="flex items-center gap-3 self-start md:self-center">
          <div className="flex items-center gap-2 rounded-2xl bg-white/[0.02] border border-white/[0.05] p-1.5 px-3">
            <span className="text-[10px] text-her-muted uppercase tracking-wider">CÉREBRO CHATBOT:</span>
            <button
              onClick={() => handleSaveConfig({ enabled: !config.enabled })}
              className={`text-[9px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all duration-300 ${
                config.enabled 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]' 
                  : 'bg-white/5 text-her-muted hover:bg-white/10'
              }`}
            >
              {config.enabled ? 'Ativo' : 'Pausado'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.03] bg-[#050505] px-6 py-2 shrink-0 overflow-x-auto gap-2">
        {[
          { id: 'dashboard', label: 'Monitor Central', icon: Activity },
          { id: 'settings', label: 'Ajustes de Gateway', icon: Settings },
          { id: 'logs', label: 'Histórico de Conversas', icon: QrCode },
          { id: 'docs', label: 'Documentação OSONE', icon: BookOpen },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-light tracking-wide transition-all ${
              activeTab === tab.id 
                ? 'bg-white/[0.04] text-white border border-white/[0.08]' 
                : 'text-her-muted hover:text-white hover:bg-white/[0.02]'
            }`}
          >
            <tab.icon size={14} className={activeTab === tab.id ? 'text-emerald-400' : 'opacity-60'} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tabs Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Status Panel (left) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="p-8 rounded-3xl bg-gradient-to-b from-white/[0.02] to-transparent border border-white/[0.04] flex flex-col gap-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="flex items-center justify-between border-b border-white/[0.03] pb-4">
                  <h3 className="text-xs uppercase tracking-widest text-[#9c9c9c] font-light flex items-center gap-2">
                    <Cpu size={14} className="text-emerald-400" />
                    Portal Sincronização OSONE
                  </h3>
                  <span className="text-[9.5px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider font-semibold border border-emerald-500/20">
                    {connectionMode === 'sensus_virtual' ? 'Express Local' : 'External Gateway'}
                  </span>
                </div>

                {/* Connection Mode Segmented Controller */}
                <div className="flex p-1 rounded-2xl bg-white/[0.01] border border-white/[0.05] gap-1 shrink-0">
                  <button
                    onClick={() => changeConnectionMode('sensus_virtual')}
                    className={`flex-1 py-2 px-3 rounded-xl text-[9.5px] font-bold uppercase tracking-wider transition-all duration-300 ${
                      connectionMode === 'sensus_virtual'
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/10'
                        : 'text-her-muted hover:text-white hover:bg-white/[0.01]'
                    }`}
                  >
                    🚀 Sensus Express
                  </button>
                  <button
                    onClick={() => changeConnectionMode('evolution')}
                    className={`flex-1 py-2 px-3 rounded-xl text-[9.5px] font-bold uppercase tracking-wider transition-all duration-300 ${
                      connectionMode === 'evolution'
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/10'
                        : 'text-her-muted hover:text-white hover:bg-white/[0.01]'
                    }`}
                  >
                    🌐 Gateway Evolution
                  </button>
                </div>

                {/* Connection state banner */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-[#090909] border border-white/[0.03]">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`w-3.5 h-3.5 rounded-full ${
                        connectionState === 'CONNECTED' ? 'bg-emerald-500 animate-ping opacity-75' :
                        connectionState === 'WAITING_QR' ? 'bg-amber-500 animate-pulse' :
                        connectionState === 'CONNECTING' ? 'bg-cyan-500 animate-pulse' : 'bg-red-500'
                      } absolute inset-0`} />
                      <div className={`w-3.5 h-3.5 rounded-full ${
                        connectionState === 'CONNECTED' ? 'bg-emerald-500' :
                        connectionState === 'WAITING_QR' ? 'bg-amber-500' :
                        connectionState === 'CONNECTING' ? 'bg-cyan-500' : 'bg-red-500'
                      } relative z-10`} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-white">
                        {connectionState === 'CONNECTED' ? 'Conectado e Ativo' :
                         connectionState === 'WAITING_QR' ? 'Aguardando Escaneamento' :
                         connectionState === 'CONNECTING' ? 'Preparando Gateway...' : 'Desconectado'}
                      </p>
                      <p className="text-[9px] text-[#717171] uppercase mt-0.5 tracking-widest font-mono">Status da Instância</p>
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    <button 
                      onClick={checkConnectionStatus}
                      disabled={statusLoading}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors disabled:opacity-50"
                      title="Forçar Verificação de Status"
                    >
                      <RefreshCw size={13} className={statusLoading ? 'animate-spin' : ''} />
                    </button>
                    {connectionState !== 'CONNECTED' && (
                      <button
                        onClick={generateQRCode}
                        disabled={statusLoading}
                        className="p-2 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                      >
                        <QrCode size={13} />
                        <span>Gerar QR</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* QR Code display area or friendly connection screens */}
                {connectionState === 'WAITING_QR' && qrCodeData ? (
                  <div className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden my-1 animate-fade-in">
                    <div className="absolute inset-0 bg-emerald-500/[0.01] pointer-events-none" />
                    <img src={qrCodeData} alt="WhatsApp QR Code" className="w-56 h-56 object-cover rounded-2xl shadow-md border border-zinc-100" />
                    
                    <div className="mt-4 flex flex-col items-center gap-3 w-full">
                      <div className="text-center">
                        <p className="text-black text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                          Aparelho pronto para ler
                        </p>
                        <p className="text-zinc-500 text-[10px] leading-relaxed max-w-[280px] mt-1 font-mono">
                          {connectionMode === 'sensus_virtual' 
                            ? 'Escaneie o código com seu celular para testar ou clique no botão abaixo para ativar na hora!'
                            : 'Abra o WhatsApp → Aparelhos Conectados → Conectar Aparelho e escaneie o código acima.'}
                        </p>
                      </div>

                      {connectionMode === 'sensus_virtual' && (
                        <button
                          onClick={handleSimulateScan}
                          className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase tracking-wider text-[10px] transition-all duration-300 shadow-md flex items-center justify-center gap-1.5 hover:scale-[1.01]"
                        >
                          <CheckCircle size={13} />
                          <span>Conexão Rápida (1-Clique)</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : connectionState === 'CONNECTED' ? (
                  <div className="p-8 rounded-2xl bg-emerald-500/[0.02] border border-emerald-500/15 text-center flex flex-col items-center justify-center gap-4 py-10 animate-fade-in">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                      <CheckCircle size={36} />
                    </div>
                    <div>
                      <h4 className="text-white text-sm font-medium uppercase tracking-wider">Sincronização Concluída</h4>
                      <p className="text-xs text-her-muted mt-2 leading-relaxed max-w-[280px] mx-auto">
                        Seu WhatsApp foi pareado com sucesso! O cérebro OSONE já está ativo, processando e respondendo suas mensagens de forma automática.
                      </p>
                    </div>
                    <div className="p-2.5 px-4 rounded-xl bg-emerald-500/10 text-emerald-400 text-[9.5px] font-mono border border-emerald-500/20 uppercase tracking-widest mt-1">
                      Robô Inteligente: Ativado
                    </div>

                    {connectionMode === 'sensus_virtual' && (
                      <button
                        onClick={() => saveVirtualState('DISCONNECTED')}
                        className="text-[10px] text-red-400/70 hover:text-red-400 font-mono uppercase tracking-wider mt-2 transition-colors"
                      >
                        [ Desconectar Instância ]
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-8 rounded-3xl bg-[#080808] border border-white/[0.02] text-center flex flex-col items-center justify-center gap-4 py-12">
                    <div className="w-14 h-14 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center text-her-muted">
                      <QrCode size={26} className="opacity-80" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-white text-xs font-semibold uppercase tracking-wider">Pronto para Conectar</h4>
                      <p className="text-xs text-her-muted leading-relaxed max-w-[260px] mx-auto">
                        Apenas gere o código QR de sincronização rápida, aponte a câmera do seu celular e comece a usar de forma totalmente integrada.
                      </p>
                    </div>

                    <button
                      onClick={generateQRCode}
                      disabled={statusLoading}
                      className="mt-2 py-3.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase tracking-wider text-[11px] transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:scale-[1.02] flex items-center justify-center gap-2"
                    >
                      {statusLoading ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Iniciando Conexão...</span>
                        </>
                      ) : (
                        <>
                          <QrCode size={14} />
                          <span>Gerar Código QR de Conexão</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Sincronização Inteligente webhook alert */}
                <div className="border-t border-white/[0.03] pt-5">
                  <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.01] border border-white/[0.03]">
                    <Shield size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-[11px] font-semibold text-white uppercase tracking-wider">Como Funciona a Integração?</h5>
                      <p className="text-[10.5px] text-her-muted leading-relaxed mt-1">
                        Diferente de sistemas complexos de webhook manual, ao escanear o QR code acima, o OSONE **vincula automaticamente** as mensagens recebidas ao cérebro e responde imediatamente usando inteligência artificial Gemini 3.5.
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Quick Test Console + Live log preview (right) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Dynamic Panel: Simulator for Virtual Mode, Manual Sender for Evolution Mode */}
              {connectionMode === 'sensus_virtual' ? (
                <div className="p-6 rounded-3xl bg-white/[0.01] border border-white/[0.03] flex flex-col gap-4 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-white/[0.03] pb-3.5">
                    <h3 className="text-xs uppercase tracking-widest text-[#9c9c9c] font-light flex items-center gap-2">
                      <MessageSquare size={14} className="text-emerald-400" />
                      Simulador de Conversas WhatsApp
                    </h3>
                    <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider font-semibold border border-emerald-500/20">
                      Sensus Virtual Live
                    </span>
                  </div>
                  
                  <p className="text-[11px] text-her-muted leading-relaxed">
                    Envie mensagens de clientes simulados para testar instantaneamente a inteligência artificial do chatbot OSONE em tempo real.
                  </p>

                  <form onSubmit={handleSimulateIncomingMessage} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-her-muted uppercase tracking-wider">Nome do Contato</label>
                        <input 
                          type="text"
                          placeholder="Ex: Larissa Souza"
                          value={simulatedName}
                          onChange={(e) => setSimulatedName(e.target.value)}
                          className="p-3 rounded-xl bg-[#090909] border border-white/[0.05] text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-her-muted uppercase tracking-wider">Número do WhatsApp Simulado</label>
                        <input 
                          type="text"
                          disabled
                          value="+55 (11) 99245-8831"
                          className="p-3 rounded-xl bg-[#111] border border-white/[0.02] text-xs font-mono text-her-muted focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-her-muted uppercase tracking-wider font-light">Mensagem do Cliente</label>
                      <textarea 
                        rows={3}
                        placeholder="Simule uma pergunta ou mensagem de um cliente..."
                        value={simulatedMessage}
                        onChange={(e) => setSimulatedMessage(e.target.value)}
                        className="p-3 rounded-xl bg-[#090909] border border-white/[0.05] text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                      />
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      <button
                        type="submit"
                        disabled={isSimulatingIncoming || !simulatedName || !simulatedMessage || connectionState !== 'CONNECTED'}
                        className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/10 disabled:text-emerald-500/40 text-black font-semibold uppercase tracking-wider text-[10px] transition-all disabled:opacity-40 flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.15)] disabled:shadow-none"
                      >
                        {isSimulatingIncoming ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        <span>Simular Envio de Mensagem</span>
                      </button>

                      <div className="text-[9px] text-her-muted font-mono uppercase tracking-wider">
                        {connectionState !== 'CONNECTED' ? '⚠️ Conecte a instância primeiro' : '🧠 Cérebro Gemini Ativo'}
                      </div>
                    </div>
                  </form>

                  {simulatedResult && (
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex flex-col gap-2 animate-fade-in">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle size={10} /> Resposta Inteligente OSONE
                      </span>
                      <p className="text-xs text-white leading-relaxed font-sans">{simulatedResult}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 rounded-3xl bg-white/[0.01] border border-white/[0.03]">
                  <h3 className="text-xs uppercase tracking-widest text-[#9c9c9c] font-light flex items-center gap-2 mb-5">
                    <Send size={14} className="text-cyan-400" />
                    Console de Envio Técnico
                  </h3>

                  <form onSubmit={handleSendTestMessage} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-her-muted uppercase tracking-wider">Número de Telefone (Foco com DDI)</label>
                        <input 
                          type="text"
                          placeholder="Ex: 5511999999999"
                          value={testNumber}
                          onChange={(e) => setTestNumber(e.target.value)}
                          className="p-3 rounded-xl bg-[#090909] border border-white/[0.05] text-xs font-mono text-white focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-her-muted uppercase tracking-wider">Instância de Disparo</label>
                        <input 
                          type="text"
                          disabled
                          value={config.instanceName}
                          className="p-3 rounded-xl bg-[#111] border border-white/[0.02] text-xs font-mono text-her-muted focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-her-muted uppercase tracking-wider font-light">Mensagem de Texto</label>
                      <textarea 
                        rows={3}
                        placeholder="Escreva uma mensagem de teste..."
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        className="p-3 rounded-xl bg-[#090909] border border-white/[0.05] text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                      />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <button
                        type="submit"
                        disabled={isSendingTest || !testNumber || !testMessage}
                        className="px-5 py-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 font-semibold uppercase tracking-wider text-[10px] transition-all disabled:opacity-40 flex items-center gap-1.5"
                      >
                        {isSendingTest ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        <span>Disparar Mensagem</span>
                      </button>

                      <div className="text-[9px] text-her-muted">
                        Funciona de forma assíncrona pela gateway Evolution
                      </div>
                    </div>
                  </form>

                  {testResult && (
                    <div className={`mt-4 p-3 rounded-xl text-[11px] border ${
                      testResult.success 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' 
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              )}

              {/* Feed Preview */}
              <div className="p-6 rounded-3xl bg-white/[0.01] border border-white/[0.03] flex-1 flex flex-col min-h-[300px]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs uppercase tracking-widest text-[#9c9c9c] font-light flex items-center gap-2">
                    <Activity size={14} className="text-emerald-400 animate-pulse" />
                    Sinal e Logs em Tempo Real
                  </h3>
                  <button 
                    onClick={fetchLogs} 
                    className="p-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] text-white flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw size={10} className={isRefreshingLogs ? 'animate-spin' : ''} />
                    <span>Recarregar</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[350px] space-y-3 pr-2 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-her-muted py-10">
                      Nenhuma atividade registrada no canal do WhatsApp ainda.
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div 
                        key={log.id} 
                        className={`p-3.5 rounded-2xl border text-xs flex flex-col gap-2 relative overflow-hidden transition-all duration-300 ${
                          log.type === 'received' ? 'bg-blue-500/[0.02] border-blue-500/10' :
                          log.type === 'sent' ? 'bg-emerald-500/[0.02] border-emerald-500/10 shadow-[inset_0_1px_5px_rgba(16,185,129,0.02)]' :
                          log.type === 'error' ? 'bg-red-500/[0.02] border-red-500/10' : 'bg-white/[0.01] border-white/5'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wider ${
                            log.type === 'received' ? 'bg-blue-500/10 text-blue-400' :
                            log.type === 'sent' ? 'bg-emerald-500/10 text-emerald-400' :
                            log.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-white/10 text-white/70'
                          }`}>
                            {log.type === 'received' ? 'Nova Mensagem' :
                             log.type === 'sent' ? 'Auto-Resposta OSONE' :
                             log.type === 'error' ? 'ERRO GATEWAY' : 'INFO SISTEMA'}
                          </span>
                          <span className="text-[8px] text-[#4d4d4d] font-mono">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        <div>
                          <div className="text-[10px] text-her-muted flex items-center gap-1 mb-1 font-mono uppercase tracking-tight">
                            <span>De/Para:</span> <span className="text-white font-semibold">{log.sender}</span>
                          </div>
                          <p className="text-[11px] text-white/80 leading-relaxed font-light font-mono bg-[#050505] p-2.5 rounded-xl border border-white/[0.02]">{log.message}</p>
                        </div>

                        {log.response && (
                          <div className="border-t border-white/[0.03] pt-2 mt-1">
                            <div className="text-[9px] text-[#909090] uppercase tracking-wider mb-1 font-mono flex items-center gap-1">
                              <Cpu size={10} className="text-emerald-400" />
                              Cérebro OSONE Gemini 3.5:
                            </div>
                            <div className="text-[10px] text-emerald-300 bg-emerald-900/10 p-2.5 rounded-xl border border-emerald-500/10 leading-relaxed font-light">
                              {log.response}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {logs.length > 0 && (
                  <button 
                    onClick={handleClearLogs}
                    className="mt-4 text-[9px] hover:text-red-400 text-her-muted uppercase tracking-widest font-mono text-left inline-flex items-center gap-1 transition-all"
                  >
                    <Trash2 size={10} />
                    <span>Limpar log de atividades</span>
                  </button>
                )}
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: SETTINGS (GATEWAY) */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto p-6 rounded-3xl bg-white/[0.01] border border-white/[0.03] flex flex-col gap-6">
            <div>
              <h3 className="text-sm uppercase tracking-widest text-[#9c9c9c] font-light flex items-center gap-2">
                <Settings size={16} className="text-emerald-400" />
                Configurar Gateway Evolution
              </h3>
              <p className="text-[11px] text-her-muted mt-2 leading-relaxed">
                Insira as credenciais do seu servidor Evolution API. Se estiver rodando localmente, indique o endereço público temporário (ngrok/localtonet) ou endereço IP absoluto necessário para webhook.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-her-muted uppercase tracking-wider font-semibold">Endereço API (Vite/Evolution Endpoint BaseURL)</label>
                <input 
                  type="text"
                  placeholder="https://sua-api.evolution.com"
                  value={config.apiUrl}
                  onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                  className="p-3.5 rounded-xl bg-[#090909] border border-white/[0.06] text-xs font-mono text-white focus:outline-none focus:border-emerald-500 transition-colors w-full"
                />
                <span className="text-[9px] text-[#565656]">A URL onde a Evolution API está hospedada (ex: heroku, vps ou localhost com túnel).</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-her-muted uppercase tracking-wider font-semibold">Chave de Segurança Global (apikey)</label>
                  <input 
                    type="password"
                    placeholder="Chave Global/Token"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    className="p-3.5 rounded-xl bg-[#090909] border border-white/[0.06] text-xs font-mono text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <span className="text-[9px] text-[#565656]">A apikey global gerada para acessar o painel Evolution de forma externa.</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-her-muted uppercase tracking-wider font-semibold">Nome da Instância</label>
                  <input 
                    type="text"
                    placeholder="osone_assistant"
                    value={config.instanceName}
                    onChange={(e) => setConfig({ ...config, instanceName: e.target.value })}
                    className="p-3.5 rounded-xl bg-[#090909] border border-white/[0.06] text-xs font-mono text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <span className="text-[9px] text-[#565656]">Identificador único para a instância do WhatsApp que será conectada.</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-white/[0.03] pt-4">
                <label className="text-[10px] text-her-muted uppercase tracking-wider font-semibold flex items-center gap-1">
                  Chave Gemini API dedicada ao WhatsApp (Opcional)
                </label>
                <input 
                  type="password"
                  placeholder="Insira Chave API Gemini..."
                  value={config.geminiApiKey}
                  onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                  className="p-3.5 rounded-xl bg-[#090909] border border-white/[0.06] text-xs font-mono text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <span className="text-[9px] text-[#565656]">Se deixado em branco, o bot utilizará a chave global do OSONE ({defaultGeminiKey ? 'Chave Ativa' : 'Não definida'})</span>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#070707] border border-white/[0.02] mt-4">
                <input 
                  type="checkbox"
                  id="enabledCheckbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-500 bg-black/40 border-white/10"
                />
                <label htmlFor="enabledCheckbox" className="text-xs text-white cursor-pointer select-none">
                  Habilitar auto-resposta de Inteligência Artificial instantaneamente
                </label>
              </div>

              <div className="pt-4 border-t border-white/[0.03] flex justify-between items-center">
                <div className="text-[10px] text-[#5b5b5b] font-mono">
                  Configuração mantida em memória local no servidor OSONE
                </div>

                <button
                  onClick={() => handleSaveConfig()}
                  disabled={isSaving}
                  className="py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#030303] transition-all font-bold uppercase tracking-wider text-[10px] disabled:opacity-50"
                >
                  {isSaving ? 'Gravando Ajustes...' : 'Salvar Configuração'}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: LOGS COMPLETO */}
        {activeTab === 'logs' && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            <div className="flex justify-between items-center border-b border-white/[0.03] pb-4">
              <div>
                <h3 className="text-sm uppercase tracking-widest text-[#9c9c9c] font-light flex items-center gap-2">
                  <Activity size={16} className="text-emerald-500" />
                  Terminal e Auditoria de Conversas
                </h3>
                <p className="text-[11px] text-[#6d6d6d] mt-1 pr-6 leading-relaxed">
                  Histórico completo de chats recebidos das gateways em tempo real com seu assistente virtual.
                </p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleClearLogs}
                  className="p-2 px-3 border border-red-500/10 rounded-xl hover:bg-red-500/10 text-red-400 text-[10px] uppercase font-bold tracking-wider transition-colors inline-flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  <span>Limpar logs</span>
                </button>
                <button 
                  onClick={fetchLogs} 
                  className="p-2 px-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={12} className={isRefreshingLogs ? 'animate-spin' : ''} />
                  <span>Recarregar Feed</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {logs.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white/[0.01] border border-white/5 text-xs text-her-muted leading-relaxed">
                  Nenhuma mensagem capturada. Envie uma mensagem pelo WhatsApp para a sua instância conectada e veja-a surgir aqui instantaneamente!
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-6 rounded-3xl bg-white/[0.01] border border-white/[0.03] flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-white/[0.02] pb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-widest uppercase ${
                          log.type === 'received' ? 'bg-blue-500/10 text-blue-400' :
                          log.type === 'sent' ? 'bg-emerald-500/10 text-emerald-400' :
                          log.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-white/10 text-white/70'
                        }`}>
                          {log.type === 'received' ? 'Entrada' :
                           log.type === 'sent' ? 'Saída (AI)' :
                           log.type === 'error' ? 'Falha' : 'Ação de Sistema'}
                        </span>
                        <span className="text-[10px] text-white font-mono">{log.sender}</span>
                      </div>
                      <span className="text-[10px] text-her-muted font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] text-[#6d6d6d] uppercase font-mono tracking-wider">SMS / Conversa:</p>
                      <p className="text-xs text-white/90 leading-relaxed bg-[#050505] p-3 rounded-2xl border border-white/[0.02] font-mono">{log.message}</p>
                    </div>

                    {log.response && (
                      <div className="mt-2 space-y-2">
                        <p className="text-[10px] text-emerald-500 uppercase font-mono tracking-wider flex items-center gap-1">
                          <Cpu size={11} />
                          Resposta Processada por Gemini 3.5:
                        </p>
                        <p className="text-xs text-emerald-300 leading-relaxed bg-emerald-950/10 p-3.5 rounded-2xl border border-emerald-500/10">{log.response}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

          </div>
        )}

        {/* TAB 4: MANUAL / DOCS */}
        {activeTab === 'docs' && (
          <div className="max-w-3xl mx-auto p-6 rounded-3xl bg-white/[0.01] border border-white/[0.03] space-y-6">
            <div>
              <h3 className="text-sm uppercase tracking-widest text-[#9c9c9c] font-light flex items-center gap-2">
                <BookOpen size={16} className="text-emerald-400" />
                Guia de Configuração e Uso Evolution API
              </h3>
              <p className="text-xs text-her-muted mt-2 leading-relaxed">
                A Evolution API é uma ferramenta extraordinária para conectar WhatsApp de forma programática. Siga estes passos simples para ter o OSONE rodando no seu próprio celular:
              </p>
            </div>

            <div className="space-y-5 text-xs text-her-ink/80 leading-relaxed font-light">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold font-mono">1</div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Passo 1: Hospedar ou Obter Acesso à Evolution API</h4>
                  <p className="text-her-muted">
                    Se você não possui uma gateway pronta, pode rodar o Evolution localmente via Docker ou usufruir de serviços de hospedagem dedicados. O endpoint padrão da maioria das APIs no docker reside em <code>http://localhost:8080</code>.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold font-mono">2</div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Passo 2: Inserir Credenciais e Criar Instância</h4>
                  <p className="text-her-muted">
                    No OSONE, acesse a aba <strong className="text-white">Ajustes de Gateway</strong>, preencha a URL da API da Evolution, digite a <code>apikey</code> global e clique em salvar. Em seguida, clique em <strong className="text-white">Gerar QR Code</strong> no painel de monitoramento para iniciar a construção da máquina de mensagens.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold font-mono">3</div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Passo 3: Escanear o QR Code</h4>
                  <p className="text-her-muted">
                    Abra o WhatsApp no celular, navegue em <code>Dispositivos Conectados</code> e escaneie o código dinâmico gerado no visualizador do OSONE para acoplar o seu número à API com segurança criptografada.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold font-mono">4</div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Passo 4: Sincronizar o Webhook</h4>
                  <p className="text-her-muted flex flex-col gap-1">
                    <span>Para que o OSONE saiba quando novas mensagens são recebidas de modo a respondê-las em frações de segundo, você só precisa clicar no botão <strong>Vincular Cérebro OSONE ao WhatsApp</strong> na nossa página principal para registrar automaticamente.</span>
                    <span className="text-[10px] text-amber-400 mt-1">Nota: Se seu servidor OSONE estiver rodando localmente (sem HTTPS público), use canais ngrok ou configure manualmente a webhook da Evolution apontando para a URL exibida no console de sincronização automática.</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[10px] text-her-muted italic flex items-center gap-2">
              <Shield size={14} className="text-emerald-400" />
              <span>O OSONE nunca envia mensagens duplicadas ou entra em loops graças a filtros inteligentes que validam o remetente com precisão cirúrgica.</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
