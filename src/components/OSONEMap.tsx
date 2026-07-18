import React, { useEffect, useRef, useState } from 'react';
import { 
  MapPin, Search, Compass, Layers, ChevronLeft, Map as MapIcon, 
  Plus, Minus, History, Navigation, Loader2, Sparkles, Pin, Check, RotateCw
} from 'lucide-react';
import { cn } from '../lib/utils';

// Preset locations to play with inside OSONE
const PRESET_PLACES = [
  { name: 'São Paulo, Brasil', lat: -23.5505, lng: -46.6333, desc: 'Metrópole pulsar da América Latina' },
  { name: 'Tóquio, Japão', lat: 35.6762, lng: 139.6503, desc: 'A capital cibernética do futuro' },
  { name: 'Paris, França', lat: 48.8566, lng: 2.3522, desc: 'Cidade Luz e centro de harmonia' },
  { name: 'Nova York, EUA', lat: 40.7128, lng: -74.0060, desc: 'O fulcro financeiro e cultural' },
  { name: 'Rio de Janeiro, Brasil', lat: -22.9068, lng: -43.1729, desc: 'Coração tropical e sinuoso' },
  { name: 'Reykjavík, Islândia', lat: 64.1466, lng: -21.9426, desc: 'Estação ártica e auroras boreais' }
];

interface OSONEMapProps {
  onClose: () => void;
  initialSearchQuery?: string;
  onLocationFound?: (placeName: string, coords: { lat: number, lng: number }) => void;
}

