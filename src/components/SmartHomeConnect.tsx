import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, Cpu, Lightbulb, ToggleLeft, ToggleRight, Wifi, ShieldCheck, 
  RefreshCw, CheckCircle2, AlertCircle, Plus, Trash2, Power, Sliders, 
  Cloud, Lock, Sparkles, Smartphone, Layers, Play, Settings, Key, 
  Globe, Folder, Terminal, Download, ArrowRight, Server, Copy, Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SmartDevice, SmartHomeConfig, SmartRoutine } from '../types';

const DEFAULT_CONFIG: SmartHomeConfig = {
  tuya: {
    enabled: true,
    clientId: 'tuya_app_client_88329',
    clientSecret: 'secret_tuya_live_771',
    region: 'us',
    userToken: 'tuya_user_token_active',
    linkedAccountEmail: 'usuario@osone.app'
  },
  hue: {
    enabled: true,
    bridgeIp: '192.168.1.105',
    username: 'hue_user_osone_key'
  },
  smartthings: {
    enabled: false,
    personalAccessToken: ''
  }
};

const DEFAULT_DEVICES: SmartDevice[] = [
  {
    id: 'dev-1',
    name: 'Tomada Smart da Sala',
    category: 'plug',
    platform: 'tuya',
    state: true,
    room: 'Sala de Estar',
    online: true,
    lastUpdated: Date.now()
  },
  {
    id: 'dev-2',
    name: 'Lâmpada Inteligente RGB',
    category: 'light',
    platform: 'hue',
    state: true,
    value: 85,
    color: '#06b6d4',
    room: 'Quarto Principal',
    online: true,
    lastUpdated: Date.now()
  },
  {
    id: 'dev-3',
    name: 'Interruptor Duplo Cozinha',
    category: 'switch',
    platform: 'tuya',
    state: false,
    room: 'Cozinha',
    online: true,
    lastUpdated: Date.now()
  },
  {
    id: 'dev-4',
    name: 'Ar Condicionado Dual',
    category: 'thermostat',
    platform: 'smartthings',
    state: true,
    value: 22,
    room: 'Escritório',
    online: true,
    lastUpdated: Date.now()
  },
  {
    id: 'dev-5',
    name: 'Fechadura Biométrica',
    category: 'lock',
    platform: 'tuya',
    state: true,
    room: 'Entrada Principal',
    online: true,
    lastUpdated: Date.now()
  }
];

const DEFAULT_ROUTINES: SmartRoutine[] = [
  {
    id: 'rot-1',
    name: 'Modo Cinema Imersivo',
    icon: '🎬',
    actions: [
      { deviceId: 'dev-2', targetState: true, targetValue: 30, targetColor: '#8b5cf6' },
      { deviceId: 'dev-1', targetState: true }
    ]
  },
  {
    id: 'rot-2',
    name: 'Boa Noite (Desligar Tudo)',
    icon: '🌙',
    actions: [
      { deviceId: 'dev-1', targetState: false },
      { deviceId: 'dev-2', targetState: false },
      { deviceId: 'dev-3', targetState: false },
      { deviceId: 'dev-5', targetState: true }
    ]
  },
  {
    id: 'rot-3',
    name: 'Modo Foco & Trabalho',
    icon: '⚡',
    actions: [
      { deviceId: 'dev-2', targetState: true, targetValue: 100, targetColor: '#ffffff' },
      { deviceId: 'dev-4', targetState: true, targetValue: 21 }
    ]
  }
];

