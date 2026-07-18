import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  Heart, 
  Scale, 
  Ruler, 
  Calendar, 
  Shirt, 
  Sparkles, 
  Activity, 
  Stethoscope, 
  ChevronRight,
  TrendingUp,
  Brain,
  Info,
  Copy,
  Download,
  Trash2,
  Check,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';
import { generatePDF } from '../lib/pdfUtils';

interface HealthData {
  age: string;
  weight: string;
  height: string;
  gender: string;
  stylePreference: string;
}

export function WellnessCenter({ externalData, onUpdate, apiKeys }: { externalData?: HealthData, onUpdate?: (data: HealthData) => void, apiKeys: { gemini: string } }) {
  const [data, setData] = useState<HealthData>(() => {
    if (externalData) return externalData;
    const saved = localStorage.getItem('osone_health_data');
    return saved ? JSON.parse(saved) : {
      age: '',
      weight: '',
      height: '',
      gender: 'masculino',
      stylePreference: 'casual'
    };
  });
  useEffect(() => {
    if (externalData) {
      setData(externalData);
    }
  }, [externalData]);

  const [advice, setAdvice] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const refreshData = useCallback(() => {
    if (externalData) {
      setData(externalData);
      return;
    }
    const saved = localStorage.getItem('osone_health_data');
    if (saved) {
      setData(JSON.parse(saved));
    }
  }, [externalData]);

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail?.type === 'health_data_updated') {
        refreshData();
      }
    };
    window.addEventListener('osone_sync', handleSync);
    return () => window.removeEventListener('osone_sync', handleSync);
  }, [refreshData]);

  useEffect(() => {
    localStorage.setItem('osone_health_data', JSON.stringify(data));
    if (onUpdate) onUpdate(data);
  }, [data, onUpdate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(advice);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([advice], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `relatorio-saude-${new Date().toLocaleDateString()}.txt`;
    document.body.appendChild(element);
    element.click();
  };

  const calculateIMC = () => {
    const w = parseFloat(data.weight);
    const h = parseFloat(data.height) / 100;
    if (w && h) return (w / (h * h)).toFixed(1);
    return null;
  };

  const getIMCStatus = (imc: number) => {
    if (imc < 18.5) return { label: 'Abaixo do peso', color: 'text-blue-400' };
    if (imc < 25) return { label: 'Peso ideal', color: 'text-green-400' };
    if (imc < 30) return { label: 'Sobrepeso', color: 'text-yellow-400' };
    return { label: 'Obesidade', color: 'text-red-400' };
  };

  const handleConsult = async () => {
    if (!data.age || !data.weight || !data.height) {
      alert("Por favor, preencha todos os dados biométricos.");
      return;
    }

    const apiKey = apiKeys.gemini;
    if (!apiKey || apiKey.trim() === '') {
      alert("Por favor, vincule sua própria chave API Gemini nas configurações para a consulta neural.");
      return;
    }

    setIsGenerating(true);
    try {
      const imc = calculateIMC();
      
      const prompt = `Aja como um especialista em Saúde, Nutrição e Personal Styling. 
      Analise os seguintes dados do usuário e forneça um relatório conciso:
      
      DADOS:
      - Idade: ${data.age} anos
      - Peso: ${data.weight}kg
      - Altura: ${data.height}cm
      - Gênero: ${data.gender}
      - IMC Calculado: ${imc}
      - Preferência de Estilo: ${data.stylePreference}
      
      INSTRUÇÕES:
      1. Avalie brevemente se o IMC está saudável para a idade/gênero.
      2. Dê 3 dicas práticas de saúde ou nutrição personalizadas.
      3. Sugira uma combinação de roupas/look que favoreça esse biotipo e respeite o estilo "${data.stylePreference}".
      
      Use um tom profissional, acolhedor e motivador. Use formatação Markdown (negrito para títulos).`;

      const response = await fetch("/api/gemini/generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientApiKey: apiKey,
          model: "gemini-3.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            tools: [{ googleSearch: {} }]
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Erro de rede no proxy do servidor.");
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      setAdvice(textResponse);
    } catch (error: any) {
      console.error("Erro na consulta:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setAdvice(`### ⚠️ Erro de Consulta de Saúde\n\nNão foi possível obter a assessoria da central de saúde.\n\n**Detalhes técnicos:**\n> ${errorMsg}\n\n*Nota: Se você ultrapassou a cota de testes (Limite 429), configure sua própria Chave API válida do Google no painel de Ajustes (engrenagem no topo) para restabelecer os serviços neurais.*`);
    } finally {
      setIsGenerating(false);
    }
  };

  const imc = calculateIMC();
  const imcVal = imc ? parseFloat(imc) : null;
  const status = imcVal ? getIMCStatus(imcVal) : null;

  return (
    <div className="h-full flex flex-col bg-transparent overflow-hidden">
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden pb-[90px] md:pb-0">
        
               <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-white/[0.05] p-4 flex flex-col gap-4 overflow-y-auto bg-black/20 shrink-0 lg:shrink">
          <div>
            <h3 className="text-xs font-serif italic mb-2 flex items-center gap-2">
              <Stethoscope size={14} className="text-her-accent" />
              Biológicos
            </h3>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-her-muted font-light">
                    <Calendar size={10} /> Idade
                  </label>
                  <input 
                    type="number"
                    value={data.age}
                    onChange={(e) => setData({...data, age: e.target.value})}
                    placeholder="Anos"
                    className="w-full bg-white/[0.03] border border-white/[0.05] px-4 py-3 text-sm focus:outline-none focus:border-her-accent/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-her-muted font-light">
                    <Heart size={10} /> Gênero
                  </label>
                  <select 
                    value={data.gender}
                    onChange={(e) => setData({...data, gender: e.target.value})}
                    className="w-full bg-white/[0.03] border border-white/[0.05] px-4 py-3 text-sm focus:outline-none focus:border-her-accent/30 appearance-none"
                  >
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-her-muted font-light">
                    <Scale size={12} /> Peso (kg)
                  </label>
                  <input 
                    type="number"
                    value={data.weight}
                    onChange={(e) => setData({...data, weight: e.target.value})}
                    placeholder="70"
                    className="w-full bg-white/[0.03] border border-white/[0.05] px-4 py-3 text-sm focus:outline-none focus:border-her-accent/30"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-her-muted font-light">
                    <Ruler size={12} /> Altura (cm)
                  </label>
                  <input 
                    type="number"
                    value={data.height}
                    onChange={(e) => setData({...data, height: e.target.value})}
                    placeholder="175"
                    className="w-full bg-white/[0.03] border border-white/[0.05] px-4 py-3 text-sm focus:outline-none focus:border-her-accent/30"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-her-muted font-light">
                  <Shirt size={12} /> Estilo Favorito
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Casual', 'Formal', 'Streetwear', 'Esportivo', 'Minimalista'].map(s => (
                    <button
                      key={s}
                      onClick={() => setData({...data, stylePreference: s})}
                      className={cn(
                        "px-4 py-3 text-[10px] transition-all border uppercase tracking-widest",
                        data.stylePreference === s 
                          ? "bg-her-accent/20 border-her-accent/40 text-white" 
                          : "bg-white/[0.03] border-transparent text-her-muted hover:bg-white/[0.06]"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          {imc && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-white/[0.05] to-transparent p-6 border-y border-white/[0.1] space-y-4"
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-her-muted">Seu IMC</span>
                <span className={cn("text-[10px] font-medium", status?.color)}>{status?.label}</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-serif italic text-white">{imc}</span>
                <span className="text-[10px] text-her-muted mb-1">kg/m²</span>
              </div>
              <div className="w-full bg-white/5 h-1 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (imcVal! / 40) * 100)}%` }}
                  className={cn("h-full", 
                    imcVal! < 18.5 ? "bg-blue-400" : 
                    imcVal! < 25 ? "bg-green-400" : 
                    imcVal! < 30 ? "bg-yellow-400" : "bg-red-400"
                  )}
                />
              </div>
            </motion.div>
          )}

          <button
            onClick={handleConsult}
            disabled={isGenerating || !data.weight || !data.height}
            className="w-full py-6 bg-gradient-to-r from-her-accent to-purple-600 text-white text-[11px] uppercase tracking-[0.4em] font-black hover:bg-her-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-3 mt-auto group"
          >
            {isGenerating ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Brain size={16} className="group-hover:rotate-12 transition-transform" />
                Consulta Neural
              </>
            )}
          </button>
        </div>

        {/* Dashboard / Response Area */}
        <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar bg-gradient-to-br from-transparent to-her-accent/5">
          <AnimatePresence mode="wait">
            {advice ? (
              <motion.div
                key="advice"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full space-y-8 pb-20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 bg-her-accent/10 flex items-center justify-center text-her-accent border border-her-accent/20">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h4 className="font-serif italic text-lg leading-none">Diagnostic Intelligence</h4>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-her-muted">Personal Health & Style Report</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleCopy}
                      className="p-5 bg-white/[0.03] hover:bg-white/[0.08] text-her-muted hover:text-white transition-all border border-white/[0.05]"
                      title="Copiar Relatório"
                    >
                      {isCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                    <button 
                      onClick={handleDownload}
                      className="p-5 bg-white/[0.03] hover:bg-white/[0.08] text-her-muted hover:text-white transition-all border border-white/[0.05]"
                      title="Baixar Relatório Texto"
                    >
                      <Download size={14} />
                    </button>
                    <button 
                      onClick={() => generatePDF(advice, `relatorio-premium-${new Date().toLocaleDateString()}.pdf`)}
                      className="p-5 bg-her-accent/10 hover:bg-her-accent/20 text-her-accent transition-all border border-her-accent/20"
                      title="Exportar PDF Premium"
                    >
                      <FileText size={14} />
                    </button>
                    <button 
                      onClick={() => setAdvice('')}
                      className="p-5 bg-white/[0.03] hover:bg-red-500/10 text-her-muted hover:text-red-400 transition-all border border-white/[0.05]"
                      title="Limpar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="bg-white/[0.02] border-b border-white/[0.05] p-6 md:p-12 leading-relaxed text-her-muted markdown-body w-full">
                  <ReactMarkdown>{advice}</ReactMarkdown>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/[0.03] border border-white/[0.05] p-10 flex items-start gap-4">
                    <Activity size={24} className="text-green-400 shrink-0" />
                    <div>
                      <h5 className="text-xs font-medium text-white mb-1">Dica de Saúde</h5>
                      <p className="text-[11px] text-her-muted leading-relaxed">Sua hidratação ideal baseada no seu peso é de aproximadamente {(parseFloat(data.weight) * 0.035).toFixed(1)}L por dia.</p>
                    </div>
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.05] p-10 flex items-start gap-4">
                    <Activity size={24} className="text-blue-400 shrink-0" />
                    <div>
                      <h5 className="text-xs font-medium text-white mb-1">Metabolismo</h5>
                      <p className="text-[11px] text-her-muted leading-relaxed">Taxa metabólica basal estimada: {data.gender === 'masculino' ? (66 + (13.7 * parseFloat(data.weight)) + (5 * parseFloat(data.height)) - (6.8 * parseFloat(data.age))).toFixed(0) : (655 + (9.6 * parseFloat(data.weight)) + (1.8 * parseFloat(data.height)) - (4.7 * parseFloat(data.age))).toFixed(0)} kcal.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                className="h-full flex flex-col items-center justify-center text-center w-full px-6"
              >
                <div className="w-20 h-20 bg-white/5 flex items-center justify-center mb-6">
                  <Info size={40} className="text-her-muted" />
                </div>
                <h4 className="font-serif italic text-2xl mb-3">Bem-estar Integrado</h4>
                <p className="text-sm font-light text-her-muted mb-6 leading-relaxed">
                  Para uma análise personalizada de saúde, vestuário e metabolismo, preencha seus dados ao lado e inicie o processamento neural.
                </p>
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 bg-her-accent animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-her-accent animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-her-accent animate-bounce [animation-delay:0.4s]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
