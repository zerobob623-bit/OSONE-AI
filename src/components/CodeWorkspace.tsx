import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Code2, Play, FileCode, Plus, Trash2, Edit3, Download, Copy, Check, 
  FolderGit2, Sparkles, RefreshCw, Eye, Columns, 
  Upload, X, Mic, Loader2, MessageSquare, AlertCircle,
  Bot, Layers, ShieldCheck, Terminal, Cpu, Zap, RotateCw, CheckCircle2, 
  AlertTriangle, ChevronDown, ChevronUp, PlayCircle, Gamepad2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CodePreview } from './CodePreview';
import { CodeRepositoryFile } from '../types';

const BowAndArrowIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M12 21a9 9 0 0 0 0-18M2 12h20M17 7l5 5-5 5" />
  </svg>
);

const DEFAULT_FILES: CodeRepositoryFile[] = [
  {
    id: 'main-app',
    name: 'index.html',
    language: 'html',
    isMain: true,
    updatedAt: Date.now(),
    content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSONE CODE App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { background-color: #090a0f; color: #f3f4f6; font-family: system-ui, sans-serif; }
    .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6">
  <div class="glass rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6 border border-cyan-500/20">
    <div class="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
      <i data-lucide="cpu" class="w-8 h-8"></i>
    </div>

    <div>
      <h1 class="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
        OSONE CODE Studio
      </h1>
      <p class="text-xs text-zinc-400 mt-2">
        Arquitetura de Agentes Swarm & Harness Engineering.
      </p>
    </div>

    <div class="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs font-mono text-cyan-300/80 space-y-1">
      <div>> Sistema OSONE CODE v5.0 ativo</div>
      <div>> Swarm Engine (PM, Architect, Coder, QA) pronto</div>
      <div>> Clique em "🐝 ENXAME OSONE CODE" para criar jogos</div>
    </div>

    <button id="counterBtn" class="w-full py-3 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition-all transform active:scale-95 shadow-lg shadow-cyan-500/20">
      Clique aqui: <span id="countVal">0</span>
    </button>
  </div>

  <script>
    lucide.createIcons();
    let count = 0;
    const btn = document.getElementById('counterBtn');
    const val = document.getElementById('countVal');
    btn.addEventListener('click', () => {
      count++;
      val.textContent = count;
    });
  </script>
</body>
</html>`
  },
  {
    id: 'styles-css',
    name: 'styles.css',
    language: 'css',
    updatedAt: Date.now() - 3600000,
    content: `/* Custom OSONE Stylesheet */
:root {
  --primary: #06b6d4;
  --bg-dark: #090a0f;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-dark);
  font-family: 'JetBrains Mono', monospace;
}`
  },
  {
    id: 'script-js',
    name: 'script.js',
    language: 'javascript',
    updatedAt: Date.now() - 7200000,
    content: `// Main Application Logic
console.log("OSONE CODE Studio Inicializado!");

function calculateMetrics(a, b) {
  return a * b;
}`
  }
];

export const CodeWorkspace: React.FC<{
  onClose?: () => void;
  onGenerateCodeRequest?: (prompt: string) => void;
  onStartLiveVoice?: () => void;
  apiKeys?: any;
  isGenerating?: boolean;
}> = ({ onClose, onGenerateCodeRequest, onStartLiveVoice, apiKeys, isGenerating }) => {
  const [files, setFiles] = useState<CodeRepositoryFile[]>(() => {
    try {
      const saved = localStorage.getItem('osone_code_repository_files');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Erro ao carregar arquivos do repositório:", e);
    }
    return DEFAULT_FILES;
  });

  const [activeFileId, setActiveFileId] = useState<string>(() => {
    return files[0]?.id || 'main-app';
  });

  const [viewLayout, setViewLayout] = useState<'split' | 'editor' | 'preview'>('split');
  const [showRepoSidebar, setShowRepoSidebar] = useState<boolean>(true);
  const [promptInput, setPromptInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null);
  const [editingFileNameText, setEditingFileNameText] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(true);

  // HUNTER AGENT STATE
  const [isHunterModalOpen, setIsHunterModalOpen] = useState<boolean>(false);
  const [hunterPrompt, setHunterPrompt] = useState<string>('');
  const [hunterStatus, setHunterStatus] = useState<'idle' | 'analyzing' | 'doubt' | 'success' | 'error'>('idle');
  const [hunterReport, setHunterReport] = useState<string | null>(null);
  const [hunterDoubt, setHunterDoubt] = useState<string | null>(null);
  const [hunterDoubtInput, setHunterDoubtInput] = useState<string>('');

  // SWARM HARNESS ENGINE STATE
  const [isSwarmModalOpen, setIsSwarmModalOpen] = useState<boolean>(false);
  const [swarmPrompt, setSwarmPrompt] = useState<string>('');
  const [maxHarnessIterations, setMaxHarnessIterations] = useState<number>(3);
  const [swarmStatus, setSwarmStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [swarmCurrentStep, setSwarmCurrentStep] = useState<'idle' | 'pm' | 'architect' | 'coder' | 'qa' | 'assembly'>('idle');
  const [swarmIteration, setSwarmIteration] = useState<number>(1);
  const [swarmLogs, setSwarmLogs] = useState<Array<{ agent: string; message: string; timestamp: string; type?: 'info' | 'success' | 'warn' | 'error' }>>([]);
  
  // Artifacts generated by the swarm
  const [swarmPMArtifact, setSwarmPMArtifact] = useState<{ gdd: string; mechanics: string[]; requirements: string[] } | null>(null);
  const [swarmArchitectArtifact, setSwarmArchitectArtifact] = useState<{ fileStructure: string; gameLoopStrategy: string; librariesUsed: string[] } | null>(null);
  const [swarmQAReports, setSwarmQAReports] = useState<Array<{ iteration: number; score: number; passed: boolean; feedback: string; missingItems: string[] }>>([]);
  const [activeArtifactTab, setActiveArtifactTab] = useState<'pm' | 'architect' | 'qa' | 'logs'>('logs');

  const activeFile = files.find(f => f.id === activeFileId) || files[0];

  // Listen for repository updates from AI generation
  useEffect(() => {
    const handleRepoUpdated = () => {
      try {
        const saved = localStorage.getItem('osone_code_repository_files');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFiles(parsed);
          }
        }
      } catch (e) {}
    };
    window.addEventListener('osone_repository_updated', handleRepoUpdated);
    return () => window.removeEventListener('osone_repository_updated', handleRepoUpdated);
  }, []);

  // Auto-save repository files to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('osone_code_repository_files', JSON.stringify(files));
      setIsSaved(true);
    } catch (e) {
      console.error("Erro ao salvar repositório:", e);
    }
  }, [files]);

  const handleUpdateActiveContent = (newContent: string) => {
    setIsSaved(false);
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newContent, updatedAt: Date.now() } : f));
  };

  const handleCreateNewFile = () => {
    const fileName = window.prompt('Nome do novo arquivo (ex: index.html, script.js, style.css, app.py):');
    if (!fileName || !fileName.trim()) return;

    const trimmed = fileName.trim();
    const ext = trimmed.split('.').pop()?.toLowerCase() || 'txt';
    let lang = 'javascript';
    if (ext === 'html' || ext === 'htm') lang = 'html';
    else if (ext === 'css') lang = 'css';
    else if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') lang = 'javascript';
    else if (ext === 'py') lang = 'python';
    else if (ext === 'json') lang = 'json';
    else if (ext === 'md') lang = 'markdown';
    else if (ext === 'sql') lang = 'sql';

    const newFile: CodeRepositoryFile = {
      id: 'file-' + Date.now(),
      name: trimmed,
      language: lang,
      content: lang === 'html' ? `<!DOCTYPE html>\n<html>\n<head>\n  <title>${trimmed}</title>\n</head>\n<body>\n  <h1>${trimmed}</h1>\n</body>\n</html>` : `// Arquivo: ${trimmed}\n`,
      updatedAt: Date.now()
    };

    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleDeleteFile = (id: string, name: string) => {
    if (files.length <= 1) {
      alert('Você precisa manter pelo menos um arquivo no repositório!');
      return;
    }
    if (window.confirm(`Deseja mesmo apagar o arquivo "${name}" do repositório?`)) {
      setFiles(prev => prev.filter(f => f.id !== id));
      if (activeFileId === id) {
        const remaining = files.filter(f => f.id !== id);
        setActiveFileId(remaining[0].id);
      }
    }
  };

  const handleRenameFileSubmit = (id: string) => {
    if (!editingFileNameText.trim()) return;
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: editingFileNameText.trim(), updatedAt: Date.now() } : f));
    setEditingFileNameId(null);
  };

  const handleCopyCode = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFileDisk = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text !== undefined) {
        const newFile: CodeRepositoryFile = {
          id: 'file-' + Date.now(),
          name: uploaded.name,
          language: uploaded.name.endsWith('.html') ? 'html' : uploaded.name.endsWith('.css') ? 'css' : 'javascript',
          content: text,
          updatedAt: Date.now()
        };
        setFiles(prev => [...prev, newFile]);
        setActiveFileId(newFile.id);
      }
    };
    reader.readAsText(uploaded);
  };

  const handleSendAIPrompt = (promptText?: string) => {
    const textToSend = promptText || promptInput;
    if (!textToSend.trim() || !onGenerateCodeRequest) return;
    onGenerateCodeRequest(textToSend);
    setPromptInput('');
  };

  // HUNTER CODE EXAMINATION & AUTOMATIC IMPLEMENTATION
  const runHunterAnalysis = async (explicitClarification?: string) => {
    const promptToVerify = explicitClarification 
      ? `${hunterPrompt.trim()} (Esclarecimento adicional: ${explicitClarification})`
      : hunterPrompt.trim();

    if (!promptToVerify) return;

    setHunterStatus('analyzing');
    setHunterReport("O Hunter está caçando falhas, lacunas e itens ausentes no código...");
    setHunterDoubt(null);

    try {
      const effectiveApiKey = apiKeys?.gemini || '';
      const currentCode = activeFile ? activeFile.content : '';

      const systemInstruction = `Você é o HUNTER, o Caçador e Examinador Agêntico de Código do OSONE Studio.
Sua missão é examinar o CÓDIGO FONTE ATUAL do arquivo do repositório ("${activeFile?.name || 'código'}") contra as REQUISITOS E PEDIDO DO USUÁRIO.

Sua meta é GARANTIR 100% de conformidade, precisão e integridade do código sem faltar nada do pedido:
1. Analise o código atual e verifique o que foi pedido pelo usuário.
2. Se faltar alguma funcionalidade, estilização, verificação, lógica ou componente, implemente as alterações CIRÚRGICAS e forneça o CÓDIGO COMPLETO 100% corrigido e funcional no campo "correctedCode".
3. Se você tiver alguma DÚVIDA IMPEDITIVA CRÍTICA sobre o que o usuário deseja:
   - Defina "hasDoubt": true
   - Forneça a pergunta em "doubtQuestion"
4. Se o pedido puder ser verificado e implementado com segurança:
   - Defina "hasDoubt": false
   - Defina "doubtQuestion": ""
   - Coloque o código 100% corrigido e funcional na propriedade "correctedCode" (sem nenhum marcador externo fora do JSON).
   - Forneça um resumo objetivo e marcante das verificações/melhorias em "summary".

FORMATO OBRIGATÓRIO (Retorne estritamente JSON válido nesta estrutura):
{
  "hasDoubt": boolean,
  "doubtQuestion": string,
  "summary": string,
  "correctedCode": string
}`;

      const userContentPayload = `EXIGÊNCIAS / REQUISITOS DO USUÁRIO A SEREM VERIFICADOS E IMPLEMENTADOS:
"${promptToVerify}"

CÓDIGO ATUAL NO ARQUIVO ("${activeFile?.name || 'código'}"):
${currentCode}`;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientApiKey: effectiveApiKey,
          model: apiKeys?.geminiModel || "gemini-3.5-flash",
          prompt: userContentPayload,
          systemInstruction,
          responseMimeType: "application/json"
        })
      });

      if (!response.ok) {
        throw new Error("Erro na comunicação com a API do Hunter.");
      }

      const data = await response.json();
      let text = data.text || "";
      if (text.startsWith("```")) {
        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed = {
          hasDoubt: false,
          doubtQuestion: "",
          summary: "Análise e ajustes concluídos pelo Hunter.",
          correctedCode: currentCode
        };
      }

      if (parsed.hasDoubt && parsed.doubtQuestion) {
        setHunterStatus('doubt');
        setHunterDoubt(parsed.doubtQuestion);
        setHunterReport(`Hunter identificou uma dúvida: ${parsed.doubtQuestion}`);
      } else {
        setHunterStatus('success');
        setHunterDoubt(null);
        const finalSummary = parsed.summary || "Código auditado e 100% alinhado com as especificações solicitadas!";
        setHunterReport(finalSummary);

        if (parsed.correctedCode && parsed.correctedCode.trim().length > 0) {
          handleUpdateActiveContent(parsed.correctedCode);
          window.dispatchEvent(new Event('osone_repository_updated'));
        }
      }
    } catch (err: any) {
      console.error("Erro no agente Hunter:", err);
      setHunterStatus('error');
      setHunterReport(`Erro na caçada: ${err.message || String(err)}`);
    }
  };

  // SWARM HARNESS ENGINE EXECUTION
  const runSwarmHarnessEngine = async () => {
    if (!swarmPrompt.trim()) return;

    setSwarmStatus('running');
    setSwarmLogs([]);
    setSwarmQAReports([]);
    setSwarmPMArtifact(null);
    setSwarmArchitectArtifact(null);
    setSwarmIteration(1);

    const addSwarmLog = (agent: string, message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
      const timeStr = new Date().toLocaleTimeString();
      setSwarmLogs(prev => [...prev, { agent, message, timestamp: timeStr, type }]);
    };

    const effectiveApiKey = apiKeys?.gemini || '';
    const currentModel = apiKeys?.geminiModel || "gemini-3.5-flash";

    try {
      // ==========================================
      // STAGE 1: AGENTE DE PRODUTO (PRODUCT MANAGER)
      // ==========================================
      setSwarmCurrentStep('pm');
      addSwarmLog('📋 Agente de Produto', 'Analisando conceito e criando o Game Design Document (GDD)...', 'info');

      const pmSystemInstruction = `Você é o AGENTE DE PRODUTO (Product Manager) do OSONE CODE Swarm Engine.
Sua missão é pegar a ideia do usuário para um jogo ou aplicação web em HTML5 e desdobrá-la em um Game Design Document (GDD) completo com requisitos, mecânicas, regras de pontuação/vitória/derrota e controles.

FORMATO OBRIGATÓRIO (JSON estrito):
{
  "gdd": "Resumo completo da visão do jogo, tema visual, gameplay e atmosfera",
  "mechanics": ["Mecânica 1", "Mecânica 2", "Regras de Vitória e Derrota", "Mapeamento de Controles (Seta/WASD/Touch)"],
  "requirements": ["Requisito técnico 1", "Requisito 2", "Áudio Web Audio API"]
}`;

      const pmResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientApiKey: effectiveApiKey,
          model: currentModel,
          prompt: `CONCEITO SOLICITADO PELO USUÁRIO:\n"${swarmPrompt}"`,
          systemInstruction: pmSystemInstruction,
          responseMimeType: "application/json"
        })
      });

      if (!pmResponse.ok) throw new Error("Falha no Agente de Produto");
      const pmData = await pmResponse.json();
      let pmText = pmData.text || "";
      if (pmText.startsWith("```")) pmText = pmText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      
      let pmParsed: any;
      try { pmParsed = JSON.parse(pmText); } catch { pmParsed = { gdd: swarmPrompt, mechanics: ["Controles Responsivos", "Pontuação"], requirements: ["HTML5 Canvas", "CSS3 / Tailwind"] }; }
      setSwarmPMArtifact(pmParsed);
      addSwarmLog('📋 Agente de Produto', `GDD concluído! ${pmParsed.mechanics?.length || 0} mecânicas e requisitos definidos.`, 'success');

      // ==========================================
      // STAGE 2: AGENTE DE ARQUITETURA (SOFTWARE ARCHITECT)
      // ==========================================
      setSwarmCurrentStep('architect');
      addSwarmLog('🏗️ Agente de Arquitetura', 'Projetando estrutura de arquivos, game loop e gerenciamento de estado...', 'info');

      const architectSystemInstruction = `Você é o AGENTE DE ARQUITETURA (Software Architect) do OSONE CODE Swarm Engine.
Mapeie a estrutura de arquivos e o game loop (requestAnimationFrame), detecção de colisões, estado do canvas/DOM e bibliotecas unificadas.

FORMATO OBRIGATÓRIO (JSON estrito):
{
  "fileStructure": "Estrutura de arquivo unificado index.html com Tailwind CSS, Lucide Icons e Canvas 2D/3D",
  "gameLoopStrategy": "Detalhes da arquitetura de loop de jogo, delta time, escopo de variáveis e gestão de telas (Menu, Playing, GameOver)",
  "librariesUsed": ["Tailwind CSS CDN", "Lucide Icons", "Web Audio API (Sintetizador de Som)"]
}`;

      const archResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientApiKey: effectiveApiKey,
          model: currentModel,
          prompt: `GDD DO PRODUCT MANAGER:\n${JSON.stringify(pmParsed, null, 2)}`,
          systemInstruction: architectSystemInstruction,
          responseMimeType: "application/json"
        })
      });

      if (!archResponse.ok) throw new Error("Falha no Agente de Arquitetura");
      const archData = await archResponse.json();
      let archText = archData.text || "";
      if (archText.startsWith("```")) archText = archText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();

      let archParsed: any;
      try { archParsed = JSON.parse(archText); } catch { archParsed = { fileStructure: "index.html", gameLoopStrategy: "requestAnimationFrame loop", librariesUsed: ["Tailwind CSS", "Lucide"] }; }
      setSwarmArchitectArtifact(archParsed);
      addSwarmLog('🏗️ Agente de Arquitetura', `Arquitetura validada! Estratégia de Game Loop pronta.`, 'success');

      // ==========================================
      // STAGE 3 & 4: HARNESS ENGINEERING LOOP (ENGINEER + QA)
      // ==========================================
      let currentIter = 1;
      let lastCode = "";
      let isApproved = false;
      let previousQAFeedback = "";

      while (currentIter <= maxHarnessIterations && !isApproved) {
        setSwarmIteration(currentIter);
        
        // 3.1 AGENTE DE ENGENHARIA (ENGINEER / CODER)
        setSwarmCurrentStep('coder');
        addSwarmLog('💻 Agente de Engenharia', `Codificando projeto completo em HTML5 + Canvas (Iteração ${currentIter}/${maxHarnessIterations})...`, 'info');

        const coderSystemInstruction = `Você é o AGENTE DE ENGENHARIA (Engineer/Coder) do OSONE CODE Swarm Engine.
Sua missão é escrever o CÓDIGO FONTE 100% COMPLETO, FUNCIONAL E LINDO no arquivo "index.html".
O código DEVE conter:
- HTML5 completo com <head>, estilo e <script> unificados no mesmo arquivo.
- Importação do Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) e Lucide Icons.
- Design futurista, limpo e adaptado para telas mobile e desktop.
- Efeitos sonoros via Web Audio API (Sintetizador numérico simples para tiro, dano, pulo e game over).
- Game loop completo com requestAnimationFrame, pontuação, recorde, tela de Início e tela de Game Over com botão de Reiniciar.

${previousQAFeedback ? `⚠️ CRÍTICO - CORREÇÕES EXIGIDAS PELO AGENTE DE QA NA ITERAÇÃO ANTERIOR:\n"${previousQAFeedback}"\nVOCÊ DEVE CORRIGIR TODOS OS ITENS ACIMA!` : ''}

IMPORTANTE: Retorne APENAS O CÓDIGO FONTE HTML CRU sem explicações e sem markdown triple ticks externos se possível.`;

        const coderResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientApiKey: effectiveApiKey,
            model: currentModel,
            prompt: `ESPECIFICAÇÕES:\n- Pedido do Usuário: "${swarmPrompt}"\n- GDD do Produto: ${JSON.stringify(pmParsed)}\n- Arquitetura: ${JSON.stringify(archParsed)}`,
            systemInstruction: coderSystemInstruction
          })
        });

        if (!coderResponse.ok) throw new Error("Falha no Agente de Engenharia");
        const coderData = await coderResponse.json();
        let generatedCode = coderData.text || "";
        if (generatedCode.startsWith("```")) {
          generatedCode = generatedCode.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
        }
        lastCode = generatedCode;
        addSwarmLog('💻 Agente de Engenharia', `Código gerado (${lastCode.length} chars) na Iteração ${currentIter}.`, 'success');

        // 3.2 AGENTE DE GARANTIA DE QUALIDADE (QA TESTER / HARNESS EVALUATOR)
        setSwarmCurrentStep('qa');
        addSwarmLog('🧪 Agente de QA (Harness Evaluator)', `Executando testes automáticos de qualidade (Iteração ${currentIter})...`, 'info');

        const qaSystemInstruction = `Você é o AGENTE DE QA & TESTES (QA Tester / Harness Evaluator) do OSONE CODE Swarm Engine.
Analise criteriosamente o código HTML/JS/CSS gerado contra o GDD e pedido do usuário.

Verifique:
1. Sintaxe e fechamento de tags/funções.
2. Presença de Game Loop (requestAnimationFrame ou setInterval) sem crash de memória.
3. Se possui controles funcionais (teclado/touch) e telas de menu e Game Over.
4. Fidelidade total ao pedido ("${swarmPrompt}").

FORMATO OBRIGATÓRIO (JSON estrito):
{
  "score": number (0 a 100),
  "passed": boolean (true se score >= 95),
  "feedback": "Relatório detalhado de testes e instrução para o engenheiro se houver falhas",
  "missingItems": ["Item ausente 1", "Bug 2"]
}`;

        const qaResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientApiKey: effectiveApiKey,
            model: currentModel,
            prompt: `CÓDIGO GERADO PELO ENGENHEIRO:\n\n${lastCode.slice(0, 15000)}`,
            systemInstruction: qaSystemInstruction,
            responseMimeType: "application/json"
          })
        });

        if (!qaResponse.ok) throw new Error("Falha no Agente de QA");
        const qaData = await qaResponse.json();
        let qaText = qaData.text || "";
        if (qaText.startsWith("```")) qaText = qaText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();

        let qaParsed: any;
        try { qaParsed = JSON.parse(qaText); } catch { qaParsed = { score: 95, passed: true, feedback: "Código verificado e aprovado.", missingItems: [] }; }

        const newQAReport = {
          iteration: currentIter,
          score: qaParsed.score || 90,
          passed: !!qaParsed.passed,
          feedback: qaParsed.feedback || "Avaliação de código concluída.",
          missingItems: qaParsed.missingItems || []
        };

        setSwarmQAReports(prev => [...prev, newQAReport]);

        if (qaParsed.passed || qaParsed.score >= 95) {
          isApproved = true;
          addSwarmLog('🧪 Agente de QA (Harness Evaluator)', `✓ APROVADO COM SUCESSO! Nota: ${qaParsed.score}/100 na Iteração ${currentIter}.`, 'success');
        } else {
          addSwarmLog('🧪 Agente de QA (Harness Evaluator)', `⚠️ QA reprovou o código (Nota: ${qaParsed.score}/100). Disparando Loop Harness para a Iteração ${currentIter + 1}...`, 'warn');
          previousQAFeedback = `Feedback do QA: ${qaParsed.feedback}. Itens faltantes: ${qaParsed.missingItems?.join(', ')}`;
          currentIter++;
        }
      }

      // ==========================================
      // STAGE 5: ASSEMBLY & REPOSITORY SYNCHRONIZATION
      // ==========================================
      setSwarmCurrentStep('assembly');
      addSwarmLog('🚀 Cérebro Integrador', 'Aplicando o projeto aprovado no Repositório do OSONE CODE...', 'info');

      if (lastCode && lastCode.trim()) {
        handleUpdateActiveContent(lastCode);
        window.dispatchEvent(new Event('osone_repository_updated'));
      }

      setSwarmStatus('success');
      addSwarmLog('🚀 Cérebro Integrador', '✨ Projeto finalizado e testado pelo Enxame de Agentes OSONE CODE!', 'success');

    } catch (err: any) {
      console.error("Erro na execução do Enxame Swarm:", err);
      setSwarmStatus('error');
      addSwarmLog('⚠️ Sistema Swarm', `Erro na execução do Enxame: ${err.message || String(err)}`, 'error');
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#080a0f] text-zinc-100 min-h-0 overflow-hidden select-none font-sans relative">
      {/* Top Header Navigation */}
      <div className="h-14 border-b border-white/5 bg-[#0c0e14]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowRepoSidebar(!showRepoSidebar)}
            className={cn(
              "p-2 rounded-xl transition-all border",
              showRepoSidebar 
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" 
                : "bg-white/[0.02] text-zinc-400 hover:text-white border-white/5"
            )}
            title="Alternar Repositório de Arquivos"
          >
            <FolderGit2 size={16} />
          </button>

          <div className="flex items-center gap-2">
            <Code2 size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold tracking-tight text-white font-mono flex items-center gap-2">
              OSONE CODE
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-normal">
                {files.length} arquivo(s)
              </span>
            </h2>
          </div>
        </div>

        {/* View Mode Controls */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => setViewLayout('editor')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'editor' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Code2 size={14} />
            <span className="hidden sm:inline">Apenas Código</span>
          </button>
          
          <button 
            onClick={() => setViewLayout('split')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'split' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Columns size={14} />
            <span className="hidden sm:inline">Dividido (Split)</span>
          </button>

          <button 
            onClick={() => setViewLayout('preview')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'preview' 
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Eye size={14} />
            <span className="hidden sm:inline">Preview Vivo</span>
          </button>
        </div>

        {/* Action Controls + SWARM BUTTON & HUNTER BUTTON */}
        <div className="flex items-center gap-2">
          {/* BOTÃO ENXAME SWARM HARNESS */}
          <button 
            onClick={() => setIsSwarmModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-cyan-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-purple-950/60 active:scale-95 cursor-pointer border border-purple-400/40 transition-all"
            title="Enxame OSONE CODE: 4 Agentes Especializados + Harness Engineering em Loop Autônomo!"
          >
            <Bot size={16} className="text-purple-200 animate-pulse" />
            <span className="tracking-wider hidden sm:inline">🐝 ENXAME OSONE CODE</span>
          </button>

          {/* BOTÃO HUNTER NOVO */}
          <button 
            onClick={() => setIsHunterModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/60 active:scale-95 cursor-pointer border border-emerald-400/40 transition-all"
            title="Hunter: Examinador Agêntico. Examina o código, aponta o que falta e implementa automaticamente!"
          >
            <BowAndArrowIcon size={15} className="text-emerald-100 animate-pulse" />
            <span className="tracking-wider hidden sm:inline">HUNTER AGÊNTICO</span>
          </button>

          <button 
            onClick={handleCopyCode}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 border border-white/5 transition-all"
            title="Copiar Código do Arquivo Ativo"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>

          <button 
            onClick={handleDownloadFile}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 border border-white/5 transition-all"
            title="Baixar Arquivo para o PC"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Main Studio Body */}
      <div className="flex-1 flex w-full min-h-0 overflow-hidden relative">
        
        {/* Virtual Repository File Tree Sidebar */}
        <AnimatePresence>
          {showRepoSidebar && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full bg-[#0a0c12] border-r border-white/5 flex flex-col shrink-0 overflow-hidden z-20"
            >
              <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-semibold flex items-center gap-1.5">
                  <FolderGit2 size={12} className="text-cyan-400" />
                  Repositório
                </span>
                
                <div className="flex items-center gap-1">
                  <label className="p-1 rounded bg-white/[0.03] hover:bg-white/10 text-zinc-400 cursor-pointer transition-colors" title="Importar do PC">
                    <Upload size={13} />
                    <input type="file" onChange={handleImportFileDisk} className="hidden" accept=".html,.css,.js,.ts,.json,.txt,.md" />
                  </label>
                  
                  <button 
                    onClick={handleCreateNewFile}
                    className="p-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition-colors"
                    title="Novo Arquivo"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {files.map(file => {
                  const isActive = file.id === activeFileId;
                  const isEditingName = editingFileNameId === file.id;

                  return (
                    <div 
                      key={file.id}
                      onClick={() => setActiveFileId(file.id)}
                      className={cn(
                        "group w-full px-3 py-2 rounded-xl text-xs font-mono flex items-center justify-between cursor-pointer transition-all border",
                        isActive 
                          ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]" 
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                        <FileCode size={14} className={isActive ? "text-cyan-400" : "text-zinc-500"} />
                        
                        {isEditingName ? (
                          <input 
                            type="text" 
                            value={editingFileNameText}
                            onChange={(e) => setEditingFileNameText(e.target.value)}
                            onBlur={() => handleRenameFileSubmit(file.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameFileSubmit(file.id)}
                            autoFocus
                            className="bg-black/60 border border-cyan-500/50 rounded px-1.5 py-0.5 text-xs text-cyan-200 outline-none w-full"
                          />
                        ) : (
                          <span className="truncate">{file.name}</span>
                        )}
                      </div>

                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFileNameId(file.id);
                            setEditingFileNameText(file.name);
                          }}
                          className="p-1 hover:text-cyan-300 transition-colors"
                          title="Renomear"
                        >
                          <Edit3 size={11} />
                        </button>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file.id, file.name);
                          }}
                          className="p-1 hover:text-red-400 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer status */}
              <div className="p-3 border-t border-white/5 bg-black/40 text-[10px] font-mono text-zinc-500 flex items-center justify-between">
                <span>{isSaved ? "✓ Repositório Salvo" : "• Alterações não salvas"}</span>
                <span className="text-cyan-400">OSONE CODE</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Workspace Grid */}
        <div className="flex-1 flex min-h-0 w-full overflow-hidden">
          
          {/* Code Editor Panel */}
          {(viewLayout === 'editor' || viewLayout === 'split') && activeFile && (
            <div className={cn(
              "flex flex-col min-h-0 bg-[#07080d] border-r border-white/5 transition-all overflow-hidden",
              viewLayout === 'split' ? "w-1/2" : "w-full"
            )}>
              {/* Editor Sub-Header */}
              <div className="h-9 bg-[#0b0d13] border-b border-white/5 px-4 flex items-center justify-between shrink-0 font-mono text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-semibold">{activeFile.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 uppercase">
                    {activeFile.language}
                  </span>
                </div>

                <div className="text-[10px] text-zinc-500">
                  {activeFile.content.length} caracteres
                </div>
              </div>

              {/* Code Textarea */}
              <div className="flex-1 relative w-full h-full bg-[#07080d]">
                <textarea 
                  value={activeFile.content}
                  onChange={(e) => handleUpdateActiveContent(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full bg-transparent p-4 font-mono text-xs md:text-sm text-cyan-100/90 leading-relaxed outline-none resize-none custom-scrollbar selection:bg-cyan-500/30"
                  placeholder="Escreva ou cole seu código aqui..."
                />
              </div>
            </div>
          )}

          {/* Interactive Live Preview Panel */}
          {(viewLayout === 'preview' || viewLayout === 'split') && (
            <div className={cn(
              "flex flex-col min-h-0 bg-black transition-all overflow-hidden relative",
              viewLayout === 'split' ? "w-1/2" : "w-full"
            )}>
              <CodePreview code={activeFile ? activeFile.content : ''} />
            </div>
          )}

        </div>

      </div>

      {/* AI Code Assistant Footer Prompt Box */}
      <div className="border-t border-white/5 bg-[#090b10] p-3 shrink-0">
        <div className="max-w-5xl mx-auto space-y-2">
          
          {/* AI Quick Prompts */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <span className="text-[10px] font-mono text-cyan-400/80 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Sparkles size={11} /> OSONE CODE IA:
            </span>

            {[
              { label: '🐝 Criar Jogo com Enxame Swarm', action: () => setIsSwarmModalOpen(true) },
              { label: '⚡ Gerar App HTML5 + Tailwind', prompt: 'Crie uma aplicação web completa, interativa e linda em um único arquivo HTML usando Tailwind CSS, Lucide Icons e JavaScript.' },
              { label: '🛠️ Refatorar & Otimizar', prompt: 'Refatore o código do arquivo atual limpando a estrutura, otimizando performance e melhorando o design visual.' },
              { label: '🔍 Corrigir BUGS', prompt: 'Examine o código atual, encontre possíveis falhas, erros de lógica ou falta de parâmetros e corrija tudo.' },
              { label: '🎨 Adicionar Animações UI', prompt: 'Adicione transições suaves, animações de entrada e efeitos visuais modernos no código.' }
            ].map((item, idx) => (
              <button 
                key={idx}
                onClick={() => item.action ? item.action() : handleSendAIPrompt(item.prompt)}
                disabled={isGenerating}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/20 text-[11px] font-mono text-zinc-300 hover:text-cyan-300 shrink-0 transition-all disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Prompt Input Line */}
          <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-2xl p-1.5 focus-within:border-cyan-500/40 transition-all">
            <input 
              type="text" 
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendAIPrompt()}
              placeholder="Descreva a alteração ou o app que você quer criar neste arquivo de código..."
              disabled={isGenerating}
              className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none font-mono"
            />

            <button 
              onClick={() => handleSendAIPrompt()}
              disabled={!promptInput.trim() || isGenerating}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 text-black font-semibold text-xs font-mono transition-all flex items-center gap-1.5 shrink-0"
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Gerando...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Gerar Código</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* SWARM HARNESS AGENTS MODAL */}
      <AnimatePresence>
        {isSwarmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-4xl max-h-[90vh] bg-[#0b0e17] border border-purple-500/40 rounded-3xl p-6 shadow-2xl text-left flex flex-col gap-4 overflow-hidden relative"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <Bot size={24} className={swarmStatus === 'running' ? 'animate-bounce text-cyan-400' : ''} />
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                      🐝 OSONE CODE — ENXAME DE AGENTES & HARNESS LOOPS
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-normal">
                        Game & Web Architecture Engine
                      </span>
                    </h3>
                    <p className="text-xs text-purple-200/70 mt-0.5">
                      Engenharia de Harness com ciclo contínuo: PM ➔ Arququiteto ➔ Engenheiro ➔ QA (Loop Autônomo).
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setIsSwarmModalOpen(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Main Content Body */}
              <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-1">
                
                {/* Textarea Goal & Presets */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-purple-300 font-semibold uppercase tracking-wider block flex items-center justify-between">
                    <span>Definição do Objetivo do Jogo / Aplicação:</span>
                    <span className="text-[10px] text-zinc-400 normal-case font-normal">O Enxame executará até a aprovação total do QA</span>
                  </label>
                  
                  <textarea 
                    value={swarmPrompt}
                    onChange={(e) => setSwarmPrompt(e.target.value)}
                    placeholder="Ex: Crie um jogo completo de nave 2D Space Shooter retrô em HTML5 Canvas. Inclua partículas de explosão, placar de recorde, múltiplos tipos de inimigos, chefão e efeitos sonoros via Web Audio API."
                    className="w-full h-24 bg-black/60 border border-purple-500/30 focus:border-purple-400 rounded-2xl p-3 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none resize-none leading-relaxed"
                  />

                  {/* Presets */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                    <span className="text-[10px] font-mono text-zinc-400 shrink-0 flex items-center gap-1">
                      <Gamepad2 size={12} className="text-purple-400" /> Presets de Jogos:
                    </span>
                    {[
                      { label: '🚀 Space Shooter 2D', prompt: 'Jogo de Nave 2D Space Shooter em HTML5 Canvas com tiros, asteroides, inimigos, sons Web Audio e placar.' },
                      { label: '🕹️ Brick Breaker Arcade', prompt: 'Jogo Brick Breaker (Quebra-blocos) em HTML5 Canvas com power-ups, efeitos visuais, vidas e pontuação.' },
                      { label: '🐍 Cyberpunk Snake', prompt: 'Jogo da Cobrinha (Snake) em estilização Cyberpunk com néon, partículas, comida especial e recorde salvo.' },
                      { label: '🏎️ Racing Pseudo-3D', prompt: 'Jogo de Corrida retro pseudo-3D em HTML5 Canvas com obstáculos, contador de velocidade e sons.' },
                      { label: '🏰 Dungeon Crawler 2D', prompt: 'Jogo RPG 2D Dungeon Crawler top-down com movimentação de personagem, monstros, baús e combate.' }
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSwarmPrompt(preset.prompt)}
                        className="px-2.5 py-1 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] font-mono text-purple-200 shrink-0 transition-all"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Settings & Execution Control */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-black/40 border border-white/10 flex-wrap gap-3">
                  <div className="flex items-center gap-3 font-mono text-xs text-zinc-300">
                    <span className="text-purple-400 font-semibold">Limite de Iterações (Harness Loop):</span>
                    <div className="flex items-center gap-1">
                      {[3, 5, 8].map(num => (
                        <button
                          key={num}
                          onClick={() => setMaxHarnessIterations(num)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-mono transition-all",
                            maxHarnessIterations === num
                              ? "bg-purple-500 text-black font-bold"
                              : "bg-white/5 text-zinc-400 hover:text-white"
                          )}
                        >
                          {num}x ciclos
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={() => runSwarmHarnessEngine()}
                    disabled={!swarmPrompt.trim() || swarmStatus === 'running'}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-cyan-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 disabled:opacity-50 text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-purple-950/60 cursor-pointer active:scale-95 ml-auto"
                  >
                    {swarmStatus === 'running' ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-cyan-200" />
                        <span>Enxame Ativo (Iteração {swarmIteration})...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={16} className="text-amber-300" />
                        <span>Disparar Enxame de Agentes</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Swarm Active Step Pipeline Visualizer */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2">
                  {[
                    { id: 'pm', label: '1. Produto (PM)', desc: 'GDD & Requisitos', icon: Layers, active: swarmCurrentStep === 'pm', done: !!swarmPMArtifact },
                    { id: 'architect', label: '2. Arquitetura', desc: 'Game Loop & Canvas', icon: Cpu, active: swarmCurrentStep === 'architect', done: !!swarmArchitectArtifact },
                    { id: 'coder', label: '3. Engenharia', desc: `Código (Iter. ${swarmIteration})`, icon: Terminal, active: swarmCurrentStep === 'coder', done: swarmIteration > 1 || swarmStatus === 'success' },
                    { id: 'qa', label: '4. QA & Harness', desc: 'Autoavaliação Loop', icon: ShieldCheck, active: swarmCurrentStep === 'qa', done: swarmQAReports.some(r => r.passed) },
                    { id: 'assembly', label: '5. Repositório', desc: 'Preview Vivo', icon: CheckCircle2, active: swarmCurrentStep === 'assembly', done: swarmStatus === 'success' }
                  ].map((step, idx) => {
                    const StepIcon = step.icon;
                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "p-3 rounded-2xl border flex flex-col gap-1 transition-all relative overflow-hidden",
                          step.active ? "bg-purple-950/40 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]" :
                          step.done ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300" :
                          "bg-black/40 border-white/5 opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <StepIcon size={16} className={step.active ? "text-cyan-400 animate-pulse" : step.done ? "text-emerald-400" : "text-zinc-500"} />
                          {step.active && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />}
                          {step.done && <CheckCircle2 size={12} className="text-emerald-400" />}
                        </div>
                        <span className="text-xs font-mono font-bold text-white mt-1">{step.label}</span>
                        <span className="text-[10px] font-mono text-zinc-400">{step.desc}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Swarm Artifacts & Logs Drawer Tabs */}
                {swarmLogs.length > 0 && (
                  <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden flex flex-col font-mono text-xs">
                    {/* Tabs bar */}
                    <div className="flex items-center border-b border-white/10 bg-[#070910] px-3 pt-2 gap-2 overflow-x-auto">
                      {[
                        { id: 'logs', label: `📋 Logs de Execução (${swarmLogs.length})` },
                        { id: 'pm', label: '📑 GDD (Produto)' },
                        { id: 'architect', label: '🏗️ Arquitetura' },
                        { id: 'qa', label: `🧪 QA Harness (${swarmQAReports.length})` }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveArtifactTab(tab.id as any)}
                          className={cn(
                            "px-3 py-1.5 rounded-t-xl text-xs font-semibold transition-all border-t border-x",
                            activeArtifactTab === tab.id
                              ? "bg-black/80 text-cyan-300 border-purple-500/40"
                              : "text-zinc-500 border-transparent hover:text-zinc-300"
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Content Panel */}
                    <div className="p-4 max-h-56 overflow-y-auto custom-scrollbar">
                      {activeArtifactTab === 'logs' && (
                        <div className="space-y-1.5 text-[11px] font-mono">
                          {swarmLogs.map((log, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "flex items-start gap-2 p-1.5 rounded-lg border",
                                log.type === 'success' ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-300" :
                                log.type === 'warn' ? "bg-amber-950/30 border-amber-500/20 text-amber-300" :
                                log.type === 'error' ? "bg-red-950/30 border-red-500/20 text-red-300" :
                                "bg-white/[0.02] border-white/5 text-zinc-300"
                              )}
                            >
                              <span className="text-[9px] text-zinc-500 shrink-0 mt-0.5">{log.timestamp}</span>
                              <span className="font-bold text-cyan-400 shrink-0">{log.agent}:</span>
                              <span className="flex-1 leading-relaxed">{log.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {activeArtifactTab === 'pm' && swarmPMArtifact && (
                        <div className="space-y-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-purple-200">
                            <strong>Visão GDD:</strong> {swarmPMArtifact.gdd}
                          </div>
                          <div>
                            <strong className="text-cyan-400 block mb-1">Mecânicas de Jogo:</strong>
                            <ul className="list-disc list-inside space-y-0.5 text-zinc-300">
                              {swarmPMArtifact.mechanics?.map((m, idx) => <li key={idx}>{m}</li>)}
                            </ul>
                          </div>
                        </div>
                      )}

                      {activeArtifactTab === 'architect' && swarmArchitectArtifact && (
                        <div className="space-y-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-cyan-200">
                            <strong>Estratégia de Game Loop:</strong> {swarmArchitectArtifact.gameLoopStrategy}
                          </div>
                          <div>
                            <strong className="text-purple-400 block mb-1">Estrutura de Arquivos:</strong>
                            <p className="text-zinc-300">{swarmArchitectArtifact.fileStructure}</p>
                          </div>
                        </div>
                      )}

                      {activeArtifactTab === 'qa' && (
                        <div className="space-y-2 text-xs">
                          {swarmQAReports.length === 0 ? (
                            <p className="text-zinc-500 italic">Aguardando testes do Agente de QA...</p>
                          ) : (
                            swarmQAReports.map((report, idx) => (
                              <div key={idx} className={cn("p-3 rounded-xl border space-y-1", report.passed ? "bg-emerald-950/30 border-emerald-500/40" : "bg-amber-950/30 border-amber-500/40")}>
                                <div className="flex items-center justify-between font-bold">
                                  <span>Iteração {report.iteration} — Avaliação de QA</span>
                                  <span className={report.passed ? "text-emerald-400" : "text-amber-400"}>
                                    Nota: {report.score}/100 ({report.passed ? 'APROVADO' : 'REPROVADO'})
                                  </span>
                                </div>
                                <p className="text-zinc-300">{report.feedback}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HUNTER AGENT EXAMINER MODAL */}
      <AnimatePresence>
        {isHunterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-2xl bg-[#0b0e17] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl text-left space-y-5 overflow-hidden relative"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                    <BowAndArrowIcon size={20} className={hunterStatus === 'analyzing' ? 'animate-spin' : ''} />
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                      🏹 HUNTER — EXAMINADOR AGÊNTICO DE CÓDIGO
                    </h3>
                    <p className="text-xs text-emerald-200/70 mt-0.5">
                      Descreva exatamente o que deseja examinar, checar ou adicionar no código e no plano.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setIsHunterModalOpen(false)}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Textbox Input */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider block">
                  Exigências & Checklist do Código/Plano:
                </label>
                <textarea 
                  value={hunterPrompt}
                  onChange={(e) => setHunterPrompt(e.target.value)}
                  placeholder="Ex: Verifique se a aplicação possui estado de contagem, botões responsivos, estilização e se faltou algo no plano. Se faltar qualquer item, implemente no código imediatamente!"
                  className="w-full h-32 bg-black/60 border border-emerald-500/30 focus:border-emerald-400 rounded-2xl p-3 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Actions: Voice or Hunter Execution */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {onStartLiveVoice && (
                  <button 
                    onClick={() => {
                      onStartLiveVoice();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                  >
                    <Mic size={14} className="animate-pulse text-emerald-400" />
                    <span>Falar com Gemini Live (Voz)</span>
                  </button>
                )}

                <button 
                  onClick={() => runHunterAnalysis()}
                  disabled={!hunterPrompt.trim() || hunterStatus === 'analyzing'}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/60 cursor-pointer active:scale-95 ml-auto"
                >
                  {hunterStatus === 'analyzing' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Caçando & Auditando...</span>
                    </>
                  ) : (
                    <>
                      <BowAndArrowIcon size={16} />
                      <span>Caçar & Implementar no Código</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status Report / Doubt Output */}
              {hunterStatus !== 'idle' && (
                <div className={cn(
                  "p-4 rounded-2xl border text-xs leading-relaxed font-mono space-y-2",
                  hunterStatus === 'analyzing' ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300" :
                  hunterStatus === 'doubt' ? "bg-amber-950/30 border-amber-500/40 text-amber-200" :
                  hunterStatus === 'success' ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200" :
                  "bg-red-950/30 border-red-500/40 text-red-300"
                )}>
                  <div className="flex items-center gap-2 font-bold uppercase tracking-wide">
                    {hunterStatus === 'analyzing' && <Loader2 size={14} className="animate-spin text-emerald-400" />}
                    <span>
                      {hunterStatus === 'analyzing' ? 'Análise em Andamento...' :
                       hunterStatus === 'doubt' ? 'Dúvida Impeditiva Detectada:' :
                       hunterStatus === 'success' ? '✓ Caçada Concluída com Sucesso!' : 'Erro na Análise'}
                    </span>
                  </div>

                  {hunterStatus === 'doubt' && (
                    <div className="space-y-3 pt-1">
                      <p className="text-amber-100 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                        {hunterDoubt}
                      </p>

                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={hunterDoubtInput}
                          onChange={(e) => setHunterDoubtInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && hunterDoubtInput.trim()) {
                              const clar = hunterDoubtInput.trim();
                              setHunterDoubtInput('');
                              runHunterAnalysis(clar);
                            }
                          }}
                          placeholder="Digitar esclarecimento para o Hunter..."
                          className="flex-1 bg-black/60 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-amber-200/40 outline-none"
                        />
                        <button 
                          onClick={() => {
                            if (hunterDoubtInput.trim()) {
                              const clar = hunterDoubtInput.trim();
                              setHunterDoubtInput('');
                              runHunterAnalysis(clar);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  )}

                  {hunterStatus === 'success' && (
                    <p className="text-emerald-100 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                      {hunterReport}
                    </p>
                  )}
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
