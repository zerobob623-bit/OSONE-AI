import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Trash2, 
  Clock, 
  Search, 
  Book, 
  Bookmark, 
  Sparkles, 
  ArrowLeft, 
  User, 
  Brain, 
  Smile, 
  Plus, 
  Tag, 
  ChevronDown, 
  Trash, 
  Heart, 
  FileText 
} from 'lucide-react';
import { useUserMemory, ImportantDate, SemanticFact, DiaryEntry } from '../hooks/useUserMemory';

interface MemoryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  createdAt: number;
}

interface GroupedChapter {
  dateStr: string; // YYYY-MM-DD
  formattedDate: string; // e.g., "17 de Julho de 2026"
  chapterNum: number;
  pages: {
    globalPageNum: number;
    localPageNum: number;
    memory: MemoryEntry;
  }[];
}

interface MemoryBookPanelProps {
  onBack: () => void;
  onAddNotification: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const MemoryBookPanel = ({ onBack, onAddNotification }: MemoryBookPanelProps) => {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [chapters, setChapters] = useState<GroupedChapter[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [activePageIndex, setActivePageIndex] = useState<number>(0); // Index of page inside the active chapter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'book' | 'index' | 'facts' | 'diary' | 'semantic'>('book');

  // Integrando o hook useUserMemory da outra IA
  const {
    userId,
    memory,
    diary,
    addFact,
    addImportantDate,
    addDiaryEntry,
    getUpcomingDates,
    addSemanticFact
  } = useUserMemory();

  // Estados locais para formulários de inserção de memórias
  const [newFact, setNewFact] = useState('');
  
  const [newDateLabel, setNewDateLabel] = useState('');
  const [newDateVal, setNewDateVal] = useState(''); // MM-DD format
  const [newDateYear, setNewDateYear] = useState('');

  const [newDiaryContent, setNewDiaryContent] = useState('');
  const [newDiaryMood, setNewDiaryMood] = useState('neutral');

  const [newConcept, setNewConcept] = useState('');
  const [newDefinition, setNewDefinition] = useState('');
  const [newCategory, setNewCategory] = useState('Geral');

  // Load conversation memories from localStorage (standard behavior)
  useEffect(() => {
    const saved = localStorage.getItem('osone_memory_book');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as MemoryEntry[];
        // Sort chronologically by date and creation time
        parsed.sort((a, b) => {
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          return a.createdAt - b.createdAt;
        });
        setMemories(parsed);
      } catch (e) {
        console.error("Error reading memory book:", e);
      }
    }
  }, []);

  // Process memories into chapters (grouped by date) and pages
  useEffect(() => {
    if (memories.length === 0) {
      setChapters([]);
      return;
    }

    // Filter by search query if any
    const filtered = memories.filter(m => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        m.title.toLowerCase().includes(query) ||
        m.summary.toLowerCase().includes(query) ||
        m.topics.some(t => t.toLowerCase().includes(query)) ||
        m.keyPoints.some(kp => kp.toLowerCase().includes(query)) ||
        m.date.includes(query)
      );
    });

    // Group by date
    const groups: { [date: string]: MemoryEntry[] } = {};
    filtered.forEach(m => {
      if (!groups[m.date]) {
        groups[m.date] = [];
      }
      groups[m.date].push(m);
    });

    // Get sorted unique dates
    const sortedDates = Object.keys(groups).sort((a, b) => a.localeCompare(b));

