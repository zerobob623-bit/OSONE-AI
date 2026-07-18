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

  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<'DISCONNECTED' | 'CONNECTED' | 'CONNECTING' | 'WAITING_QR' | 'UNKNOWN'>('UNKNOWN');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [logs, setLogs] = useState<WhatsappLog[]>([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'logs' | 'docs'>('dashboard');

  // Evolution manual test sending
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Auto configure webhook
  const [isConfiguringWebhook, setIsConfiguringWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ success: boolean; message: string } | null>(null);

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
              <div className="p-6 rounded-3xl bg-white/[0.01] border border-white/[0.03] flex flex-col gap-5">
                <h3 className="text-xs uppercase tracking-widest text-[#9c9c9c] font-light flex items-center gap-2">
                  <Cpu size={14} className="text-emerald-400" />
                  Estado da Conexão WhatsApp
                </h3>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-[#090909] border border-white/[0.02]">
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
                        {connectionState === 'CONNECTED' ? 'Conectado (WhatsApp Ativo)' :
                         connectionState === 'WAITING_QR' ? 'Aguardando Escaneamento' :
                         connectionState === 'CONNECTING' ? 'Sincronizando...' : 'Desconectado'}
                      </p>
                      <p className="text-[9px] text-[#717171] uppercase mt-0.5 tracking-widest">Gateway Evolution API</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={checkConnectionStatus}
                      disabled={statusLoading}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors disabled:opacity-50"
                      title="Checar Status"
                    >
                      <RefreshCw size={14} className={statusLoading ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={generateQRCode}
                      disabled={statusLoading}
                      className="p-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <QrCode size={12} />
                      <span>Gerar QR</span>
                    </button>
                  </div>
                </div>

                {/* QR Code display area */}
                {connectionState === 'WAITING_QR' && qrCodeData ? (
                  <div className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden my-2">
                    <div className="absolute inset-0 bg-emerald-500/[0.02] pointer-events-none" />
                    <img src={qrCodeData} alt="WhatsApp QR Code" className="w-56 h-56 object-cover rounded-xl" />
                    <p className="text-black text-[11px] font-mono mt-4 text-center leading-relaxed">
                      Abra o WhatsApp no seu celular → Configurações → Aparelhos conectados → Conectar aparelho
                    </p>
                  </div>
                ) : connectionState === 'CONNECTED' ? (
                  <div className="p-8 rounded-2xl bg-emerald-500/[0.02] border border-emerald-500/10 text-center flex flex-col items-center justify-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <CheckCircle size={28} />
                    </div>
                    <div>
                      <h4 className="text-white text-sm font-medium">Instância Pronta para Uso</h4>
                      <p className="text-xs text-her-muted mt-1 leading-relaxed">
                        Os canais estão ativos e o OSONE responderá automaticamente a novos chats recebidos assim que o webhook estiver configurado.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-[#080808] border border-white/[0.01] text-center flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#111] flex items-center justify-center text-her-muted">
                      <QrCode size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-her-muted leading-relaxed">
                        Nenhum QR Code ativo gerado neste momento. Clique em <strong className="text-white">Gerar QR</strong> para carregar ou iniciar sua instância do WhatsApp.
                      </p>
                    </div>
                  </div>
                )}

                {/* Automation Webhook Quick Sync */}
                <div className="border-t border-white/[0.03] pt-5 flex flex-col gap-3">
                  <h4 className="text-[11px] text-[#aeaeae] uppercase tracking-wider font-medium">Configuração Automática</h4>
                  <p className="text-[11px] text-her-muted leading-relaxed">
                    Clique abaixo para registrar automaticamente o servidor OSONE como assistente de inteligência artificial nos eventos desta instância.
                  </p>
                  
                  <button
                    onClick={handleAutoConfigureWebhook}
                    disabled={isConfiguringWebhook}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 transition-all font-semibold uppercase tracking-wider text-[10px] text-white flex items-center justify-center gap-2"
                  >
                    {isConfiguringWebhook ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Sincronizando Gateway...</span>
                      </>
                    ) : (
                      <>
                        <Shield size={12} />
                        <span>Vincular Cérebro OSONE ao WhatsApp</span>
                      </>
                    )}
                  </button>

                  {webhookResult && (
                    <div className={`p-4 rounded-xl text-[11px] leading-relaxed border ${
                      webhookResult.success 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    }`}>
                      <div className="flex gap-2 items-start">
                        {webhookResult.success ? <Check size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                        <span>{webhookResult.message}</span>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Quick Test Console + Live log preview (right) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Manual sending test */}
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
