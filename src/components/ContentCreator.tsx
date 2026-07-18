import React, { useState } from 'react';
import { 
  Video, Sparkles, Send, Play, Copy, Check, Info, FileText, Share2, CornerDownRight, 
  Trash2, AlertCircle, RefreshCw, Volume2, Bookmark, HelpCircle, BookOpen, Upload,
  Zap, Brain
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ApiKeys } from '../types';

interface ContentCreatorProps {
  apiKeys: ApiKeys;
  addNotification: (msg: string, type: 'success' | 'error' | 'info') => void;
  onSaveToVirtualWorkspace?: (filename: string, content: string) => void;
}

interface IdeaIdea {
  id: number;
  title: string;
  hook: string;
  viralPotential: 'Extremo' | 'Altíssimo' | 'Alto';
  description: string;
  reason: string;
}

interface BrainAreaImpact {
  area: string;
  targetExplanation: string;
}

interface ScientificApproachImpact {
  name: string;
  whyChosen: string;
  applicationInScript: string;
}

interface CreativeEngineOutput {
  allNineIdeas: IdeaIdea[];
  topThreeChosen: {
    id: number;
    title: string;
    description: string;
    whyTop3: string;
  }[];
  bestIdea: {
    title: string;
    justification: string;
    storytelling: {
      hook: string; // Gancho visual traumático e impactante
      conflict: string; // Conflito aflitivo que gera emoção e sentimento angustiante
      conclusion: string; // Conclusão com consequência inesperada com gatilho de humor ou surpresa
    };
    script: {
      scene: string;
      narration: string;
    }[];
  };
  neuroAnalysis?: {
    selectedApproaches: ScientificApproachImpact[];
    brainAreas: BrainAreaImpact[];
    neurotransmitters: string[];
    languageStructureType: string;
    cognitivePreWritingReflexion: string;
  };
}

export const SCIENTIFIC_APPROACHES = [
  { id: 'cla', name: 'Análise de Camadas Causais (CLA)', desc: 'Desmistifica passado e presente para futuros alternativos.' },
  { id: 'scenarios', name: 'Planejamento de Cenários', desc: 'Cria mundos paralelos e futuros plausíveis.' },
  { id: 'least_action', name: 'Princípio da Menor Ação', desc: 'Encontra a trajetória biológica e física mais eficiente.' },
  { id: 'snell_descartes', name: 'Lei de Snell-Descartes', desc: 'Otimiza transição de frentes de onda e meios de esforço.' },
  { id: 'quantum_cognition', name: 'Cognição Quântica', desc: 'Aborda estados de superposição pré e pós decisão.' },
  { id: 'behavioral_econ', name: 'Economia Comportamental', desc: 'Mapeia aversão à perda e assimetria de ganhos.' },
  { id: 'nudging', name: 'Arquitetura de Escolha & Nudging', desc: 'Desenha estímulos suaves que guiam decisões sem limitar liberdade.' },
  { id: 'fogg', name: 'Modelo de Comportamento de Fogg', desc: 'Aperfeiçoa hábitos com B = MAP (Motivação, Velocidade, Gatilho).' },
  { id: 'sct', name: 'Teoria Cognitiva Social (SCT)', desc: 'Analisa autoeficácia, ambiente e retroreforços.' },
  { id: 'backcasting', name: 'Backcasting', desc: 'Trabalha do futuro ideal de volta para o presente.' },
  { id: 'delphi', name: 'Método Delphi', desc: 'Consulta iterativa a tendências especialistas.' },
  { id: 'morphological', name: 'Análise Morfológica', desc: 'Mapeia todas as possíveis permutações e combinações de problemas.' },
  { id: 'futures_wheel', name: 'Roda do Futuro (Futures Wheel)', desc: 'Identifica desdobramentos secundários e terciários de escolhas.' },
  { id: 'cross_impact', name: 'Análise de Impacto Cruzado', desc: 'Interdependência probabilística de eventos futuros.' },
  { id: 'look_heuristic', name: 'Heurística do Olhar', desc: 'Processamento imediato com variáveis físicas mantidas equilibradas.' },
  { id: 'wild_cards', name: 'Monitoramento de Wild Cards', desc: 'Varredura de choques térmicos inesperados de alto impacto.' },
  { id: 'chaos_theory', name: 'Teoria do Caos & Efeito Borboleta', desc: 'Como o bater de asas altera o destino final de longo prazo.' },
  { id: 'behavioral_entropy', name: 'Entropia Comportamental', desc: 'Mapeia e governa a imprevisibilidade sobre as decisões.' },
  { id: 'operant_conditioning', name: 'Condicionamento Operante', desc: 'Reforços comportamentais baseados em recompensa e estresse.' },
  { id: 'abm', name: 'Modelagem Baseada em Agentes (ABM)', desc: 'Simula dinâmicas de comportamento cooperativo em massa.' }
];

