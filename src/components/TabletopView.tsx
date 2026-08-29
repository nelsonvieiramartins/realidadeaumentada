import { useState, useEffect, useRef } from 'react';
import { socket } from '../lib/socket';
import { tuioService } from '../lib/tuioService';
import { Stage, Layer, Circle, Rect, Text, Group, RegularPolygon } from 'react-konva';
import { LogOut, Plus, Dices, Info, Camera, CameraOff, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const HEX_SIZE = 80;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

const snapToHex = (x: number, y: number) => {
  const q = (Math.sqrt(3)/3 * x - 1/3 * y) / HEX_SIZE;
  const r = (2/3 * y) / HEX_SIZE;
  
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(-q - r);
  
  const q_diff = Math.abs(rq - q);
  const r_diff = Math.abs(rr - r);
  const s_diff = Math.abs(rs - (-q - r));
  
  if (q_diff > r_diff && q_diff > s_diff) {
      rq = -rr - rs;
  } else if (r_diff > s_diff) {
      rr = -rq - rs;
  } else {
      rs = -rq - rr;
  }
  
  return {
    x: HEX_SIZE * Math.sqrt(3) * (rq + rr/2),
    y: HEX_SIZE * 3/2 * rr
  };
};

interface TabletopViewProps {
  onExit: () => void;
}

export default function TabletopView({ onExit }: TabletopViewProps) {
  const [objects, setObjects] = useState<Record<string, any>>({});
  const objectsRef = useRef<Record<string, any>>({});
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  const [diceRolls, setDiceRolls] = useState<any[]>([]);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const stageSizeRef = useRef({ width: 800, height: 600 });
  
  const [showTuioInfo, setShowTuioInfo] = useState(false);
  const [lastTuioUpdate, setLastTuioUpdate] = useState<string | null>(null);

  const [showUI, setShowUI] = useState(true);

  // AR Webcam States & Refs
  const [isARMode, setIsARMode] = useState(false);
  const [flipCamera, setFlipCamera] = useState(false);
  const flipCameraRef = useRef(false);
  const [luminosity, setLuminosity] = useState(1.0);
  const luminosityRef = useRef(1.0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const arCanvasRef = useRef<HTMLCanvasElement>(null);
  const arActiveRef = useRef(false);
  const lastEmitRef = useRef<number>(0);
  const lastDialRotationRef = useRef<number | null>(null);
  const lastRingRef = useRef<Float32Array | null>(null);
  const accumulatedRotationRef = useRef<number>(0);
  const lastBlueTokensRef = useRef<{ id: string; cx: number; cy: number }[]>([]);
  const lastSnappedHexRef = useRef<{x: number, y: number} | null>(null);
  const isMarkerActiveRef = useRef<boolean>(false);
  const lastActiveTabsRef = useRef<{ id: string, x: number, y: number, hex: {x: number, y: number} }[]>([]);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setBlink(b => !b), 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    luminosityRef.current = luminosity;
    flipCameraRef.current = flipCamera;
  }, [luminosity, flipCamera]);

  useEffect(() => {
    const unsubscribe = tuioService.subscribe((data) => {
      setLastTuioUpdate(`ID:${data.fiducialId} (${Math.round(data.x)},${Math.round(data.y)})`);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Initial sync
    socket.on('state:init', (state) => {
      setObjects(state.objects);
      setDiceRolls(state.diceRolls);
    });

    socket.on('object:updated', (obj) => {
      setObjects(prev => ({ ...prev, [obj.id]: obj }));
    });

    socket.on('object:deleted', (id) => {
      setObjects(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on('dice:rolled', (roll) => {
      setDiceRolls(prev => [roll, ...prev]);
    });

    return () => {
      socket.off('state:init');
      socket.off('object:updated');
      socket.off('object:deleted');
      socket.off('dice:rolled');
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const newSize = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
        setStageSize(newSize);
        stageSizeRef.current = newSize;
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [showUI]); // Re-bind if necessary, though containerRef persists

  const handleDragEnd = (e: any, id: string) => {
    const obj = objects[id];
    if (!obj) return;
    
    // Snap to nearest hex
    const { x: snappedX, y: snappedY } = snapToHex(e.target.x(), e.target.y());
    
    // Only emit if it's a local drag (not driven by TUIO)
    // For this prototype, we'll just emit the new position
    const updated = {
      ...obj,
      x: snappedX,
      y: snappedY,
    };
    setObjects(prev => ({ ...prev, [id]: updated }));
    socket.emit('object:update', updated);
  };

  const addMiniature = () => {
    const id = `mini-${Date.now()}`;
    const { x, y } = snapToHex(stageSize.width / 2, stageSize.height / 2);
    const newObj = {
      id,
      type: 'miniature',
      x,
      y,
      rotation: 0,
      label: `Hero ${Object.keys(objects).length + 1}`,
      color: '#3b82f6', // blue-500
    };
    socket.emit('object:create', newObj);
  };

  const addMonster = () => {
    const id = `monster-${Date.now()}`;
    const { x, y } = snapToHex(stageSize.width / 2 + 50, stageSize.height / 2);
    const newObj = {
      id,
      type: 'miniature',
      x,
      y,
      rotation: 0,
      label: `Orc ${Object.keys(objects).length + 1}`,
      color: '#ef4444', // red-500
    };
    socket.emit('object:create', newObj);
  };

  const toggleARMode = async () => {
    if (isARMode) {
      // Stop AR
      arActiveRef.current = false;
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      setIsARMode(false);
    } else {
      // Start AR
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setIsARMode(true);
          arActiveRef.current = true;
          requestAnimationFrame(scanAR);
        }
      } catch (err) {
        console.error('Error accessing webcam:', err);
        alert('Could not access webcam for AR mode.');
      }
    }
  };

  const scanAR = () => {
    if (!arActiveRef.current || !videoRef.current || !arCanvasRef.current) return;
    
    if (Date.now() - lastEmitRef.current < 66) {
       requestAnimationFrame(scanAR);
       return;
    }
    
    const video = videoRef.current;
    const canvas = arCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Apply luminosity filter
      ctx.filter = `brightness(${luminosityRef.current})`;
      
      if (flipCameraRef.current) {
        ctx.save();
        ctx.translate(canvas.width, canvas.height);
        ctx.scale(-1, -1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      
      ctx.filter = 'none'; // reset
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;

      // Track Red Object for Hex Marker & Tabs
      const step = 4;
      const clusters: { sumX: number, sumY: number, count: number }[] = [];
      const tabClusters: { sumX: number, sumY: number, count: number }[] = [];
      const clusterRadius = 60;
      
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          
          // Detect red (adjusted for lower light)
          const isRed = (r > 80 && r > g * 1.4 && r > b * 1.4);
          
          // Detect beige/white tabs (bright, low saturation)
          const isTab = (!isRed && r > 110 && g > 110 && b > 80 && Math.abs(r - g) < 40 && r > b * 0.7);
          
          if (isRed) {
            let found = false;
            for (let c of clusters) {
              const cx = c.sumX / c.count;
              const cy = c.sumY / c.count;
              if (Math.hypot(x - cx, y - cy) < clusterRadius) {
                c.sumX += x;
                c.sumY += y;
                c.count++;
                found = true;
                break;
              }
            }
            if (!found) {
              clusters.push({ sumX: x, sumY: y, count: 1 });
            }
          } else if (isTab) {
            let found = false;
            for (let c of tabClusters) {
              const cx = c.sumX / c.count;
              const cy = c.sumY / c.count;
              if (Math.hypot(x - cx, y - cy) < clusterRadius) {
                c.sumX += x;
                c.sumY += y;
                c.count++;
                found = true;
                break;
              }
            }
            if (!found) {
              tabClusters.push({ sumX: x, sumY: y, count: 1 });
            }
          }
        }
      }
      
      let updateBatch: Record<string, any> = {};
      
      // The largest red cluster is assumed to be the marker
      const redClusters = clusters.filter(c => c.count > 20).sort((a, b) => b.count - a.count);
      const dialCluster = redClusters.length > 0 ? redClusters[0] : null;
      
      if (dialCluster) {
        const centerX = dialCluster.sumX / dialCluster.count;
        const centerY = dialCluster.sumY / dialCluster.count;
        
        const mappedX = (centerX / w) * stageSizeRef.current.width;
        const mappedY = (centerY / h) * stageSizeRef.current.height;
        
        // Snap to potential hex grid
        const potentialHex = snapToHex(mappedX, mappedY);
        let finalHex = lastSnappedHexRef.current;
        
        if (!finalHex) {
           finalHex = potentialHex;
        } else {
           // Hysteresis / 80% Rule
           const distToPotential = Math.hypot(mappedX - potentialHex.x, mappedY - potentialHex.y);
           
           if (distToPotential < HEX_SIZE * 0.4) {
               finalHex = potentialHex;
           }
        }
        
        lastSnappedHexRef.current = finalHex;
        
        const markerId = 'ar-marker';
        
        updateBatch[markerId] = {
          id: markerId,
          type: 'hex-marker',
          x: finalHex.x,
          y: finalHex.y,
          color: '#ef4444',
          label: 'Alvo',
        };
        isMarkerActiveRef.current = true;
      } else {
        lastSnappedHexRef.current = null;
        if (isMarkerActiveRef.current) {
          updateBatch['ar-marker'] = null; // mark for deletion
          isMarkerActiveRef.current = false;
        }
      }
      
      // Process Tab Clusters
      const validTabs = tabClusters.filter(c => c.count > 15);
      const currentActiveTabs: { id: string, x: number, y: number, hex: {x: number, y: number} }[] = [];
      
      const centerHex = lastSnappedHexRef.current;
      
      validTabs.forEach(c => {
         if (!centerHex) return; // Only process tabs if there is a main marker
         
         const cx = c.sumX / c.count;
         const cy = c.sumY / c.count;
         
         const mappedX = (cx / w) * stageSizeRef.current.width;
         const mappedY = (cy / h) * stageSizeRef.current.height;
         const potentialHex = snapToHex(mappedX, mappedY);
         
         // Check if potentialHex is strictly adjacent to centerHex
         // In a pointy-topped hex grid, adjacent hexes have a center-to-center distance of exactly Math.sqrt(3) * HEX_SIZE.
         const distToCenterHex = Math.hypot(potentialHex.x - centerHex.x, potentialHex.y - centerHex.y);
         const expectedDist = Math.sqrt(3) * HEX_SIZE;
         const isAdjacent = Math.abs(distToCenterHex - expectedDist) < 5;
         
         if (!isAdjacent) return; // Discard if outside adjacency
         
         let matchedTab = null;
         let minDistance = 80;
         
         for (let pt of lastActiveTabsRef.current) {
            const dist = Math.hypot(mappedX - pt.x, mappedY - pt.y);
            if (dist < minDistance) {
               minDistance = dist;
               matchedTab = pt;
            }
         }
         
         let finalHex = potentialHex;
         let tabId = matchedTab ? matchedTab.id : `ar-tab-${Date.now()}-${Math.floor(Math.random()*1000)}`;
         
         if (matchedTab) {
            const distToPotential = Math.hypot(mappedX - potentialHex.x, mappedY - potentialHex.y);
            if (distToPotential < HEX_SIZE * 0.4) {
               finalHex = potentialHex;
            } else {
               // Ensure the matched tab's old hex was also adjacent, just in case
               finalHex = matchedTab.hex;
            }
         }
         
         currentActiveTabs.push({ id: tabId, x: mappedX, y: mappedY, hex: finalHex });
         
         updateBatch[tabId] = {
           id: tabId,
           type: 'action-tab',
           x: finalHex.x,
           y: finalHex.y,
           color: '#fbbf24',
           label: 'Ação',
         };
      });
      
      // Find deleted tabs
      for (let pt of lastActiveTabsRef.current) {
         if (!currentActiveTabs.find(t => t.id === pt.id)) {
            updateBatch[pt.id] = null;
         }
      }
      
      lastActiveTabsRef.current = currentActiveTabs;
      
      if (Object.keys(updateBatch).length > 0) {
        setObjects(prev => {
          const next = { ...prev };
          let stateChanged = false;
          for (let key in updateBatch) {
            if (updateBatch[key] === null) {
              if (next[key]) {
                delete next[key];
                socket.emit('object:delete', key);
                stateChanged = true;
              }
            } else {
              next[key] = updateBatch[key];
              socket.emit('object:update', updateBatch[key]);
              stateChanged = true;
            }
          }
          return stateChanged ? next : prev;
        });
        
        if (updateBatch['ar-marker'] === null) {
          setLastTuioUpdate(`PROCURANDO...`);
        } else if (updateBatch['ar-marker']) {
          setLastTuioUpdate(`ALVO DETECTADO`);
        }
        
        lastEmitRef.current = Date.now();
      }
    }
    
    if (arActiveRef.current) {
      requestAnimationFrame(scanAR);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0a0b0d] text-[#e0e0e0] font-sans flex flex-col overflow-hidden relative">
      {/* Header */}
      {showUI && (
        <header className="h-14 border-b border-white/10 bg-[#12141a] flex flex-shrink-0 items-center justify-between px-6 z-20">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded bg-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(234,88,12,0.4)]">
              <span className="text-white font-bold text-xs">DM</span>
            </div>
            <h1 className="text-lg font-medium tracking-tight text-white">Tabletop Simulator <span className="text-white/40 ml-2 text-sm">| Host</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowUI(false)}
              className="px-3 py-1 bg-white/5 border border-white/10 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors mr-2"
            >
              Hide UI
            </button>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div> 
              {lastTuioUpdate ? `TUIO: ${lastTuioUpdate}` : 'TUIO: LISTENING'}
            </div>
            <button onClick={onExit} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </header>
      )}

      {/* Un-Hide UI Button */}
      {!showUI && (
        <button 
          onClick={() => setShowUI(true)}
          className="absolute top-4 left-4 z-50 p-2 bg-black/50 border border-white/10 rounded-lg text-white/50 hover:text-white hover:bg-black/80 backdrop-blur transition-all"
          title="Show UI"
        >
          <Monitor size={18} />
        </button>
      )}

      <main className={`flex-1 flex overflow-hidden p-4 gap-4 ${!showUI ? 'p-0 gap-0' : ''}`}>
        {/* Sidebar */}
        {showUI && (
          <aside className="w-full md:w-64 flex flex-col gap-4 z-10 h-full">
            <div className="bg-[#12141a] rounded-xl border border-white/5 p-4 flex flex-col">
              <h2 className="text-xs uppercase tracking-widest text-white/40 font-bold mb-4">Spawn Objects</h2>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={addMiniature} className="p-3 bg-white/5 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/30 rounded-lg flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors text-blue-400">
                  <Plus size={16} /> Hero
                </button>
                <button onClick={addMonster} className="p-3 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 rounded-lg flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors text-red-400">
                  <Plus size={16} /> Monster
                </button>
              </div>
              
              <button 
                onClick={toggleARMode}
                className={`w-full py-3 mb-4 border rounded-lg text-xs font-medium uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                  isARMode 
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30' 
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                }`}
              >
                {isARMode ? <CameraOff size={14} /> : <Camera size={14} />}
                {isARMode ? 'Stop AR Camera' : 'Start AR Camera'}
              </button>
              
              {isARMode && (
                <div className="mb-4 bg-black/20 p-3 rounded-lg border border-white/5 space-y-4">
                  <div>
                    <label className="text-[10px] text-white/60 mb-2 flex justify-between uppercase tracking-wider">
                      Luminosity <span>{luminosity.toFixed(1)}x</span>
                    </label>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="4.0" 
                      step="0.1" 
                      value={luminosity}
                      onChange={(e) => setLuminosity(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                  
                  <button 
                    onClick={() => setFlipCamera(!flipCamera)}
                    className={`w-full py-2 border rounded-lg text-xs font-medium tracking-wider transition-colors flex items-center justify-center gap-2 ${
                      flipCamera 
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                        : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    Flip Camera (180°)
                  </button>
                </div>
              )}
              
              <button 
                onClick={() => setObjects({})}
                className="w-full py-3 mb-2 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 text-xs font-medium uppercase tracking-wider transition-colors text-red-400"
              >
                Clear Board
              </button>
              
              <button 
                onClick={() => setShowTuioInfo(true)}
                className="w-full py-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-xs font-medium uppercase tracking-wider transition-colors text-white/70"
              >
                <span className="flex items-center justify-center gap-2"><Info size={14} /> Tracking Info</span>
              </button>
            </div>

            <div className="flex-1 bg-[#12141a] rounded-xl border border-white/5 p-4 flex flex-col overflow-hidden">
              <h2 className="text-xs uppercase tracking-widest text-white/40 font-bold mb-4 flex items-center gap-2">
                <Dices size={14} /> Global Rolls
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                <AnimatePresence>
                  {diceRolls.slice(0, 10).map((roll, i) => (
                    <motion.div
                      key={roll.id}
                      initial={{ opacity: 0, x: -20, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: 'auto' }}
                      className="bg-white/5 border border-white/5 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-[11px] text-emerald-400 font-mono">{roll.player}</span>
                        <span className="text-[10px] text-white/40">rolled d{roll.sides}</span>
                      </div>
                      <div className="text-lg font-bold bg-black/40 w-8 h-8 flex items-center justify-center rounded border border-white/10 shadow-inner text-white font-mono">
                        {roll.result}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {diceRolls.length === 0 && (
                  <div className="text-center p-6 border border-dashed border-white/10 rounded-lg text-white/30 text-xs uppercase tracking-widest">
                    Awaiting rolls
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Main Board */}
        <section className={`flex-1 relative rounded-2xl border border-white/10 overflow-hidden shadow-inner transition-colors duration-500 ${isARMode ? 'bg-black' : 'bg-[#08090b]'}`} ref={containerRef}>
          {/* Webcam Video Background */}
          <video 
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-500 ${isARMode ? 'opacity-100' : 'opacity-0'}`}
            style={{ 
              filter: `brightness(${luminosity})`,
              transform: flipCamera ? 'scaleX(-1) scaleY(-1)' : 'none'
            }}
            playsInline
            muted
          />
          <canvas ref={arCanvasRef} className="hidden" />

          {/* AR Overlay Scanning Effect */}
          {isARMode && (
            <div className="absolute inset-0 z-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-emerald-500/50 m-8 rounded-tl-xl shadow-[0_0_15px_rgba(16,185,129,0.3)]"></div>
              <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-emerald-500/50 m-8 rounded-tr-xl shadow-[0_0_15px_rgba(16,185,129,0.3)]"></div>
              <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-emerald-500/50 m-8 rounded-bl-xl shadow-[0_0_15px_rgba(16,185,129,0.3)]"></div>
              <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-emerald-500/50 m-8 rounded-br-xl shadow-[0_0_15px_rgba(16,185,129,0.3)]"></div>
              <motion.div 
                animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                className="absolute left-1/2 -translate-x-1/2 w-[80%] h-0.5 bg-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.5)] blur-[1px]"
              />
            </div>
          )}

          <div className="absolute inset-0 z-10">
            <Stage width={stageSize.width} height={stageSize.height}>
              {/* Hex Grid Background */}
              <Layer opacity={isARMode ? 0.3 : 0.6}>
                {(() => {
                  const cols = Math.ceil(stageSize.width / HEX_WIDTH) + 2;
                  const rows = Math.ceil(stageSize.height / (HEX_HEIGHT * 0.75)) + 2;
                  const hexes = [];
                  for (let r = -2; r < rows; r++) {
                    for (let c = -2; c < cols; c++) {
                      const isOddRow = Math.abs(r) % 2 === 1;
                      const x = c * HEX_WIDTH + (isOddRow ? HEX_WIDTH / 2 : 0);
                      const y = r * HEX_HEIGHT * 0.75;
                      hexes.push(
                        <RegularPolygon
                          key={`hex-${r}-${c}`}
                          x={x}
                          y={y}
                          sides={6}
                          radius={HEX_SIZE}
                          stroke="#ffffff"
                          strokeWidth={2}
                          opacity={0.3}
                        />
                      );
                    }
                  }
                  return hexes;
                })()}
              </Layer>

              <Layer>
                {Object.values(objects).map((obj) => (
              <Group
                key={obj.id}
                x={obj.x}
                y={obj.y}
                rotation={obj.rotation}
                draggable
                onDragEnd={(e) => handleDragEnd(e, obj.id)}
              >
                {obj.type === 'hex-marker' ? (
                  <RegularPolygon
                    sides={6}
                    radius={HEX_SIZE}
                    fill="#ef4444"
                    opacity={0.6}
                    stroke="#ffffff"
                    strokeWidth={2}
                    shadowColor="#ef4444"
                    shadowBlur={15}
                  />
                ) : obj.type === 'action-tab' ? (
                  <RegularPolygon
                    sides={6}
                    radius={HEX_SIZE}
                    fill="transparent"
                    stroke="#fbbf24"
                    strokeWidth={6}
                    shadowColor="#fbbf24"
                    shadowBlur={20}
                    opacity={blink ? 1 : 0.15}
                  />
                ) : (
                  <Circle
                    radius={30}
                    fill={obj.color}
                    stroke="#ffffff"
                    strokeWidth={2}
                    shadowColor="black"
                    shadowBlur={10}
                    shadowOpacity={0.6}
                    shadowOffsetY={5}
                  />
                )}
                
                <Text
                  text={obj.id === 'ar-marker' ? '' : obj.label}
                  y={25}
                  x={-40}
                  width={80}
                  align="center"
                  fill="white"
                  fontSize={12}
                  fontFamily="sans-serif"
                  fontStyle="bold"
                />
                {obj.fiducialId !== undefined && (
                  <Text
                    text={`ID:${obj.fiducialId}`}
                    y={-6}
                    x={-20}
                    width={40}
                    align="center"
                    fill="rgba(255,255,255,0.7)"
                    fontSize={10}
                  />
                )}
              </Group>
            ))}
          </Layer>
        </Stage>
          </div>

          {/* Floating bottom HUD */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/80 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-full z-20 pointer-events-none">
            <div className="text-center border-r border-white/10 pr-4">
              <p className="text-[9px] uppercase opacity-40">Grid Scale</p>
              <p className="text-xs font-mono">5ft / Sq</p>
            </div>
            <div className="text-center border-r border-white/10 pr-4">
              <p className="text-[9px] uppercase opacity-40">Lighting</p>
              <p className="text-xs font-mono">Dungeon Dim</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] uppercase opacity-40">Layer</p>
              <p className="text-xs font-mono">Tactical-Top</p>
            </div>
          </div>
        </section>
      </main>

      {/* TUIO Info Modal */}
      <AnimatePresence>
        {showTuioInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#12141a] border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4"
            >
              <h3 className="text-xl font-bold text-white">Physical TUIO Tracking</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                To use physical miniature tracking with reacTIVision on this hosted platform, you'll need to run a small local bridge script on the same machine running your camera.
              </p>
              
              <div className="bg-[#08090b] rounded-xl p-4 border border-white/5 shadow-inner">
                <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-bold">1. Install dependencies locally:</p>
                <code className="text-xs text-emerald-400 font-mono bg-white/5 p-1 rounded">npm install osc socket.io-client</code>
                
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-4 mb-2 font-bold">2. Run this node script (bridge.js):</p>
                <pre className="text-[11px] text-white/70 font-mono overflow-x-auto whitespace-pre-wrap">
{`const osc = require("osc");
const io = require("socket.io-client");

// Connect to this cloud app
const socket = io("${window.location.origin}");

// Listen to reacTIVision (default UDP 3333)
const udpPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 3333,
  metadata: true
});

udpPort.on("message", (msg) => {
  if (msg.address === "/tuio/2Dobj" && msg.args[0].value === "set") {
    socket.emit("tuio:update", {
      id: msg.args[1].value, // fiducial ID
      x: msg.args[2].value * 800, // Normalize to screen
      y: msg.args[3].value * 600,
      angle: msg.args[4].value
    });
  }
});

udpPort.open();
console.log("Bridge running...");`}
                </pre>
              </div>
              
              <button 
                onClick={() => setShowTuioInfo(false)}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-colors mt-4 uppercase tracking-wider text-xs border border-white/10"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
