import { useState, useEffect, useCallback } from 'react';
import { Timestamp } from '../firebase';

export interface ImportantDate {
  label: string;
  date: string; // MM-DD format
  year?: number;
}

export interface SemanticFact {
  concept: string;
  definition: string;
  category: string;
  embedding?: number[];
}

export interface ConversationSummary {
  summary: string;
  topics: string[];
  createdAt: Timestamp;
  embedding?: number[];
}

export interface DiaryEntry {
  id?: string;
  content: string;
  mood: string;
  createdAt: Timestamp;
  userId: string;
}

export interface UserMemory {
  facts: string[];
  preferences: string[];
  importantDates: ImportantDate[];
  workspace?: string;
  semanticMemory: SemanticFact[];
  summaries: ConversationSummary[];
}

function deserializeMemory(data: any): UserMemory {
  if (!data) return { facts: [], preferences: [], importantDates: [], semanticMemory: [], summaries: [] };
  return {
    ...data,
    facts: data.facts || [],
    preferences: data.preferences || [],
    importantDates: data.importantDates || [],
    semanticMemory: data.semanticMemory || [],
    summaries: (data.summaries || []).map((s: any) => {
      let ts = Timestamp.now();
      if (s.createdAt) {
        const sec = typeof s.createdAt.seconds === 'number' ? s.createdAt.seconds : (s.createdAt._seconds || 0);
        const nano = typeof s.createdAt.nanoseconds === 'number' ? s.createdAt.nanoseconds : (s.createdAt._nanoseconds || 0);
        ts = new Timestamp(sec, nano);
      }
      return {
        ...s,
        createdAt: ts
      };
    })
  };
}

function deserializeDiary(entries: any[]): DiaryEntry[] {
  if (!entries) return [];
  return entries.map((e: any) => {
    let ts = Timestamp.now();
    if (e.createdAt) {
      const sec = typeof e.createdAt.seconds === 'number' ? e.createdAt.seconds : (e.createdAt._seconds || 0);
      const nano = typeof e.createdAt.nanoseconds === 'number' ? e.createdAt.nanoseconds : (e.createdAt._nanoseconds || 0);
      ts = new Timestamp(sec, nano);
    }
    return {
      ...e,
      createdAt: ts
    };
  });
}