    // Format dates for Portuguese presentation
    const formatDate = (dateStr: string) => {
      try {
        const [year, month, day] = dateStr.split('-');
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return date.toLocaleDateString('pt-BR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      } catch (e) {
        return dateStr;
      }
    };

    let globalPageCounter = 1;
    const processedChapters: GroupedChapter[] = sortedDates.map((date, idx) => {
      const chapterNum = idx + 1;
      const chapterMemories = groups[date];

      const pages = chapterMemories.map((memory, pIdx) => {
        const page = {
          globalPageNum: globalPageCounter,
          localPageNum: pIdx + 1,
          memory
        };
        globalPageCounter++;
        return page;
      });

      return {
        dateStr: date,
        formattedDate: formatDate(date),
        chapterNum,
        pages
      };
    });

    setChapters(processedChapters);

    // Keep indices bounded
    if (activeChapterIndex >= processedChapters.length) {
      setActiveChapterIndex(Math.max(0, processedChapters.length - 1));
    }
    const currentChapter = processedChapters[activeChapterIndex];
    if (currentChapter && activePageIndex >= currentChapter.pages.length) {
      setActivePageIndex(Math.max(0, currentChapter.pages.length - 1));
    }
  }, [memories, searchQuery]);

  const handleDeleteMemory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Deseja realmente excluir esta memória do Livro de Memórias?")) {
      return;
    }

    const updated = memories.filter(m => m.id !== id);
    setMemories(updated);
    localStorage.setItem('osone_memory_book', JSON.stringify(updated));
    onAddNotification("Memória de conversação removida com sucesso.", "success");
  };

  // Turn page backward
  const handlePrevPage = () => {
    if (activePageIndex > 0) {
      setActivePageIndex(activePageIndex - 1);
    } else if (activeChapterIndex > 0) {
      const prevChapterIdx = activeChapterIndex - 1;
      setActiveChapterIndex(prevChapterIdx);
      setActivePageIndex(chapters[prevChapterIdx].pages.length - 1);
    }
  };

  // Turn page forward
  const handleNextPage = () => {
    const currentChapter = chapters[activeChapterIndex];
    if (!currentChapter) return;

    if (activePageIndex < currentChapter.pages.length - 1) {
      setActivePageIndex(activePageIndex + 1);
    } else if (activeChapterIndex < chapters.length - 1) {
      setActiveChapterIndex(activeChapterIndex + 1);
      setActivePageIndex(0);
    }
  };

  const currentChapter = chapters[activeChapterIndex];
  const currentPage = currentChapter?.pages[activePageIndex];

  const handleJumpToChapter = (chapIdx: number) => {
    setActiveChapterIndex(chapIdx);
    setActivePageIndex(0);
    setViewMode('book');
  };

  // Formulários handlers
  const handleAddFactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;
    await addFact(newFact.trim());
    onAddNotification("Novo fato simples guardado com sucesso!", "success");
    setNewFact('');
  };

  const handleAddDateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDateLabel.trim() || !newDateVal.trim()) return;
    // MM-DD verification
    const parts = newDateVal.split('-');
    if (parts.length !== 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1])) || parts[0].length !== 2 || parts[1].length !== 2) {
      onAddNotification("O formato da data deve ser MM-DD (ex: 07-18)", "error");
      return;
    }
    await addImportantDate({
      label: newDateLabel.trim(),
      date: newDateVal.trim(),
      year: newDateYear ? Number(newDateYear) : undefined
    });
    onAddNotification("Data importante agendada com sucesso!", "success");
    setNewDateLabel('');
    setNewDateVal('');
    setNewDateYear('');
  };

  const handleAddDiarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiaryContent.trim()) return;
    await addDiaryEntry(newDiaryContent.trim(), newDiaryMood);
    onAddNotification("Nova página registrada no seu diário com sucesso!", "success");
    setNewDiaryContent('');
    setNewDiaryMood('neutral');
  };

  const handleAddSemanticSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConcept.trim() || !newDefinition.trim()) return;
    await addSemanticFact(newConcept.trim(), newDefinition.trim(), newCategory);
    onAddNotification("Fato conceitual registrado na memória semântica!", "success");
    setNewConcept('');
    setNewDefinition('');
    setNewCategory('Geral');
  };

  // Helper for rendering mood in Portuguese & emoji
  const getMoodEmojiAndLabel = (mood: string) => {
    switch (mood) {
      case 'happy': return { emoji: '😊', label: 'Feliz', color: 'text-emerald-400 bg-emerald-500/10' };
      case 'sad': return { emoji: '😢', label: 'Triste', color: 'text-blue-400 bg-blue-500/10' };
      case 'excited': return { emoji: '🔥', label: 'Animado', color: 'text-amber-400 bg-amber-500/10' };
      case 'calm': return { emoji: '🧘', label: 'Calmo', color: 'text-teal-400 bg-teal-500/10' };
      case 'tired': return { emoji: '🥱', label: 'Cansado', color: 'text-zinc-400 bg-zinc-500/10' };
      case 'thoughtful': return { emoji: '🧠', label: 'Pensativo', color: 'text-purple-400 bg-purple-500/10' };
      default: return { emoji: '😐', label: 'Neutro', color: 'text-zinc-300 bg-zinc-500/10' };
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-zinc-950 font-sans text-zinc-100">
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0 p-6 border-b border-white/5 w-full select-none">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-3 bg-white/[0.03] hover:bg-white/[0.05] transition-all text-zinc-400 border border-white/[0.05] rounded-xl cursor-pointer active:scale-95 flex items-center justify-center"
            title="Voltar ao início"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="text-left">
            <span className="block text-[9px] uppercase tracking-[0.3em] text-pink-400 font-mono font-bold">Protocolo de Cognição OSONE</span>
            <h2 className="text-lg font-bold uppercase tracking-wider text-white font-serif italic">Núcleo Evolutivo de Memória</h2>
          </div>
        </div>

        {/* Top Controls & Mode switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="bg-zinc-900 border border-white/5 p-1 rounded-xl flex flex-wrap gap-1">
            <button
              onClick={() => setViewMode('book')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all uppercase cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'book' 
                  ? 'bg-pink-500/10 border border-pink-500/20 text-pink-300' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BookOpen size={13} />
              Livro
            </button>
            <button
              onClick={() => setViewMode('index')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all uppercase cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'index' 
                  ? 'bg-pink-500/10 border border-pink-500/20 text-pink-300' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Book size={13} />
              Índice
            </button>
            <button
              onClick={() => setViewMode('facts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all uppercase cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'facts' 
                  ? 'bg-pink-500/10 border border-pink-500/20 text-pink-300' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Fatos & Datas Importantes"
            >
              <User size={13} />
              Fatos & Datas
            </button>
            <button
              onClick={() => setViewMode('diary')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all uppercase cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'diary' 
                  ? 'bg-pink-500/10 border border-pink-500/20 text-pink-300' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Meu Diário Pessoal"
            >
              <Smile size={13} />
              Diário
            </button>
            <button
              onClick={() => setViewMode('semantic')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all uppercase cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'semantic' 
                  ? 'bg-pink-500/10 border border-pink-500/20 text-pink-300' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Memória Semântica Conectada"
            >
              <Brain size={13} />
              Semântica
            </button>
          </div>

          {/* Search box (shown only for conversation memories) */}
          {(viewMode === 'book' || viewMode === 'index') && (
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-zinc-500" size={14} />
              <input
                type="text"
                placeholder="Buscar memórias..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-zinc-900/50 border border-white/5 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-pink-500/30 transition-all w-48 sm:w-60 font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 flex items-start justify-center min-h-0 bg-gradient-to-b from-zinc-950 to-zinc-900/60 custom-scrollbar">
        
        {/* VIEW: CONVERSATION MEMORY EMPTY STATE (ONLY FOR BOOK/INDEX AND TRULY EMPTY) */}
        {memories.length === 0 && (viewMode === 'book' || viewMode === 'index') ? (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md text-center p-8 bg-zinc-900/40 border border-white/5 rounded-3xl backdrop-blur-sm my-auto"
          >
            <div className="w-16 h-16 bg-pink-500/10 border border-pink-500/20 text-pink-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BookOpen size={28} className="animate-pulse" />
            </div>
            <h3 className="text-lg font-bold font-serif italic text-zinc-200 mb-2">Suas páginas estão em branco</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-6 font-sans">
              O Livro de Memórias do OSONE registra e consolida as conversas importantes do seu dia. 
              Ao finalizar ou fechar uma conversa de chat, você poderá salvá-la para que o OSONE organize os tópicos e guarde os aprendizados nestas páginas.
            </p>
            <button 
              onClick={onBack}
              className="px-5 py-2.5 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/25 rounded-xl text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer active:scale-95"
            >
              Iniciar uma conversa por Chat
            </button>
          </motion.div>
        ) : viewMode === 'index' ? (
          
          /* VIEW: INDEX / TABLE OF CONTENTS */
          <div className="w-full max-w-4xl flex flex-col gap-6 animate-in fade-in duration-300">
            <h3 className="text-xs font-mono font-bold uppercase tracking-[0.25em] text-zinc-500 mb-2">Sumário de Recordações ({memories.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {chapters.map((chap, cIdx) => (
                <div key={chap.dateStr} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Calendar size={13} className="text-pink-400" />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-pink-300 font-bold">Capítulo {chap.chapterNum}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">{chap.formattedDate}</span>
                  </div>

                  <div className="space-y-3">
                    {chap.pages.map((p) => (
                      <div 
                        key={p.memory.id} 
                        onClick={() => {
                          setActiveChapterIndex(cIdx);
                          setActivePageIndex(p.localPageNum - 1);
                          setViewMode('book');
                        }}
                        className="p-3 bg-zinc-950/40 hover:bg-pink-500/[0.03] border border-white/[0.02] hover:border-pink-500/20 rounded-xl transition-all cursor-pointer group flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <span className="text-[9px] font-mono text-zinc-500 group-hover:text-pink-400 transition-colors">Página {p.globalPageNum}</span>
                          <h4 className="text-xs font-bold text-zinc-300 group-hover:text-white transition-colors truncate mt-0.5">{p.memory.title}</h4>
                          <p className="text-[10px] text-zinc-400 line-clamp-1 mt-1 font-sans">{p.memory.summary}</p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteMemory(p.memory.id, e)}
                          className="p-1.5 hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 rounded-lg transition-all"
                          title="Excluir do Livro"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
        ) : viewMode === 'book' ? (
          
          /* VIEW: BOOK LAYOUT MODE */
          <div className="w-full max-w-4xl flex flex-col gap-6 select-none my-auto">
            {/* Book Layout Frame */}
            <div className="relative bg-[#1a1917] p-4 md:p-6 rounded-[2.5rem] shadow-[0_30px_70px_rgba(0,0,0,0.8)] border border-[#2e2d2a] select-text">
              {/* Spine Gutter Ring Binder Decoration */}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4 flex flex-col justify-around py-12 pointer-events-none z-20 hidden md:flex">
                {[1, 2, 3, 4, 5, 6, 7].map((binder) => (
                  <div key={binder} className="relative w-8 h-3 -left-2 bg-gradient-to-r from-zinc-400 via-zinc-100 to-zinc-500 rounded-full border border-black/30 shadow-md">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/40" />
                  </div>
                ))}
              </div>

              {/* Book Layout Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 bg-[#fcfaf4] rounded-2xl min-h-[520px] md:min-h-[550px] relative overflow-hidden shadow-inner">
                
                {/* Left Page: Chapter Title / Navigation Bookmarks */}
                <div className="border-r border-black/10 p-6 md:p-8 flex flex-col justify-between bg-gradient-to-r from-[#fbf9f2] to-[#f5f2e8] relative select-none">
                  {/* Page texture overlay */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-white/30 via-transparent to-transparent opacity-75 pointer-events-none" />
                  
                  {/* Date Badge / Chapter number */}
                  <div className="flex items-center justify-between border-b border-black/5 pb-3">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-zinc-600" />
                      <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-700 font-bold">
                        Capítulo {currentChapter ? currentChapter.chapterNum : '-'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-semibold text-zinc-600">
                      {currentChapter ? currentChapter.formattedDate : 'Nova Data'}
                    </span>
                  </div>

                  {/* Left content center */}
                  <div className="my-auto py-8">
                    {currentChapter ? (
                      <div className="space-y-6 text-left">
                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-pink-600 block font-bold">Resumo Diário</span>
                        <h3 className="text-2xl font-serif italic text-zinc-800 leading-tight font-light">
                          {currentPage ? currentPage.memory.title : 'Sem Título'}
                        </h3>
                        <p className="text-xs text-zinc-700 leading-relaxed font-serif italic border-l-2 border-zinc-300 pl-4 bg-zinc-400/5 py-1">
                          "{currentPage ? currentPage.memory.summary : ''}"
                        </p>
                        
                        {/* Topic tags */}
                        {currentPage && currentPage.memory.topics.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-2">
                            {currentPage.memory.topics.map((topic, i) => (
                              <span 
                                key={i}
                                className="px-2 py-0.5 bg-zinc-800/5 text-[9px] text-zinc-700 font-mono rounded border border-black/5"
                              >
                                #{topic}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center text-zinc-400 py-12">
                        <p className="text-sm">Nenhuma memória no momento.</p>
                      </div>
                    )}
                  </div>

                  {/* Left Footer: Day bookmark and navigation */}
                  <div className="flex items-center justify-between border-t border-black/5 pt-3 text-[10px] font-mono text-zinc-500">
                    <span>OSONE MEMORY BOOK</span>
                    <span>DAY #{currentChapter ? currentChapter.chapterNum : 1}</span>
                  </div>
                </div>

                {/* Right Page: Key Points and Action checklist */}
                <div className="p-6 md:p-8 flex flex-col justify-between bg-gradient-to-l from-[#fbf9f2] to-[#f8f5eb] relative text-left">
                  {/* Page texture overlay */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/30 via-transparent to-transparent opacity-75 pointer-events-none" />
                  
                  {/* Page Title & Delete */}
                  <div className="flex items-center justify-between border-b border-black/5 pb-3 select-none">
                    <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-500 font-bold">Anais de Diálogo</span>
                    {currentPage && (
                      <button
                        onClick={(e) => handleDeleteMemory(currentPage.memory.id, e)}
                        className="p-1 hover:bg-black/5 rounded-lg text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Remover esta página do livro"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Key Points list */}
                  <div className="my-auto py-4 select-text">
                    {currentPage ? (
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-700 font-bold flex items-center gap-1.5">
                          <Sparkles size={11} className="text-pink-600 animate-pulse" />
                          Pontos Relevantes
                        </h4>
                        
                        <div className="space-y-3 font-serif text-xs text-zinc-800 leading-relaxed">
                          {currentPage.memory.keyPoints && currentPage.memory.keyPoints.length > 0 ? (
                            currentPage.memory.keyPoints.map((point, index) => (
                              <motion.div 
                                key={index} 
                                initial={{ opacity: 0, x: 5 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="flex items-start gap-2.5"
                              >
                                <span className="text-pink-500 font-bold text-xs select-none">•</span>
                                <p className="flex-1">{point}</p>
                              </motion.div>
                            ))
                          ) : (
                            <p className="text-zinc-500 italic">Sem pontos registrados nesta conversa.</p>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div className="pt-2 text-[8px] font-mono text-zinc-500 flex items-center gap-1 select-none">
                          <Clock size={10} />
                          <span>Registrado às {new Date(currentPage.memory.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-zinc-400 py-12 select-none">
                        <p className="text-sm">Vazio</p>
                      </div>
                    )}
                  </div>

                  {/* Right Footer: Global Page number and page turning */}
                  <div className="flex items-center justify-between border-t border-black/5 pt-3 text-[10px] font-mono text-zinc-600 select-none">
                    <span>
                      {currentPage ? `Pág. ${currentPage.globalPageNum}` : 'Pág. -'}
                    </span>
                    <span className="font-semibold text-zinc-700">
                      {currentPage ? `Folha ${currentPage.localPageNum} de ${currentChapter?.pages.length}` : ''}
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Pagination controls */}
            <div className="flex items-center justify-between px-2 text-zinc-400">
              <button
                onClick={handlePrevPage}
                disabled={activeChapterIndex === 0 && activePageIndex === 0}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/5 hover:border-white/10 hover:bg-zinc-800/80 rounded-xl transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-xs font-mono font-bold tracking-wider uppercase active:scale-95"
              >
                <ChevronLeft size={16} />
                Anterior
              </button>

              <div className="text-xs font-mono text-zinc-500 bg-zinc-900/40 border border-white/5 py-1.5 px-4 rounded-full flex items-center gap-2">
                <span>Capítulo {activeChapterIndex + 1} de {chapters.length}</span>
                <span className="text-zinc-700">|</span>
                <span>Pág. {currentPage ? currentPage.globalPageNum : 0} de {memories.length}</span>
              </div>

              <button
                onClick={handleNextPage}
                disabled={
                  activeChapterIndex === chapters.length - 1 && 
                  activePageIndex === (chapters[activeChapterIndex]?.pages.length - 1)
                }
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/5 hover:border-white/10 hover:bg-zinc-800/80 rounded-xl transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-xs font-mono font-bold tracking-wider uppercase active:scale-95"
              >
                Próxima
                <ChevronRight size={16} />
              </button>
            </div>
            
            {/* Quick chapters bookmark bar */}
            <div className="flex flex-col gap-2 pt-2 select-none">
              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold text-left">Marcadores de Capítulos (Datas)</span>
              <div className="flex flex-wrap gap-2">
                {chapters.map((chap, idx) => (
                  <button
                    key={chap.dateStr}
                    onClick={() => handleJumpToChapter(idx)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-mono tracking-wider transition-all border cursor-pointer flex items-center gap-1.5 ${
                      idx === activeChapterIndex
                        ? 'bg-pink-500/10 border-pink-500/20 text-pink-300 font-bold shadow-[0_0_10px_rgba(244,63,94,0.1)]'
                        : 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Bookmark size={10} className={idx === activeChapterIndex ? "text-pink-400 fill-pink-400/20" : "text-zinc-500"} />
                    <span>Cap. {chap.chapterNum}: {chap.dateStr.split('-').reverse().slice(0, 2).join('/')}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
          
        ) : viewMode === 'facts' ? (
          
          /* VIEW: FACTS & IMPORTANT DATES */
          <div className="w-full max-w-4xl flex flex-col md:grid md:grid-cols-2 gap-8 animate-in fade-in duration-300 text-left">
            
            {/* Left Col: Simple Facts Ledger */}
            <div className="flex flex-col gap-6">
              <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <User className="text-pink-400" size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">Livro de Fatos Simples</h3>
                </div>
                
                <p className="text-xs text-zinc-400 mb-6 font-sans leading-relaxed">
                  Estes são os fatos objetivos que o OSONE aprendeu sobre você (seus gostos, rotinas, traços). Você pode registrar novos fatos diretamente abaixo.
                </p>

                {/* Add Fact Form */}
                <form onSubmit={handleAddFactSubmit} className="flex gap-2 mb-6">
                  <input
                    type="text"
                    value={newFact}
                    onChange={(e) => setNewFact(e.target.value)}
                    placeholder="Adicione um fato (ex: Gosto de café sem açúcar)"
                    className="flex-1 px-4 py-2 bg-zinc-950/80 border border-white/5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-pink-500/30 transition-all font-sans"
                  />
                  <button
                    type="submit"
                    className="p-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
                    title="Adicionar Fato"
                  >
                    <Plus size={16} />
                  </button>
                </form>

                {/* Facts Stream */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                  {memory.facts && memory.facts.length > 0 ? (
                    memory.facts.map((fact, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-3 bg-zinc-950/40 border border-white/[0.03] rounded-xl flex items-start gap-3 text-xs text-zinc-300 font-sans"
                      >
                        <span className="text-pink-500 mt-0.5">•</span>
                        <span className="flex-1">{fact}</span>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-zinc-500 italic text-xs font-sans">
                      Nenhum fato simples registrado ainda. Escreva acima!
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Col: Important Dates Ledger */}
            <div className="flex flex-col gap-6">
              <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="text-pink-400" size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">Datas Importantes & Festividades</h3>
                </div>

                <p className="text-xs text-zinc-400 mb-6 font-sans leading-relaxed">
                  Registre datas comemorativas, aniversários ou lembretes sazonais. O OSONE as lembrará inteligentemente em suas conversas!
                </p>

                {/* Add Date Form */}
                <form onSubmit={handleAddDateSubmit} className="space-y-3 mb-6 bg-zinc-950/30 p-3.5 border border-white/5 rounded-2xl">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDateLabel}
                      onChange={(e) => setNewDateLabel(e.target.value)}
                      placeholder="Título / Descrição (ex: Meu Aniversário)"
                      className="flex-1 px-3 py-2 bg-zinc-950/80 border border-white/5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-pink-500/30 transition-all font-sans"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newDateVal}
                      onChange={(e) => setNewDateVal(e.target.value)}
                      placeholder="Data MM-DD (ex: 12-25)"
                      maxLength={5}
                      className="px-3 py-2 bg-zinc-950/80 border border-white/5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-pink-500/30 transition-all font-mono text-center"
                      required
                    />
                    <input
                      type="number"
                      value={newDateYear}
                      onChange={(e) => setNewDateYear(e.target.value)}
                      placeholder="Ano (Opcional)"
                      className="px-3 py-2 bg-zinc-950/80 border border-white/5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-pink-500/30 transition-all font-mono text-center"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/20 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Plus size={14} />
                    Agendar Data Importante
                  </button>
                </form>

                {/* Upcoming & All Dates List */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-widest text-pink-400 font-bold mb-2 flex items-center gap-1">
                      <Sparkles size={11} className="animate-pulse" /> Próximas Datas Detectadas
                    </h4>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                      {getUpcomingDates().length > 0 ? (
                        getUpcomingDates().map((d, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-pink-500/5 border border-pink-500/10 rounded-xl flex items-center justify-between text-xs font-sans"
                          >
                            <span className="font-medium text-pink-200">{d.label}</span>
                            <span className="font-mono text-pink-400 font-bold bg-pink-500/10 px-2 py-0.5 rounded-lg text-[10px]">
                              {d.date.split('-').reverse().join('/')}
                              {d.year ? `/${d.year}` : ''}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-zinc-500 italic text-[11px] font-sans">
                          Nenhuma data futura próxima agendada.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-3">
                    <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold mb-2">Todas as Datas Registradas ({memory.importantDates?.length || 0})</h4>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                      {memory.importantDates && memory.importantDates.length > 0 ? (
                        memory.importantDates.map((d, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-zinc-950/40 border border-white/[0.02] rounded-xl flex items-center justify-between text-xs font-sans text-zinc-400"
                          >
                            <span>{d.label}</span>
                            <span className="font-mono text-[10px]">
                              {d.date.split('-').reverse().join('/')}
                              {d.year ? `/${d.year}` : ''}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-2 text-zinc-600 italic text-[11px] font-sans">
                          Nenhuma data no catálogo.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
          
        ) : viewMode === 'diary' ? (
          
          /* VIEW: PERSONAL DIARY PAGE */
          <div className="w-full max-w-2xl flex flex-col gap-6 animate-in fade-in duration-300 text-left">
            
            {/* Diary Input Section */}
            <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <Smile className="text-pink-400" size={18} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Meu Diário Íntimo</h3>
              </div>
              
              <p className="text-xs text-zinc-400 mb-6 font-sans leading-relaxed">
                Registre uma reflexão diária, seus humores ou acontecimentos importantes. Estes dados permanecem encriptados localmente em sua sandbox privada.
              </p>

              <form onSubmit={handleAddDiarySubmit} className="space-y-4">
                <textarea
                  value={newDiaryContent}
                  onChange={(e) => setNewDiaryContent(e.target.value)}
                  placeholder="Querido diário... O que está passando por sua mente hoje?"
                  rows={4}
                  className="w-full p-4 bg-zinc-950/80 border border-white/5 rounded-2xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-pink-500/30 transition-all font-serif italic"
                  required
                />
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Mood selection */}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Como se sente?</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['happy', 'sad', 'excited', 'calm', 'tired', 'thoughtful', 'neutral'].map((m) => {
                        const mInfo = getMoodEmojiAndLabel(m);
                        const isSelected = newDiaryMood === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setNewDiaryMood(m)}
                            className={`p-2 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                              isSelected 
                                ? 'bg-pink-500/15 border-pink-500/25 text-pink-300' 
                                : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/10'
                            }`}
                            title={mInfo.label}
                          >
                            <span>{mInfo.emoji}</span>
                            {isSelected && <span className="text-[9px] font-mono font-bold uppercase tracking-wider hidden sm:inline">{mInfo.label}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shrink-0"
                  >
                    <Plus size={14} />
                    Gravar Página
                  </button>
                </div>
              </form>
            </div>

            {/* Diary Entries List */}
            <div className="space-y-4">
              <h4 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Páginas de Reflexão Recentes ({diary.length})</h4>
              
              <div className="space-y-4">
                {diary && diary.length > 0 ? (
                  diary.map((entry) => {
                    const mInfo = getMoodEmojiAndLabel(entry.mood);
                    // Handle timestamp display safely
                    let dateStr = "Recent";
                    if (entry.createdAt && typeof entry.createdAt.toDate === 'function') {
                      try {
                        dateStr = entry.createdAt.toDate().toLocaleDateString('pt-BR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                      } catch {}
                    }
                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all flex gap-4"
                      >
                        {/* Mood Icon column */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border border-white/5 ${mInfo.color}`}>
                            <span className="text-lg">{mInfo.emoji}</span>
                          </div>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mt-1.5">{mInfo.label}</span>
                        </div>

                        {/* Content column */}
                        <div className="flex-1 min-w-0">
                          <span className="text-[9px] font-mono text-zinc-500">{dateStr}</span>
                          <p className="text-xs text-zinc-300 font-serif italic mt-2 leading-relaxed whitespace-pre-wrap">
                            "{entry.content}"
                          </p>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 bg-zinc-900/10 border border-dashed border-white/5 rounded-2xl text-zinc-500 italic text-xs font-sans">
                    Nenhum diário registrado ainda. Que tal escrever sua primeira reflexão acima?
                  </div>
                )}
              </div>
            </div>

          </div>
          
        ) : (
          
          /* VIEW: SEMANTIC MEMORY FACTS (CONCEPTS) */
          <div className="w-full max-w-4xl flex flex-col md:grid md:grid-cols-3 gap-8 animate-in fade-in duration-300 text-left">
            
            {/* Left Column: Form to define new concepts */}
            <div className="md:col-span-1">
              <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-sm sticky top-4">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="text-pink-400" size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">Consolidador Semântico</h3>
                </div>

                <p className="text-xs text-zinc-400 mb-6 font-sans leading-relaxed">
                  Insira conceitos, jargões, filosofias, ou saberes intelectuais importantes. O OSONE os conectará de forma profunda aos fluxos de RAG da IA.
                </p>

                <form onSubmit={handleAddSemanticSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-mono uppercase tracking-widest text-zinc-400 mb-1.5">Conceito / Termo</label>
                    <input
                      type="text"
                      value={newConcept}
                      onChange={(e) => setNewConcept(e.target.value)}
                      placeholder="Conceito (ex: Ikigai)"
                      className="w-full px-3 py-2 bg-zinc-950/80 border border-white/5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-pink-500/30 transition-all font-sans"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-mono uppercase tracking-widest text-zinc-400 mb-1.5">Definição / Explicação</label>
                    <textarea
                      value={newDefinition}
                      onChange={(e) => setNewDefinition(e.target.value)}
                      placeholder="Definição aprofundada ou insight conceitual..."
                      rows={4}
                      className="w-full p-3 bg-zinc-950/80 border border-white/5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-pink-500/30 transition-all font-sans"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-mono uppercase tracking-widest text-zinc-400 mb-1.5">Categoria</label>
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="Categoria (ex: Filosofia Japonesa)"
                      className="w-full px-3 py-2 bg-zinc-950/80 border border-white/5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-pink-500/30 transition-all font-sans"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Plus size={14} />
                    Consolidar Termo
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Grid list of concepts (Semantic memory cards) */}
            <div className="md:col-span-2 flex flex-col gap-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Catálogo de Memória Semântica ({memory.semanticMemory?.length || 0})</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {memory.semanticMemory && memory.semanticMemory.length > 0 ? (
                  memory.semanticMemory.map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="p-5 bg-zinc-900/30 border border-white/5 rounded-2xl hover:border-white/10 hover:bg-zinc-900/50 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                          <Tag className="text-pink-400" size={10} />
                          <span className="text-[9px] font-mono uppercase text-pink-300 font-bold bg-pink-500/10 px-2 py-0.5 rounded-md">
                            {item.category || 'Conceito'}
                          </span>
                        </div>
                        
                        <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wide font-mono">{item.concept}</h4>
                        <p className="text-[11px] text-zinc-400 leading-relaxed font-sans line-clamp-4">
                          {item.definition}
                        </p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-2 text-center py-16 bg-zinc-900/10 border border-dashed border-white/5 rounded-2xl text-zinc-500 italic text-xs font-sans">
                    Nenhum conceito estruturado na memória conceitual. Adicione ao lado para treinar a inteligência OSONE!
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
