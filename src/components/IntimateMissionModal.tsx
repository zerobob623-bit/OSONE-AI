import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock, Fingerprint, FileText, Download, CheckCircle, HelpCircle, Edit3, Trash2, Loader2, UploadCloud, Mic, MicOff } from 'lucide-react';
import { INTIMATE_QUESTIONS, IntimateQuestion } from '../App';

interface IntimateMissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  intimateAnswers: { [id: number]: string };
  onUpdateAnswer: (id: number, val: string) => void;
  onUpdateBulkAnswers?: (answers: { [id: number]: string }) => void;
}

export function IntimateMissionModal({ isOpen, onClose, intimateAnswers, onUpdateAnswer, onUpdateBulkAnswers }: IntimateMissionModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>("Informações Básicas e Identidade");
  const [filterType, setFilterType] = useState<'all' | 'answered' | 'pending'>('all');
  
  // Reference Document Upload States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New States for Text reference and Voice input
  const [showTextInputArea, setShowTextInputArea] = useState(true);
  const [referenceText, setReferenceText] = useState("");
  const [dictatingQuestionId, setDictatingQuestionId] = useState<number | null>(null);
  const recognitionInstanceRef = useRef<any>(null);

  const startVoiceDictation = (qId: number) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Seu navegador não oferece suporte nativo para Reconhecimento de Voz. Experimente usar o Chrome ou Edge!");
      return;
    }

    if (dictatingQuestionId === qId) {
      stopVoiceDictation();
      return;
    }

    if (recognitionInstanceRef.current) {
      try {
        recognitionInstanceRef.current.stop();
      } catch (e) {}
    }

    try {
      const rec = new SpeechRecognition();
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        setDictatingQuestionId(qId);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        const inputEl = document.getElementById(`dossier-input-${qId}`) as HTMLInputElement;
        if (inputEl) {
          inputEl.value = transcript;
        }
      };

      rec.onerror = (event: any) => {
        console.error("Erro no reconhecimento de voz do dossiê:", event.error);
        if (event.error === 'not-allowed') {
          alert("Permissão de acesso ao microfone negada. Ative o acesso nas configurações do seu navegador para usar a voz.");
        }
      };

      rec.onend = () => {
        setDictatingQuestionId(null);
      };

      recognitionInstanceRef.current = rec;
      rec.start();
    } catch (err) {
      console.error("Falha ao iniciar gravador de voz:", err);
    }
  };

  const stopVoiceDictation = () => {
    if (recognitionInstanceRef.current) {
      try {
        recognitionInstanceRef.current.stop();
      } catch (e) {}
    }
    setDictatingQuestionId(null);
  };

  const handleAnalyzeTextReference = async () => {
    if (!referenceText.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStatus("Lendo referências bibliográficas...");
    
    try {
      // Base64 encode the string safely supporting utf-8
      const utf8Bytes = new TextEncoder().encode(referenceText);
      let binary = "";
      const len = utf8Bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const base64 = window.btoa(binary);
      
      setAnalysisStatus("Mapeando respostas com o Cérebro OSONE...");
      
      const response = await fetch('/api/dossier/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: base64,
          mimeType: "text/plain",
          questions: INTIMATE_QUESTIONS,
          currentAnswers: intimateAnswers
        })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Falha na análise automatizada do dossiê.");
      }
      
      setAnalysisStatus("Inserindo sinapses...");
      const data = await response.json();
      
      if (data.status === "success" && data.answers) {
        const returnedAnswers = data.answers;
        const formattedNewAnswers: { [id: number]: string } = {};
        let filledCount = 0;
        
        Object.entries(returnedAnswers).forEach(([key, val]) => {
          const id = Number(key);
          const valStr = String(val).trim();
          
          if (!isNaN(id) && id >= 1 && id <= 55 && valStr) {
            if (!intimateAnswers[id] || intimateAnswers[id].trim() === "") {
              formattedNewAnswers[id] = valStr;
              filledCount++;
            }
          }
        });
        
        if (filledCount > 0) {
          if (onUpdateBulkAnswers) {
            onUpdateBulkAnswers(formattedNewAnswers);
          } else {
            Object.entries(formattedNewAnswers).forEach(([id, val]) => {
              onUpdateAnswer(Number(id), val);
            });
          }
          alert(`🧬 Mapeamento com sucesso! ${filledCount} novas respostas preenchidas a partir do texto!`);
          setShowTextInputArea(false);
          setReferenceText("");
        } else {
          alert(`📄 Texto analisado! Todas as informações extraídas já estavam preenchidas no seu Dossiê.`);
        }
      } else {
        throw new Error("Formato inválido de resposta do servidor neural.");
      }
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || "Houve uma anomalia ao analisar o texto.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const answeredCount = Object.keys(intimateAnswers).filter(id => intimateAnswers[Number(id)]?.trim() !== '').length;
  const totalCount = INTIMATE_QUESTIONS.length;
  const completionPercentage = Math.round((answeredCount / totalCount) * 100);
  const isMissionComplete = answeredCount === totalCount;

  // Group questions by category
  const categories = Array.from(new Set(INTIMATE_QUESTIONS.map(q => q.category)));

  // Process reference document uploading
  const processReferenceFile = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStatus("Decodificando arquivo biográfico...");
    
    try {
      const reader = new FileReader();
      
      const filePromise = new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          let detectedMimeType = file.type;
          const lowerName = file.name.toLowerCase();
          if (!detectedMimeType) {
            if (lowerName.endsWith('.pdf')) {
              detectedMimeType = "application/pdf";
            } else if (lowerName.endsWith('.txt')) {
              detectedMimeType = "text/plain";
            } else if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
              detectedMimeType = "text/html";
            } else if (lowerName.endsWith('.md')) {
              detectedMimeType = "text/markdown";
            }
          }
          resolve({
            base64,
            mimeType: detectedMimeType || "text/plain"
          });
        };
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo biográfico físico."));
        reader.readAsDataURL(file);
      });
      
      const { base64, mimeType } = await filePromise;
      
      setAnalysisStatus("Sincronizando com as engrenagens neurais...");
      
      const response = await fetch('/api/dossier/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: base64,
          mimeType,
          questions: INTIMATE_QUESTIONS,
          currentAnswers: intimateAnswers
        })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Falha na análise automatizada do dossiê.");
      }
      
      setAnalysisStatus("Mapeando sinapses novas no OSONE local...");
      const data = await response.json();
      
      if (data.status === "success" && data.answers) {
        const returnedAnswers = data.answers;
        
        const formattedNewAnswers: { [id: number]: string } = {};
        let filledCount = 0;
        
        Object.entries(returnedAnswers).forEach(([key, val]) => {
          const id = Number(key);
          const valStr = String(val).trim();
          
          if (!isNaN(id) && id >= 1 && id <= 55 && valStr) {
            // Fill empty fields only (as requested: "preencher caso falte, ou preencher automaticamente se dossiê limpo")
            if (!intimateAnswers[id] || intimateAnswers[id].trim() === "") {
              formattedNewAnswers[id] = valStr;
              filledCount++;
            }
          }
        });
        
        if (filledCount > 0) {
          if (onUpdateBulkAnswers) {
            onUpdateBulkAnswers(formattedNewAnswers);
          } else {
            Object.entries(formattedNewAnswers).forEach(([id, val]) => {
              onUpdateAnswer(Number(id), val);
            });
          }
          alert(`🧬 Mapeamento com sucesso! ${filledCount} novas respostas integradas às lacunas do seu Dossiê!`);
        } else {
          alert(`📄 Documento analisado! Todas as informações extraídas já estavam preenchidas no seu Dossiê.`);
        }
      } else {
        throw new Error("Formato inválido de resposta do servidor neural.");
      }
      
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || "Houve uma anomalia ao processar a referência.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processReferenceFile(file);
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  
  const handleDragLeave = () => {
    setDragOver(false);
  };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processReferenceFile(file);
    }
  };

  const handleDownloadDossier = () => {
    // Generate beautiful Dossier Markdown content
    let markdown = `# DOSSIÊ OSONE: QUEM É VOCÊ?\n\n`;
    markdown += `*Um mapeamento íntimo e sofisticado da identidade de nosso Criador e Usuário.*\n`;
    markdown += `*Gerado silenciosamente por OSONE G5 na data de hoje de forma offline.*\n\n`;
    markdown += `## PROGRESSO DO MAPEAMENTO: ${completionPercentage}% ATIVO\n`;
    markdown += `Total de Perguntas Respondidas: ${answeredCount} / 55\n\n`;
    markdown += `🐾 --- INÍCIO DO REGISTRO DE IDENTIDADE ---\n\n`;

    categories.forEach(category => {
      markdown += `### 📁 COMPARTIMENTO: ${category.toUpperCase()}\n\n`;
      const questionsInCat = INTIMATE_QUESTIONS.filter(q => q.category === category);
      questionsInCat.forEach(q => {
        const answer = intimateAnswers[q.id]?.trim() || "Aguardando preenchimento / Não documentado.";
        markdown += `**${q.id}. ${q.question}**\n`;
        markdown += `> 📝 R: ${answer}\n\n`;
      });
      markdown += `---\n\n`;
    });

    markdown += `\n*Fim do dossiê de memórias. Todos os dados permanecem guardados localmente no OSONE.*`;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Dossie_Mapeamento_OSONE_${completionPercentage}percent.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        {/* Backdrop glass */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal box */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-4xl h-[85vh] flex flex-col bg-[#0b0c0e]/95 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden text-zinc-100 font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-gradient-to-r from-rose-950/20 via-black to-black">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
                <Fingerprint size={22} className="animate-pulse" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-[0.2em] uppercase text-rose-450 font-mono">
                  DOSSIÊ DE MEMÓRIA ÍNTIMA do criador
                </h1>
                <p className="text-xs text-zinc-400">
                  Perguntas de identificação e sinapses. Responda diretamente ou converse livremente com o OSONE para que ele aprenda.
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress region */}
          <div className="px-6 py-4 bg-white/[0.01] border-b border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="w-full md:w-2/3">
              <div className="flex justify-between text-xs font-mono text-zinc-400 mb-1.5">
                <span>MAPEAMENTO DO CRIADOR (SEM BLOQUEIOS)</span>
                <span className="text-rose-400 font-bold">{completionPercentage}% ({answeredCount} de {totalCount} Completo)</span>
              </div>
              <div className="h-2 w-full bg-zinc-900 border border-white/5 rounded-full overflow-hidden p-0.5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${completionPercentage}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.4)]"
                />
              </div>
            </div>

            <div className="w-full md:w-auto shrink-0 flex flex-wrap items-center justify-end gap-2">
              {/* Text Reference Toggle Button */}
              <button
                id="btn-paste-text-reference"
                onClick={() => setShowTextInputArea(!showTextInputArea)}
                className={`flex items-center gap-1.5 p-1.5 px-3 rounded-full border transition-all text-zinc-300 hover:text-white font-bold font-mono text-[10px] uppercase tracking-widest cursor-pointer ${
                  showTextInputArea
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                    : "bg-zinc-950/40 border-white/5 hover:border-white/15"
                }`}
              >
                <FileText size={12} className="text-rose-400" />
                <span>Colar Texto</span>
              </button>

              {/* Usar Dossiê de referência - Sleek, Compact Pill */}
              <div 
                className={`relative flex items-center gap-1.5 p-1.5 px-3 rounded-full border transition-all ${
                  dragOver 
                    ? "bg-rose-500/10 border-rose-500/30 ring-1 ring-rose-500/20 animate-pulse" 
                    : "bg-zinc-950/40 border-white/5 hover:border-white/15"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {isAnalyzing ? (
                  <div className="flex items-center gap-1.5">
                    <Loader2 size={12} className="text-zinc-400 animate-spin" />
                    <span className="text-[9.5px] text-rose-400 font-mono animate-pulse">{analysisStatus}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-zinc-300 hover:text-white font-bold font-mono text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    <UploadCloud size={12} className="text-rose-450" />
                    <span>Usar Referência</span>
                  </button>
                )}

                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,.txt,.md,.json" 
                  className="hidden" 
                />
              </div>

              {analysisError && (
                <div 
                  onClick={() => setAnalysisError(null)}
                  className="text-[9px] text-red-400 font-mono bg-red-950/30 border border-red-500/20 px-2.5 py-1.5 rounded-full cursor-pointer animate-fade-in flex items-center gap-1 shrink-0"
                  title="Clique para limpar"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>Erro: {analysisError.length > 30 ? analysisError.substring(0, 30) + "..." : analysisError}</span>
                </div>
              )}

              <button 
                onClick={handleDownloadDossier}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 font-semibold text-xs rounded-full border border-rose-400/20 transition-all text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:scale-[1.02]"
              >
                <Download size={14} />
                <span>{isMissionComplete ? "BAIXAR DOSSIÊ COMPLETO" : "EXPORTAR DOSSIÊ PARCIAL"}</span>
              </button>
            </div>
          </div>

          {/* Expandable Text Reference Input */}
          <AnimatePresence>
            {showTextInputArea && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden bg-rose-950/10 border-b border-rose-500/15"
              >
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-400">Inserir Texto de Referência</span>
                    </div>
                    <button 
                      onClick={() => setShowTextInputArea(false)}
                      className="text-[10px] font-mono text-zinc-400 hover:text-white uppercase"
                    >
                      [Fechar]
                    </button>
                  </div>
                  <textarea
                    value={referenceText}
                    onChange={(e) => setReferenceText(e.target.value)}
                    placeholder="Cole ou escreva aqui qualquer texto de referência sobre você (ex: uma breve biografia, perfil profissional, fatos que deseja registrar, anotações de conversa, etc.). A IA do OSONE fará uma varredura profunda no texto para mapear e preencher automaticamente as perguntas pendentes do seu Dossiê de Memória!"
                    className="w-full h-32 bg-zinc-950/80 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-500/30 font-sans resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setReferenceText("")}
                      className="px-3.5 py-1.5 text-[10px] font-mono uppercase border border-white/5 hover:border-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
                    >
                      Limpar
                    </button>
                    <button
                      onClick={handleAnalyzeTextReference}
                      disabled={isAnalyzing || !referenceText.trim()}
                      className="px-4 py-1.5 text-[10px] font-mono uppercase bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1.5 font-bold shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Analisando...</span>
                        </>
                      ) : (
                        <>
                          <Fingerprint size={12} />
                          <span>🧬 Sincronizar Texto</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Core interface content splitting */}
          <div className="flex-grow flex flex-col md:flex-row overflow-hidden min-h-0">
            {/* Category tabs */}
            <div className="w-full md:w-[325px] bg-black/40 border-r border-white/5 overflow-y-auto p-4 flex flex-row md:flex-col gap-1 shrink-0 scrollbar-none">
              
              {/* Resumo de Perguntas para Acompanhamento Geral */}
              <div className="hidden md:flex flex-col gap-2.5 p-4 bg-zinc-950/40 border border-white/[0.04] rounded-2xl text-left select-none relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/[0.03] blur-xl rounded-full pointer-events-none" />
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 font-bold uppercase block">Mapeamento de Sinapses</span>
                
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="p-2.5 bg-black/40 rounded-xl border border-white/[0.02]">
                    <span className="block text-[8px] text-zinc-400 uppercase font-mono leading-none tracking-wider">Respondidas</span>
                    <span className="text-base font-serif italic font-bold text-emerald-400 mt-1 block">
                      {answeredCount} <span className="text-[10px] text-zinc-500 font-sans font-light">/ {totalCount}</span>
                    </span>
                  </div>
                  <div className="p-2.5 bg-black/40 rounded-xl border border-white/[0.02]">
                    <span className="block text-[8px] text-zinc-400 uppercase font-mono leading-none tracking-wider">Restantes</span>
                    <span className="text-base font-serif italic font-bold text-rose-450 mt-1 block">
                      {totalCount - answeredCount} <span className="text-[10px] text-zinc-500 font-sans font-light">restantes</span>
                    </span>
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between text-[9.5px] text-zinc-500 font-mono">
                  <span>Conexão Local:</span>
                  <span className="text-zinc-300 font-semibold">Criptografia Baseada na Web</span>
                </div>
              </div>


              {categories.map((category, idx) => {
                const qInCat = INTIMATE_QUESTIONS.filter(q => q.category === category);
                const answeredInCat = qInCat.filter(q => intimateAnswers[q.id]?.trim()).length;
                const isCatFinished = answeredInCat === qInCat.length;

                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl text-left border transition-all shrink-0 md:shrink-1 ${
                      selectedCategory === category 
                        ? "bg-rose-500/[0.06] border-rose-500/15 text-rose-400" 
                        : "bg-transparent border-transparent hover:bg-white/[0.015] text-zinc-400"
                    }`}
                  >
                    <span className="text-[9px] font-mono tracking-wider text-rose-500 uppercase leading-none">
                      CATEGORIA 0{idx + 1}
                    </span>
                    <span className="text-xs font-semibold truncate w-full leading-normal">
                      {category}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mt-0.5 font-mono">
                      {isCatFinished ? (
                        <CheckCircle size={10} className="text-green-500" />
                      ) : (
                        <HelpCircle size={10} className="text-zinc-750" />
                      )}
                      <span>{answeredInCat} de {qInCat.length} respondidas</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Questions detail lists */}
            <div className="flex-1 overflow-y-auto p-6 bg-black/20">
              {selectedCategory && (
                <div className="space-y-4">
                  <div className="pb-4 border-b border-white/5 mb-4 shrink-0 select-none flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-rose-450 tracking-wider">
                        {selectedCategory.toUpperCase()}
                      </h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Livre visualização e edição. Escreva respostas diretamente para preencher os dados.
                      </p>
                    </div>

                    {/* Segmented controls to filter answered/pending questions */}
                    <div className="flex items-center bg-white/[0.02] border border-white/5 p-1 rounded-xl shrink-0">
                      <button
                        onClick={() => setFilterType('all')}
                        className={`px-3 py-1.5 text-[9.5px] font-mono tracking-wider uppercase rounded-lg transition-all cursor-pointer ${
                          filterType === 'all' 
                            ? "bg-white/10 text-white font-bold" 
                            : "text-zinc-400 hover:text-zinc-300"
                        }`}
                      >
                        Todas ({INTIMATE_QUESTIONS.filter(q => q.category === selectedCategory).length})
                      </button>
                      <button
                        onClick={() => setFilterType('answered')}
                        className={`px-3 py-1.5 text-[9.5px] font-mono tracking-wider uppercase rounded-lg transition-all cursor-pointer ${
                          filterType === 'answered' 
                            ? "bg-emerald-500/10 text-emerald-400 font-bold" 
                            : "text-zinc-400 hover:text-zinc-300"
                        }`}
                      >
                        Respondidas ({INTIMATE_QUESTIONS.filter(q => q.category === selectedCategory).filter(q => intimateAnswers[q.id]?.trim()).length})
                      </button>
                      <button
                        onClick={() => setFilterType('pending')}
                        className={`px-3 py-1.5 text-[9.5px] font-mono tracking-wider uppercase rounded-lg transition-all cursor-pointer ${
                          filterType === 'pending' 
                            ? "bg-rose-500/10 text-rose-400 font-bold" 
                            : "text-zinc-400 hover:text-zinc-300"
                        }`}
                      >
                        Restantes ({INTIMATE_QUESTIONS.filter(q => q.category === selectedCategory).filter(q => !intimateAnswers[q.id]?.trim()).length})
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(() => {
                      const filteredQs = INTIMATE_QUESTIONS.filter(q => q.category === selectedCategory).filter(q => {
                        const isAnswered = !!intimateAnswers[q.id]?.trim();
                        if (filterType === 'answered') return isAnswered;
                        if (filterType === 'pending') return !isAnswered;
                        return true;
                      });

                      if (filteredQs.length === 0) {
                        return (
                          <div className="py-12 text-center text-zinc-500 border border-dashed border-white/5 rounded-2xl">
                            <HelpCircle size={18} className="mx-auto mb-2 opacity-20 text-rose-450" />
                            <p className="text-xs font-light text-zinc-400">Nenhuma pergunta para este filtro.</p>
                            <p className="text-[9px] font-mono text-zinc-650 uppercase mt-1">Sincronização Ativa</p>
                          </div>
                        );
                      }

                      return filteredQs.map(q => {
                        const answer = intimateAnswers[q.id];
                        const isAnswered = !!answer?.trim();

                        return (
                          <div 
                            key={q.id}
                            className={`p-4 rounded-xl border transition-all ${
                              isAnswered 
                                ? "bg-emerald-500/[0.02] border-emerald-500/10 text-zinc-100 animate-in fade-in duration-300" 
                                : "bg-white/[0.01] border-white/5 text-zinc-300 hover:bg-white/[0.015] hover:border-white/10"
                            }`}
                          >
                            <div className="flex items-start gap-4 justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono px-2 py-0.5 bg-white/5 rounded text-zinc-400 shrink-0">
                                  #{q.id}
                                </span>
                                <span className="text-xs font-medium text-zinc-200">
                                  {q.question}
                                </span>
                              </div>
                              <div className="shrink-0 pt-0.5">
                                {isAnswered ? (
                                  <CheckCircle size={14} className="text-emerald-500" />
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500/80 block" />
                                )}
                              </div>
                            </div>

                            <div className="mt-3 pl-2 border-l border-white/5">
                              {isAnswered ? (
                                <div className="space-y-3">
                                  <p className="text-xs font-serif italic text-emerald-400/90 leading-relaxed max-w-3xl whitespace-pre-wrap">
                                    "{answer}"
                                  </p>
                                  <div className="flex items-center gap-4">
                                    <button
                                      onClick={() => {
                                        const newVal = prompt(`Editar Resposta #${q.id}:\n${q.question}`, answer);
                                        if (newVal !== null) {
                                          onUpdateAnswer(q.id, newVal.trim());
                                        }
                                      }}
                                      className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 hover:text-emerald-400 bg-white/[0.03] border border-white/5 hover:border-emerald-500/20 px-2.5 py-1 rounded-lg transition-all"
                                    >
                                      <Edit3 size={11} />
                                      <span>Editar Resposta</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm("Remover esta resposta?")) {
                                          onUpdateAnswer(q.id, "");
                                        }
                                      }}
                                      className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 hover:text-red-400 bg-white/[0.03] border border-white/5 hover:border-red-500/20 px-2.5 py-1 rounded-lg transition-all"
                                    >
                                      <Trash2 size={11} />
                                      <span>Apagar</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5 w-full max-w-3xl">
                                  <div className="relative flex-1 flex items-center">
                                    <input 
                                      id={`dossier-input-${q.id}`}
                                      type="text" 
                                      placeholder={dictatingQuestionId === q.id ? "Escutando... Fale agora para preencher" : "Escreva sua resposta ou use o microfone..."}
                                      className="w-full bg-white/[0.02] hover:bg-white/[0.04] focus:bg-black/60 border border-white/5 focus:border-rose-400/30 rounded-xl pl-3.5 pr-10 py-2 text-xs text-white placeholder:text-zinc-550 focus:outline-none transition-all"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const target = e.currentTarget;
                                          if (target.value.trim()) {
                                            onUpdateAnswer(q.id, target.value.trim());
                                            target.value = '';
                                            if (dictatingQuestionId === q.id) {
                                              stopVoiceDictation();
                                            }
                                          }
                                        }
                                      }}
                                    />
                                    <button
                                      id={`dossier-voice-btn-${q.id}`}
                                      type="button"
                                      onClick={() => startVoiceDictation(q.id)}
                                      className={`absolute right-2.5 p-1.5 rounded-lg transition-all ${
                                        dictatingQuestionId === q.id 
                                          ? "text-red-500 bg-red-500/10 animate-pulse border border-red-500/30" 
                                          : "text-zinc-400 hover:text-rose-450 hover:bg-white/5"
                                      }`}
                                      title="Preencher por Voz"
                                    >
                                      {dictatingQuestionId === q.id ? (
                                        <MicOff size={13} className="text-red-500 animate-pulse" />
                                      ) : (
                                        <Mic size={13} />
                                      )}
                                    </button>
                                  </div>
                                  <button
                                    id={`dossier-save-btn-${q.id}`}
                                    onClick={() => {
                                      const input = document.getElementById(`dossier-input-${q.id}`) as HTMLInputElement;
                                      if (input && input.value.trim()) {
                                        onUpdateAnswer(q.id, input.value.trim());
                                        input.value = '';
                                        if (dictatingQuestionId === q.id) {
                                          stopVoiceDictation();
                                        }
                                      }
                                    }}
                                    className="bg-zinc-800 hover:bg-zinc-700 hover:text-white text-zinc-300 text-[10px] font-mono uppercase tracking-wider px-3.5 py-2 rounded-xl border border-white/5 shrink-0 transition-colors cursor-pointer"
                                  >
                                    Salvar
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer visual indicators */}
          <div className="px-6 py-3 bg-black border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-zinc-550 select-none">
            <span>MEMÓRIA CONFIDENCIAL DESBLOQUEADA EM TEMPO REAL: SEM TRAVAS</span>
            <span>OSONE SECRETHUB v4.1.0</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