export function useUserMemory() {
  const [userId, setUserId] = useState<string>(() => {
    try {
      const savedUserStr = localStorage.getItem('osone_last_active_user');
      if (savedUserStr) {
        const parsed = JSON.parse(savedUserStr);
        return parsed?.uid || 'guest';
      }
    } catch {}
    return 'guest';
  });

  const [memory, setMemory] = useState<UserMemory>({
    facts: [],
    preferences: [],
    importantDates: [],
    semanticMemory: [],
    summaries: []
  });
  
  const [diary, setDiary] = useState<DiaryEntry[]>([]);

  // Keep userId in sync if the local storage changes or profile changes
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const savedUserStr = localStorage.getItem('osone_last_active_user');
        if (savedUserStr) {
          const parsed = JSON.parse(savedUserStr);
          const currentUid = parsed?.uid || 'guest';
          if (currentUid !== userId) {
            setUserId(currentUid);
          }
        } else if (userId !== 'guest') {
          setUserId('guest');
        }
      } catch {}
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('osone_user_changed', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('osone_user_changed', handleStorageChange);
    };
  }, [userId]);

  // Carrega a Memória e o Diário do localStorage do usuário ativo
  useEffect(() => {
    if (!userId) {
      setMemory({ facts: [], preferences: [], importantDates: [], semanticMemory: [], summaries: [] });
      return;
    }

    const memoryKey = `nash_memory_${userId}`;
    const diaryKey = `nash_diary_${userId}`;

    const storedMemory = localStorage.getItem(memoryKey);
    if (storedMemory) {
      try {
        setMemory(deserializeMemory(JSON.parse(storedMemory)));
      } catch (e) {
        console.error('Erro ao analisar a memória do usuário:', e);
      }
    } else {
      setMemory({ facts: [], preferences: [], importantDates: [], semanticMemory: [], summaries: [] });
    }

    const storedDiary = localStorage.getItem(diaryKey);
    if (storedDiary) {
      try {
        setDiary(deserializeDiary(JSON.parse(storedDiary)));
      } catch (e) {
        console.error('Erro ao analisar as entradas do diário:', e);
      }
    } else {
      setDiary([]);
    }
  }, [userId]);

  // Salva qualquer alteração parcial na memória
  const saveMemory = useCallback(async (partial: Partial<UserMemory>) => {
    if (!userId) return;
    const memoryKey = `nash_memory_${userId}`;
    
    const cleanPartial = Object.fromEntries(
      Object.entries(partial).filter(([_, v]) => v !== undefined)
    );

    setMemory(prev => {
      const updated = { ...prev, ...cleanPartial };
      localStorage.setItem(memoryKey, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  // Adiciona um fato simples sobre o usuário
  const addFact = useCallback(async (fact: string) => {
    if (!userId) return;
    const memoryKey = `nash_memory_${userId}`;

    setMemory(prev => {
      const updated = {
        ...prev,
        facts: [...(prev.facts || []), fact]
      };
      localStorage.setItem(memoryKey, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  // Adiciona datas comemorativas importantes
  const addImportantDate = useCallback(async (date: ImportantDate) => {
    if (!userId) return;
    const memoryKey = `nash_memory_${userId}`;

    setMemory(prev => {
      const newDate: any = { label: date.label, date: date.date };
      if (date.year) newDate.year = date.year;
      const updated = {
        ...prev,
        importantDates: [...(prev.importantDates || []), newDate]
      };
      localStorage.setItem(memoryKey, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  // Registra uma nova página no diário pessoal
  const addDiaryEntry = useCallback(async (content: string, mood?: string) => {
    if (!userId) return;
    const diaryKey = `nash_diary_${userId}`;

    const newEntry: DiaryEntry = {
      id: Math.random().toString(36).substring(7),
      content,
      mood: mood || 'neutral',
      createdAt: Timestamp.now(),
      userId
    };

    setDiary(prev => {
      const updated = [newEntry, ...prev].slice(0, 50);
      localStorage.setItem(diaryKey, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  // Métodos utilitários de busca de datas próximas
  const getUpcomingDates = useCallback(() => {
    if (!memory.importantDates) return [];
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDate = today.getDate();

    return memory.importantDates.filter(d => {
      const [m, day] = d.date.split('-').map(Number);
      if (m > currentMonth) return true;
      if (m === currentMonth && day >= currentDate) return true;
      return false;
    }).sort((a, b) => {
      const [am, ad] = a.date.split('-').map(Number);
      const [bm, bd] = b.date.split('-').map(Number);
      return am !== bm ? am - bm : ad - bd;
    });
  }, [memory.importantDates]);

  // Atualiza a área de rascunhos (Workspace) temporária
  const updateWorkspace = useCallback(async (content: string) => {
    if (!userId) return;
    const memoryKey = `nash_memory_${userId}`;

    setMemory(prev => {
      const updated = {
        ...prev,
        workspace: content
      };
      localStorage.setItem(memoryKey, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  const clearWorkspace = useCallback(async () => {
    if (!userId) return;
    const memoryKey = `nash_memory_${userId}`;

    setMemory(prev => {
      const { workspace, ...rest } = prev;
      localStorage.setItem(memoryKey, JSON.stringify(rest));
      return rest;
    });
  }, [userId]);

  // Adiciona memórias semânticas explicativas complexas
  const addSemanticFact = useCallback(async (concept: string, definition: string, category: string, embedding?: number[]) => {
    if (!userId) return;
    const memoryKey = `nash_memory_${userId}`;

    setMemory(prev => {
      const newFact: any = { concept, definition, category };
      if (embedding) newFact.embedding = embedding;
      const updated = {
        ...prev,
        semanticMemory: [...(prev.semanticMemory || []), newFact]
      };
      localStorage.setItem(memoryKey, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  // Salva resumos de conversações anteriores para o protocolo RAG da IA
  const addSummary = useCallback(async (summary: string, topics: string[], embedding?: number[]) => {
    if (!userId) return;
    const memoryKey = `nash_memory_${userId}`;

    setMemory(prev => {
      const newSummary: any = { summary, topics, createdAt: Timestamp.now() };
      if (embedding) newSummary.embedding = embedding;
      const updated = {
        ...prev,
        summaries: [...(prev.summaries || []), newSummary]
      };
      localStorage.setItem(memoryKey, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  return {
    userId,
    memory,
    diary,
    saveMemory,
    addFact,
    addImportantDate,
    addDiaryEntry,
    getUpcomingDates,
    updateWorkspace,
    clearWorkspace,
    addSemanticFact,
    addSummary
  };
}