export const OSONEMap = ({ onClose, initialSearchQuery = '', onLocationFound }: OSONEMapProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null); // Leaflet map instance
  const markerRef = useRef<any>(null); // Leaflet active marker instance
  
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number, lng: number }>({ lat: -23.5505, lng: -46.6333 });
  const [focalCoords, setFocalCoords] = useState<{ lat: number, lng: number }>({ lat: -23.5505, lng: -46.6333 });
  const [orbitMode, setOrbitMode] = useState<'off' | '2d' | '3d'>('2d');
  const angleRef = useRef(0);

  // Intelligent Triangulation State & Controls
  const [isTriangulating, setIsTriangulating] = useState(false);
  const [triangulationPoints, setTriangulationPoints] = useState<Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    radiusKm: number;
    color: string;
  }>>([]);
  const [positioningTarget, setPositioningTarget] = useState<'A' | 'B' | 'C' | null>(null);
  const positioningTargetRef = useRef<'A' | 'B' | 'C' | null>(null);
  const triangulationLayersRef = useRef<any[]>([]);

  useEffect(() => {
    positioningTargetRef.current = positioningTarget;
  }, [positioningTarget]);

  // Real-time Triangulated Math Solver using Spherical Gradient Descent Optimization
  const triangulatedPoint = React.useMemo(() => {
    if (triangulationPoints.length === 0) return null;
    
    // Begin step at centroid of signal emitters
    let bestLat = triangulationPoints.reduce((sum, p) => sum + p.lat, 0) / triangulationPoints.length;
    let bestLng = triangulationPoints.reduce((sum, p) => sum + p.lng, 0) / triangulationPoints.length;
    
    let learningRate = 0.2;
    // Iterate to align with distance constraints with mathematically high accuracy
    for (let iter = 0; iter < 120; iter++) {
      let dLat = 0;
      let dLng = 0;
      
      for (const p of triangulationPoints) {
        const latDiffRaw = bestLat - p.lat;
        const lngDiffRaw = bestLng - p.lng;
        
        // 1 deg Latitude delta is ~110.57 km in standard coordinate projections, 
        // 1 deg Longitude is ~111.32 km scaled by cosine of latitude to correct for curvature.
        const dy = latDiffRaw * 110.57;
        const dx = lngDiffRaw * 111.32 * Math.cos(p.lat * Math.PI / 180);
        const currentDist = Math.sqrt(dx * dx + dy * dy);
        
        if (currentDist === 0) continue;
        
        const error = currentDist - p.radiusKm;
        const gradX = dx / currentDist;
        const gradY = dy / currentDist;
        
        dLng += error * gradX;
        dLat += error * gradY;
      }
      
      // Fine-grained gradient step coordinates conversion
      bestLng -= (dLng / triangulationPoints.length) * learningRate * 0.009;
      bestLat -= (dLat / triangulationPoints.length) * learningRate * 0.009;
      
      learningRate *= 0.985;
    }
    
    return { lat: bestLat, lng: bestLng };
  }, [triangulationPoints]);

  const [locationName, setLocationName] = useState('São Paulo, Brasil');
  const [searchHistory, setSearchHistory] = useState<Array<{ name: string, lat: number, lng: number, time: string }>>([
    { name: 'São Paulo, Brasil', lat: -23.5505, lng: -46.6333, time: 'Definido como Padrão' }
  ]);
  
  const [mapStyle, setMapStyle] = useState<'slate' | 'satellite' | 'terrain' | 'warm'>('slate');
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dynamic map viewport invalidation on layout changes for fluid mobile transitions
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        try {
          mapRef.current.invalidateSize();
        } catch (_) {}
      }, 250);
    }
  }, [mobileMenuOpen]);

  // Spontaneous drone-like circular viewport panning loop around focalCoords
  useEffect(() => {
    if (orbitMode === 'off') {
      // Return camera smoothly to focalCenter focus
      if (mapRef.current && focalCoords) {
        mapRef.current.setView([focalCoords.lat, focalCoords.lng], mapRef.current.getZoom(), { animate: true });
        setCurrentCoords(focalCoords);
        if (markerRef.current) {
          markerRef.current.setLatLng([focalCoords.lat, focalCoords.lng]);
        }
      }
      return;
    }

    let active = true;
    const tick = () => {
      if (!active) return;
      if (mapRef.current && focalCoords) {
        try {
          const zoom = mapRef.current.getZoom();
          // Dynamic scale-adjusted radius factor so orbital span looks identical at all zoom levels
          const radius = 0.006 * Math.pow(2, 13 - zoom);
          
          // Increment angle smoothly
          angleRef.current += orbitMode === '3d' ? 0.0035 : 0.0055;
          
          const nextLat = focalCoords.lat + Math.cos(angleRef.current) * radius;
          const nextLng = focalCoords.lng + Math.sin(angleRef.current) * radius;
          
          mapRef.current.setView([nextLat, nextLng], zoom, { animate: false });
          setCurrentCoords({ lat: nextLat, lng: nextLng });
        } catch (_) {}
      }
      requestAnimationFrame(tick);
    };

    const frameId = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frameId);
    };
  }, [orbitMode, focalCoords]);

  // Load Leaflet dynamically matching stylesheet and script loads to prevent race conditions
  useEffect(() => {
    const initLeaflet = () => {
      const L = (window as any).L;
      const isCssLoaded = !!document.getElementById('leaflet-css');
      
      let cssReady = isCssLoaded;
      let jsReady = !!L;

      const checkReady = () => {
        if (cssReady && jsReady) {
          setIsLeafletLoaded(true);
        }
      };

      if (cssReady && jsReady) {
        setIsLeafletLoaded(true);
        return;
      }

      // Load CSS
      if (!isCssLoaded) {
        const css = document.createElement('link');
        css.id = 'leaflet-css';
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        css.onload = () => {
          cssReady = true;
          checkReady();
        };
        css.onerror = () => {
          // Fallback if load fails to not block app
          cssReady = true;
          checkReady();
        };
        document.head.appendChild(css);
      }

      // Load JS
      if (L) {
        jsReady = true;
        checkReady();
      } else {
        let script = document.getElementById('leaflet-js') as HTMLScriptElement;
        if (!script) {
          script = document.createElement('script');
          script.id = 'leaflet-js';
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => {
            jsReady = true;
            checkReady();
          };
          script.onerror = () => {
            jsReady = true;
            checkReady();
          };
          document.head.appendChild(script);
        } else {
          // If script tag exists but flag is not yet populated
          const interval = setInterval(() => {
            if ((window as any).L) {
              clearInterval(interval);
              jsReady = true;
              checkReady();
            }
          }, 100);
          return () => clearInterval(interval);
        }
      }
    };

    initLeaflet();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isLeafletLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    // Destruct previous map if exists
    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch (_) {}
      mapRef.current = null;
    }

    // Initialize map centered on currentCoords
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([currentCoords.lat, currentCoords.lng], 12);

    mapRef.current = map;

    // Apply active tile layer depending on style
    let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'; // default Slate Dark
    if (mapStyle === 'slate') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    } else if (mapStyle === 'warm') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    } else if (mapStyle === 'terrain') {
      tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
    } else if (mapStyle === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }

    L.tileLayer(tileUrl, {
      maxZoom: 19
    }).addTo(map);

    // Create custom Pulse Icon for marker matching OSONE Neural Theme
    const pulseIcon = L.divIcon({
      className: 'osone-custom-marker',
      html: `
        <div class="relative w-8 h-8 flex items-center justify-center">
          <div class="absolute inset-0 bg-purple-500 rounded-full animate-ping opacity-25 w-full h-full"></div>
          <div class="absolute w-4 h-4 bg-purple-600 rounded-full border-2 border-white flex items-center justify-center">
            <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([currentCoords.lat, currentCoords.lng], { icon: pulseIcon }).addTo(map);
    markerRef.current = marker;

    // Event listener for map clicks to extract coordinates natively with positioning overrides
    map.on('click', async (e: any) => {
      const { lat, lng } = e.latlng;
      const target = positioningTargetRef.current;
      
      if (target) {
        setTriangulationPoints(prev => prev.map(p => {
          if (p.id === target) {
            return { ...p, lat, lng };
          }
          return p;
        }));
        setPositioningTarget(null);
      } else {
        updateMapPosition(lat, lng, `Coordenadas: [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
      }
    });

    // Add CSS stylesheet for clean map look inside container
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      .leaflet-container {
        background: #09090b !important;
        outline: none;
      }
      .osone-custom-marker {
        display: flex;
        justify-content: center;
        align-items: center;
      }
    `;
    document.head.appendChild(styleTag);

    // Setup ResizeObserver to automatically invalidate sizes on resize and dynamic viewports
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        try {
          mapRef.current.invalidateSize();
        } catch (_) {}
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    // Dynamic initial view invalidation timeouts
    const t1 = setTimeout(() => {
      if (mapRef.current) {
        try { mapRef.current.invalidateSize(); } catch (_) {}
      }
    }, 100);
    const t2 = setTimeout(() => {
      if (mapRef.current) {
        try { mapRef.current.invalidateSize(); } catch (_) {}
      }
    }, 400);

    return () => {
      try { document.head.removeChild(styleTag); } catch (_) {}
      clearTimeout(t1);
      clearTimeout(t2);
      resizeObserver.disconnect();
    };
  }, [isLeafletLoaded, mapStyle]);

  // Synchronize and draw advanced triangulation overlays onto Leaflet
  useEffect(() => {
    const L = (window as any).L;
    if (!isLeafletLoaded || !mapRef.current || !L) return;

    // Clear previous elements
    if (triangulationLayersRef.current) {
      triangulationLayersRef.current.forEach(layer => {
        try {
          layer.remove();
        } catch (_) {}
      });
      triangulationLayersRef.current = [];
    }

    if (!isTriangulating || triangulationPoints.length === 0) return;

    const layers: any[] = [];

    triangulationPoints.forEach((p) => {
      // 1. Telemetry coverage circle
      const circle = L.circle([p.lat, p.lng], {
        radius: p.radiusKm * 1000,
        color: p.color,
        fillColor: p.color,
        fillOpacity: 0.05,
        weight: 1.5,
        dashArray: '3, 8',
        className: 'osone-pulse-radial-scan'
      }).addTo(mapRef.current);
      layers.push(circle);

      // 2. High-tech circular DivIcon label for transmitter
      const emitterIcon = L.divIcon({
        className: 'gps-tower-emitter',
        html: `
          <div class="relative w-8 h-8 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full bg-white/10 animate-ping opacity-20"></div>
            <div class="w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white/50 text-[9px] font-sans font-extrabold text-white leading-none shadow-[0_0_10px_rgba(255,255,255,0.2)]" style="background-color: ${p.color};">
              ${p.id}
            </div>
            <div class="absolute -bottom-5 bg-zinc-950/95 text-zinc-300 text-[8px] font-mono border border-white/10 px-1 py-0.5 rounded leading-none whitespace-nowrap shadow-lg">
              ${p.name.split(' ')[1] || p.name}
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const emitterMarker = L.marker([p.lat, p.lng], { icon: emitterIcon }).addTo(mapRef.current);
      layers.push(emitterMarker);

      // 3. Connect lines from current radio antennas to computed triangulation intercept center
      if (triangulatedPoint) {
        const polyline = L.polyline([[p.lat, p.lng], [triangulatedPoint.lat, triangulatedPoint.lng]], {
          color: p.color,
          weight: 1.2,
          dashArray: '4, 8',
          opacity: 0.7
        }).addTo(mapRef.current);
        layers.push(polyline);
      }
    });

    // 4. Highlight calculated target intersection
    if (triangulatedPoint) {
      const targetIcon = L.divIcon({
        className: 'triangulated-endpoint',
        html: `
          <div class="relative w-12 h-12 flex items-center justify-center">
            <div class="absolute inset-0 border border-emerald-400 rounded-full animate-spin" style="animation-duration: 4s; border-width: 1px; border-style: dashed;"></div>
            <div class="absolute w-10 h-10 border border-emerald-400/20 rounded-full animate-ping opacity-20"></div>
            <div class="absolute w-7 h-7 rounded-full bg-emerald-500/10 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <div class="w-2 h-2 bg-emerald-400 rounded-full border border-black flex items-center justify-center">
                <div class="w-1 h-1 bg-white rounded-full"></div>
              </div>
            </div>
            <div class="absolute -top-7 bg-emerald-950/95 border border-emerald-500/40 text-emerald-200 text-[8px] font-mono px-1.5 py-0.5 rounded shadow-2xl tracking-wider font-extrabold animate-pulse">
              🎯 ALVO SINTONIZADO
            </div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      });

      const targetMarker = L.marker([triangulatedPoint.lat, triangulatedPoint.lng], { icon: targetIcon }).addTo(mapRef.current);
      layers.push(targetMarker);
    }

    triangulationLayersRef.current = layers;

    return () => {
      layers.forEach(layer => {
        try {
          layer.remove();
        } catch (_) {}
      });
    };
  }, [isTriangulating, triangulationPoints, triangulatedPoint, isLeafletLoaded, mapStyle]);

  // Handle outside prop searches (e.g. from chatbot trigger)
  useEffect(() => {
    if (initialSearchQuery && initialSearchQuery.trim()) {
      setSearchQuery(initialSearchQuery);
      handleAddressSearch(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // Update position easily
  const updateMapPosition = (lat: number, lng: number, label: string) => {
    setCurrentCoords({ lat, lng });
    setFocalCoords({ lat, lng });
    setLocationName(label);

    const L = (window as any).L;
    if (mapRef.current && L) {
      mapRef.current.setView([lat, lng], 13);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      }
    }

    // Add to history list silently
    setSearchHistory(prev => {
      // Avoid duplicate direct listings
      if (prev.some(h => Math.abs(h.lat - lat) < 0.001 && Math.abs(h.lng - lng) < 0.001)) return prev;
      return [
        { name: label, lat, lng, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 19)
      ];
    });

    // Fire callback for voice system to use
    if (onLocationFound) {
      onLocationFound(label, { lat, lng });
    }
  };

  // Dispersion and Auto-Triangulation initial setup functions
  const disperseEmitters = (latVal = currentCoords.lat, lngVal = currentCoords.lng) => {
    setTriangulationPoints([
      { id: 'A', name: 'Canal Alpha (UHF-1)', lat: latVal + 0.007 + (Math.random() - 0.5) * 0.005, lng: lngVal - 0.010 + (Math.random() - 0.5) * 0.005, radiusKm: 1.6 + Math.random() * 1.1, color: '#ef4444' },
      { id: 'B', name: 'Canal Beta (HF-2)', lat: latVal - 0.011 + (Math.random() - 0.5) * 0.005, lng: lngVal + 0.009 + (Math.random() - 0.5) * 0.005, radiusKm: 1.9 + Math.random() * 1.1, color: '#06b6d4' },
      { id: 'C', name: 'Canal Gamma (VHF-3)', lat: latVal - 0.006 + (Math.random() - 0.5) * 0.010, lng: lngVal - 0.007 + (Math.random() - 0.5) * 0.005, radiusKm: 1.4 + Math.random() * 1.1, color: '#f59e0b' }
    ]);
    setIsTriangulating(true);
    setOrbitMode('off');
  };

  const toggleTriangulation = () => {
    if (isTriangulating) {
      setIsTriangulating(false);
      setPositioningTarget(null);
    } else {
      disperseEmitters(currentCoords.lat, currentCoords.lng);
    }
  };

  // Trigger real Nominatim API search for pinpoint precision without Google API keys
  const handleAddressSearch = async (queryText = searchQuery) => {
    if (!queryText.trim()) return;
    setIsSearching(true);
    setNoResults(false);
    
    try {
      const formattedQuery = encodeURIComponent(queryText);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${formattedQuery}&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'OSONE-Desktop-Navigator/4.0'
        }
      });
      
      if (!response.ok) throw new Error('Network error on search server.');
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const place = data[0];
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lon);
        const displayName = place.display_name.split(',').slice(0, 3).join(','); // Beautify title
        
        updateMapPosition(lat, lng, displayName);
      } else {
        setNoResults(true);
        setTimeout(() => setNoResults(false), 4000);
      }
    } catch (error) {
      console.error('Error during Nominatim geocode:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddressSearch();
    }
  };

  const zoomIn = () => {
    if (mapRef.current) mapRef.current.zoomIn();
  };

  const zoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut();
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-zinc-950 font-sans border border-white/[0.05] md:rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      {/* Top Banner Navigation bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-zinc-900/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-2 bg-white/5 hover:bg-white/10 active:scale-95 duration-150 transition-all rounded-lg text-zinc-400 hover:text-white border border-white/[0.05]"
            title="Voltar ao início"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] md:text-[9px] tracking-[0.3em] font-serif italic text-purple-400 font-bold uppercase">Satelite Vector Core</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h2 className="text-sm md:text-md font-medium tracking-tight text-white flex items-center gap-1.5">
              <Compass size={14} className="text-purple-400/80" />
              <span>Navegador Geográfico OSONE</span>
            </h2>
          </div>
        </div>

        {/* Telemetry Coordinate Screen */}
        <div className="hidden sm:flex items-center gap-4 bg-black/40 px-3.5 py-1.5 rounded-xl border border-white/5 font-mono text-[9px] text-zinc-400">
          <div>
            <span className="text-zinc-600 block text-[7px] uppercase tracking-wider">LATITUDE</span>
            <span className="text-purple-300 font-bold">{currentCoords.lat.toFixed(6)}°</span>
          </div>
          <div className="w-[1px] h-5 bg-white/5" />
          <div>
            <span className="text-zinc-600 block text-[7px] uppercase tracking-wider">LONGITUDE</span>
            <span className="text-purple-300 font-bold">{currentCoords.lng.toFixed(6)}°</span>
          </div>
        </div>

        {/* Mobile search / preset controller toggle button */}
        <button
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="md:hidden flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 transition-all text-[11px] text-purple-300 font-medium font-sans border border-purple-500/20 shadow-lg"
          title="Alternar Painel de Controle"
        >
          {mobileMenuOpen ? <Check size={12} className="text-purple-400" /> : <Search size={12} className="text-purple-400" />}
          <span>{mobileMenuOpen ? "Ver Mapa" : "Procurar"}</span>
        </button>
      </div>

      <div className="flex-1 w-full flex flex-col md:flex-row min-h-0 relative">
        {/* Left Side: Controls, Presets and History Panel */}
        <div className={cn(
          "w-full md:w-80 border-b md:border-b-0 md:border-r border-white/[0.05] bg-zinc-950/90 backdrop-blur shrink-0 overflow-y-auto flex flex-col transition-all duration-200",
          mobileMenuOpen ? "flex h-[60vh] max-h-[60vh]" : "hidden md:flex md:h-full"
        )}>
          {/* Geolocation Search Head */}
          <div className="p-4 border-b border-white/[0.04]">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Pesquisar cidade, país ou endereço..."
                className="w-full h-10 bg-zinc-900 border border-white/5 hover:border-white/10 focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 text-xs text-white rounded-xl pl-9 pr-10 outline-none transition-all placeholder:text-zinc-500"
              />
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              
              <button
                onClick={() => handleAddressSearch()}
                disabled={isSearching}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 transition-all outline-none text-purple-400 rounded-lg"
              >
                {isSearching ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              </button>
            </div>

            {noResults && (
              <div className="mt-2 text-[10px] text-red-400 bg-red-950/20 border border-red-500/10 p-2 rounded-lg leading-relaxed animate-in slide-in-from-top-1">
                ⚠️ Nenhum local encontrado para esta busca. Tente buscar um termo mais amplo.
              </div>
            )}
          </div>

          <div className="p-4 space-y-4 flex-1">
            {/* Presets and Cool Locations */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Estações Globais</span>
                <span className="text-[8px] px-1.5 py-0.5 bg-purple-500/5 text-purple-400 rounded-md border border-purple-500/10">Fácil Acesso</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_PLACES.map((place, idx) => (
                  <button
                    key={idx}
                    onClick={() => updateMapPosition(place.lat, place.lng, place.name)}
                    className={cn(
                      "p-2.5 rounded-xl border text-left transition-all relative group outline-none",
                      locationName.includes(place.name.split(',')[0])
                        ? "bg-purple-500/10 border-purple-500/30 text-purple-200"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10 text-zinc-400 hover:text-white"
                    )}
                  >
                    <span className="text-[10px] font-bold block">{place.name.split(',')[0]}</span>
                    <span className="text-[8px] opacity-40 font-mono tracking-tighter truncate block mt-0.5">{place.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Map Styles Selector */}
            <div>
              <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold block mb-2">Matriz de Renderização</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'slate', name: 'Nébula Carbono', icon: MapIcon, desc: 'Foco cibernético escuro' },
                  { id: 'satellite', name: 'Órbita Satélite', icon: Layers, desc: 'Imagens reais do espaço' },
                  { id: 'warm', name: 'Traçado Urbano', icon: Navigation, desc: 'Geográfico simplificado' },
                  { id: 'terrain', name: 'Estação Topo', icon: Compass, desc: 'Curvas de nível e relevos' }
                ].map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setMapStyle(style.id as any)}
                    className={cn(
                      "p-2 rounded-xl text-left border flex items-start gap-2 transition-all outline-none",
                      mapStyle === style.id
                        ? "bg-purple-500/10 border-purple-500/30 text-purple-200"
                        : "bg-white/[0.01] border-white/5 hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <style.icon size={13} className={cn("mt-0.5", mapStyle === style.id ? "text-purple-400" : "")} />
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold block leading-tight">{style.name}</span>
                      <span className="text-[7.5px] opacity-40 truncate block leading-tight">{style.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Aerial Orbit & Flight Camera Simulator (Voo Espontâneo) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Voo Orbital Espontâneo</span>
                <span className="text-[8px] px-1.5 py-0.5 bg-purple-500/5 text-purple-400 rounded-md border border-purple-500/10 animate-pulse">Câmera Drone</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'off', name: 'Desativado', desc: 'Estático / Manual', icon: Pin },
                  { id: '2d', name: 'Órbita 2D', desc: 'Tridimensional plano', icon: RotateCw },
                  { id: '3d', name: 'Imersão 3D', desc: 'Voo com inclinação', icon: Compass }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setOrbitMode(mode.id as any);
                    }}
                    className={cn(
                      "p-2 rounded-xl text-center border flex flex-col items-center justify-center transition-all outline-none",
                      orbitMode === mode.id
                        ? "bg-purple-500/15 border-purple-500/40 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                        : "bg-white/[0.01] border-white/5 hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <mode.icon size={13} className={cn("mb-1", orbitMode === mode.id ? "text-purple-400 animate-spin" : "text-zinc-500")} style={orbitMode === mode.id && mode.id !== 'off' ? { animationDuration: mode.id === '3d' ? '12s' : '6s' } : undefined} />
                    <span className="text-[9px] font-bold block leading-tight">{mode.name}</span>
                    <span className="text-[7.5px] opacity-40 block leading-tight mt-0.5">{mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Triangulação e Busca de Sinais de Inteligência */}
            <div className="border border-white/5 rounded-2xl p-3 bg-[#0d0d11]/80 backdrop-blur-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-mono tracking-widest text-zinc-400 uppercase font-extrabold">Busca Multi-Raios</span>
                </div>
                <button
                  onClick={toggleTriangulation}
                  className={cn(
                    "text-[8px] font-mono uppercase font-bold tracking-wider px-2 py-1 rounded border transition-all active:scale-95",
                    isTriangulating 
                      ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20" 
                      : "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
                  )}
                >
                  {isTriangulating ? "Desligar" : "Triangular"}
                </button>
              </div>

              {isTriangulating ? (
                <div className="space-y-2.5">
                  {/* Channels A, B, C */}
                  <div className="space-y-2">
                    {triangulationPoints.map((p) => (
                      <div key={p.id} className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between text-[9px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full flex items-center justify-center text-[7px] font-extrabold text-white" style={{ backgroundColor: p.color }}>
                              {p.id}
                            </span>
                            <span className="font-bold text-zinc-300 truncate">{p.name}</span>
                          </div>
                          
                          <button
                            onClick={() => {
                              setPositioningTarget(positioningTarget === p.id ? null : p.id as 'A' | 'B' | 'C');
                            }}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[7.5px] font-mono font-medium tracking-tight border active:scale-95 transition-all",
                              positioningTarget === p.id
                                ? "bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse"
                                : "bg-white/5 border-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                            )}
                          >
                            {positioningTarget === p.id ? "Clicar..." : "Ajustar"}
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <label className="text-[7.5px] font-mono text-zinc-500 shrink-0 w-11 uppercase leading-none">Raio: {p.radiusKm.toFixed(1)}km</label>
                          <input 
                            type="range" 
                            min="0.3" 
                            max="8.0" 
                            step="0.1" 
                            value={p.radiusKm}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setTriangulationPoints(prev => prev.map(item => item.id === p.id ? { ...item, radiusKm: v } : item));
                            }}
                            className="flex-1 accent-purple-500 h-1 rounded bg-zinc-800 cursor-pointer outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Triangulation math estimation result panel */}
                  {triangulatedPoint && (
                    <div className="p-2 border border-emerald-950 bg-emerald-950/10 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-[8px] font-mono">
                        <span className="text-emerald-400 uppercase font-extrabold tracking-wider">Centro de Convergência</span>
                        <span className="text-zinc-600 bg-zinc-900 px-1 py-0.5 rounded">Trilateração GPS</span>
                      </div>
                      <div className="font-mono text-[8.5px] text-zinc-300 flex items-center justify-between">
                        <span>Lat: {triangulatedPoint.lat.toFixed(5)}°</span>
                        <span>Lng: {triangulatedPoint.lng.toFixed(5)}°</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => {
                            updateMapPosition(triangulatedPoint.lat, triangulatedPoint.lng, "Ponto de Intercepção Sintonizado");
                            if (mapRef.current) {
                              mapRef.current.setView([triangulatedPoint.lat, triangulatedPoint.lng], 14, { animate: true });
                            }
                          }}
                          className="w-full py-1.5 bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 text-[8.5px] font-bold rounded-lg transition-all active:scale-95 outline-none flex items-center justify-center gap-1"
                        >
                          <Compass size={10} className="text-emerald-400 animate-spin" style={{ animationDuration: '6s' }} />
                          <span>Ir ao Alvo</span>
                        </button>
                        <button
                          onClick={() => disperseEmitters(currentCoords.lat, currentCoords.lng)}
                          className="w-full py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-zinc-300 text-[8.5px] font-bold rounded-lg transition-all active:scale-95 outline-none flex items-center justify-center gap-1"
                        >
                          <RotateCw size={10} className="text-zinc-500" />
                          <span>Dispersar</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-2.5 px-2 bg-black/10 border border-white/[0.02] rounded-xl">
                  <p className="text-[8.5px] text-zinc-500 leading-normal">
                    Simule 3 antenas repetidoras simultâneas e calcule seu ponto exato de cruzamento via varredura de raios e laser dinâmico.
                  </p>
                  <button
                    onClick={toggleTriangulation}
                    className="mt-2 px-2.5 py-1 bg-purple-500/10 hover:bg-purple-500/15 text-purple-300 border border-purple-500/20 text-[8.5px] font-bold rounded-lg transition-all active:scale-95 outline-none"
                  >
                    Ativar Trilateração
                  </button>
                </div>
              )}
            </div>

            {/* History of searched coordinates */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Rastro de Navegação</span>
                <History size={10} className="text-zinc-600" />
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {searchHistory.map((hist, idx) => (
                  <button
                    key={idx}
                    onClick={() => updateMapPosition(hist.lat, hist.lng, hist.name)}
                    className="w-full text-left p-2 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all flex items-center gap-2"
                  >
                    <div className="w-1.5 h-1.5 bg-purple-500/20 group-hover:bg-purple-500 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] text-zinc-300 truncate block font-medium">{hist.name}</span>
                      <span className="text-[7.5px] text-zinc-600 font-mono block mt-0.5">
                        {hist.lat.toFixed(4)}, {hist.lng.toFixed(4)} • {hist.time}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Mobile action confirmation overlay button */}
          <div className="md:hidden p-3 bg-zinc-900 border-t border-white/5 shrink-0 mt-auto">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="w-full h-10 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-xs active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Check size={14} />
              <span>Ver Mapa Sintonizado</span>
            </button>
          </div>

          {/* Active location indicator footer (Desktop only) */}
          <div className="hidden md:flex mt-auto p-4 border-t border-white/[0.04] bg-black/20 text-[9px] text-zinc-400 items-center gap-2">
            <MapPin size={12} className="text-purple-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-zinc-600 block uppercase text-[7px] tracking-wider">FOCO DE RETÍCULO ATIVO</span>
              <span className="truncate block text-white font-medium">{locationName}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Map Container Screen */}
        <div className="flex-1 h-full relative bg-[#09090b] overflow-hidden">
          {!isLeafletLoaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-3 font-mono">
              <Loader2 size={32} className="animate-spin text-purple-500/80" />
              <div className="text-center">
                <p className="text-xs">Sincronizando Cartografia Neural...</p>
                <p className="text-[10px] text-zinc-600 mt-1">Carregando bibliotecas geográficas dinâmicas</p>
              </div>
            </div>
          ) : (
            <>
              {/* Map Canvas target with gorgeous hardware-accelerated 3D flight camera perspective */}
              <div 
                ref={mapContainerRef} 
                className={cn(
                  "w-full h-full z-10 transition-all duration-1000 ease-in-out origin-center",
                  orbitMode === '3d' ? "scale-[1.12]" : ""
                )}
                style={orbitMode === '3d' ? {
                  transform: 'perspective(1200px) rotateX(34deg) rotateY(-5deg) rotateZ(6deg)',
                  boxShadow: '0 40px 100px rgba(0,0,0,0.85), inset 0 0 100px rgba(0,0,0,0.85)'
                } : undefined}
              />

              {/* In-Map Zoom Controls */}
              <div className="absolute bottom-6 right-6 z-[20] flex flex-col gap-1.5">
                <button
                  onClick={zoomIn}
                  className="w-10 h-10 rounded-xl bg-zinc-950/95 hover:bg-zinc-900 border border-white/10 hover:border-white/20 text-white flex items-center justify-center shadow-2xl active:scale-95 transition-all outline-none"
                  title="Aproximar Visão"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={zoomOut}
                  className="w-10 h-10 rounded-xl bg-zinc-950/95 hover:bg-zinc-900 border border-white/10 hover:border-white/20 text-white flex items-center justify-center shadow-2xl active:scale-95 transition-all outline-none"
                  title="Afastar Visão"
                >
                  <Minus size={16} />
                </button>
              </div>

              {/* Float Panel: Interactive Perspective Controls (Voo 2D / 3D Simulação) */}
              <div className="absolute top-3 right-3 z-[20] flex items-center gap-1.5 p-1.5 rounded-2xl bg-zinc-950/90 border border-white/[0.08] backdrop-blur-md shadow-2xl">
                <div className="hidden sm:inline-block px-2 py-1 select-none font-mono text-[7.5px] font-bold text-zinc-500 uppercase tracking-widest border-r border-white/5 pr-2.5">
                  Câmera
                </div>
                {[
                  { id: 'off', name: 'Manual', desc: 'Foco Fixo', icon: Pin },
                  { id: '2d', name: 'Órbita 2D', desc: 'Varredura plana', icon: RotateCw },
                  { id: '3d', name: 'Voo 3D', desc: 'Imersão livre', icon: Compass }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setOrbitMode(mode.id as any)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all text-xs font-sans font-medium outline-none active:scale-95",
                      orbitMode === mode.id
                        ? "bg-purple-500/20 border-purple-500/35 text-white shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                        : "bg-transparent border-transparent hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                    )}
                    title={`${mode.name}: ${mode.desc}`}
                  >
                    <mode.icon size={12} className={cn(orbitMode === mode.id && mode.id !== 'off' ? "text-purple-400 animate-spin" : "")} style={orbitMode === mode.id && mode.id !== 'off' ? { animationDuration: mode.id === '3d' ? '12s' : '6s' } : undefined} />
                    <span className="text-[10px] tracking-tight">{mode.name}</span>
                  </button>
                ))}
              </div>

              {/* Floating Map HUD details display */}
              <div className="absolute top-3 left-3 right-3 sm:left-4 sm:top-4 z-[20] pointer-events-none max-w-[calc(100%-1.5rem)] sm:max-w-sm">
                <div className="bg-zinc-950/95 border border-white/[0.08] backdrop-blur-md p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shadow-2xl flex items-center sm:items-start gap-2 sm:gap-2.5">
                  <div className="p-1.5 sm:p-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg sm:rounded-xl shrink-0">
                    <Compass size={13} className="animate-spin" style={{ animationDuration: '8s' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[6.5px] sm:text-[7px] font-bold font-mono tracking-widest text-purple-400 block uppercase">
                      {orbitMode === '3d' ? "Simulação de Órbita Imersiva 3D" : orbitMode === '2d' ? "Varredura de Câmera 2D Ativa" : "Foco de Retículo"}
                    </span>
                    <p className="text-[9.5px] sm:text-[10px] text-zinc-100 font-medium truncate mt-0.5">{locationName}</p>
                    <span className="text-[7.5px] sm:text-[8px] text-zinc-500 block font-mono mt-0.5 truncate">
                      Grid: {currentCoords.lat.toFixed(4)}°, {currentCoords.lng.toFixed(4)}°
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