export function ContentCreator({ apiKeys, addNotification, onSaveToVirtualWorkspace }: ContentCreatorProps) {
  // Inputs
  const [channelTema, setChannelTema] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [workedIdeas, setWorkedIdeas] = useState('');
  const [customStyle, setCustomStyle] = useState('Alucinante / Ultra Emocionante');
  const [selectedApproaches, setSelectedApproaches] = useState<string[]>([]);
  const [cognitiveGoal, setCognitiveGoal] = useState('Curiosidade Extrema (Gatilho Dopamina)');

  // Knowledge Base RAG states
  const [knowledgeBaseText, setKnowledgeBaseText] = useState('');
  const [strictKnowledgeBase, setStrictKnowledgeBase] = useState(false);
  const [kbFileName, setKbFileName] = useState('');

  // Loading and steps
  const [loadingStep, setLoadingStep] = useState<number>(0); // 0 = idle, 1 = brainstorming 9, 2 = distilling 3, 3 = finalizing best
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Result state
  const [output, setOutput] = useState<CreativeEngineOutput | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  
  // Image prompts state
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [imagePrompts, setImagePrompts] = useState<{
    scenes: {
      sceneNumber: number;
      suggestedVisual: string;
      midjourneyPrompt: string;
      mood: string;
      lighting: string;
    }[]
  } | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copiedPromptIdx, setCopiedPromptIdx] = useState<number | null>(null);
  
  // Tab within final output
  const [activeResultTab, setActiveResultTab] = useState<'brainstorm' | 'comparison' | 'master_script' | 'neuro_science'>('master_script');

  const cleanInputs = () => {
    setChannelTema('');
    setTargetAudience('');
    setWorkedIdeas('');
    setKnowledgeBaseText('');
    setStrictKnowledgeBase(false);
    setKbFileName('');
    setOutput(null);
    setImagePrompts(null);
    setGenerationError(null);
    setPromptError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setKbFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setKnowledgeBaseText(content);
        addNotification(`Base de conhecimento carregada com sucesso: ${file.name}`, 'success');
      }
    };
    reader.onerror = () => {
      addNotification(`Erro ao ler o arquivo. Prefira formatos de texto (.txt, .md, .json).`, 'error');
    };
    reader.readAsText(file);
  };

  const loadExample = () => {
    setChannelTema('Curiosidades obscuras, segredos históricos e simulações inquietantes do destino.');
    setTargetAudience('Jovens de 16 a 28 anos, viciados em dopamina rápida no TikTok e Reels, obcecados por mistérios reais e dilemas morais de ficção científica.');
    setWorkedIdeas('- "O dilema da inteligência que descobriu que o mundo é um pixel"\n- "A história do homem que ficou preso em 1993 após pisar num ralo de chuva"\n- "O que acontece se você acordar no meio do oceano dentro de uma bolha flutuante indestrutível"');
    setCustomStyle('Agonizante, suspense cinematográfico com picos de ironia ácida');
    setKnowledgeBaseText(`[ESTRUTURA DE SUCESSO COGNITIVO - CASOS REAIS DE 1M+ VIEWS]:
- Gancho (Seg 0-3): Faça uma pergunta ultra impactante baseada em "Você sabia que existe um objeto que..."
- Ritmo das frases: Intercale períodos muito curtos com pontuações bem marcadas.
- Conclusão: Sempre termine com uma lição cínica ou humor ácido que provoca o usuário a debater na seção de comentários (ex: "E você, continuaria dormindo sabendo disso?").`);
    setStrictKnowledgeBase(true);
    setKbFileName('modelo_canal_paranormal.txt');
    addNotification('Exemplo de referência com Base de Conhecimento configurado!', 'info');
  };

  const handleGenerate = async () => {
    if (!channelTema.trim()) {
      addNotification('Por favor, informe pelo menos o Tema/Nicho do seu canal.', 'error');
      return;
    }

    const effectiveKey = apiKeys.gemini || '';
    if (!effectiveKey) {
      addNotification('API Key do Gemini não encontrada! Configure nas Configurações (ícone de engrenagem) no topo.', 'error');
      setGenerationError('Gemini API Key ausente de suas configurações. Vá em "Ajustes" para inserir para um processamento local neural robusto.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setOutput(null);
    
    // Smooth step transition simulation
    setLoadingStep(1);
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    try {
      await delay(1500);
      setLoadingStep(2);
      await delay(1500);
      setLoadingStep(3);

      let kbPrompt = '';
      if (knowledgeBaseText.trim()) {
        if (strictKnowledgeBase) {
          kbPrompt = `
=== REGRA PRIORITÁRIA DE BASE DE CONHECIMENTO (ESTRITO) ===
O usuário forneceu abaixo uma Base de Conhecimento com regras de instrução de roteiro que já deram muito certo.
Como o recurso de SEGURANÇA E ADERÊNCIA ESTRITA À BASE DE CONHECIMENTO ESTÁ ATIVO, você DEVE basear-se UNICA, EXCLUSIVAMENTE E ESTRITAMENTE nas regras, padrões estruturais, ganchos e restrições descritas na base de conhecimento fornecida abaixo. Desconsidere sugestões ou tendências genéricas externas que fujam a este escopo. Sua missão é garantir que o roteiro gerado siga o que já deu certo ipsis litteris:

[BASE DE CONHECIMENTO OFICIAL DE SUCESSO]:
"${knowledgeBaseText}"
`;
        } else {
          kbPrompt = `
=== BASE DE CONHECIMENTO ADICIONAL (GUIA DE REFERÊNCIA) ===
Considere as diretrizes, ideias e exemplos contidos nesta Base de Conhecimento fornecida pelo usuário como inspiração e estruturação complementar de alta qualidade para desenhar seus ganchos, histórias e dinâmicas:

[BASE DE CONHECIMENTO FORNECIDA]:
"${knowledgeBaseText}"
`;
        }
      }

      const approachedPrompt = selectedApproaches.length > 0 
        ? `Use obrigatoriamente as seguintes abordagens científicas/futuristas escolhidas pelo usuário para pautar o roteiro: [${selectedApproaches.map(id => SCIENTIFIC_APPROACHES.find(a => a.id === id)?.name).join(', ')}].`
        : `Você (OSONE) deve escolher ativamente entre 3 e 5 destas abordagens científicas/futuristas para modelar o roteiro e o embasamento cognitivo do usuário: Análise de Camadas Causais (CLA), Planejamento de Cenários, Princípio da Menor Ação, Lei de Snell-Descartes, Cognição Quântica, Economia Comportamental, Arquitetura de Escolha & Nudging, Modelo de Comportamento de Fogg, Teoria Cognitiva Social (SCT), Backcasting, Método Delphi, Análise Morfológica, Roda do Futuro, Análise de Impacto Cruzado, Heurística do Olhar, Monitoramento de Wild Cards, Teoria do Caos, Entropia Comportamental, Condicionamento Operante, Modelagem Baseada em Agentes.`;

      const prompt = `
Você é o OSONE Neural Short-Form Scriptwriter, especialista em neurocomunicação, storytelling educativo e hiper-viralização no TikTok, Reels, YouTube Shorts e Kwai.
Sua missão especial é criar roteiros e textos baseados em neurociência que não apenas informem, mas que "assinem" o cérebro do espectador através de gatilhos neuroquímicos e ativação de áreas cerebrais específicas.

Siga obrigatoriamente este protocolo que prioriza o processamento cognitivo antes da redação:
"osone, quando você for criar um roteiro, antes de escrever, pense sobre as áreas cerebrais que precisam ser acessadas. Só depois de analisar a neurociência envolvida no aprendizado daquele tema, você irá escrever o roteiro de acordo, garantindo que as palavras escolhidas sejam 'bússolas' que guiam o cérebro para o estado de fluxo e compreensão máxima."

Informações base enviadas pelo usuário:
- Tema/Nicho do Canal: "${channelTema}"
- Público Alvo: "${targetAudience || 'Geral apaixonado por Shorts'}"
- Ideias de Referência/Êxito: "${workedIdeas || 'Nenhum exemplo fornecido'}"
- Estilo e Tom desejados: "${customStyle}"
- Meta / Objetivo Cognitivo do Usuário: "${cognitiveGoal}"

=== DIRETRIZES DE NEUROCOMUNICAÇÃO ===
1. A Primazia do Sentir: O cérebro humano sente antes de pensar. Emoções organizam sensações em padrões de resposta. Seu roteiro deve primeiro evocar uma sensação impactante para depois entregar a lógica.
2. O Combustível da Dopamina: Desperte curiosidade, surpresa ou desafio para liberar dopamina, facilitando a retenção.
3. Storytelling e Acoplamento Neural: Ative o córtex motor, sensorial e frontal através de histórias que o espectador transforme em sua própria experiência.
4. Processamento Visual e "Bottom-up": Ajude pensadores visuais traduzindo palavras em "filmes coloridos" na mente (detalhes marcantes antes do reflexo conceitual).

=== SELEÇÃO DE ABORDAGENS CIENTÍFICAS DA FÍSICA E SOCIEDADE ===
${approachedPrompt}

=== FLUXO COGNITIVO EXIGIDO ===
1. Você deve raciocinar sobre exatamente 9 ideias virais em potencial que se alinham perfeitamente ao nicho do canal e ao gosto do público.
2. Filtre e extraia as 3 melhores ideias dessas 9. Descreva o porquê destas 3 serem excepcionais.
3. Compare as 3 ideias mais fortes e tome a decisão cirúrgica de qual é a MELHOR (A Vencedora) com potencial absoluto de viralizar, justificando as taxas prováveis de retenção.
4. Mapeie a resposta com base em termos neurocientíficos e preencha a estrutura de "neuroAnalysis" no JSON.
5. Estruture o roteiro storytelling da vencedora nas 3 etapas de estresse de retenção:
   - Gancho visual traumático e impactante: (Cena de abertura chocante que impede o scroll nos primeiros 3 segundos).
   - Conflito aflitivo de alto impacto: (O miolo da história, onde o perigo, dilema moral angustiante ou curiosidade desconcertante atinge o pico).
   - Conclusão inesperada com gatilho de humor ou surpresa: (O desfecho, que quebra a expectativa com sarcasmo, ironia, humor ácido ou choque total, garantindo comentários infinitos).
6. Forneça o roteiro de fala em sequência para vídeos rápidos de até 1 minuto. O roteiro de falas deve conter cenas sugeridas de fundo e as falas exatas de forma fluída e veloz.

RESPONDA APENAS no formato de um objeto corporativo JSON sem marcações externas desnecessárias além de JSON válido, para que meu front-end possa estruturar os cards de transição.
O schema JSON deve ser rigorosamente o seguinte:
{
  "allNineIdeas": [
    {
      "id": 1,
      "title": "Título Curto da Ideia 1",
      "hook": "Gancho de entrada resumido",
      "viralPotential": "Extremo" | "Altíssimo" | "Alto",
      "description": "Uma frase explicando o conceito",
      "reason": "Por que viraliza?"
    },
    ... (continue até 9)
  ],
  "topThreeChosen": [
    {
      "id": 1,
      "title": "Título da Ideia",
      "description": "Conceito resumido",
      "whyTop3": "Razão cognitiva por que foi escolhida pras top 3"
    }
  ],
  "bestIdea": {
    "title": "Título da Ideia Vencedora",
    "justification": "Por que esta é a campeã incontestável com base das referências de sucesso fornecidas",
    "storytelling": {
      "hook": "Descreva o Gancho visual traumático e impactante",
      "conflict": "Descreva o Conflito aflitivo e angustiante com riqueza de sentimento",
      "conclusion": "Descreva a Conclusão inesperada com gatilho de surpresa ou humor"
    },
    "script": [
      {
        "scene": "Descrição visual rápida para a tela (ex: Vídeo macro de formigas de ferro ou simulação 3D)",
        "narration": "Texto exato a ser falado pelo locutor (rápido, magnético, sem enrolação)."
      }
    ]
  },
  "neuroAnalysis": {
    "selectedApproaches": [
      {
        "name": "Nome de uma das 20 Abordagens Científicas/Futuristas aplicadas",
        "whyChosen": "Por que essa teoria clássica ou física se alinha perfeitamente ao objetivo do usuário?",
        "applicationInScript": "Como essa teoria moldou diretamente o andamento do roteiro?"
      }
    ],
    "brainAreas": [
      {
        "area": "Córtex Pré-Frontal" | "Sistema Límbico (Amígdala)" | "Área de Wernicke" | "Área de Broca" | "Giro Fusiforme",
        "targetExplanation": "Como o roteiro ou as palavras escolhidas pretendem estimular esta região encefálica?"
      }
    ],
    "neurotransmitters": ["Ex: Dopamina, Ocitocina, Serotonina"],
    "languageStructureType": "Pensamento convergente ou divergente",
    "cognitivePreWritingReflexion": "Sua reflexão profunda pré-redação. Analise a neurociência envolvida no aprendizado desse tema antes de expor o roteiro de acordo, garantindo que as palavras escolhidas sejam 'bússolas' que guiam o cérebro para o estado de fluxo e compreensão máxima."
  }
}
`;

      const response = await fetch('/api/gemini/generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientApiKey: effectiveKey,
          model: apiKeys.geminiModel || 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          responseMimeType: 'application/json'
        })
      });

      if (!response.ok) {
        throw new Error(`Falha no processador neural OSONE: status ${response.status}`);
      }

      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!rawText) {
        throw new Error('OSONE processou as ideias, mas a resposta retornou vazia. Tente novamente.');
      }

      // Parse JSON safely
      const parsedData: CreativeEngineOutput = JSON.parse(rawText);
      setOutput(parsedData);
      setActiveResultTab('master_script');
      addNotification('Roteiro Viral gerado e estruturado com sucesso!', 'success');
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || 'Erro inesperado ao gerar roteiros cognitivos virais.');
      addNotification('Erro ao criar ideias virais.', 'error');
    } finally {
      setIsGenerating(false);
      setLoadingStep(0);
    }
  };

  const handleCopyText = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
    addNotification('Conteúdo copiado para a área de transferência!', 'success');
  };

  const handleExportToFile = () => {
    if (!output || !onSaveToVirtualWorkspace) return;
    const { bestIdea } = output;
    const fileContent = `=====================================================
OSONE VIRAL SHORT-FORM CREATIVE AUDIO/SCRIPT
=====================================================
TEMA DE CANAL: ${channelTema}
IDEIA CONCEITO: ${bestIdea.title}
ESTILO/TOM: ${customStyle}

--- STORYTELLING EM 3 PARTES ---
[PARTE 1] GANCHO VISUAL TRAUMÁTICO E IMPACTANTE:
${bestIdea.storytelling.hook}

[PARTE 2] CONFLITO AFLITIVO & ANGUSTIANTE:
${bestIdea.storytelling.conflict}

[PARTE 3] CONCLUSÃO COM SURPRESA/HUMOR:
${bestIdea.storytelling.conclusion}

--- ROTEIRO COMPLETO DE FALAS (VÍDEO DE 1 MINUTO) ---
${bestIdea.script.map((s, idx) => `
SCENE ${idx + 1}: ${s.scene}
🎙️ NARRAÇÃO: "${s.narration}"
`).join('\n')}

---
Gerado por OSONE G5 Creative Media Center.
`;
    const cleanFileName = `roteiro_viral_${bestIdea.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.txt`;
    onSaveToVirtualWorkspace(cleanFileName, fileContent);
    addNotification(`Arquivo '${cleanFileName}' salvo na aba Escrita/RAG com sucesso!`, 'success');
  };

  const handleGenerateImagePrompts = async () => {
    if (!output) return;
    
    setIsGeneratingPrompts(true);
    setPromptError(null);
    
    const effectiveKey = apiKeys.gemini || '';
    if (!effectiveKey) {
      addNotification('Configure a API Key do Gemini para gerar seus prompts de imagem nas Configurações (ícone de engrenagem).', 'error');
      setPromptError('Gemini API Key ausente para o processamento de imagens.');
      setIsGeneratingPrompts(false);
      return;
    }
    
    try {
      const prompt = `
Você é um Engenheiro de Prompts especialista em Midjourney V6, Leonardo AI e Imagen 3.
Sua tarefa é analisar o seguinte roteiro de vídeo curto viral e gerar prompts cinematográficos ultra detalhados em inglês para cada uma das cenas (pois geradores de imagens operam melhor em inglês).

=== CONTEXTO DO CANAL E VÍDEO ===
Nicho do Canal: "${channelTema}"
Título Vencedor: "${output.bestIdea.title}"
Estilo Geral / Sentimento: "${customStyle}"

=== AS CENAS DO ROTEIRO DO VÍDEO ===
${output.bestIdea.script.map((s, idx) => `CENA ${idx + 1}:
Visual sugerido: ${s.scene}
Locução falada: ${s.narration}`).join('\n\n')}

=== DIRETRIZ DE ENGENHARIA DE PROMPT ===
Para cada cena, crie um prompt detalhado em INGLÊS.
Insira detalhes como:
- Estilo estético (ex: cinematic realism, dark fantasy, low-key lighting, hyper-detailed photography, 8k Resolution)
- Ângulo de câmera e tipo de lente (ex: macro close-up, wide angle anamorphic lens, drone shot, side profile view)
- Detalhes de iluminação e atmosferas (ex: dramatic volumetrical lighting, soft backlighting, warm glowing sunset, cool twilight hues)
- Finalize cada prompt com o parâmetro de proporção vertical apropriado de Reels/Kwai/Shorts: --ar 9:16

Responda RIGOROSAMENTE com um objeto JSON puro, sem textos adicionais, seguindo exatamente este schema:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "suggestedVisual": "O que esta cena representa visualmente (em português)",
      "midjourneyPrompt": "O prompt ultra detalhado em inglês contendo todos os detalhes e o parâmetro --ar 9:16 no final",
      "mood": "Sentimento sugerido do frame (ex: Choque, Suspense, Nostalgia, Curiosidade)",
      "lighting": "Tipo de iluminação ou tom de cores principal (ex: Neon cyberpunk glow, Rembrandt lighting)"
    }
  ]
}
`;

      const response = await fetch('/api/gemini/generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientApiKey: effectiveKey,
          model: apiKeys.geminiModel || 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          responseMimeType: 'application/json'
        })
      });

      if (!response.ok) {
        throw new Error(`Falha ao obter prompts de imagem do Gemini: status ${response.status}`);
      }

      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!rawText) {
        throw new Error('A resposta do processador de prompts do Gemini retornou vazia.');
      }

      const parsedData = JSON.parse(rawText);
      setImagePrompts(parsedData);
      addNotification('Fórmulas e Prompts de Imagem criados para todas as cenas!', 'success');
    } catch (err: any) {
      console.error(err);
      setPromptError(err.message || 'Erro inesperado na geração de prompts de imagem.');
      addNotification('Erro ao formular prompts de imagem.', 'error');
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6" id="osone_content_creator_hub">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white/[0.01] border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.15)]">
            <Video size={24} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-serif italic tracking-tight text-white flex items-center gap-2">
              Creative Studio Neural <span className="text-xs uppercase tracking-widest font-mono text-orange-400 bg-orange-500/10 px-2.5 py-0.5 rounded-full border border-orange-500/10">Viral Engine 🚀</span>
            </h2>
            <p className="text-xs text-her-muted mt-0.5 max-w-xl">
              Gere picos instantâneos de retenção e roteiros cinematográficos em 3 etapas de estresse cognitivo, desenhados para vídeos curtos de até 1 minuto.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadExample}
            disabled={isGenerating}
            className="px-4 py-2 text-xs font-medium text-amber-300 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/15 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            title="Carrega dados de canal de sucesso para testar rapidamente"
          >
            <HelpCircle size={14} />
            Carregar Canal Modelo
          </button>
          <button
            onClick={cleanInputs}
            disabled={isGenerating}
            className="p-2 text-her-muted hover:text-red-400 bg-white/[0.02] border border-white/[0.04] rounded-xl transition-all"
            title="Limpar campos"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* BODY CONTENT - BENTO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 px-6 pb-12">
        {/* INPUT PANEL - 2 COLUMNS */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="p-6 bg-[#161514] border border-white/[0.02] rounded-3xl flex flex-col gap-5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full" />
            
            <div className="flex items-center gap-2 text-xs font-bold text-orange-400 uppercase tracking-wider border-b border-white/[0.03] pb-3">
              <Sparkles size={14} />
              Configuração do Algoritmo Viral
            </div>

            {/* Field 1: Canal niche */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-her-ink/80 flex items-center gap-1">
                1. Nicho / Conteúdo do Canal <span className="text-red-400">*</span>
              </label>
              <textarea
                value={channelTema}
                onChange={(e) => setChannelTema(e.target.value)}
                placeholder="Exemplo de Conteúdo: Mistérios arqueológicos inexplicáveis, ficção científica distópica, teorias assustadoras do espaço sideral..."
                className="w-full min-h-[70px] bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 text-xs font-light text-white focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.04] transition-all resize-none leading-relaxed placeholder:text-stone-600"
              />
            </div>

            {/* Field 2: Target Audience */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-her-ink/80 flex items-center gap-1">
                2. Público Alvo
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Ex: Adolescentes obcecados por terror e puzzles, pessoas curiosas..."
                className="w-full bg-white/[0.02] border border-white/[0.06] rounded-2xl px-4 py-3.5 text-xs font-light text-white focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.04] transition-all placeholder:text-stone-600"
              />
            </div>

            {/* Field 3: Worked Ideas / References */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-her-ink/80 flex items-center justify-between">
                <span>3. Ideias ou Temas de Éxito</span>
                <span className="text-[10px] text-her-muted font-normal lowercase italic">para ela se basear</span>
              </label>
              <textarea
                value={workedIdeas}
                onChange={(e) => setWorkedIdeas(e.target.value)}
                placeholder="Ex: &#10;- O segredo do poço da Ilha de Oak&#10;- E se a gravidade mudasse de direção por 5 segundos?&#10;- A garrafa térmica que esconde uma câmera de 1950"
                className="w-full min-h-[90px] bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 text-xs font-light text-white focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.04] transition-all resize-none leading-relaxed placeholder:text-stone-600"
              />
            </div>

            {/* NEW: Knowledge Base (RAG) */}
            <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-orange-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <BookOpen size={14} />
                  Base de Conhecimento
                </label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer flex items-center gap-1 text-[10px] bg-neutral-900 border border-white/10 hover:bg-neutral-800 transition-colors text-zinc-300 px-2 py-1 rounded-lg">
                    <Upload size={11} className="text-orange-400" />
                    <span>Carregar</span>
                    <input 
                      type="file" 
                      accept=".txt,.md,.json,.csv" 
                      onChange={handleFileUpload} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              {kbFileName && (
                <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Arquivo: {kbFileName}
                </div>
              )}

              <textarea
                value={knowledgeBaseText}
                onChange={(e) => setKnowledgeBaseText(e.target.value)}
                placeholder="Cole regras estratégicas, roteiros milionários do TikTok/Shorts ou diretrizes que já deram muito certo para o OSONE seguir..."
                className="w-full min-h-[90px] bg-black/40 border border-white/[0.06] focus:border-orange-500/30 rounded-xl p-3 text-xs font-light text-zinc-100 focus:outline-none transition-all resize-none leading-relaxed placeholder:text-stone-600"
              />

              {/* Strict option */}
              <div className="flex items-center justify-between pt-1 border-t border-white/[0.03]">
                <span className="text-[10px] text-zinc-400 font-medium">Siga apenas a base p/ roteiros</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={strictKnowledgeBase}
                    onChange={(e) => setStrictKnowledgeBase(e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-8 h-4 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-[14px] after:transition-all peer-checked:bg-orange-500/70 peer-checked:after:bg-white"></div>
                </label>
              </div>
            </div>

            {/* Field 4: Custom Style */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-her-ink/80 flex items-center gap-1">
                4. Estilo de Narrativa & Sentimento
              </label>
              <select
                value={customStyle}
                onChange={(e) => setCustomStyle(e.target.value)}
                className="w-full bg-[#1e1d1b] border border-white/[0.06] rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-orange-500/40"
              >
                <option value="Alucinante / Ultra Emocionante">🔥 Alucinante com Alto Risco Emocional</option>
                <option value="Agonizante, suspense cinematográfico com picos de ironia ácida">⚠️ Agonizante & Suspense de Ficção Científica</option>
                <option value="Sombrio, focado em causar pesadelos e dúvidas morais lentas">🌙 Obscuro & Macabro de Retenção Psicológica</option>
                <option value="Interativo com quebras constantes de tela para travar o cérebro">🧠 Quebra de Quarta Parede (Para Travar a Tela)</option>
                <option value="Curioso, intrigante e acelerado (Estilo Nerd Extreme)">⚡ Curiosidades Secretas em Altíssima Velocidade</option>
              </select>
            </div>

            {/* NEW Field 5: Meta Neurocognitiva */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-her-ink/80 flex items-center gap-1">
                5. Meta Neurocognitiva & Foco Cerebral
              </label>
              <select
                value={cognitiveGoal}
                onChange={(e) => setCognitiveGoal(e.target.value)}
                className="w-full bg-[#1e1d1b] border border-white/[0.06] rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-orange-500/40"
              >
                <option value="Curiosidade Extrema (Gatilho Dopamina)">🧠 Curiosidade Extrema (Gatilho Dopamina)</option>
                <option value="Conexão Sensorial e História (Gatilho Ocitocina)">🤝 Conexão Sensorial e História (Gatilho Ocitocina)</option>
                <option value="Aprendizado Profundo por Analogia (Gatilho Serotonina)">📚 Aprendizado Profundo por Analogia (Gatilho Serotonina)</option>
                <option value="Desconforto Moral e Raciocínio Social (Atenção Límbica)">⚠️ Desconforto Moral e Raciocínio Social (Atenção Límbica)</option>
                <option value="Fascínio Científico e Simulação Futura (Fluxo Córtex)">⚡ Fascínio Científico e Simulação Futura (Fluxo Córtex)</option>
              </select>
            </div>

            {/* NEW Field 6: Abordagens Científicas Opcionais */}
            <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-orange-400 flex items-center gap-1 uppercase tracking-wider">
                  <Zap size={13} />
                  Filtro de Abordagens ({selectedApproaches.length || 'Sone Auto-seleciona'})
                </span>
                {selectedApproaches.length > 0 && (
                  <button 
                    onClick={() => setSelectedApproaches([])}
                    type="button"
                    className="text-[9px] text-stone-500 hover:text-orange-400 transition-colors uppercase font-mono"
                  >
                    limpar
                  </button>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-snug">
                Selecione as teorias clássicas para pautar o comportamento físico e econômico do roteiro:
              </p>
              
              <div className="max-h-[140px] overflow-y-auto pr-1 border border-white/[0.04] rounded-xl p-1.5 bg-black/30 mt-1 flex flex-col gap-1 select-none">
                {SCIENTIFIC_APPROACHES.map((app) => {
                  const isChecked = selectedApproaches.includes(app.id);
                  return (
                    <label 
                      key={app.id} 
                      className={cn(
                        "flex items-start gap-2 p-1.5 rounded-lg border text-[10px] cursor-pointer transition-colors leading-relaxed",
                        isChecked 
                          ? "bg-orange-500/10 border-orange-500/20 text-orange-200" 
                          : "bg-white/[0.01] border-white/[0.03] hover:bg-white/[0.03] text-stone-400 hover:text-stone-300"
                      )}
                    >
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedApproaches(selectedApproaches.filter(i => i !== app.id));
                          } else {
                            setSelectedApproaches([...selectedApproaches, app.id]);
                          }
                        }}
                        className="sr-only"
                      />
                      <div className={cn(
                        "w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center mt-0.5 transition-colors",
                         isChecked ? "border-orange-500 bg-orange-500 text-black" : "border-stone-700 bg-stone-900"
                      )}>
                        {isChecked && <Check size={10} strokeWidth={3} />}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold">{app.name}</span>
                        <span className="text-[9px] text-stone-500 leading-normal">{app.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={cn(
                "w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 border shadow-lg overflow-hidden relative",
                isGenerating 
                  ? "bg-stone-800 border-white/5 text-white/40 cursor-not-allowed" 
                  : "bg-gradient-to-r from-orange-500 to-amber-600 text-white border-orange-400/20 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:brightness-110 active:scale-[0.98]"
              )}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                  <span>Sintonizando Redes Cognitivas...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Iniciar Processamento Viral</span>
                </>
              )}
            </button>
          </div>

          {/* RAG DISCLOSURE HINT */}
          <div className="p-4 rounded-2xl bg-cyan-950/10 border border-cyan-800/10 text-[11px] text-cyan-400 font-light flex items-start gap-2.5">
            <Info size={16} className="shrink-0 text-cyan-400 mt-0.5" />
            <p className="leading-relaxed">
              O OSONE sincronizará as criações, ideias e roteiros formados diretamente com a aba de documentos e o seu computador via <strong>Canal RAG integrado</strong>, facilitando edições físicas no seu PC em tempo real!
            </p>
          </div>
        </div>

        {/* OUTPUT OR PROCESSING VIEW - 3 COLUMNS */}
        <div className="lg:col-span-3 flex flex-col min-h-[500px]">
          {/* IDLE OR GENERATING STATES */}
          <AnimatePresence mode="wait">
            {!output && !isGenerating && !generationError && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/[0.04] rounded-3xl p-8 text-center bg-white/[0.005]"
              >
                <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center text-her-muted mb-4 relative">
                  <div className="absolute inset-0 rounded-full border border-orange-500/10 animate-ping" />
                  <Video size={24} className="text-orange-400" />
                </div>
                <h3 className="text-sm font- serif text-white/50 mb-1 italic">Estúdio Criativo Aguardando Chamado</h3>
                <p className="text-xs text-her-muted max-w-sm mb-6 leading-relaxed">
                  Insira as referências do seu canal à esquerda ou carregue as bases e inicie o OSONE para estruturar o roteiro ideal de retenção.
                </p>
                <div className="flex gap-2 max-w-md flex-wrap justify-center">
                  <span className="text-[9px] bg-white/[0.02] text-her-muted/80 px-2.5 py-1 rounded-full border border-white/[0.05]">9 Ideias Simultâneas</span>
                  <span className="text-[9px] bg-white/[0.02] text-her-muted/80 px-2.5 py-1 rounded-full border border-white/[0.05]">Destilação das Top 3</span>
                  <span className="text-[9px] bg-white/[0.02] text-her-muted/80 px-2.5 py-1 rounded-full border border-white/[0.05]">Gancho / Conflito / Surpresa</span>
                  <span className="text-[9px] bg-white/[0.02] text-her-muted/80 px-2.5 py-1 rounded-full border border-white/[0.05]">Narração de 1 Min</span>
                </div>
              </motion.div>
            )}

            {isGenerating && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-8 bg-[#161514] border border-white/[0.03] rounded-3xl text-center shadow-inner relative"
              >
                {/* Visual Neural wave animation */}
                <div className="relative mb-8 flex items-center justify-center">
                  <div className="absolute w-24 h-24 rounded-full bg-orange-500/10 blur-xl animate-pulse" />
                  <div className="absolute w-16 h-16 rounded-full bg-amber-500/15 animate-ping" />
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-lg z-10">
                    <Video size={22} className="animate-bounce" />
                  </div>
                </div>

                <div className="max-w-md">
                  {/* Status wizard messages */}
                  <div className="h-6 overflow-hidden relative mb-2">
                    <AnimatePresence mode="wait">
                      {loadingStep === 1 && (
                        <motion.p 
                          key="step1"
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -20, opacity: 0 }}
                          className="text-xs uppercase tracking-[0.2em] font-mono text-orange-400 font-bold"
                        >
                          Etapa 1: Espalhando 9 Teorias & Ideias Virais
                        </motion.p>
                      )}
                      {loadingStep === 2 && (
                        <motion.p 
                          key="step2"
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -20, opacity: 0 }}
                          className="text-xs uppercase tracking-[0.2em] font-mono text-orange-400 font-bold"
                        >
                          Etapa 2: Filtrando e destilando as 3 Mais Robustas
                        </motion.p>
                      )}
                      {loadingStep === 3 && (
                        <motion.p 
                          key="step3"
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -20, opacity: 0 }}
                          className="text-xs uppercase tracking-[0.2em] font-mono text-amber-300 font-bold"
                        >
                          Etapa 3: Moldando Storytelling & Linha de Falas
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <p className="text-xs text-her-muted max-w-xs mx-auto leading-relaxed mt-2">
                    O OSONE está consultando o cérebro do Gemini para estruturar o fluxo psicológico de retenção perfeito baseado na sua aba local.
                  </p>

                  {/* Progressive loading bar */}
                  <div className="w-56 h-1 bg-white/5 rounded-full mx-auto mt-6 overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-orange-500 to-amber-400"
                      initial={{ width: '0%' }}
                      animate={{ 
                        width: loadingStep === 1 ? '30%' : loadingStep === 2 ? '65%' : '95%' 
                      }}
                      transition={{ duration: 1.5 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {generationError && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-8 bg-red-950/10 border border-red-500/10 rounded-3xl text-center"
              >
                <AlertCircle className="text-red-400 w-12 h-12 mb-4 animate-bounce" />
                <h4 className="text-sm font-serif italic text-red-300 mb-2">Engarrafamento de Dados Neurais</h4>
                <p className="text-xs text-red-100/65 max-w-sm leading-relaxed mb-6">
                  {generationError}
                </p>
                <button
                  onClick={handleGenerate}
                  className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/25 rounded-xl transition-all"
                >
                  Tentar Novamente
                </button>
              </motion.div>
            )}

            {/* GENERATED OUTPUT PANEL */}
            {output && !isGenerating && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 flex flex-col gap-4"
              >
                {/* CONTROLS & TAB HEADERS */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white/[0.01] border border-white/[0.04] rounded-2xl">
                  {/* Tabs */}
                  <div className="flex bg-neutral-900 p-1 rounded-xl border border-white/5 w-full sm:w-auto gap-0.5 overflow-x-auto">
                    <button
                      onClick={() => setActiveResultTab('master_script')}
                      className={cn(
                        "flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none cursor-pointer shrink-0",
                        activeResultTab === 'master_script' 
                          ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" 
                          : "text-her-muted hover:text-white"
                      )}
                    >
                      🏆 Roteiro Vencedor
                    </button>
                    <button
                      onClick={() => setActiveResultTab('comparison')}
                      className={cn(
                        "flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none cursor-pointer shrink-0",
                        activeResultTab === 'comparison' 
                          ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" 
                          : "text-her-muted hover:text-white"
                      )}
                    >
                      ⚖️ Escolha das 3
                    </button>
                    <button
                      onClick={() => setActiveResultTab('brainstorm')}
                      className={cn(
                        "flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none cursor-pointer shrink-0",
                        activeResultTab === 'brainstorm' 
                          ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" 
                          : "text-her-muted hover:text-white"
                      )}
                    >
                      💡 As 9 Ideias
                    </button>
                    <button
                      onClick={() => setActiveResultTab('neuro_science')}
                      className={cn(
                        "flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none cursor-pointer shrink-0 flex items-center gap-1",
                        activeResultTab === 'neuro_science' 
                          ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold" 
                          : "text-her-muted hover:text-white"
                      )}
                    >
                      <Brain size={12} className="text-purple-400 shrink-0" />
                      <span>Neurociência ({output.neuroAnalysis ? 'Ativo' : 'Auto'})</span>
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                    <button
                      onClick={handleExportToFile}
                      className="px-3 py-2 text-xs text-orange-300 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/15 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                      title="Salvar script como arquivo TXT no Workspace atual"
                    >
                      <FileText size={13} />
                      Exportar RAG
                    </button>
                    <button
                      onClick={() => handleCopyText(JSON.stringify(output, null, 2))}
                      className="p-2 text-her-muted hover:text-white bg-white/[0.02] border border-white/[0.04] rounded-xl transition-all relative"
                      title="Copiar JSON bruto"
                    >
                      <Share2 size={14} />
                    </button>
                  </div>
                </div>

                {/* TAB OUTLET WINDOW */}
                <div className="flex-1 bg-stone-900/60 border border-white/[0.03] rounded-3xl p-6 custom-scrollbar max-h-[620px] overflow-y-auto">
                  <AnimatePresence mode="wait">
                    {/* TAB 1: ALL NINE IDEAS */}
                    {activeResultTab === 'brainstorm' && (
                      <motion.div
                        key="tab-nine"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="space-y-4"
                      >
                        <div className="border-b border-white/[0.04] pb-3 mb-5">
                          <h4 className="text-xs uppercase tracking-[0.2em] font-bold text-orange-400 mb-1">
                            Explosão Criativa Coletiva
                          </h4>
                          <p className="text-[11px] text-her-muted">
                            Estas são 9 ideias formadas para o nicho fornecido. O algoritmo do OSONE analisará todas antes de fazer as escolhas principais.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {output.allNineIdeas.map((idea) => (
                            <div 
                              key={idea.id}
                              className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04] hover:bg-white/[0.02] hover:border-orange-500/20 transition-all flex flex-col gap-2 relative group"
                            >
                              <div className="absolute top-3 right-3 text-[8px] uppercase tracking-wider font-bold text-amber-500 bg-amber-500/5 border border-amber-500/20 px-2 rounded-full">
                                {idea.viralPotential} Potential
                              </div>
                              <span className="text-[10px] font-mono text-her-muted">IDEIA #{idea.id}</span>
                              <h5 className="text-xs font-serif font-bold text-white tracking-wide">{idea.title}</h5>
                              <p className="text-[11px] text-her-ink/65 leading-relaxed">{idea.description}</p>
                              
                              <div className="mt-auto pt-3 border-t border-white/[0.03] text-[10px] italic text-orange-400">
                                💬 {idea.reason}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* TAB 2: COMPARISON OF TOP THREE */}
                    {activeResultTab === 'comparison' && (
                      <motion.div
                        key="tab-three"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-6"
                      >
                        <div className="border-b border-white/[0.04] pb-3">
                          <h4 className="text-xs uppercase tracking-[0.2em] font-bold text-orange-400 mb-1">
                            A Destilação: Funil Seletivo de Audiência
                          </h4>
                          <p className="text-[11px] text-her-muted">
                            Dentre as 9, o cérebro matemático de retenção extraiu as 3 com potencial mais elevado.
                          </p>
                        </div>

                        <div className="space-y-4">
                          {output.topThreeChosen.map((top, idx) => (
                            <div 
                              key={top.id}
                              className={cn(
                                "p-5 rounded-2xl border flex flex-col md:flex-row gap-4 items-start shadow-xl relative overflow-hidden",
                                idx === 0 
                                  ? "bg-orange-500/[0.03] border-orange-500/20" 
                                  : "bg-white/[0.01] border-white/[0.04]"
                              )}
                            >
                              <div className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-mono text-xs font-bold leading-none select-none shrink-0">
                                {idx + 1}
                              </div>
                              <div className="flex-1 space-y-2">
                                <h5 className="text-xs font-serif font-bold text-white flex items-center gap-2">
                                  {top.title}
                                  {idx === 0 && (
                                    <span className="text-[8px] bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded-full uppercase font-sans tracking-widest font-bold">Favorito do Algoritmo</span>
                                  )}
                                </h5>
                                <p className="text-xs text-her-ink/75 font-light leading-relaxed">{top.description}</p>
                                <div className="text-[10px] text-amber-300 bg-amber-500/5 px-3 py-2 rounded-xl mt-2 border border-amber-500/10">
                                  <strong>Métrica Cognitiva:</strong> {top.whyTop3}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* TAB 3: THE CHOSEN MASTER SCRIPT */}
                    {activeResultTab === 'master_script' && (
                      <motion.div
                        key="tab-best"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="space-y-6"
                      >
                        {/* Winner Pitch */}
                        <div className="p-5 rounded-2xl bg-[#1e1d1b] border border-orange-500/10 relative overflow-hidden shadow-xl">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 blur-2xl rounded-full" />
                          <span className="text-[9px] uppercase tracking-widest font-mono text-orange-400 font-bold bg-orange-500/10 px-2.5 py-0.5 rounded-full border border-orange-500/10">🏆 Vencedora Incontestável</span>
                          <h4 className="text-base font-serif italic font-bold text-white mt-2 mb-1">
                            {output.bestIdea.title}
                          </h4>
                          <p className="text-xs text-her-muted italic font-light leading-relaxed">
                            "{output.bestIdea.justification}"
                          </p>
                        </div>

                        {/* Tri-Part Storytelling structure as requested by user */}
                        <div className="space-y-3">
                          <h5 className="text-xs uppercase tracking-wider font-bold text-stone-400 flex items-center gap-1.5 border-b border-white/[0.04] pb-2">
                            <Sparkles size={14} className="text-orange-400" />
                            A Estrutura de Retenção Psíquica (Três Partes)
                          </h5>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Part 1: Visual hook */}
                            <div className="p-4 rounded-2xl bg-red-950/5 border border-red-900/10 flex flex-col gap-2 relative group hover:border-red-500/25 transition-all">
                              <span className="text-[8px] uppercase tracking-widest font-mono text-red-400 font-bold">Parte I • Hook de Alto Impacto</span>
                              <h6 className="text-[11px] font-bold text-white">Chocante & Chamatino</h6>
                              <p className="text-[11px] text-her-ink/70 leading-relaxed font-light">{output.bestIdea.storytelling.hook}</p>
                            </div>

                            {/* Part 2: Distressing conflict */}
                            <div className="p-4 rounded-2xl bg-amber-950/5 border border-amber-900/10 flex flex-col gap-2 relative group hover:border-amber-500/25 transition-all">
                              <span className="text-[8px] uppercase tracking-widest font-mono text-amber-400 font-bold">Parte II • Conflito Aflitivo</span>
                              <h6 className="text-[11px] font-bold text-white">Angustiante & Intenso</h6>
                              <p className="text-[11px] text-her-ink/70 leading-relaxed font-light">{output.bestIdea.storytelling.conflict}</p>
                            </div>

                            {/* Part 3: Conclusion unexpected */}
                            <div className="p-4 rounded-2xl bg-emerald-950/5 border border-emerald-900/10 flex flex-col gap-2 relative group hover:border-emerald-500/25 transition-all">
                              <span className="text-[8px] uppercase tracking-widest font-mono text-emerald-400 font-bold">Parte III • Desfecho Inesperado</span>
                              <h6 className="text-[11px] font-bold text-white">Humor ou Choque surpresa</h6>
                              <p className="text-[11px] text-her-ink/70 leading-relaxed font-light">{output.bestIdea.storytelling.conclusion}</p>
                            </div>
                          </div>
                        </div>

                        {/* Sequential Audio/Video Script */}
                        <div className="space-y-4 pt-3">
                          <div className="flex items-center justify-between border-b border-white/[0.04] pb-2">
                            <h5 className="text-xs uppercase tracking-wider font-bold text-stone-400 flex items-center gap-1.5">
                              <FileText size={14} className="text-orange-400" />
                              Cronologia de Falas (Sequencial - Até 1m)
                            </h5>
                            <button
                              onClick={() => {
                                const fullLines = output.bestIdea.script.map((s, idx) => `Cena ${idx + 1}: ${s.scene}\n🎙️ "${s.narration}"`).join('\n\n');
                                handleCopyText(fullLines);
                              }}
                              className="text-[10px] text-orange-400 hover:text-white flex items-center gap-1 transition-colors bg-orange-500/5 px-2.5 py-1.5 rounded-lg border border-orange-500/10 select-none cursor-pointer"
                            >
                              {copiedScript ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              {copiedScript ? "Copiado!" : "Copiar Roteiro"}
                            </button>
                          </div>

                          <div className="space-y-3.5">
                            {output.bestIdea.script.map((speech, sIdx) => (
                              <div 
                                key={sIdx}
                                className="p-4 rounded-2xl bg-[#141312] border border-white/[0.02] hover:bg-[#181716] transition-all flex flex-col md:flex-row gap-3.5 items-start relative group"
                              >
                                <span className="text-[9px] font-mono text-orange-400 bg-orange-500/10 px-2 py-1 rounded-md border border-orange-500/10 shrink-0">
                                  CENA {sIdx + 1}
                                </span>

                                <div className="space-y-2 flex-1">
                                  {/* Scene layout directions */}
                                  <div className="text-[10px] text-her-muted flex items-start gap-1 font-light italic bg-white/[0.01] p-2 rounded-lg border border-white/[0.02]">
                                    <CornerDownRight size={11} className="text-orange-400 shrink-0 mt-0.5" />
                                    <span>Visual sugerido: {speech.scene}</span>
                                  </div>

                                  {/* Speech narration audio stream */}
                                  <div className="p-3.5 bg-neutral-900 rounded-xl border border-white/[0.03] relative">
                                    <p className="text-xs font-light text-white leading-relaxed tracking-wide select-text">
                                      🎙️ {speech.narration}
                                    </p>
                                    <button
                                      onClick={() => handleCopyText(speech.narration, sIdx)}
                                      className="absolute top-2 right-2 p-1.5 text-her-muted hover:text-white rounded-lg hover:bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                      title="Copiar apenas esta fala"
                                    >
                                      {copiedIndex === sIdx ? <Check size={12} className="text-emerald-400" /> : <Copy size={11} />}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* SEÇÃO DE PROMPTS DE IMAGEM ADICIONADA */}
                        <div className="pt-6 border-t border-white/[0.04] mt-8" id="image-prompts-section">
                          <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-500/[0.02] to-orange-500/[0.02] border border-orange-500/15 relative overflow-hidden flex flex-col gap-5">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full pointer-events-none" />
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400 border border-orange-500/10">
                                  <Sparkles size={16} />
                                </div>
                                <div>
                                  <h5 className="text-xs font-bold text-white uppercase tracking-wider">Gostou deste roteiro? Crie os visuais viciantes!</h5>
                                  <p className="text-[10px] text-her-muted mt-0.5">O OSONE criará fórmulas e prompts cinematográficos ultra detalhados para cada cena deste vídeo.</p>
                                </div>
                              </div>
                              
                              {!imagePrompts ? (
                                <button
                                  onClick={handleGenerateImagePrompts}
                                  disabled={isGeneratingPrompts}
                                  className={cn(
                                    "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center gap-1.5 border shadow-md shrink-0",
                                    isGeneratingPrompts
                                      ? "bg-stone-800 border-white/5 text-stone-500 cursor-not-allowed"
                                      : "bg-orange-500 hover:bg-orange-600 text-white border-orange-400/20 active:scale-95 shadow-[0_0_15px_rgba(249,115,22,0.15)]"
                                  )}
                                >
                                  {isGeneratingPrompts ? (
                                    <>
                                      <RefreshCw size={13} className="animate-spin" />
                                      <span>Gerando Fórmulas...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={13} />
                                      <span>Gerar Prompts de Imagem</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <button
                                  onClick={handleGenerateImagePrompts}
                                  disabled={isGeneratingPrompts}
                                  className="px-3 py-1.5 rounded-lg text-[10px] text-orange-400 border border-orange-500/15 bg-orange-500/5 hover:bg-orange-500/10 transition-all select-none cursor-pointer flex items-center gap-1 shrink-0"
                                >
                                  <RefreshCw size={11} className={cn(isGeneratingPrompts && "animate-spin")} />
                                  Regerar Prompts
                                </button>
                              )}
                            </div>

                            {/* Prompts error display */}
                            {promptError && (
                              <div className="p-3 bg-red-950/20 border border-red-500/15 rounded-xl text-[11px] text-red-400 flex items-center gap-1.5">
                                <AlertCircle size={14} />
                                <span>{promptError}</span>
                              </div>
                            )}

                            {/* Render generated prompts */}
                            {imagePrompts && (
                              <div className="space-y-4 pt-1">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.04] pb-2 pointer-events-auto">
                                  <span className="text-[10px] font-mono text-orange-400 uppercase tracking-widest font-bold">🎯 Fórmulas Fotográficas (Aspecto 9:16):</span>
                                  <button
                                    onClick={() => {
                                      const promptDoc = imagePrompts.scenes.map(s => 
                                        `=====================================================\n[CENA ${s.sceneNumber}] Humor: ${s.mood} | Iluminação: ${s.lighting}\nVisual Sugerido: ${s.suggestedVisual}\n\nPROMPT PARA GERADOR (MIDJOURNEY):\n${s.midjourneyPrompt}\n=====================================================\n`
                                      ).join('\n\n');
                                      
                                      if (onSaveToVirtualWorkspace) {
                                        onSaveToVirtualWorkspace(`prompts_imagens_${output.bestIdea.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.txt`, promptDoc);
                                        addNotification('Fórmulas de imagem salvas na Biblioteca RAG!', 'success');
                                      } else {
                                        navigator.clipboard.writeText(promptDoc);
                                        addNotification('Fórmulas copiadas para a área de transferência!', 'success');
                                      }
                                    }}
                                    className="px-2.5 py-1 text-[9px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/20 rounded-lg transition-all font-mono select-none cursor-pointer flex items-center gap-1"
                                  >
                                    <FileText size={11} />
                                    Salvar no Canal RAG
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {imagePrompts.scenes.map((p, idx) => (
                                    <div 
                                      key={p.sceneNumber}
                                      className="p-4 rounded-xl bg-black/20 border border-white/[0.03] flex flex-col gap-2.5 group relative hover:border-orange-500/25 transition-all"
                                    >
                                      {/* Header badges */}
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[9px] font-mono text-orange-400/80 font-bold bg-orange-500/5 px-2 py-0.5 rounded border border-orange-500/5">CENA {p.sceneNumber}</span>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[8px] bg-amber-500/5 text-amber-300 border border-amber-500/10 px-2 py-0.5 rounded-full uppercase font-medium">{p.mood}</span>
                                          <span className="text-[8px] bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full font-light truncate max-w-[120px]">{p.lighting}</span>
                                        </div>
                                      </div>

                                      <p className="text-[11px] text-her-ink/75 font-light leading-relaxed">
                                        <strong className="text-stone-300 font-medium">Visual da Cena:</strong> {p.suggestedVisual}
                                      </p>

                                      <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.02] relative mt-1">
                                        <p className="text-[11px] font-mono text-stone-300 leading-relaxed font-light break-words pr-7 select-all">
                                          {p.midjourneyPrompt}
                                        </p>
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(p.midjourneyPrompt);
                                            setCopiedPromptIdx(idx);
                                            setTimeout(() => setCopiedPromptIdx(null), 2000);
                                            addNotification(`Prompt da cena ${p.sceneNumber} copiado!`, 'success');
                                          }}
                                          className="absolute top-2.5 right-2 text-stone-500 hover:text-white transition-colors cursor-pointer select-none"
                                          title="Copiar prompt"
                                        >
                                          {copiedPromptIdx === idx ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* TAB 4: NEUROSCIENCE COGNITIVE STUDY AND SCIENTIFIC THEORIES */}
                    {activeResultTab === 'neuro_science' && (
                      <motion.div
                        key="tab-neuro"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="space-y-6"
                      >
                        <div className="border-b border-white/[0.04] pb-3">
                          <h4 className="text-xs uppercase tracking-[0.2em] font-bold text-purple-400 flex items-center gap-1.5 mb-1 animate-pulse">
                            <Brain size={14} className="shrink-0 text-purple-400" />
                            Protocolo Neural & Cognição Pré-Redação
                          </h4>
                          <p className="text-[11px] text-zinc-400">
                            Estudo e mapeamento prévio realizado pelo OSONE antes da redação do roteiro, com base nas teorias de ação comportamental e física.
                          </p>
                        </div>

                        {output.neuroAnalysis ? (
                          <div className="space-y-6">
                            {/* Reflection statement */}
                            <div className="p-5 rounded-2xl bg-purple-500/[0.02] border border-purple-500/20 relative overflow-hidden shadow-xl">
                              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-2xl rounded-full" />
                              <span className="text-[8px] uppercase tracking-widest font-mono text-purple-400 font-bold bg-purple-500/15 px-2.5 py-0.5 rounded-full border border-purple-500/15">
                                Reflexão de Consciência de osone
                              </span>
                              <p className="text-xs text-purple-100/90 italic font-mono leading-relaxed mt-3 whitespace-pre-wrap leading-relaxed select-text">
                                "{output.neuroAnalysis.cognitivePreWritingReflexion}"
                              </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              {/* Brain Areas Activation Grid */}
                              <div className="p-5 rounded-2xl bg-black/40 border border-white/[0.04] space-y-4">
                                <h5 className="text-[11px] uppercase tracking-wider font-bold text-zinc-300 flex items-center gap-1.5 border-b border-white/[0.03] pb-2">
                                  <Brain size={13} className="text-purple-400 animate-pulse shrink-0" />
                                  Regiões Encefálicas Estimuladas
                                </h5>
                                <div className="space-y-3.5 select-text">
                                  {output.neuroAnalysis.brainAreas.map((area, key) => (
                                    <div key={key} className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] gap-2">
                                        <span className="font-bold text-zinc-250 text-white">{area.area}</span>
                                        <span className="font-mono text-purple-400 font-semibold bg-purple-950/20 px-2 py-0.5 border border-purple-500/10 rounded text-[9px] uppercase tracking-wider">Atividade Alvo</span>
                                      </div>
                                      <p className="text-[10px] text-zinc-400 leading-relaxed font-light">
                                        {area.targetExplanation}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Scientific Theories Applied */}
                              <div className="p-5 rounded-2xl bg-black/40 border border-white/[0.04] space-y-4">
                                <h5 className="text-[11px] uppercase tracking-wider font-bold text-zinc-300 flex items-center gap-1.5 border-b border-white/[0.03] pb-2">
                                  <Zap size={13} className="text-orange-400 animate-pulse shrink-0" />
                                  Fundamentos de Física e Comportamento
                                </h5>
                                <div className="space-y-3.5 select-text">
                                  {output.neuroAnalysis.selectedApproaches.map((app, key) => (
                                    <div key={key} className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="font-bold text-zinc-250 text-white">{app.name}</span>
                                        <span className="font-mono text-orange-400 text-[9px] lowercase italic shrink-0">teoria material</span>
                                      </div>
                                      <p className="text-[10px] text-zinc-400 leading-relaxed font-light mt-0.5">
                                        💡 <strong>Ajuste do canal:</strong> {app.whyChosen}
                                      </p>
                                      <p className="text-[10px] text-zinc-400 leading-relaxed font-light mt-0.5">
                                        🎯 <strong>No roteiro:</strong> {app.applicationInScript}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Neurotransmitters bar */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="p-4 rounded-xl bg-purple-950/10 border border-purple-500/10 flex items-center justify-between gap-2">
                                <div className="space-y-0.5 flex-1">
                                  <div className="text-[10px] text-purple-450 font-bold uppercase tracking-wider">Combustível Neuroquímico Ativado</div>
                                  <div className="text-xs font-mono font-bold text-white uppercase tracking-tight break-all">
                                    {output.neuroAnalysis.neurotransmitters.join(', ')}
                                  </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-purple-500/15 flex items-center justify-center text-purple-450 shrink-0">
                                  <Zap size={14} className="text-purple-400" />
                                </div>
                              </div>

                              <div className="p-4 rounded-xl bg-orange-950/10 border border-orange-500/10 flex items-center justify-between gap-2">
                                <div className="space-y-0.5 flex-1">
                                  <div className="text-[10px] text-orange-450 font-bold uppercase tracking-wider">Estrutura de Linguagem do Estudo</div>
                                  <div className="text-xs font-mono font-bold text-white uppercase tracking-tight break-all">
                                    {output.neuroAnalysis.languageStructureType}
                                  </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-450 shrink-0">
                                  <Brain size={14} className="text-orange-400" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-8 border border-dashed border-white/[0.04] rounded-2xl text-center text-zinc-500">
                            <Brain size={24} className="mx-auto text-zinc-600 mb-2 animate-pulse" />
                            <p className="text-[11px]">
                              Nenhuma análise neurocognitiva detalhada foi mapeada para este roteiro específico. Ative e processe um novo roteiro para visualizar os canais cerebrais.
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
