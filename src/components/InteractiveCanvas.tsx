import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MousePointer2, Pencil, Brush, Eraser, Square, Circle, 
  Minus, ArrowRight, Type, Image as ImageIcon, Undo2, 
  Redo2, Grid, Trash2, Download, Upload, X, Layers, 
  Plus, ChevronUp, ChevronDown, Eye, EyeOff, Sparkles, PaintBucket
} from 'lucide-react';
import { cn } from '../lib/utils';
import { DrawingObject } from '../types';

interface InteractiveCanvasProps {
  objects: DrawingObject[];
  setObjects: (objs: DrawingObject[] | ((prev: DrawingObject[]) => DrawingObject[])) => void;
  onClear?: () => void;
  isAIProcessing?: boolean;
}

type CanvasTool = 'select' | 'pen' | 'brush' | 'eraser' | 'line' | 'arrow' | 'rect' | 'circle' | 'text';
type FillMode = 'stroke' | 'fill' | 'both';
type CanvasBgStyle = 'dark' | 'light' | 'grid' | 'sepia';

export function InteractiveCanvas({ objects, setObjects, onClear, isAIProcessing }: InteractiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core drawing state
  const [currentTool, setCurrentTool] = useState<CanvasTool>('pen');
  const [currentColor, setCurrentColor] = useState('#8B5CF6');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [opacity, setOpacity] = useState(1);
  const [fillMode, setFillMode] = useState<FillMode>('stroke');
  const [fontSize, setFontSize] = useState(24);
  const [bgStyle, setBgStyle] = useState<CanvasBgStyle>('dark');
  const [showGrid, setShowGrid] = useState(true);

  // Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  
  // High-performance tracker for current action preview
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [tempRectSize, setTempRectSize] = useState<{ w: number; h: number } | null>(null);
  const [tempRadius, setTempRadius] = useState<number | null>(null);
  
  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDraggingSelected, setIsDraggingSelected] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Inline text creator
  const [activeTextCreator, setActiveTextCreator] = useState<{ x: number; y: number } | null>(null);
  const [textInputVal, setTextInputVal] = useState('');

  // Local Undo / Redo stacks
  const [redoStack, setRedoStack] = useState<DrawingObject[][]>([]);

  // Premium design palettes
  const PALETTES = [
    '#8B5CF6', // Purple Glow
    '#EC4899', // Cyber Pink
    '#3B82F6', // Cobalt Electric
    '#10B981', // Neon Emerald
    '#F59E0B', // Sun-gold Amber
    '#EF4444', // Crimson Pulsar
    '#ffffff', // Absolute Snow
    '#000000', // Deep Void
  ];

  // Helper for background colors based on style
  const getBackgroundColorStr = () => {
    switch (bgStyle) {
      case 'dark': return '#0b0b0f';
      case 'light': return '#ffffff';
      case 'sepia': return '#FAF6F0';
      case 'grid': return '#121214';
      default: return '#0b0b0f';
    }
  };

  // Push standard action to undo state
  const pushToHistory = (newObjects: DrawingObject[]) => {
    setObjects(newObjects);
    setRedoStack([]); // Clear redo
  };

  // Resize canvas handler
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        drawAll();
      }
    };

    window.addEventListener('resize', handleResize);
    // Tiny delay to allow window animation/initial layout
    const timer = setTimeout(handleResize, 100);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [objects, bgStyle, showGrid, selectedId, currentPoints, tempRectSize, tempRadius, activeTextCreator]);

  // Redraw canvas on any structural change
  useEffect(() => {
    drawAll();
  }, [objects, bgStyle, showGrid, selectedId, currentPoints, tempRectSize, tempRadius, activeTextCreator]);

  const drawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Backdrop
    ctx.fillStyle = getBackgroundColorStr();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render Grid Lines if requested
    if (showGrid) {
      ctx.strokeStyle = bgStyle === 'light' || bgStyle === 'sepia' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      
      // Vertical grid
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      
      // Horizontal grid
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // Render static completed objects
    objects.forEach(obj => {
      // Skip if marked hidden
      const isHidden = (obj as any).visible === false;
      if (isHidden) return;

      ctx.save();
      ctx.globalAlpha = obj.opacity ?? 1;
      
      // Configure stroke/fill
      ctx.strokeStyle = obj.stroke || obj.color || '#fff';
      ctx.fillStyle = obj.fill || obj.color || 'transparent';
      ctx.lineWidth = (obj as any).lineWidth || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Advanced support for eraser brush stroke with transparent cut out
      if ((obj as any).isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)'; // Must draw dense alpha to cut out pixels
      }

      switch (obj.type) {
        case 'line':
          if (obj.points && obj.points.length >= 4) {
            ctx.beginPath();
            ctx.moveTo(obj.points[0], obj.points[1]);
            for (let i = 2; i < obj.points.length; i += 2) {
              ctx.lineTo(obj.points[i], obj.points[i+1]);
            }
            ctx.stroke();

            // Arrow addition support
            if ((obj as any).isArrow) {
              const startX = obj.points[0];
              const startY = obj.points[1];
              const endX = obj.points[obj.points.length - 2];
              const endY = obj.points[obj.points.length - 1];
              drawArrowHead(ctx, startX, startY, endX, endY, (obj as any).lineWidth || 4);
            }
          }
          break;
        case 'rect':
          ctx.beginPath();
          ctx.rect(obj.x, obj.y, obj.width || 0, obj.height || 0);
          if (obj.fill && obj.fill !== 'transparent') ctx.fill();
          if (obj.stroke && obj.stroke !== 'transparent') ctx.stroke();
          break;
        case 'circle':
          ctx.beginPath();
          ctx.arc(obj.x, obj.y, obj.radius || 0, 0, Math.PI * 2);
          if (obj.fill && obj.fill !== 'transparent') ctx.fill();
          if (obj.stroke && obj.stroke !== 'transparent') ctx.stroke();
          break;
        case 'text':
          ctx.font = `${obj.fontSize || 24}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = obj.color || '#fff';
          ctx.textBaseline = 'top';
          ctx.fillText(obj.text || '', obj.x, obj.y);
          break;
        case 'image':
          if ((obj as any)._imgElement) {
            try {
              ctx.drawImage((obj as any)._imgElement, obj.x, obj.y, obj.width || 100, obj.height || 100);
            } catch (err) {
              // Fail-safe image rendering if image load timed out
              ctx.fillStyle = 'rgba(255,255,255,0.1)';
              ctx.fillRect(obj.x, obj.y, obj.width || 100, obj.height || 100);
            }
          } else {
            // Lazy-load image element for static representation
            const img = new Image();
            img.src = obj.text || ''; // text contains image URL or dataURL
            img.onload = () => {
              (obj as any)._imgElement = img;
              drawAll();
            };
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(obj.x, obj.y, obj.width || 100, obj.height || 100);
          }
          break;
      }
      ctx.restore();

      // Draw Selection Outline Wrapper
      if (selectedId && selectedId === obj.id) {
        ctx.save();
        ctx.strokeStyle = '#8B5CF6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        
        let bounds = getObjectBoundingBox(obj);
        ctx.strokeRect(
          bounds.x - 6,
          bounds.y - 6,
          bounds.width + 12,
          bounds.height + 12
        );
        
        // Visual select dots
        ctx.fillStyle = '#8B5CF6';
        ctx.beginPath();
        ctx.arc(bounds.x - 6, bounds.y - 6, 4.5, 0, Math.PI*2);
        ctx.arc(bounds.x + bounds.width + 6, bounds.y - 6, 4.5, 0, Math.PI*2);
        ctx.arc(bounds.x - 6, bounds.y + bounds.height + 6, 4.5, 0, Math.PI*2);
        ctx.arc(bounds.x + bounds.width + 6, bounds.y + bounds.height + 6, 4.5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
    });

    // Draw Live-Action preview (for real-time feedback during drawing)
    if (isDrawing) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = currentColor;
      ctx.fillStyle = fillMode === 'stroke' ? 'transparent' : currentColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (currentTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      }

      switch (currentTool) {
        case 'pen':
        case 'brush':
        case 'eraser':
          if (currentPoints.length >= 4) {
            ctx.beginPath();
            ctx.moveTo(currentPoints[0], currentPoints[1]);
            for (let i = 2; i < currentPoints.length; i += 2) {
              ctx.lineTo(currentPoints[i], currentPoints[i+1]);
            }
            ctx.stroke();
          }
          break;
        case 'line':
          if (currentPoints.length >= 4) {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentPoints[currentPoints.length - 2], currentPoints[currentPoints.length - 1]);
            ctx.stroke();
          }
          break;
        case 'arrow':
          if (currentPoints.length >= 4) {
            const endX = currentPoints[currentPoints.length - 2];
            const endY = currentPoints[currentPoints.length - 1];
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            drawArrowHead(ctx, startX, startY, endX, endY, strokeWidth);
          }
          break;
        case 'rect':
          if (tempRectSize) {
            ctx.beginPath();
            ctx.rect(startX, startY, tempRectSize.w, tempRectSize.h);
            if (fillMode === 'fill' || fillMode === 'both') {
              ctx.fill();
            }
            if (fillMode === 'stroke' || fillMode === 'both') {
              ctx.stroke();
            }
          }
          break;
        case 'circle':
          if (tempRadius !== null) {
            ctx.beginPath();
            ctx.arc(startX, startY, tempRadius, 0, Math.PI * 2);
            if (fillMode === 'fill' || fillMode === 'both') {
              ctx.fill();
            }
            if (fillMode === 'stroke' || fillMode === 'both') {
              ctx.stroke();
            }
          }
          break;
      }
      ctx.restore();
    }
  };

  // Secondary helper to draw a crisp direction arrow head
  const drawArrowHead = (ctx: CanvasRenderingContext2D, sx: number, sy: number, ex: number, ey: number, width: number) => {
    const angle = Math.atan2(ey - sy, ex - sx);
    const arrowLength = Math.max(15, width * 3.5);
    
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - arrowLength * Math.cos(angle - Math.PI / 6),
      ey - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - arrowLength * Math.cos(angle + Math.PI / 6),
      ey - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
    ctx.restore();
  };

  // Coordinate helper
  const getCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }
    
    return {
      x: Math.round(clientX - rect.left),
      y: Math.round(clientY - rect.top)
    };
  };

  // Helper to obtain the rectangular box bounds of an object for visual selector highlights
  const getObjectBoundingBox = (obj: DrawingObject) => {
    switch (obj.type) {
      case 'rect':
        return {
          x: obj.width! < 0 ? obj.x + obj.width! : obj.x,
          y: obj.height! < 0 ? obj.y + obj.height! : obj.y,
          width: Math.abs(obj.width || 0),
          height: Math.abs(obj.height || 0)
        };
      case 'circle':
        return {
          x: obj.x - (obj.radius || 0),
          y: obj.y - (obj.radius || 0),
          width: (obj.radius || 0) * 2,
          height: (obj.radius || 0) * 2
        };
      case 'text':
        // Estimate dimensions of text
        const canvas = canvasRef.current;
        let textWidth = 100;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.save();
            ctx.font = `${obj.fontSize || 24}px Inter`;
            textWidth = ctx.measureText(obj.text || '').width;
            ctx.restore();
          }
        }
        return {
          x: obj.x,
          y: obj.y,
          width: textWidth,
          height: (obj.fontSize || 24) * 1.2
        };
      case 'image':
        return {
          x: obj.x,
          y: obj.y,
          width: obj.width || 120,
          height: obj.height || 120
        };
      case 'line':
      default:
        if (obj.points && obj.points.length >= 2) {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          
          for (let i = 0; i < obj.points.length; i += 2) {
            const px = obj.points[i];
            const py = obj.points[i+1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
          
          return {
            x: minX,
            y: minY,
            width: Math.max(10, maxX - minX),
            height: Math.max(10, maxY - minY)
          };
        }
        return { x: obj.x, y: obj.y, width: 20, height: 20 };
    }
  };

  // Proximity click target math helper for 'Selector' mode
  const findObjectAtCoords = (x: number, y: number): string | null => {
    // Traverse backwards so top/latest elements gets priority click selection
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if ((obj as any).visible === false) continue;

      const bounds = getObjectBoundingBox(obj);
      // Simple collision inside bounding box with broad tolerance margins
      const tolerance = 8;
      if (
        x >= bounds.x - tolerance &&
        x <= bounds.x + bounds.width + tolerance &&
        y >= bounds.y - tolerance &&
        y <= bounds.y + bounds.height + tolerance
      ) {
        return obj.id;
      }
    }
    return null;
  };

  // Begin Interaction logic
  const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Guard text input focuses
    if (activeTextCreator) return;

    const { x, y } = getCoords(e);
    setStartX(x);
    setStartY(y);

    if (currentTool === 'select') {
      const clickedId = findObjectAtCoords(x, y);
      if (clickedId) {
        setSelectedId(clickedId);
        setIsDraggingSelected(true);
        const obj = objects.find(o => o.id === clickedId)!;
        setDragOffset({
          x: x - obj.x,
          y: y - obj.y
        });
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (currentTool === 'text') {
      setActiveTextCreator({ x, y });
      setTextInputVal('');
      return;
    }

    // Default Canvas Draw Initialization
    setIsDrawing(true);
    setCurrentPoints([x, y, x, y]);
    setTempRectSize({ w: 0, h: 0 });
    setTempRadius(0);
  };

  // Move Dragging and Shape expansion logic
  const handleInteractionMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y } = getCoords(e);

    if (currentTool === 'select' && isDraggingSelected && selectedId) {
      setObjects(prev => prev.map(obj => {
        if (obj.id === selectedId) {
          const dx = x - dragOffset.x - obj.x;
          const dy = y - dragOffset.y - obj.y;
          
          if (obj.type === 'line' && obj.points) {
            // Shift all vector coordinate points
            const newPoints = obj.points.map((p, idx) => {
              return idx % 2 === 0 ? p + dx : p + dy;
            });
            return {
              ...obj,
              x: obj.x + dx,
              y: obj.y + dy,
              points: newPoints
            };
          }
          
          // Basic shapes or text
          return {
            ...obj,
            x: obj.x + dx,
            y: obj.y + dy
          };
        }
        return obj;
      }));
      return;
    }

    if (!isDrawing) return;

    switch (currentTool) {
      case 'pen':
      case 'brush':
      case 'eraser':
        // Append raw coordinates to points stack
        setCurrentPoints(prev => [...prev, x, y]);
        break;
      case 'line':
      case 'arrow':
        setCurrentPoints([startX, startY, x, y]);
        break;
      case 'rect':
        setTempRectSize({
          w: x - startX,
          h: y - startY
        });
        break;
      case 'circle':
        const r = Math.round(Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2)));
        setTempRadius(r);
        break;
    }
  };

  // Finish element construction and push state
  const handleInteractionEnd = () => {
    if (currentTool === 'select') {
      if (isDraggingSelected) {
        setIsDraggingSelected(false);
        pushToHistory([...objects]);
      }
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    const endPointIdx = currentPoints.length - 2;
    const finalX = currentPoints[endPointIdx] || startX;
    const finalY = currentPoints[endPointIdx + 1] || startY;

    let newElement: DrawingObject | null = null;
    const elementId = Math.random().toString(36).substring(2, 11);

    switch (currentTool) {
      case 'pen':
      case 'brush':
      case 'eraser':
        if (currentPoints.length >= 4) {
          newElement = {
            id: elementId,
            type: 'line',
            x: startX,
            y: startY,
            points: currentPoints,
            stroke: currentColor,
            color: currentColor,
            opacity: opacity,
            lineWidth: strokeWidth,
            isEraser: currentTool === 'eraser',
            visible: true
          } as any;
        }
        break;
      case 'line':
        if (currentPoints.length >= 4) {
          newElement = {
            id: elementId,
            type: 'line',
            x: startX,
            y: startY,
            points: [startX, startY, finalX, finalY],
            stroke: currentColor,
            color: currentColor,
            opacity: opacity,
            lineWidth: strokeWidth,
            visible: true
          } as any;
        }
        break;
      case 'arrow':
        if (currentPoints.length >= 4) {
          newElement = {
            id: elementId,
            type: 'line',
            x: startX,
            y: startY,
            points: [startX, startY, finalX, finalY],
            stroke: currentColor,
            color: currentColor,
            opacity: opacity,
            lineWidth: strokeWidth,
            isArrow: true,
            visible: true
          } as any;
        }
        break;
      case 'rect':
        if (tempRectSize && (Math.abs(tempRectSize.w) > 2 || Math.abs(tempRectSize.h) > 2)) {
          newElement = {
            id: elementId,
            type: 'rect',
            x: startX,
            y: startY,
            width: tempRectSize.w,
            height: tempRectSize.h,
            stroke: fillMode === 'fill' ? 'transparent' : currentColor,
            fill: fillMode === 'stroke' ? 'transparent' : currentColor,
            opacity: opacity,
            lineWidth: strokeWidth,
            visible: true
          } as any;
        }
        break;
      case 'circle':
        if (tempRadius && tempRadius > 2) {
          newElement = {
            id: elementId,
            type: 'circle',
            x: startX,
            y: startY,
            radius: tempRadius,
            stroke: fillMode === 'fill' ? 'transparent' : currentColor,
            fill: fillMode === 'stroke' ? 'transparent' : currentColor,
            opacity: opacity,
            lineWidth: strokeWidth,
            visible: true
          } as any;
        }
        break;
    }

    if (newElement) {
      const updated = [...objects, newElement];
      pushToHistory(updated);
    }

    // Reset preview metrics
    setCurrentPoints([]);
    setTempRectSize(null);
    setTempRadius(null);
  };

  // Direct Inline Text confirmation
  const handleConfirmText = () => {
    if (!activeTextCreator || !textInputVal.trim()) {
      setActiveTextCreator(null);
      return;
    }

    const textObj: DrawingObject = {
      id: Math.random().toString(36).substring(2, 11),
      type: 'text',
      x: activeTextCreator.x,
      y: activeTextCreator.y,
      text: textInputVal.trim(),
      color: currentColor,
      fontSize: fontSize,
      opacity: opacity,
      visible: true
    } as any;

    pushToHistory([...objects, textObj]);
    setActiveTextCreator(null);
    setTextInputVal('');
  };

  // Image Upload handler
  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Center the imported image on the viewport
        const canvas = canvasRef.current;
        const cx = canvas ? Math.max(20, (canvas.width - 250) / 2) : 100;
        const cy = canvas ? Math.max(20, (canvas.height - 250) / 2) : 100;

        const imgObj: DrawingObject = {
          id: Math.random().toString(36).substring(2, 11),
          type: 'image',
          x: cx,
          y: cy,
          width: img.width > 500 ? 500 : img.width,
          height: img.height > 500 ? Math.round(500 * (img.height / img.width)) : img.height,
          text: dataUrl, // Stores the dataUrl safely
          opacity: 1,
          visible: true
        } as any;

        (imgObj as any)._imgElement = img;
        pushToHistory([...objects, imgObj]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Undo / Redo operations
  const triggerUndo = () => {
    if (objects.length === 0) return;
    const currentList = [...objects];
    const popped = currentList.pop();
    if (popped) {
      setRedoStack(prev => [[...objects], ...prev]);
      setObjects(currentList);
    }
  };

  const triggerRedo = () => {
    if (redoStack.length === 0) return;
    const nextList = redoStack[0];
    setRedoStack(prev => prev.slice(1));
    setObjects(nextList);
  };

  // Layer Visibility trigger
  const toggleVisibility = (id: string) => {
    setObjects(prev => prev.map(obj => {
      if (obj.id === id) {
        return {
          ...obj,
          visible: (obj as any).visible === false ? true : false
        } as any;
      }
      return obj;
    }));
  };

  // Layer Delete trigger
  const deleteObject = (id: string) => {
    const filtered = objects.filter(o => o.id !== id);
    pushToHistory(filtered);
    if (selectedId === id) setSelectedId(null);
  };

  // Layer Reordering support
  const moveLayerIndex = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx < objects.length - 1) {
      const swapped = [...objects];
      const temp = swapped[idx];
      swapped[idx] = swapped[idx + 1];
      swapped[idx + 1] = temp;
      pushToHistory(swapped);
    } else if (direction === 'down' && idx > 0) {
      const swapped = [...objects];
      const temp = swapped[idx];
      swapped[idx] = swapped[idx - 1];
      swapped[idx - 1] = temp;
      pushToHistory(swapped);
    }
  };

  // High quality PNG download with selection overlays masked out
  const handleDownload = (transparent: boolean = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Temporarily cancel selection outline for printing
    const initialSelectedId = selectedId;
    setSelectedId(null);

    // Dynamic rendering using separate virtual printer canvas for top quality
    setTimeout(() => {
      const printerCanvas = document.createElement('canvas');
      printerCanvas.width = canvas.width;
      printerCanvas.height = canvas.height;
      const pctx = printerCanvas.getContext('2d');
      if (!pctx) return;

      if (!transparent) {
        pctx.fillStyle = getBackgroundColorStr();
        pctx.fillRect(0, 0, printerCanvas.width, printerCanvas.height);
      }

      // Draw active elements
      objects.forEach(obj => {
        if ((obj as any).visible === false) return;
        pctx.save();
        pctx.globalAlpha = obj.opacity ?? 1;
        pctx.strokeStyle = obj.stroke || obj.color || '#fff';
        pctx.fillStyle = obj.fill || obj.color || 'transparent';
        pctx.lineWidth = (obj as any).lineWidth || 4;
        pctx.lineCap = 'round';
        pctx.lineJoin = 'round';

        if ((obj as any).isEraser) {
          pctx.globalCompositeOperation = 'destination-out';
          pctx.strokeStyle = 'rgba(0,0,0,1)';
        }

        switch (obj.type) {
          case 'line':
            if (obj.points && obj.points.length >= 4) {
              pctx.beginPath();
              pctx.moveTo(obj.points[0], obj.points[1]);
              for (let i = 2; i < obj.points.length; i += 2) {
                pctx.lineTo(obj.points[i], obj.points[i+1]);
              }
              pctx.stroke();

              if ((obj as any).isArrow) {
                const endX = obj.points[obj.points.length - 2];
                const endY = obj.points[obj.points.length - 1];
                drawArrowHead(pctx, obj.points[0], obj.points[1], endX, endY, (obj as any).lineWidth || 4);
              }
            }
            break;
          case 'rect':
            pctx.beginPath();
            pctx.rect(obj.x, obj.y, obj.width || 0, obj.height || 0);
            if (obj.fill && obj.fill !== 'transparent') pctx.fill();
            if (obj.stroke && obj.stroke !== 'transparent') pctx.stroke();
            break;
          case 'circle':
            pctx.beginPath();
            pctx.arc(obj.x, obj.y, obj.radius || 0, 0, Math.PI * 2);
            if (obj.fill && obj.fill !== 'transparent') pctx.fill();
            if (obj.stroke && obj.stroke !== 'transparent') pctx.stroke();
            break;
          case 'text':
            pctx.font = `${obj.fontSize || 24}px Inter`;
            pctx.fillStyle = obj.color || '#fff';
            pctx.textBaseline = 'top';
            pctx.fillText(obj.text || '', obj.x, obj.y);
            break;
          case 'image':
            if ((obj as any)._imgElement) {
              pctx.drawImage((obj as any)._imgElement, obj.x, obj.y, obj.width || 100, obj.height || 100);
            }
            break;
        }
        pctx.restore();
      });

      // Restore highlight back on editor
      setSelectedId(initialSelectedId);

      // Save to disk
      const link = document.createElement('a');
      link.download = `osone-paint-${transparent ? 'alpha' : 'backdrop'}.png`;
      link.href = printerCanvas.toDataURL();
      link.click();
    }, 50);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="w-full flex-1 p-3 md:p-6 flex flex-col gap-4 overflow-hidden h-full"
    >
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0c0c12]/75 border border-white/[0.04] p-4 rounded-2xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 border border-purple-500/10">
            <Sparkles size={18} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase text-white">Estúdio de Arte OSONE</h2>
            <p className="text-[10px] text-white/40 font-mono">Quadro dinâmico multifuncional à mão livre e objetos inteligentes</p>
          </div>
        </div>

        {/* Global Toolbar Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-auto">
          {/* Grid Blueprint */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={cn(
              "p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 border border-transparent transition-all",
              showGrid && "bg-purple-950/40 text-purple-400 border-purple-500/20"
            )}
            title="Ligar/Desligar Coordenadas da Grade"
          >
            <Grid size={16} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" />

          {/* Canvas Background Settings */}
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/5">
            {(['dark', 'light', 'sepia', 'grid'] as CanvasBgStyle[]).map(style => (
              <button
                key={style}
                onClick={() => setBgStyle(style)}
                className={cn(
                  "px-2 py-1 text-[9px] font-mono font-bold uppercase rounded-md transition-all",
                  bgStyle === style ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                )}
                title={`Trocar fundo: ${style}`}
              >
                {style}
              </button>
            ))}
          </div>

          <div className="w-[1px] h-4 bg-white/10 mx-1" />

          {/* Undo/Redo Engine */}
          <button
            onClick={triggerUndo}
            disabled={objects.length === 0}
            className="p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all text-white/70"
            title="Desfazer Ação (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          
          <button
            onClick={triggerRedo}
            disabled={redoStack.length === 0}
            className="p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all text-white/70"
            title="Refazer Ação"
          >
            <Redo2 size={16} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" />

          {/* Upload Image Layer */}
          <button
            onClick={triggerImageUpload}
            className="p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-white/70 flex items-center gap-1.5 transition-all text-xs font-mono font-bold"
            title="Inserir Foto Local"
          >
            <Upload size={14} />
            <span className="hidden md:inline">IMAGEM</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageFileChange} 
            accept="image/*" 
            className="hidden" 
          />

          {/* Clear Layer Canvas */}
          <button
            onClick={() => {
              if (onClear) onClear();
              setSelectedId(null);
            }}
            className="p-2 rounded-lg bg-red-950/20 hover:bg-red-900/30 text-red-400 border border-red-950/90 transition-all font-mono text-xs font-bold"
            title="Apagar Tudo"
          >
            <Trash2 size={14} />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" />

          {/* Fancy Export dropdown */}
          <div className="relative group/download">
            <button
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold font-mono tracking-wider flex items-center gap-1.5 shadow-lg shadow-purple-600/10"
            >
              <Download size={14} />
              SALVAR...
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#0e0e16] border border-white/[0.08] rounded-xl shadow-2xl p-1 z-50 opacity-0 scale-95 pointer-events-none group-focus-within/download:opacity-100 group-focus-within/download:scale-100 group-focus-within/download:pointer-events-auto group-hover/download:opacity-100 group-hover/download:scale-100 group-hover/download:pointer-events-auto transition-all duration-150">
              <button
                onClick={() => handleDownload(false)}
                className="w-full text-left font-mono text-[10px] px-3 py-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                Baixar com Fundo
              </button>
              <button
                onClick={() => handleDownload(true)}
                className="w-full text-left font-mono text-[10px] px-3 py-2 text-white/85 hover:text-white hover:bg-purple-600/20 rounded-lg transition-all"
              >
                Transparência (PNG)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden min-h-0">
        
        {/* Core Sidebar Toolbox (18 tools selector & layers) */}
        <div className="w-full lg:w-48 bg-[#0c0c12]/60 border border-white/[0.04] rounded-2xl p-3 flex flex-row lg:flex-col gap-4 overflow-x-auto lg:overflow-y-auto shrink-0 custom-scrollbar">
          
          {/* Main Drawing Tools Grid */}
          <div className="flex flex-row lg:flex-col gap-1 w-full shrink-0">
            <span className="hidden lg:block text-[9.5px] font-mono font-bold tracking-widest text-white/30 uppercase mb-2 px-1">FERRAMENTAS</span>
            
            <div className="grid grid-flow-col lg:grid-cols-2 gap-1.5">
              {/* Select */}
              <button
                onClick={() => { setCurrentTool('select'); setSelectedId(null); }}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent",
                  currentTool === 'select' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Mover e Selecionar Objetos"
              >
                <MousePointer2 size={16} />
              </button>

              {/* Freehand Pen */}
              <button
                onClick={() => setCurrentTool('pen')}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent",
                  currentTool === 'pen' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Caneta Livre"
              >
                <Pencil size={16} />
              </button>

              {/* Paint brush */}
              <button
                onClick={() => setCurrentTool('brush')}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent",
                  currentTool === 'brush' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Pincel Esfumado"
              >
                <Brush size={16} />
              </button>

              {/* Eraser */}
              <button
                onClick={() => setCurrentTool('eraser')}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent",
                  currentTool === 'eraser' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Borracha de Pixel Real"
              >
                <Eraser size={16} />
              </button>

              {/* Straight Line */}
              <button
                onClick={() => setCurrentTool('line')}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent",
                  currentTool === 'line' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Reta Perfeita"
              >
                <Minus size={16} />
              </button>

              {/* Arrow indicators */}
              <button
                onClick={() => setCurrentTool('arrow')}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent",
                  currentTool === 'arrow' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Flecha Direcional"
              >
                <ArrowRight size={16} />
              </button>

              {/* Rectangle box */}
              <button
                onClick={() => setCurrentTool('rect')}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent",
                  currentTool === 'rect' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Retângulo Inteligente"
              >
                <Square size={16} />
              </button>

              {/* Perfect Circles */}
              <button
                onClick={() => setCurrentTool('circle')}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent",
                  currentTool === 'circle' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Círculo Elegante"
              >
                <Circle size={16} />
              </button>

              {/* Inline Text Layer tool */}
              <button
                onClick={() => setCurrentTool('text')}
                className={cn(
                  "p-2.5 rounded-xl flex items-center justify-center transition-all border border-transparent col-span-2 lg:col-span-1",
                  currentTool === 'text' ? "bg-purple-600 text-white shadow-md" : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
                title="Digitação de Texto"
              >
                <Type size={16} />
              </button>
            </div>
          </div>

          <div className="hidden lg:block w-full h-[1px] bg-white/5 shrink-0" />

          {/* Active Objects & Layers Minimap Index */}
          <div className="hidden lg:flex flex-col flex-1 min-h-0 w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono font-bold tracking-widest text-white/30 uppercase px-1 flex items-center gap-1.5">
                <Layers size={10} />
                VETORES ({objects.length})
              </span>
            </div>

            {objects.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center p-3 text-white/20 border border-dashed border-white/5 rounded-xl">
                <span className="text-[10px] font-mono italic">Sem objetos na tela</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar min-h-[140px]">
                {/* Visual List representation */}
                {[...objects].reverse().map((obj, i) => {
                  const actualIdx = objects.length - 1 - i;
                  return (
                    <div 
                      key={obj.id}
                      className={cn(
                        "group/layer p-1.5 rounded-lg border flex items-center justify-between text-left transition-all",
                        selectedId === obj.id 
                          ? "bg-purple-600/10 border-purple-500/30 text-purple-200" 
                          : "bg-white/[0.01] border-white/[0.03] hover:border-white/10 text-white/60 hover:text-white"
                      )}
                    >
                      <button
                        onClick={() => setSelectedId(obj.id)}
                        className="flex-1 min-w-0 flex items-center gap-1.5 text-[10px] font-mono leading-tight font-bold"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: obj.color || obj.stroke || '#fff' }} />
                        <span className="truncate uppercase tracking-wider">{obj.type}</span>
                        {obj.text && <span className="opacity-40 text-[9px] truncate">"{obj.text}"</span>}
                      </button>

                      {/* Micro Layer Commands */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/layer:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveLayerIndex(actualIdx, 'up')}
                          disabled={actualIdx === objects.length - 1}
                          className="p-1 hover:text-white text-white/30 disabled:opacity-20 transition-all"
                          title="Mover para Frente"
                        >
                          <ChevronUp size={10} />
                        </button>
                        <button
                          onClick={() => moveLayerIndex(actualIdx, 'down')}
                          disabled={actualIdx === 0}
                          className="p-1 hover:text-white text-white/30 disabled:opacity-20 transition-all"
                          title="Mover para Trás"
                        >
                          <ChevronDown size={10} />
                        </button>
                        <button
                          onClick={() => toggleVisibility(obj.id)}
                          className={cn(
                            "p-1 transition-all",
                            (obj as any).visible === false ? "text-red-400 hover:text-red-300" : "text-white/40 hover:text-white"
                          )}
                          title="Ocultar/Visível"
                        >
                          {(obj as any).visible === false ? <EyeOff size={10} /> : <Eye size={10} />}
                        </button>
                        <button
                          onClick={() => deleteObject(obj.id)}
                          className="p-1 text-white/30 hover:text-red-400 transition-all"
                          title="Deletar Elemento"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Canvas Workspace Box */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          
          <div 
            ref={containerRef}
            className={cn(
              "flex-1 border rounded-3xl relative overflow-hidden group touch-none cursor-crosshair shadow-inner min-h-[300px]",
              bgStyle === 'dark' ? "border-white/[0.05]" : bgStyle === 'light' ? "border-black/5" : bgStyle === 'sepia' ? "border-amber-900/10" : "border-purple-500/10"
            )}
            onMouseDown={handleInteractionStart}
            onMouseMove={handleInteractionMove}
            onMouseUp={handleInteractionEnd}
            onMouseLeave={handleInteractionEnd}
            onTouchStart={handleInteractionStart}
            onTouchMove={handleInteractionMove}
            onTouchEnd={handleInteractionEnd}
          >
            {/* Direct Interactive HTML5 Canvas Render Layer */}
            <canvas 
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-auto"
            />

            {/* Prompt Helper when clean canvas */}
            {objects.length === 0 && !isDrawing && !activeTextCreator && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 pointer-events-none select-none">
                <AnimatePresence>
                  {isAIProcessing ? (
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                        <Sparkles size={28} className="text-purple-400 animate-spin" />
                      </div>
                      <h3 className="text-sm font-bold font-mono tracking-widest text-purple-400">ANALISANDO O QUADRO...</h3>
                      <p className="text-[10px] text-white/30 font-mono mt-1 px-4 max-w-sm">O canal neural do OSONE está ouvindo ou estruturando respostas...</p>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center opacity-25">
                      <Pencil size={42} className="mb-4 text-white animate-bounce" />
                      <h3 className="text-lg font-serif italic text-white font-thin">Estúdio criativo livre</h3>
                      <p className="text-[11px] text-white/50 max-w-xs mt-1.5 font-mono">Arraste, desenhe, use formas geométricas ou adicione imagens para compor sua arte</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Float Overlay Inline text creator */}
            <AnimatePresence>
              {activeTextCreator && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute z-40 bg-[#0e0e15] border border-white/10 p-3.5 rounded-2xl shadow-2xl flex flex-col gap-2 min-w-[280px]"
                  style={{ 
                    left: Math.min(activeTextCreator.x, (canvasRef.current?.width || 300) - 300), 
                    top: Math.min(activeTextCreator.y, (canvasRef.current?.height || 300) - 150) 
                  }}
                  onMouseDown={(e) => e.stopPropagation()} // Guard dragging
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold text-white/40 uppercase">Adicionar Texto</span>
                    <button 
                      onClick={() => setActiveTextCreator(null)}
                      className="p-1 text-white/40 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={textInputVal}
                      onChange={(e) => setTextInputVal(e.target.value)}
                      placeholder="Sua mensagem..."
                      className="flex-1 bg-white/5 border border-white/10 p-2 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-purple-500 font-sans"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmText();
                        if (e.key === 'Escape') setActiveTextCreator(null);
                      }}
                    />
                    <button
                      onClick={handleConfirmText}
                      className="px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold font-mono transition-all"
                    >
                      OK
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono text-white/50 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="opacity-50">Tamanho:</span>
                      <input 
                        type="number"
                        value={fontSize}
                        onChange={(e) => setFontSize(Math.max(10, parseInt(e.target.value) || 12))}
                        className="w-10 bg-white/5 border border-white/10 text-center rounded text-white p-0.5"
                      />
                      <span>px</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Dynamic Element Styling and Configuration Property bar */}
          <div className="bg-[#0c0c12]/75 border border-white/[0.04] p-4 rounded-2xl flex flex-col md:flex-row flex-wrap items-center justify-between gap-5 shrink-0">
            
            {/* Color Swatch Panel */}
            <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-start">
              <span className="text-[9.5px] font-mono font-bold tracking-widest text-white/30 uppercase">COR SELECIONADA</span>
              <div className="flex items-center gap-1">
                {PALETTES.map(col => (
                  <button
                    key={col}
                    onClick={() => {
                      setCurrentColor(col);
                      if (selectedId) {
                        setObjects(prev => prev.map(obj => obj.id === selectedId ? { ...obj, color: col, stroke: col, fill: col === 'transparent' ? 'transparent' : col } : obj));
                      }
                    }}
                    className={cn(
                      "w-6.5 h-6.5 rounded-full transition-all border border-transparent flex items-center justify-center p-0.5",
                      currentColor === col ? "border-purple-500 scale-110 shadow-lg shadow-purple-500/20" : "hover:scale-105"
                    )}
                  >
                    <div className="w-full h-full rounded-full border border-white/15" style={{ backgroundColor: col }} />
                  </button>
                ))}

                <div className="w-[1px] h-5 bg-white/10 mx-1" />

                {/* Styled Native Custom Color Picker */}
                <div className="relative w-6.5 h-6.5 rounded-full overflow-hidden border border-white/10 hover:border-white/30 transition-all flex items-center justify-center bg-white/5">
                  <PaintBucket size={11} className="text-white/40 pointer-events-none absolute" />
                  <input
                    type="color"
                    value={currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#8B5CF6'}
                    onChange={(e) => {
                      setCurrentColor(e.target.value);
                      if (selectedId) {
                        setObjects(prev => prev.map(obj => obj.id === selectedId ? { ...obj, color: e.target.value, stroke: e.target.value, fill: e.target.value } : obj));
                      }
                    }}
                    className="absolute cursor-pointer opacity-0 scale-150 w-full h-full"
                    title="Paleta de Cores Adicional"
                  />
                </div>
              </div>
            </div>

            {/* Structural Parameters (LineWidth, Opacity, Fill Modes) */}
            <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-8 w-full md:w-auto flex-1 justify-end">
              {/* Stroke / Brush thickness slider */}
              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                <span className="text-[9.5px] font-mono font-bold tracking-widest text-white/30 uppercase">ESPESSURA</span>
                <div className="flex items-center gap-2.5 flex-1 sm:flex-initial">
                  <input
                    type="range"
                    min="1"
                    max="80"
                    value={strokeWidth}
                    onChange={(e) => {
                      const num = parseInt(e.target.value);
                      setStrokeWidth(num);
                      if (selectedId) {
                        setObjects(prev => prev.map(obj => obj.id === selectedId ? { ...obj, lineWidth: num } as any : obj));
                      }
                    }}
                    className="accent-purple-500 bg-white/15 h-1 w-24 sm:w-28 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center font-mono text-[9px] font-bold text-white/75">
                    {strokeWidth}
                  </div>
                </div>
              </div>

              {/* Opacity level slider */}
              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                <span className="text-[9.5px] font-mono font-bold tracking-widest text-white/30 uppercase">OPACIDADE</span>
                <div className="flex items-center gap-2.5 flex-1 sm:flex-initial">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={opacity * 100}
                    onChange={(e) => {
                      const num = parseInt(e.target.value) / 100;
                      setOpacity(num);
                      if (selectedId) {
                        setObjects(prev => prev.map(obj => obj.id === selectedId ? { ...obj, opacity: num } : obj));
                      }
                    }}
                    className="accent-purple-500 bg-white/15 h-1 w-24 sm:w-28 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="w-8 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center font-mono text-[9px] font-bold text-white/75">
                    {Math.round(opacity * 100)}%
                  </div>
                </div>
              </div>

              {/* Geometric Drawing Mode Selector (only show for shapes) */}
              {['rect', 'circle'].includes(currentTool) && (
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/[0.04] shrink-0 self-start sm:self-auto">
                  {(['stroke', 'fill', 'both'] as FillMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setFillMode(mode)}
                      className={cn(
                        "px-2.5 py-1 text-[9px] font-mono font-bold uppercase rounded-lg transition-all",
                        fillMode === mode ? "bg-purple-600 text-white shadow" : "text-white/40 hover:text-white"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </motion.div>
  );
}
