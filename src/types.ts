export interface AIProfile {
  name: string;
  personality: string;
  writingStyle: string;
  obsidianConfig?: {
    baseUrl: string;
    apiKey: string;
    vaultName?: string;
  };
}

export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  isLocal?: boolean;
}

export interface ApiKeys {
  gemini: string;
  googleHomeId?: string;
  googleHomeToken?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsVoiceId2?: string;
  elevenLabsVoiceId3?: string;
  elevenLabsActiveVoice?: 'voice1' | 'voice2' | 'voice3';
  elevenLabsStability?: number;
  elevenLabsSimilarityBoost?: number;
  elevenLabsStyle?: number;
  elevenLabsSpeakerBoost?: boolean;
  elevenLabsModel?: string;
  geminiModel?: 'gemini-3.6-flash' | 'gemini-3.5-flash-lite' | 'gemini-3.1-flash-lite' | 'gemini-2.5-flash' | 'gemini-3.5-flash';
  googleCustomSearchApiKey?: string;
  googleCustomSearchCx?: string;
  tavilyApiKey?: string;
}

export type OrbStyle = 'classic' | 'superintelligence' | 'neural' | 'shadow' | 'wave' | 'jarvis' | 'smoke';
export type AppTheme = 'her' | 'cyberpunk' | 'monochrome' | 'nature';

export type WorkspaceMode = 'home' | 'writing' | 'code' | 'sounds' | 'canvas' | 'wellness' | 'local_control' | 'whatsapp' | 'map' | 'rag' | 'creator' | 'tiktok' | 'sentinel' | 'sensus_evolution' | 'memory_book' | 'smarthome';

export interface SmartDevice {
  id: string;
  name: string;
  category: 'light' | 'plug' | 'switch' | 'thermostat' | 'lock' | 'sensor' | 'tv' | 'fan';
  platform: 'tuya' | 'hue' | 'smartthings' | 'custom';
  state: boolean;
  value?: number; // brightness, temp, level
  color?: string;
  room?: string;
  online: boolean;
  lastUpdated: number;
}

export interface SmartHomeConfig {
  tuya: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    region: 'us' | 'eu' | 'cn' | 'in';
    userToken?: string;
    linkedAccountEmail?: string;
  };
  hue: {
    enabled: boolean;
    bridgeIp?: string;
    accessToken?: string;
    username?: string;
  };
  smartthings: {
    enabled: boolean;
    personalAccessToken?: string;
    locationId?: string;
  };
}

export interface SmartRoutine {
  id: string;
  name: string;
  icon: string;
  actions: {
    deviceId: string;
    targetState: boolean;
    targetValue?: number;
    targetColor?: string;
  }[];
}

export interface CodeRepositoryFile {
  id: string;
  name: string;
  language: string;
  content: string;
  updatedAt: number;
  isMain?: boolean;
}

export interface MemoryBookEntry {
  id: string;
  date: string; // Formato "YYYY-MM-DD" para ordenamento
  title: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  createdAt: number;
}

export interface RagFile {
  id: string;
  name: string;
  path: string;
  content: string;
  size: number;
  type: string;
  isActive: boolean;
}

export interface DrawingObject {
  id: string;
  type: 'line' | 'rect' | 'circle' | 'text' | 'image';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  color?: string;
  text?: string;
  fontSize?: number;
  points?: number[]; // For lines/polygons
  stroke?: string;
  fill?: string;
  opacity?: number;
}

export interface SoundEffect {
  id: string;
  name: string;
  category: string;
  url: string;
}

export interface Character {
  id: string;
  name: string;
  characteristics: string;
  imageUrl?: string;
}

export interface WebtoonPanel {
  id: string;
  imageUrl?: string;
  dialogue: string;
  narration: string;
  panelNumber: number;
  imagePrompt?: string;
}

export interface WebtoonProject {
  id: string;
  title: string;
  idea: string;
  characters: Character[];
  style: string;
  language: string;
  panels: WebtoonPanel[];
  createdAt: number;
}

export interface VirtualFile {
  id: string;
  name: string;
  content: string;
  type: 'file';
}

export interface VirtualFolder {
  id: string;
  name: string;
  children: FileSystemItem[];
  type: 'folder';
}

export type FileSystemItem = VirtualFile | VirtualFolder;

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

export interface SkeletonPlan {
  id: string;
  title: string;
  content: string; // Markdown
  status: 'pending' | 'approved' | 'rejected';
}

export interface LiveState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export interface VoiceModulation {
  pitch: number;
  rate: number;
  distortion: number;
}

export interface WritingProject {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}



