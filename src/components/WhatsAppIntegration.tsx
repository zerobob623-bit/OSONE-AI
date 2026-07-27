import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { WhatsAppConnect } from './WhatsAppConnect';
import { 
  MessageSquare, Settings, AlertCircle, CheckCircle, 
  RefreshCw, Play, Pause, Trash2, Cpu, Activity, Send, 
  Check, AlertTriangle, ArrowRight, BookOpen, Smartphone, ShieldCheck
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
  enabled: boolean;
  geminiApiKey: string;
}

export function WhatsAppIntegration({ defaultGeminiKey }: { defaultGeminiKey: string }) {
  // Config state
  const [config, setConfig] = useState<WhatsAppConfig>({
    enabled: false,
    geminiApiKey: ''
  });

  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<WhatsappLog[]>([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'logs' | 'docs'>('dashboard');

  // Manual Outbound Sending State (whatsapp-web.js)
  const [sendNumber, setSendNumber] = useState('');
  const [sendMessageText, setSendMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string; id?: string } | null>(null);

  // Simulated Chatbot incoming test state
  const [simulatedName, setSimulatedName] = useState('Larissa Souza');
  const [simulatedMessage, setSimulatedMessage] = useState('Olá! Gostaria de entender como o assistente OSONE funciona.');
  const [isSimulatingIncoming, setIsSimulatingIncoming] = useState(false);
  const [simulatedResult, setSimulatedResult] = useState<string | null>(null);

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
    const val = setInterval(fetchLogs, 4000);
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

  // Direct Outbound Message Sending via whatsapp-web.js
  const handleSendDirectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendNumber || !sendMessageText) return;
    setIsSending(true);
    setSendResult(null);

    const cleanNumber = sendNumber.replace(/\D/g, '');

    try {
      const res = await fetch('/api/whatsapp/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: cleanNumber,
          message: sendMessageText
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSendResult({
          success: true,
          message: `Mensagem enviada com sucesso para ${cleanNumber}!`,
          id: data.messageId
        });
        setSendMessageText('');
        fetchLogs();
      } else {
        setSendResult({
          success: false,
          message: data.error || 'Falha ao enviar mensagem pelo WhatsApp.'
        });
      }
    } catch (err: any) {
      setSendResult({
        success: false,
        message: `Erro na comunicação com o servidor OSONE: ${err?.message || err}`
      });
    } finally {
      setIsSending(false);
    }
  };

  // Simulate incoming test message
  const handleSimulateIncoming = async (e: React.FormEvent) => {
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
          remoteJid: "5511999999999@s.whatsapp.net"
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setSimulatedResult(data.reply);
          setSimulatedMessage('');
          fetchLogs();
        } else {
          setSimulatedResult(`Aviso: ${data.reason || data.error || 'Chatbot desativado ou sem chave Gemini.'}`);
        }
      } else {
        setSimulatedResult('Erro ao se conectar com o servidor OSONE.');
      }
    } catch (e: any) {
      setSimulatedResult(`Erro: ${e?.message || e}`);
    } finally {
      setIsSimulatingIncoming(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-white overflow-y-auto selection:bg-orange-500/30">
      {/* Header Banner */}
      <div className="p-6 md:p-8 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-b border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-transparent border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-xl shadow-orange-500/10">
              <MessageSquare size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-white">WhatsApp Copilot</h1>
                <span className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold">
                  puppeteer local
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-xl">
                Automação nativa via whatsapp-web.js com respostas orientadas pelo Gemini 3.5-flash-lite e disparo direto de mensagens.
              </p>
            </div>
          </div>

          {/* Quick Autoresponder Status Switch */}
          <div className="flex items-center gap-3 bg-white/5 p-2 px-4 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-zinc-300">Auto-resposta com IA</span>
              <span className="text-[9px] text-zinc-500">
                {config.enabled ? 'Ativo e respondendo' : 'Pausado'}
              </span>
            </div>
            <button
              onClick={() => handleSaveConfig({ enabled: !config.enabled })}
              disabled={isSaving}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                config.enabled 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30' 
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-white'
              }`}
            >
              {config.enabled ? <Play size={18} className="fill-emerald-400" /> : <Pause size={18} />}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto flex items-center gap-2 mt-8 border-b border-white/5 pb-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'dashboard' 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-lg' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Cpu size={14} />
            Painel & Disparo
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'settings' 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-lg' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings size={14} />
            Ajustes do Chatbot
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'logs' 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-lg' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity size={14} />
            Logs & Atividade ({logs.length})
          </button>

          <button
            onClick={() => setActiveTab('docs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'docs' 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-lg' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen size={14} />
            Guia de Uso
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full flex-1">
        {/* TAB 1: DASHBOARD & SENDING */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: WhatsApp Connect Widget */}
            <div className="lg:col-span-6">
              <WhatsAppConnect />
            </div>

            {/* Right Column: Direct Message Sending Card & Simulator */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              {/* Direct Message Sending Box */}
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400">
                      <Send size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Disparo Direto de Mensagem</h3>
                      <p className="text-[11px] text-zinc-400">Envia uma mensagem pelo WhatsApp Web sincronizado</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSendDirectMessage} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Número de Destino (com DDI e DDD)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 5511999999999"
                      value={sendNumber}
                      onChange={(e) => setSendNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 transition-all font-mono"
                      required
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Digite os dígitos com o código do país (55 para Brasil).
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Conteúdo da Mensagem
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Escreva a mensagem a ser enviada..."
                      value={sendMessageText}
                      onChange={(e) => setSendMessageText(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 transition-all resize-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSending || !sendNumber || !sendMessageText}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-bold text-xs shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSending ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Enviando pelo Puppeteer...</span>
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        <span>Enviar Mensagem pelo WhatsApp</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Send Result Feedback */}
                {sendResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-4 p-3 rounded-xl border text-xs font-medium ${
                      sendResult.success 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {sendResult.success ? (
                        <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <p>{sendResult.message}</p>
                        {sendResult.id && (
                          <p className="text-[10px] font-mono opacity-80 mt-1">ID: {sendResult.id}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Chatbot Simulator Box */}
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                      <Cpu size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Simulador de Auto-resposta IA</h3>
                      <p className="text-[11px] text-zinc-400">Teste as respostas do Gemini sem disparar mensagem real</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSimulateIncoming} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        Nome do Contato
                      </label>
                      <input
                        type="text"
                        value={simulatedName}
                        onChange={(e) => setSimulatedName(e.target.value)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        Telefone Simulado
                      </label>
                      <input
                        type="text"
                        value="5511999999999"
                        disabled
                        className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-xl text-xs text-zinc-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                      Mensagem de Entrada
                    </label>
                    <textarea
                      rows={2}
                      value={simulatedMessage}
                      onChange={(e) => setSimulatedMessage(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSimulatingIncoming || !simulatedName || !simulatedMessage}
                    className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/10 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSimulatingIncoming ? (
                      <RefreshCw size={14} className="animate-spin text-amber-400" />
                    ) : (
                      <Play size={14} className="text-amber-400" />
                    )}
                    <span>Simular Entrada & Gerar Resposta Gemini</span>
                  </button>
                </form>

                {simulatedResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200"
                  >
                    <span className="font-bold text-amber-400 block mb-1">Resposta Gerada pelo OSONE:</span>
                    <p className="whitespace-pre-wrap">{simulatedResult}</p>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CHATBOT SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Settings size={18} className="text-orange-400" />
              Configurações do Chatbot OSONE
            </h3>
            <p className="text-xs text-zinc-400 mb-6">
              Ajuste as preferências de auto-resposta inteligente do WhatsApp.
            </p>

            <div className="space-y-6">
              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <div>
                  <h4 className="text-xs font-bold text-white">Auto-resposta com IA</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Responde automaticamente mensagens recebidas usando o Gemini 3.5-flash-lite
                  </p>
                </div>

                <button
                  onClick={() => handleSaveConfig({ enabled: !config.enabled })}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    config.enabled ? 'bg-orange-500' : 'bg-zinc-800'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      config.enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Custom Gemini Key */}
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Chave API Personalizada do Gemini (Opcional)
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={config.geminiApiKey}
                  onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Se deixado em branco, o sistema usará a chave de ambiente configurada no OSONE.
                </p>
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                  onClick={() => handleSaveConfig()}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-black font-bold text-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  Salvar Ajustes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: LOGS FEED */}
        {activeTab === 'logs' && (
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-orange-400 animate-pulse" />
                <div>
                  <h3 className="text-base font-bold text-white">Sinal e Logs em Tempo Real</h3>
                  <p className="text-xs text-zinc-400">Histórico de mensagens enviadas, recebidas e eventos do Puppeteer</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLogs}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw size={12} className={isRefreshingLogs ? 'animate-spin' : ''} />
                  Atualizar Feed
                </button>

                <button
                  onClick={handleClearLogs}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                  Limpar Logs
                </button>
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                Nenhum log registrado até o momento.
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 bg-white/5 border border-white/5 rounded-2xl flex flex-col gap-1.5 text-xs hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {log.type === 'sent' && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            ENVIADA
                          </span>
                        )}
                        {log.type === 'received' && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                            RECEBIDA
                          </span>
                        )}
                        {log.type === 'info' && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
                            SISTEMA
                          </span>
                        )}
                        {log.type === 'error' && (
                          <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold">
                            ERRO
                          </span>
                        )}

                        <span className="font-semibold text-white">{log.sender}</span>
                      </div>

                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="text-zinc-300 pl-1">{log.message}</p>

                    {log.response && (
                      <div className="mt-1 p-2.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-orange-200 text-[11px]">
                        <span className="font-bold text-orange-400 block mb-0.5">Resposta IA:</span>
                        {log.response}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DOCS */}
        {activeTab === 'docs' && (
          <div className="max-w-3xl mx-auto bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl text-xs space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BookOpen size={18} className="text-orange-400" />
              Guia de Funcionamento do WhatsApp Copilot
            </h3>

            <p className="text-zinc-300 leading-relaxed">
              O OSONE utiliza a biblioteca <code className="text-orange-400 font-mono">whatsapp-web.js</code> integrada ao navegador headless Puppeteer rodando no servidor local.
            </p>

            <div className="space-y-3 pt-2">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <h4 className="font-bold text-white mb-1">1. Conectando pelo QR Code</h4>
                <p className="text-zinc-400">
                  Ao clicar em "Iniciar Conexão WhatsApp", o Puppeteer abre o WhatsApp Web em segundo plano e gera o QR Code na tela. Abra o WhatsApp no celular, escaneie e a sessão fica salva na pasta local <code className="text-zinc-300 font-mono">.wwebjs_auth</code>.
                </p>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <h4 className="font-bold text-white mb-1">2. Disparo de Mensagens</h4>
                <p className="text-zinc-400">
                  A aba "Painel & Disparo" permite enviar qualquer mensagem diretamente para números externos (ex: 5511999999999) usando a função nativa <code className="text-orange-400 font-mono">client.sendMessage()</code> com log detalhado de auditoria.
                </p>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <h4 className="font-bold text-white mb-1">3. Auto-resposta com Gemini</h4>
                <p className="text-zinc-400">
                  Quando o recurso estiver ativado em "Ajustes do Chatbot", qualquer mensagem privada recebida será respondida automaticamente pelo modelo Gemini 3.5-flash-lite do OSONE.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
