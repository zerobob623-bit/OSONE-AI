import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { WhatsAppConnect } from './WhatsAppConnect';
import { 
  MessageSquare, Settings, AlertCircle, CheckCircle, 
  RefreshCw, Play, Pause, Trash2, Cpu, Activity, Send, 
  Check, AlertTriangle, ArrowRight, BookOpen, Smartphone, ShieldCheck,
  Database, Globe, Save, History, FileText, Link as LinkIcon,
  Users, UserPlus, Edit3, Plus, Search, UserCheck
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
  sendAudioReplies: boolean;
  onlyKnownContacts: boolean;
  requireTriggerCommand: boolean;
  triggerCommand: string;
  ttsEngine: 'gemini' | 'elevenlabs';
  ttsVoice: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

type ConversationsMap = Record<string, ChatMessage[]>;

interface ContactItem {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  source?: 'wa' | 'manual';
  createdAt: number;
}

export function WhatsAppIntegration({ defaultGeminiKey }: { defaultGeminiKey: string }) {
  // Config state
  const [config, setConfig] = useState<WhatsAppConfig>({
    enabled: false,
    geminiApiKey: '',
    sendAudioReplies: true,
    onlyKnownContacts: true,
    requireTriggerCommand: true,
    triggerCommand: '/osone',
    ttsEngine: 'gemini',
    ttsVoice: 'Kore',
    elevenLabsApiKey: '',
    elevenLabsVoiceId: ''
  });
  const [waConnectionStatus, setWaConnectionStatus] = useState<string>('desconectado');

  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<WhatsappLog[]>([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'contacts' | 'docs' | 'settings'>('dashboard');

  // Manual Outbound Sending State (Baileys)
  const [sendNumber, setSendNumber] = useState('');
  const [sendMessageText, setSendMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string; id?: string } | null>(null);

  // Knowledge Base States
  const [knowledgeBaseText, setKnowledgeBaseText] = useState('');
  const [isSavingKb, setIsSavingKb] = useState(false);
  const [kbSaveResult, setKbSaveResult] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importUrlResult, setImportUrlResult] = useState<{ success: boolean; message: string } | null>(null);

  // Conversations History State
  const [conversations, setConversations] = useState<ConversationsMap>({});
  const [selectedContactJid, setSelectedContactJid] = useState<string | null>(null);

  // Contacts State
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactStatusMsg, setContactStatusMsg] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [isImportingWa, setIsImportingWa] = useState(false);
  const [importWaStatusMsg, setImportWaStatusMsg] = useState<string | null>(null);

  const handleImportWaContacts = async () => {
    setIsImportingWa(true);
    setImportWaStatusMsg(null);
    try {
      const res = await fetch('/api/whatsapp/wa-contacts');
      const data = await res.json();
      if (!res.ok) {
        setImportWaStatusMsg(`Erro: ${data.error || 'Não foi possível obter os contatos do WhatsApp.'}`);
        return;
      }

      const waList = data.contacts || [];
      if (waList.length === 0) {
        setImportWaStatusMsg('Nenhum contato individual encontrado na conta conectada.');
        return;
      }

      const importRes = await fetch('/api/whatsapp/import-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactsToImport: waList })
      });
      const importData = await importRes.json();
      if (importRes.ok) {
        setContacts(importData.contacts || []);
        setImportWaStatusMsg(`Sucesso! ${importData.addedCount} novos contatos do WhatsApp importados (${importData.updatedCount} já existiam).`);
      } else {
        setImportWaStatusMsg(`Erro ao salvar: ${importData.error || 'Falha ao salvar contatos.'}`);
      }
    } catch (err: any) {
      setImportWaStatusMsg(`Erro: ${err?.message || err}`);
    } finally {
      setIsImportingWa(false);
    }
  };

  // Load backend configurations, logs, knowledge base, conversations and contacts
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

  const fetchKnowledgeBase = async () => {
    try {
      const res = await fetch('/api/whatsapp/knowledge-base');
      if (res.ok) {
        const data = await res.json();
        setKnowledgeBaseText(data.content || '');
      }
    } catch (e) {
      console.error("Erro ao carregar base de conhecimento:", e);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/whatsapp/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data || {});
      }
    } catch (e) {
      console.error("Erro ao carregar conversas:", e);
    }
  };

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/whatsapp/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data || []);
      }
    } catch (e) {
      console.error("Erro ao carregar contatos:", e);
    }
  };

  const fetchConnectionStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setWaConnectionStatus(data.status || 'desconectado');
      }
    } catch (e) {
      console.error("Erro ao carregar status da conexão do WhatsApp:", e);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchLogs();
    fetchKnowledgeBase();
    fetchConversations();
    fetchContacts();
    fetchConnectionStatus();

    // Constant auto-refresh for logs and conversations so user can see chatbot activity
    const val = setInterval(() => {
      fetchLogs();
      fetchConversations();
      fetchConnectionStatus();
    }, 4000);
    return () => clearInterval(val);
  }, []);

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName || !cPhone) return;
    setIsSavingContact(true);
    setContactStatusMsg(null);
    try {
      const res = await fetch('/api/whatsapp/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingContactId || undefined,
          name: cName,
          phone: cPhone,
          notes: cNotes
        })
      });
      const data = await res.json();
      if (res.ok) {
        setContacts(data.contacts || []);
        setCName('');
        setCPhone('');
        setCNotes('');
        setEditingContactId(null);
        setContactStatusMsg("Contato cadastrado com sucesso!");
      } else {
        setContactStatusMsg(data.error || "Erro ao salvar contato.");
      }
    } catch (err: any) {
      setContactStatusMsg(`Erro: ${err?.message || err}`);
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleEditContact = (contact: ContactItem) => {
    setEditingContactId(contact.id);
    setCName(contact.name);
    setCPhone(contact.phone);
    setCNotes(contact.notes || '');
    setActiveTab('contacts');
  };

  const handleDeleteContact = async (id: string) => {
    try {
      const res = await fetch(`/api/whatsapp/contacts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (e) {
      console.error("Erro ao remover contato:", e);
    }
  };

  const handleSelectContactForMessage = (phone: string) => {
    setSendNumber(phone);
    setActiveTab('dashboard');
  };

  const handleSelectContactForHistory = (phone: string) => {
    const cleanKey = phone.replace(/\D/g, "");
    setSelectedContactJid(cleanKey);
    setActiveTab('history');
  };

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

  const handleSaveKnowledgeBase = async () => {
    setIsSavingKb(true);
    setKbSaveResult(null);
    try {
      const res = await fetch('/api/whatsapp/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: knowledgeBaseText })
      });
      if (res.ok) {
        setKbSaveResult("Base de conhecimento salva com sucesso no servidor!");
        fetchKnowledgeBase();
      } else {
        setKbSaveResult("Erro ao salvar a base de conhecimento.");
      }
    } catch (e: any) {
      setKbSaveResult(`Falha ao salvar: ${e?.message || e}`);
    } finally {
      setIsSavingKb(false);
    }
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl) return;
    setIsImportingUrl(true);
    setImportUrlResult(null);

    try {
      const res = await fetch('/api/whatsapp/knowledge-base/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setKnowledgeBaseText(data.content);
        setImportUrlResult({
          success: true,
          message: data.message || `Dados da URL importados com sucesso!`
        });
        setImportUrl('');
        fetchKnowledgeBase();
      } else {
        setImportUrlResult({
          success: false,
          message: data.error || 'Falha ao extrair conteúdo da URL.'
        });
      }
    } catch (err: any) {
      setImportUrlResult({
        success: false,
        message: `Erro na comunicação: ${err?.message || err}`
      });
    } finally {
      setIsImportingUrl(false);
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

  // Direct Outbound Message Sending via Baileys
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

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-white overflow-y-auto selection:bg-orange-500/30">
      {/* Header Banner */}
      <div className="p-6 md:p-8 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-b border-white/10 relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-transparent border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-xl shadow-orange-500/10">
              <MessageSquare size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-white">OSONE ZAP</h1>
                <span className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold">
                  baileys local
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-xl">
                Automação nativa via Baileys (conexão direta por WebSocket, sem navegador) com respostas orientadas pelo Gemini 3.5-flash-lite e disparo direto de mensagens.
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
      </div>

      {/* Sticky Navigation Tabs Header */}
      <div className="sticky top-0 z-30 bg-[#0c0d10]/95 backdrop-blur-xl border-b border-white/10 shadow-2xl py-3 px-6 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'dashboard' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Smartphone size={15} className="text-emerald-400" />
            1. Conectar & Disparar
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'history' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <History size={15} />
            2. Histórico de Mensagens {logs.length > 0 && <span className="text-[10px] bg-emerald-500/30 px-1.5 py-0.5 rounded-full text-emerald-300 font-mono font-bold">{logs.length}</span>}
          </button>

          <button
            onClick={() => setActiveTab('contacts')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'contacts' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Users size={15} />
            3. Lista de Contatos {contacts.length > 0 && <span className="text-[10px] bg-emerald-500/30 px-1.5 py-0.5 rounded-full text-emerald-300 font-mono font-bold">{contacts.length}</span>}
          </button>

          <button
            onClick={() => setActiveTab('docs')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'docs' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <BookOpen size={15} />
            4. Documentação & Base RAG
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'settings' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Settings size={15} />
            5. Ajustes de IA
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full flex-1">
        {/* TAB 1: DASHBOARD & SENDING */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Guide Info Banner */}
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200 flex items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 border border-emerald-500/30">
                  <Smartphone size={20} />
                </div>
                <div>
                  <span className="font-bold text-white text-sm block mb-0.5">Aba 1: Pareamento & Disparo Rápido</span>
                  <p className="text-[11px] text-emerald-300/90 leading-relaxed">
                    O QR Code abaixo pertence à <strong className="text-white">Aba 1 (Conectar & Disparar)</strong>. Para alternar para as outras funções (Histórico, Contatos, Base de Conhecimento RAG e Ajustes de IA), clique nos botões na <strong className="text-white">Barra de Abas Fixa</strong> no topo da página.
                  </p>
                </div>
              </div>
            </div>

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
                    <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                      <Send size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Disparo Real de Mensagem</h3>
                      <p className="text-[11px] text-zinc-400">Envia uma mensagem direta pelo WhatsApp Web conectado</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSendDirectMessage} className="space-y-4">
                  {/* Quick Select from Saved Contacts */}
                  {contacts.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <Users size={12} /> Selecionar de Contatos Cadastrados
                        </span>
                        <span className="text-[10px] text-zinc-500">{contacts.length} contatos salvos</span>
                      </label>
                      <select
                        onChange={(e) => {
                          if (e.target.value) setSendNumber(e.target.value);
                        }}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="" className="bg-zinc-900 text-zinc-400">-- Escolha um contato ou digite abaixo --</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.phone} className="bg-zinc-900 text-white">
                            👤 {c.name} ({c.phone})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Número de Destino (com DDI e DDD)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 5511999999999"
                      value={sendNumber}
                      onChange={(e) => setSendNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
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
                      rows={4}
                      placeholder="Escreva a mensagem real a ser enviada..."
                      value={sendMessageText}
                      onChange={(e) => setSendMessageText(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-all resize-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSending || !sendNumber || !sendMessageText}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSending ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Enviando pelo Puppeteer...</span>
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        <span>Enviar Mensagem Real pelo WhatsApp</span>
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
            </div>
          </div>
        </div>
        )}

        {/* TAB 2: HISTÓRICO DE MENSAGENS */}
        {activeTab === 'history' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Chat History per Contact */}
            <div className="lg:col-span-6 space-y-6">
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl h-full flex flex-col">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                      <History size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Histórico de Mensagens por Contato</h3>
                      <p className="text-[11px] text-zinc-400">Mensagens enviadas e recebidas gravadas no servidor</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    conversations.json
                  </span>
                </div>

                {Object.keys(conversations).length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs">
                    Nenhuma conversa registrada ainda. As conversas ativas no WhatsApp aparecerão aqui automaticamente.
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                    {/* Contact Selector */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/5">
                      {Object.keys(conversations).map((jidKey) => (
                        <button
                          key={jidKey}
                          onClick={() => setSelectedContactJid(jidKey)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-mono whitespace-nowrap cursor-pointer transition-all ${
                            selectedContactJid === jidKey || (!selectedContactJid && Object.keys(conversations)[0] === jidKey)
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                              : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                          }`}
                        >
                          +{jidKey} ({conversations[jidKey].length})
                        </button>
                      ))}
                    </div>

                    {/* Chat Messages Log for Selected Contact */}
                    {(() => {
                      const activeJid = selectedContactJid || Object.keys(conversations)[0];
                      const activeMsgs = activeJid ? conversations[activeJid] || [] : [];

                      return (
                        <div className="flex-1 overflow-y-auto max-h-[480px] space-y-2.5 pr-1 mt-2">
                          {activeMsgs.length === 0 ? (
                            <p className="text-xs text-zinc-500 text-center py-4">Sem mensagens neste contato.</p>
                          ) : (
                            activeMsgs.map((msg, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-2xl text-xs max-w-[85%] ${
                                  msg.role === 'user'
                                    ? 'bg-zinc-800 text-zinc-100 mr-auto border border-white/5'
                                    : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 ml-auto'
                                }`}
                              >
                                <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 mb-1 gap-2">
                                  <span>{msg.role === 'user' ? '👤 Cliente' : '🤖 Vendedor AI (OSONE)'}</span>
                                  <span className="font-mono text-zinc-500">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Real-time Event Feed */}
            <div className="lg:col-span-6">
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl h-full flex flex-col">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <Activity size={18} className="text-emerald-400 animate-pulse" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Feed de Auditoria & Logs em Tempo Real</h3>
                      <p className="text-[11px] text-zinc-400">Eventos de envio, recebimento e status Puppeteer</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchLogs}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RefreshCw size={11} className={isRefreshingLogs ? 'animate-spin' : ''} />
                      Atualizar
                    </button>
                    <button
                      onClick={handleClearLogs}
                      className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 size={11} />
                      Limpar
                    </button>
                  </div>
                </div>

                {logs.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs">
                    Nenhum log de atividade registrado até o momento.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1 flex-1">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col gap-1 text-xs hover:border-white/10 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {log.type === 'sent' && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold">
                                ENVIADA
                              </span>
                            )}
                            {log.type === 'received' && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-bold">
                                RECEBIDA
                              </span>
                            )}
                            {log.type === 'info' && (
                              <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-bold">
                                SISTEMA
                              </span>
                            )}
                            {log.type === 'error' && (
                              <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-bold">
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
                          <div className="mt-1 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-200 text-[11px]">
                            <span className="font-bold text-emerald-400 block mb-0.5">Resposta Gerada:</span>
                            {log.response}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: LISTA DE CONTATOS */}
        {activeTab === 'contacts' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Add / Edit Contact Form */}
            <div className="lg:col-span-4">
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/10">
                  <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                    <UserPlus size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {editingContactId ? 'Editar Contato' : 'Novo Contato'}
                    </h3>
                    <p className="text-[11px] text-zinc-400">Cadastre nome e telefone para envios rápidos e histórico</p>
                  </div>
                </div>

                <form onSubmit={handleSaveContact} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Nome do Contato / Cliente
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Carlos Oliveira"
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Telefone (DDI + DDD + Número)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 5511999998888"
                      value={cPhone}
                      onChange={(e) => setCPhone(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Observações / Categoria (Opcional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Ex: Cliente interessado no OSONE G5. Atendido dia 25/07."
                      value={cNotes}
                      onChange={(e) => setCNotes(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                    />
                  </div>

                  {contactStatusMsg && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle size={14} className="shrink-0 text-emerald-400" />
                      <p>{contactStatusMsg}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    {editingContactId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingContactId(null);
                          setCName('');
                          setCPhone('');
                          setCNotes('');
                        }}
                        className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSavingContact || !cName || !cPhone}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-black font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                    >
                      {isSavingContact ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                      {editingContactId ? 'Atualizar Contato' : 'Salvar Contato'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right: Saved Contacts List */}
            <div className="lg:col-span-8 space-y-6">
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                      <Users size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Agenda de Contatos</h3>
                      <p className="text-[11px] text-zinc-400">Armazenados com persistência em <code className="text-emerald-400 font-mono">contacts.json</code></p>
                    </div>
                  </div>

                  {/* Actions: Import Button + Search Bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleImportWaContacts}
                      disabled={isImportingWa}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Importar contatos salvos da conta do WhatsApp conectada"
                    >
                      <RefreshCw size={12} className={isImportingWa ? "animate-spin" : ""} />
                      {isImportingWa ? "Sincronizando..." : "Ler Contatos do WhatsApp"}
                    </button>

                    <div className="relative w-full sm:w-52">
                      <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Buscar nome ou fone..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>
                </div>

                {importWaStatusMsg && (
                  <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle size={14} className="shrink-0 text-emerald-400" />
                    <p>{importWaStatusMsg}</p>
                  </div>
                )}

                {contacts.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs">
                    Nenhum contato cadastrado ainda. Clique em "Ler Contatos do WhatsApp" acima ou adicione manualmente ao lado!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contacts
                      .filter(c => 
                        c.name.toLowerCase().includes(contactSearch.toLowerCase()) || 
                        c.phone.includes(contactSearch)
                      )
                      .map((c) => (
                        <div key={c.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-emerald-500/30 transition-all flex flex-col justify-between gap-3">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                <UserCheck size={14} className="text-emerald-400 shrink-0" />
                                {c.name}
                              </h4>
                              <div className="flex items-center gap-1.5">
                                {c.source === 'wa' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                                    WhatsApp
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-white/10 text-[9px] font-bold">
                                    Manual
                                  </span>
                                )}
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  +{c.phone}
                                </span>
                              </div>
                            </div>
                            {c.notes && (
                              <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 bg-black/30 p-2 rounded-xl border border-white/5">
                                {c.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleSelectContactForMessage(c.phone)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                title="Mandar Mensagem Direta"
                              >
                                <Send size={11} /> Disparar
                              </button>
                              <button
                                onClick={() => handleSelectContactForHistory(c.phone)}
                                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                title="Ver Histórico de Conversa"
                              >
                                <History size={11} /> Histórico
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleEditContact(c)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
                                title="Editar Contato"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteContact(c.id)}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all cursor-pointer"
                                title="Excluir Contato"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DOCUMENTAÇÃO & BASE DO PRODUTO */}
        {activeTab === 'docs' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Product Info Card & URL Importer */}
            <div className="lg:col-span-7 space-y-6">
              {/* Knowledge Base Editor */}
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl relative">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                      <Database size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Base de Conhecimento do Produto (Vendedor AI)</h3>
                      <p className="text-[11px] text-zinc-400">Texto base e regras de produto que a IA usará ao responder clientes</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    knowledge-base.json
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
                      <span>Descrição do Produto, Preços & Links de Venda</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{knowledgeBaseText.length} carac</span>
                    </label>
                    <textarea
                      rows={10}
                      value={knowledgeBaseText}
                      onChange={(e) => setKnowledgeBaseText(e.target.value)}
                      placeholder={`Exemplo de Conteúdo para a IA:\n- NOME: OSONE G5 Automation\n- PREÇO: R$ 497,00 à vista\n- LINK DO PRODUTO: https://osone.app/produto-exemplo\n- DETALHES: Atendimento automático via WhatsApp Web, leitor de QR Code, histórico completo.`}
                      className="w-full p-3.5 bg-white/5 border border-white/10 rounded-2xl text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-mono leading-relaxed resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {kbSaveResult ? (
                      <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                        <CheckCircle size={14} /> {kbSaveResult}
                      </span>
                    ) : (
                      <span className="text-[11px] text-zinc-500">Salvo no servidor e lido nas mensagens.</span>
                    )}

                    <button
                      onClick={handleSaveKnowledgeBase}
                      disabled={isSavingKb}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-black font-bold text-xs transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {isSavingKb ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                      Salvar Base de Texto
                    </button>
                  </div>
                </div>
              </div>

              {/* URL Web Scraping Importer Card */}
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/10">
                  <div className="p-2 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-400">
                    <Globe size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Importar Link da Página do Produto / Site</h3>
                    <p className="text-[11px] text-zinc-400">Extrai o texto da página e anexa à base do vendedor AI</p>
                  </div>
                </div>

                <form onSubmit={handleImportUrl} className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Globe size={16} className="absolute left-3.5 top-3 text-zinc-500" />
                      <input
                        type="url"
                        placeholder="https://sualoja.com.br/meu-produto"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500/50 font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isImportingUrl || !importUrl}
                      className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                    >
                      {isImportingUrl ? <RefreshCw size={14} className="animate-spin" /> : <LinkIcon size={14} />}
                      Extrair Conteúdo do Link
                    </button>
                  </div>

                  {importUrlResult && (
                    <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                      importUrlResult.success 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}>
                      {importUrlResult.success ? <CheckCircle size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                      <p>{importUrlResult.message}</p>
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* Right: Technical Documentation Guide */}
            <div className="lg:col-span-5">
              <div className="p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl h-full flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/10">
                    <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Documentação do OSONE ZAP</h3>
                      <p className="text-[11px] text-zinc-400">Guia oficial da arquitetura e automação</p>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10">
                      <h4 className="font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                        <CheckCircle size={13} /> 1. Conexão Real via Baileys
                      </h4>
                      <p className="text-zinc-400 text-[11px] leading-relaxed">
                        O OSONE conecta direto ao WhatsApp por WebSocket com <code className="text-emerald-300 font-mono">Baileys</code>, sem abrir navegador nenhum. O QR Code gerado é capturado em tempo real e a sessão autenticada é mantida na pasta segura <code className="text-zinc-300 font-mono">.baileys_auth</code>.
                      </p>
                    </div>

                    <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10">
                      <h4 className="font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                        <CheckCircle size={13} /> 2. Leitura de Contatos e Mensagens
                      </h4>
                      <p className="text-zinc-400 text-[11px] leading-relaxed">
                        A API sincroniza os contatos armazenados na agenda do WhatsApp e grava o histórico de envios e recebimentos diretamente no servidor local (<code className="text-zinc-300 font-mono">conversations.json</code>).
                      </p>
                    </div>

                    <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10">
                      <h4 className="font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                        <CheckCircle size={13} /> 3. Motor de Atendimento com Gemini AI
                      </h4>
                      <p className="text-zinc-400 text-[11px] leading-relaxed">
                        Quando uma mensagem chega, o servidor consulta a Base de Conhecimento e utiliza o Gemini 3.5-flash-lite para responder o cliente instantaneamente.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`p-3 border rounded-2xl text-[11px] flex items-center justify-between ${
                  waConnectionStatus === 'conectado'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                }`}>
                  <span>Sistema OSONE ZAP v5.0 — Status: </span>
                  <span className={`font-bold font-mono ${waConnectionStatus === 'conectado' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {waConnectionStatus === 'conectado' ? 'CONECTADO E OPERACIONAL' : waConnectionStatus.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: CHATBOT SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Settings size={18} className="text-emerald-400" />
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
                    config.enabled ? 'bg-emerald-500' : 'bg-zinc-800'
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
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Se deixado em branco, o sistema usará a chave de ambiente configurada no OSONE.
                </p>
              </div>

              {/* Trigger Command Toggle */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="pr-3">
                    <h4 className="text-xs font-bold text-white">Só responder quando chamarem o OSONE</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {config.requireTriggerCommand
                        ? `O robô fica quieto até alguém escrever "${config.triggerCommand}" na mensagem — como quem diz "ei, OSONE, me responde aqui". Suas conversas normais seguem sem interrupção.`
                        : 'ATENÇÃO: o robô responde a TODA mensagem recebida, inclusive no meio de conversas suas com outras pessoas.'}
                    </p>
                  </div>

                  <button
                    onClick={() => handleSaveConfig({ requireTriggerCommand: !config.requireTriggerCommand })}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                      config.requireTriggerCommand ? 'bg-emerald-500' : 'bg-zinc-800'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        config.requireTriggerCommand ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {config.requireTriggerCommand && (
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">
                      Comando que ativa o robô
                    </label>
                    <input
                      type="text"
                      placeholder="/osone"
                      value={config.triggerCommand}
                      onChange={(e) => setConfig({ ...config, triggerCommand: e.target.value })}
                      onBlur={() => {
                        // Campo vazio liberaria todas as mensagens, o oposto do que a opção promete:
                        // volta para o padrão em vez de salvar um gatilho que não filtra nada.
                        const cleaned = config.triggerCommand.trim() || '/osone';
                        if (cleaned !== config.triggerCommand) setConfig({ ...config, triggerCommand: cleaned });
                        handleSaveConfig({ triggerCommand: cleaned });
                      }}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Funciona em qualquer parte da mensagem, sem diferenciar maiúsculas. O comando é
                      removido antes de a IA ler o pedido. Vale também para áudios: basta falar o comando.
                    </p>
                  </div>
                )}
              </div>

              {/* Saved-contacts-only Toggle */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="pr-3">
                  <h4 className="text-xs font-bold text-white">Responder apenas contatos salvos</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {config.onlyKnownContacts
                      ? 'O robô só atende números cadastrados na aba Contatos. Mensagens de desconhecidos ficam registradas nos logs, mas sem resposta automática.'
                      : 'ATENÇÃO: o robô responde a QUALQUER número que escrever, incluindo spam e desconhecidos, mesmo com você longe do computador.'}
                  </p>
                </div>

                <button
                  onClick={() => handleSaveConfig({ onlyKnownContacts: !config.onlyKnownContacts })}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    config.onlyKnownContacts ? 'bg-emerald-500' : 'bg-zinc-800'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      config.onlyKnownContacts ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Audio Reply Toggle */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <div>
                  <h4 className="text-xs font-bold text-white">Responder também por áudio</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Além do texto, envia a resposta como mensagem de voz gerada por IA.
                  </p>
                </div>

                <button
                  onClick={() => handleSaveConfig({ sendAudioReplies: !config.sendAudioReplies })}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    config.sendAudioReplies ? 'bg-emerald-500' : 'bg-zinc-800'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      config.sendAudioReplies ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* TTS Engine Selector */}
              {config.sendAudioReplies && (
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    Motor de Voz para as Respostas em Áudio
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConfig({ ...config, ttsEngine: 'gemini' })}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        config.ttsEngine === 'gemini'
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-zinc-400'
                      }`}
                    >
                      Gemini (padrão)
                    </button>
                    <button
                      onClick={() => setConfig({ ...config, ttsEngine: 'elevenlabs' })}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        config.ttsEngine === 'elevenlabs'
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-zinc-400'
                      }`}
                    >
                      ElevenLabs
                    </button>
                  </div>

                  {config.ttsEngine === 'elevenlabs' && (
                    <div className="mt-3 space-y-2.5">
                      <input
                        type="password"
                        placeholder="Chave API da ElevenLabs (opcional, usa a global se vazio)"
                        value={config.elevenLabsApiKey}
                        onChange={(e) => setConfig({ ...config, elevenLabsApiKey: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                      />
                      <input
                        type="text"
                        placeholder="ID da Voz na ElevenLabs (opcional)"
                        value={config.elevenLabsVoiceId}
                        onChange={(e) => setConfig({ ...config, elevenLabsVoiceId: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                  onClick={() => handleSaveConfig()}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-black font-bold text-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  Salvar Ajustes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