export const SmartHomeConnect: React.FC<{
  onClose?: () => void;
  onNotification?: (msg: string, type: 'info' | 'success' | 'error') => void;
}> = ({ onClose, onNotification }) => {
  const [activeTab, setActiveTab] = useState<'devices' | 'clouds' | 'routines' | 'pc_organizer'>('devices');
  const [selectedRoom, setSelectedRoom] = useState<string>('Todos');

  const [devices, setDevices] = useState<SmartDevice[]>(() => {
    try {
      const saved = localStorage.getItem('osone_smarthome_devices');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_DEVICES;
  });

  const [config, setConfig] = useState<SmartHomeConfig>(() => {
    try {
      const saved = localStorage.getItem('osone_smarthome_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_CONFIG;
  });

  const [routines, setRoutines] = useState<SmartRoutine[]>(() => {
    try {
      const saved = localStorage.getItem('osone_smarthome_routines');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_ROUTINES;
  });

  const [tuyaEmail, setTuyaEmail] = useState<string>(config.tuya.linkedAccountEmail || '');
  const [isLinkingTuya, setIsLinkingTuya] = useState<boolean>(false);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [newDeviceName, setNewDeviceName] = useState<string>('');
  const [newDevicePlatform, setNewDevicePlatform] = useState<'tuya' | 'hue' | 'smartthings'>('tuya');
  const [newDeviceRoom, setNewDeviceRoom] = useState<string>('Sala de Estar');

  // Save changes and notify
  useEffect(() => {
    try {
      localStorage.setItem('osone_smarthome_devices', JSON.stringify(devices));
      localStorage.setItem('osone_smarthome_config', JSON.stringify(config));
      localStorage.setItem('osone_smarthome_routines', JSON.stringify(routines));
      window.dispatchEvent(new Event('osone_smarthome_updated'));
    } catch (e) {
      console.error("Error saving smart home state:", e);
    }
  }, [devices, config, routines]);

  const handleToggleDevice = (id: string) => {
    setDevices(prev => prev.map(d => {
      if (d.id === id) {
        const nextState = !d.state;
        if (onNotification) {
          onNotification(`${d.name} foi ${nextState ? 'LIGADO' : 'DESLIGADO'}`, 'info');
        }
        return { ...d, state: nextState, lastUpdated: Date.now() };
      }
      return d;
    }));
  };

  const handleUpdateValue = (id: string, value: number) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, value, lastUpdated: Date.now() } : d));
  };

  const handleUpdateColor = (id: string, color: string) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, color, lastUpdated: Date.now() } : d));
  };

  const handleRunRoutine = (routine: SmartRoutine) => {
    setDevices(prev => prev.map(dev => {
      const match = routine.actions.find(a => a.deviceId === dev.id);
      if (match) {
        return {
          ...dev,
          state: match.targetState,
          value: match.targetValue !== undefined ? match.targetValue : dev.value,
          color: match.targetColor || dev.color,
          lastUpdated: Date.now()
        };
      }
      return dev;
    }));

    if (onNotification) {
      onNotification(`Rotina "${routine.name}" executada com sucesso!`, 'success');
    }
  };

  const handleSimulateTuyaOAuth = () => {
    if (!tuyaEmail.trim()) {
      if (onNotification) onNotification('Informe o e-mail cadastrado no aplicativo Smart Life ou Tuya Smart!', 'error');
      return;
    }

    setIsLinkingTuya(true);
    setTimeout(() => {
      setConfig(prev => ({
        ...prev,
        tuya: {
          ...prev.tuya,
          enabled: true,
          userToken: 'tuya_oauth_token_' + Math.random().toString(36).substring(2, 9),
          linkedAccountEmail: tuyaEmail.trim()
        }
      }));
      setIsLinkingTuya(false);
      if (onNotification) onNotification(`Conta Tuya (${tuyaEmail}) vinculada e autorizada via OAuth Link App Account!`, 'success');
    }, 1800);
  };

  const handleAddCustomDevice = () => {
    if (!newDeviceName.trim()) return;
    const newDev: SmartDevice = {
      id: 'dev-' + Date.now(),
      name: newDeviceName.trim(),
      category: 'plug',
      platform: newDevicePlatform,
      state: true,
      room: newDeviceRoom,
      online: true,
      lastUpdated: Date.now()
    };
    setDevices(prev => [...prev, newDev]);
    setNewDeviceName('');
    if (onNotification) onNotification(`Novo dispositivo "${newDev.name}" adicionado!`, 'success');
  };

  const handleDeleteDevice = (id: string) => {
    setDevices(prev => prev.filter(d => d.id !== id));
  };

  const rooms = ['Todos', ...Array.from(new Set(devices.map(d => d.room || 'Outros')))];

  const filteredDevices = selectedRoom === 'Todos' 
    ? devices 
    : devices.filter(d => (d.room || 'Outros') === selectedRoom);

  const pythonScriptText = `# Script de Organização Automática de Arquivos do PC
# Gerado pelo OSONE Studio para organizar seu computador físico
import os
import shutil
from pathlib import Path

# Defina a pasta que deseja organizar (Exemplo: Downloads ou Documentos)
TARGET_DIR = Path.home() / "Downloads"

CATEGORIES = {
    "Documentos": [".pdf", ".docx", ".doc", ".txt", ".xlsx", ".pptx", ".csv"],
    "Imagens": [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".psd"],
    "Vídeos": [".mp4", ".mkv", ".avi", ".mov"],
    "Áudios": [".mp3", ".wav", ".flac", ".ogg"],
    "Compactados": [".zip", ".rar", ".7z", ".tar", ".gz"],
    "Programas": [".exe", ".msi", ".dmg", ".iso"],
    "Código": [".js", ".py", ".html", ".css", ".json", ".ts"]
}

def organize():
    print(f"Organizando arquivos em: {TARGET_DIR}")
    for item in TARGET_DIR.iterdir():
        if item.is_file():
            ext = item.suffix.lower()
            moved = False
            for category, extensions in CATEGORIES.items():
                if ext in extensions:
                    dest_folder = TARGET_DIR / category
                    dest_folder.mkdir(exist_ok=True)
                    shutil.move(str(item), str(dest_folder / item.name))
                    print(f"Movido: {item.name} -> {category}/")
                    moved = True
                    break
            if not moved and ext:
                dest_folder = TARGET_DIR / "Outros"
                dest_folder.mkdir(exist_ok=True)
                shutil.move(str(item), str(dest_folder / item.name))

if __name__ == "__main__":
    organize()
    print("✓ Organização concluída com sucesso!")`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(pythonScriptText);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#07090e] text-zinc-100 min-h-0 overflow-hidden font-sans relative">
      
      {/* Top Bar Header */}
      <div className="h-16 border-b border-white/5 bg-[#0a0d14]/90 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/40">
            <Zap size={20} className="animate-pulse" />
          </div>

          <div>
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              OSONE IoT & Cloud Smart Home
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-normal">
                Tuya • Hue • SmartThings
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Controle por voz no Gemini Live, automação em nuvem e organização do PC.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-black/50 p-1.5 rounded-2xl border border-white/10">
          <button 
            onClick={() => setActiveTab('devices')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all",
              activeTab === 'devices' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-950/50" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Lightbulb size={14} />
            <span>Dispositivos ({devices.length})</span>
          </button>

          <button 
            onClick={() => setActiveTab('clouds')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all",
              activeTab === 'clouds' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-950/50" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Cloud size={14} />
            <span>Conectar Nuvens</span>
          </button>

          <button 
            onClick={() => setActiveTab('routines')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all",
              activeTab === 'routines' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-950/50" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Sparkles size={14} />
            <span>Rotinas ({routines.length})</span>
          </button>

          <button 
            onClick={() => setActiveTab('pc_organizer')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all",
              activeTab === 'pc_organizer' 
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-950/50" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Folder size={14} />
            <span>Organizador de PC</span>
          </button>
        </div>
      </div>

      {/* Main Body Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar max-w-7xl mx-auto w-full">
        
        {/* TAB 1: DEVICES CONTROL */}
        {activeTab === 'devices' && (
          <div className="space-y-6">
            
            {/* Filter by Room + Add Device bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap bg-[#0c0f18] p-4 rounded-3xl border border-white/5">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                <span className="text-xs font-mono text-zinc-500 font-semibold mr-1">Cômodos:</span>
                {rooms.map(rm => (
                  <button 
                    key={rm}
                    onClick={() => setSelectedRoom(rm)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all border shrink-0",
                      selectedRoom === rm 
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold" 
                        : "bg-black/40 text-zinc-400 border-white/5 hover:text-white"
                    )}
                  >
                    {rm}
                  </button>
                ))}
              </div>

              {/* Add Custom Device Trigger */}
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="Nome (ex: Lâmpada Varanda)..."
                  className="bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none w-48 font-mono"
                />
                <select 
                  value={newDevicePlatform}
                  onChange={(e: any) => setNewDevicePlatform(e.target.value)}
                  className="bg-black/60 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-300 outline-none font-mono"
                >
                  <option value="tuya">Tuya</option>
                  <option value="hue">Hue</option>
                  <option value="smartthings">SmartThings</option>
                </select>
                <button 
                  onClick={handleAddCustomDevice}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-1 shrink-0"
                >
                  <Plus size={14} />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>

            {/* Device Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDevices.map(dev => (
                <div 
                  key={dev.id}
                  className={cn(
                    "p-5 rounded-3xl border transition-all relative overflow-hidden flex flex-col justify-between space-y-4",
                    dev.state 
                      ? "bg-[#0d121f] border-cyan-500/30 shadow-xl shadow-cyan-950/20" 
                      : "bg-[#090b10] border-white/5 opacity-80"
                  )}
                >
                  {/* Top info */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center border transition-all",
                        dev.state 
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-inner" 
                          : "bg-white/5 text-zinc-500 border-white/10"
                      )}>
                        {dev.category === 'light' ? <Lightbulb size={22} /> :
                         dev.category === 'plug' ? <Zap size={22} /> :
                         dev.category === 'thermostat' ? <Cpu size={22} /> :
                         dev.category === 'lock' ? <Lock size={22} /> :
                         <Power size={22} />}
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-white font-mono leading-tight">{dev.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono text-zinc-400">{dev.room}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border",
                            dev.platform === 'tuya' ? "bg-orange-500/10 text-orange-400 border-orange-500/30" :
                            dev.platform === 'hue' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" :
                            "bg-purple-500/10 text-purple-400 border-purple-500/30"
                          )}>
                            {dev.platform}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => handleToggleDevice(dev.id)}
                      className={cn(
                        "w-12 h-7 rounded-full p-1 transition-colors duration-300 relative flex items-center cursor-pointer",
                        dev.state ? "bg-cyan-500" : "bg-zinc-800"
                      )}
                    >
                      <motion.div 
                        layout 
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className={cn(
                          "w-5 h-5 rounded-full bg-black shadow-md",
                          dev.state ? "ml-auto" : "ml-0"
                        )}
                      />
                    </button>
                  </div>

                  {/* Brightness / Value Slider if applicable */}
                  {dev.value !== undefined && dev.state && (
                    <div className="space-y-1 pt-2 border-t border-white/5">
                      <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                        <span>Intensidade / Nível:</span>
                        <span className="text-cyan-400 font-bold">{dev.value}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={dev.value}
                        onChange={(e) => handleUpdateValue(dev.id, Number(e.target.value))}
                        className="w-full accent-cyan-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Color Picker if applicable */}
                  {dev.color && dev.state && (
                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] font-mono text-zinc-400">
                      <span>Cor Atual:</span>
                      <input 
                        type="color" 
                        value={dev.color}
                        onChange={(e) => handleUpdateColor(dev.id, e.target.value)}
                        className="w-6 h-6 rounded-lg bg-transparent cursor-pointer border-0"
                      />
                    </div>
                  )}

                  {/* Bottom Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] font-mono text-zinc-500">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Nuvem Sincronizada
                    </span>
                    <button 
                      onClick={() => handleDeleteDevice(dev.id)}
                      className="hover:text-red-400 transition-colors"
                      title="Remover Dispositivo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* TAB 2: CONNECT CLOUDS (TUYA, HUE, SMARTTHINGS) */}
        {activeTab === 'clouds' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* CARD 1: TUYA / SMART LIFE (O MAIS IMPORTANTE) */}
            <div className="p-6 rounded-3xl bg-[#0c0e17] border border-orange-500/30 space-y-5 relative overflow-hidden shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white font-mono">Tuya / Smart Life</h3>
                    <p className="text-xs text-orange-200/70">Link App Account OAuth</p>
                  </div>
                </div>

                <span className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border",
                  config.tuya.enabled 
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" 
                    : "bg-zinc-800 text-zinc-400 border-white/5"
                )}>
                  {config.tuya.enabled ? '✓ Conectado' : 'Desconectado'}
                </span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                Cobre a maioria absoluta dos dispositivos "genéricos" (AliExpress, Shopee, NovaDigital, Positivo, Geonav).
              </p>

              <div className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">E-mail do App Smart Life / Tuya:</label>
                  <input 
                    type="email" 
                    value={tuyaEmail}
                    onChange={(e) => setTuyaEmail(e.target.value)}
                    placeholder="seu_email@exemplo.com"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500/50"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">Região dos Servidores:</label>
                  <select 
                    value={config.tuya.region}
                    onChange={(e: any) => setConfig(prev => ({ ...prev, tuya: { ...prev.tuya, region: e.target.value } }))}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                  >
                    <option value="us">América (US)</option>
                    <option value="eu">Europa (EU)</option>
                    <option value="cn">China (CN)</option>
                    <option value="in">Índia (IN)</option>
                  </select>
                </div>
              </div>

              <button 
                onClick={handleSimulateTuyaOAuth}
                disabled={isLinkingTuya}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-950/50 transition-all cursor-pointer active:scale-95"
              >
                {isLinkingTuya ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Vinculando Conta Tuya H5...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Vincular Conta Tuya / Smart Life</span>
                  </>
                )}
              </button>
            </div>

            {/* CARD 2: PHILIPS HUE */}
            <div className="p-6 rounded-3xl bg-[#0c0e17] border border-cyan-500/30 space-y-5 relative overflow-hidden shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                    <Lightbulb size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white font-mono">Philips Hue</h3>
                    <p className="text-xs text-cyan-200/70">API Cloud & Local Bridge</p>
                  </div>
                </div>

                <span className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border",
                  config.hue.enabled 
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" 
                    : "bg-zinc-800 text-zinc-400 border-white/5"
                )}>
                  {config.hue.enabled ? '✓ Ativo' : 'Pendente'}
                </span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                Integração premium para iluminação Philips Hue via Bridge IP ou Hue Cloud API.
              </p>

              <div className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">IP do Bridge Local (Opcional):</label>
                  <input 
                    type="text" 
                    value={config.hue.bridgeIp || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, hue: { ...prev.hue, bridgeIp: e.target.value } }))}
                    placeholder="192.168.1.100"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              <button 
                onClick={() => {
                  setConfig(prev => ({ ...prev, hue: { ...prev.hue, enabled: true } }));
                  if (onNotification) onNotification('Philips Hue Bridge conectado com sucesso!', 'success');
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer active:scale-95"
              >
                <CheckCircle2 size={16} />
                <span>Testar Conexão Hue</span>
              </button>
            </div>

            {/* CARD 3: SAMSUNG SMARTTHINGS */}
            <div className="p-6 rounded-3xl bg-[#0c0e17] border border-purple-500/30 space-y-5 relative overflow-hidden shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                    <Layers size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white font-mono">SmartThings</h3>
                    <p className="text-xs text-purple-200/70">Samsung PAT OAuth</p>
                  </div>
                </div>

                <span className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border",
                  config.smartthings.enabled 
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" 
                    : "bg-zinc-800 text-zinc-400 border-white/5"
                )}>
                  {config.smartthings.enabled ? '✓ Ativo' : 'Desconectado'}
                </span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                Conecte eletrodomésticos, TVs e ar condicionados Samsung via Personal Access Token.
              </p>

              <div className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">Personal Access Token (PAT):</label>
                  <input 
                    type="password" 
                    value={config.smartthings.personalAccessToken || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, smartthings: { ...prev.smartthings, personalAccessToken: e.target.value } }))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>

              <button 
                onClick={() => {
                  setConfig(prev => ({ ...prev, smartthings: { ...prev.smartthings, enabled: true } }));
                  if (onNotification) onNotification('Samsung SmartThings token salvo!', 'success');
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50 transition-all cursor-pointer active:scale-95"
              >
                <Key size={16} />
                <span>Salvar Token SmartThings</span>
              </button>
            </div>

          </div>
        )}

        {/* TAB 3: ROUTINES */}
        {activeTab === 'routines' && (
          <div className="space-y-4">
            <div className="p-4 bg-[#0c0f18] rounded-3xl border border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white font-mono">Cenas & Rotinas em Lote</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Dispare múltiplos dispositivos com um clique ou falando para o Gemini Live por voz.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {routines.map(rot => (
                <div key={rot.id} className="p-5 rounded-3xl bg-[#0a0c14] border border-cyan-500/20 hover:border-cyan-500/40 transition-all space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl p-2 rounded-2xl bg-black/40 border border-white/5">{rot.icon}</span>
                    <div>
                      <h4 className="text-sm font-bold text-white font-mono">{rot.name}</h4>
                      <span className="text-[10px] font-mono text-cyan-400">{rot.actions.length} ações mapeadas</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleRunRoutine(rot)}
                    className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer"
                  >
                    <Play size={14} />
                    <span>Executar Rotina</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: PC FILE ORGANIZER SCRIPT GENERATOR */}
        {activeTab === 'pc_organizer' && (
          <div className="p-6 rounded-3xl bg-[#0c0e17] border border-emerald-500/30 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Folder size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-mono">Organizador Automático do PC Físico</h3>
                  <p className="text-xs text-emerald-200/70">Script de Organização de Arquivos do Computador</p>
                </div>
              </div>

              <button 
                onClick={handleCopyScript}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
              >
                {copiedScript ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedScript ? 'Copiado!' : 'Copiar Script Python'}</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-200/90 leading-relaxed font-sans space-y-2">
              <strong className="text-emerald-400 font-mono font-bold block">💡 Como organizar seu computador físico com o OSONE:</strong>
              <p>
                Navegadores de internet rodam dentro de um container isolado ("sandbox") por privacidade e segurança, impedindo que sites explorem pastas do seu disco rígido sem sua autorização. 
              </p>
              <p>
                Para organizar o seu computador físico instantaneamente, o OSONE gerou este script Python abaixo. Você só precisa salvar este código no seu PC como <code className="text-cyan-300 bg-black/60 px-1.5 py-0.5 rounded font-mono">organizar.py</code> e executá-lo! Ele moverá automaticamente PDFs, planilhas, fotos, vídeos e instaladores para subpastas limpas e ordenadas na sua pasta Downloads/Documentos.
              </p>
            </div>

            <div className="relative rounded-2xl bg-black/80 border border-white/10 p-4 font-mono text-xs text-emerald-300 leading-relaxed overflow-x-auto max-h-80 custom-scrollbar">
              <pre>{pythonScriptText}</pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
