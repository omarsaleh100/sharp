'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { simulateStep, calculateSharpeRatio } from '@/lib/math';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// --- TYPES ---
interface AssetData {
  shares: number;
  price: number;
  mu: number;
  sigma: number;
  narrative?: string;
}
interface GameState {
  turn: number;
  max_turns: number;
  cash: number;
  portfolio: Record<string, AssetData>;
  history: number[];
}

// --- WARP SPEED COMPONENT ---
// Lines racing TOWARDS the center
const WarpSpeed = ({ active, speed = 1 }: { active: boolean; speed?: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        // Resize handler
        const handleResize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        // Star/Line Class
        class Star {
            x: number;
            y: number;
            z: number;
            
            constructor() {
                this.x = Math.random() * w - w / 2;
                this.y = Math.random() * h - h / 2;
                this.z = Math.random() * 2000; // Start far away
            }

            update() {
                // Move CLOSER (decrease Z)
                this.z -= 10 * speed; 
                if (this.z <= 1) {
                    this.z = 2000;
                    this.x = Math.random() * w - w / 2;
                    this.y = Math.random() * h - h / 2;
                }
            }

            draw() {
                if (!ctx) return;
                
                // Perspective projection
                const sx = (this.x / this.z) * 500 + w / 2;
                const sy = (this.y / this.z) * 500 + h / 2;

                // Previous position (for trail effect)
                const prevZ = this.z + (20 * speed);
                const px = (this.x / prevZ) * 500 + w / 2;
                const py = (this.y / prevZ) * 500 + h / 2;

                // Don't draw if out of bounds
                if (sx < 0 || sx > w || sy < 0 || sy > h) return;

                const opacity = (2000 - this.z) / 2000;
                
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(sx, sy);
                ctx.strokeStyle = `rgba(173, 71, 255, ${opacity})`; // Purple trails
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        const stars = Array.from({ length: 400 }, () => new Star());

        const render = () => {
            if (!active) {
                ctx.clearRect(0, 0, w, h);
                return;
            }
            
            // Fade effect for trails
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(0, 0, w, h);

            stars.forEach(star => {
                star.update();
                star.draw();
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [active, speed]);

    return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />;
};

// --- MAIN GAME COMPONENT ---
function GameContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [eventMsg, setEventMsg] = useState<string | null>(null);
  const [gameSpeed, setGameSpeed] = useState(1);
  const router = useRouter();

  // Initialize
  useEffect(() => {
    const initGame = async () => {
      const tickers = searchParams.get('tickers')?.split(',') || [];
      if (tickers.length === 0) return;

      try {
        const response = await fetch('http://127.0.0.1:5001/sharp-80263/us-central1/start_simulation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedTickers: tickers })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        setGameState({ ...data, history: [data.cash] });
        
        const initialAlloc: Record<string, number> = {};
        tickers.forEach((t: string) => { initialAlloc[t] = 100 / tickers.length });
        setAllocations(initialAlloc);
        setLoading(false);
      } catch (err) { console.error(err); }
    };
    initGame();
  }, [searchParams]);

  const getTotalValue = () => {
    if (!gameState) return 0;
    let val = gameState.cash;
    Object.values(gameState.portfolio).forEach(a => val += a.price * a.shares);
    return val;
  };

  // Rebalance & Simulate
  const handleNextTurn = () => {
    if (!gameState) return;
    
    // 1. Rebalance
    let currentTotalValue = gameState.cash;
    Object.entries(gameState.portfolio).forEach(([_, data]) => {
        currentTotalValue += data.shares * data.price;
    });

    const newPortfolio = { ...gameState.portfolio };
    let remainingCash = currentTotalValue;

    Object.keys(newPortfolio).forEach(ticker => {
        const targetPct = (allocations[ticker] || 0) / 100;
        const targetValue = currentTotalValue * targetPct;
        newPortfolio[ticker].shares = targetValue / newPortfolio[ticker].price;
        remainingCash -= targetValue;
    });

    // 2. Simulate
    const dt = 1/252; 
    const daysPerTurn = 63; // Quarterly

    for (let day = 0; day < daysPerTurn; day++) {
        Object.keys(newPortfolio).forEach(ticker => {
            const asset = newPortfolio[ticker];
            asset.price = simulateStep(asset.price, asset.mu, asset.sigma, dt);
        });
    }

    // 3. Event Logic
    const roll = Math.random();
    let evt = null;
    if (roll > 0.85) evt = "Market Crash! AI bubble burst, volatility spiking.";
    else if (roll < 0.1) evt = "Tech Boom! Unprecedented growth sector-wide.";

    // 4. Update State
    let newVal = remainingCash;
    Object.values(newPortfolio).forEach(a => newVal += a.price * a.shares);
    
    setEventMsg(evt);
    setGameState({
        ...gameState,
        cash: remainingCash,
        portfolio: newPortfolio,
        turn: gameState.turn + 1,
        history: [...gameState.history, newVal]
    });

    // Pause speed on event
    if (evt) setGameSpeed(0); 
    else setGameSpeed(1);
  };

  // Dismiss Event
  const handleContinue = () => {
    setEventMsg(null);
    setGameSpeed(1);
  };

  if (loading) return <div className="h-screen bg-black text-white flex items-center justify-center">Initializing Quant Engine...</div>;

  const totalVal = getTotalValue();
  const prevVal = gameState?.history[gameState.history.length - 2] || 1000000;
  const isProfit = totalVal >= prevVal;

  return (
    <main className="h-screen bg-black text-white overflow-hidden relative font-sans flex flex-col items-center justify-center">
      
      {/* 1. Background Effects */}
      <WarpSpeed active={!eventMsg && (gameState?.turn || 0) < 20} speed={gameSpeed} />
      
      {/* 2. The Orb (Central Anchor) */}
      <motion.div 
        animate={{ 
            scale: eventMsg ? 1.2 : 1,
            // Removed normal purple glow, kept red glow for events only
            boxShadow: eventMsg 
                ? '0 0 100px rgba(220, 38, 38, 0.6)' 
                : 'none'
        }}
        transition={{ duration: 0.5 }}
        className={`
            absolute z-10 w-64 h-64 rounded-full
            /* Changed black_70% to transparent_70% */
            bg-[radial-gradient(circle,var(--color-purple-main)_5%,transparent_70%)]
            ${eventMsg ? 'bg-[radial-gradient(circle,var(--color-red-600)_0%,transparent_70%)]' : ''}
        `}
      />

      {/* 3. Connecting Lines (Visualizing Assets) */}
      {!eventMsg && (
        <div className="absolute inset-0 z-10 pointer-events-none">
            {/* Simple SVGs connecting corners to center could go here, 
                but the WarpSpeed component largely handles the "lines" aesthetic requested */}
        </div>
      )}

      {/* 4. HUD: Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-20">
        
        {/* Left: History Graph */}
        <div className="flex items-end gap-1 h-12 w-48 opacity-80">
             {gameState?.history.map((val, i) => {
                 const pVal = gameState.history[i-1] || 1000000;
                 const color = val >= pVal ? 'bg-green-500' : 'bg-red-500';
                 return (
                     <motion.div 
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.min((val/1500000)*100, 100)}%` }}
                        className={`flex-1 ${color} min-w-[4px] rounded-t-sm`}
                     />
                 )
             })}
        </div>

        {/* Center: Money */}
        <div className="text-center">
            <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Portfolio Value</div>
            <div className={`text-4xl font-mono font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                ${totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
        </div>

        {/* Right: Turn Counter */}
        <div className="text-right">
            <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Turn</div>
            <div className="text-4xl font-bold text-white">
                {gameState?.turn} <span className="text-gray-600 text-2xl">/ 20</span>
            </div>
        </div>
      </div>

      {/* 5. Event Overlay (Pause State) */}
      <AnimatePresence>
          {eventMsg && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute z-30 text-center max-w-xl"
            >
                <h2 className="text-5xl font-bold text-red-500 mb-4 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">
                    MARKET EVENT
                </h2>
                <p className="text-xl text-white mb-8 font-light leading-relaxed">
                    {eventMsg}
                </p>
                
                <div className="flex gap-4 justify-center">
                    {/* Diversify forces user to adjust sliders below before continuing */}
                    <button 
                        onClick={handleContinue}
                        className="px-8 py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform"
                    >
                        Adjust & Continue
                    </button>
                </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* 6. Bottom Controls (Allocations) */}
      <div className="absolute bottom-0 w-full bg-gradient-to-t from-black via-black/90 to-transparent pt-20 pb-8 px-8 z-20 flex flex-col items-center">
         
         {/* Allocation Sliders */}
         <div className="flex gap-6 mb-8 w-full max-w-5xl overflow-x-auto no-scrollbar justify-center">
            {Object.keys(gameState!.portfolio).map(ticker => (
                <div key={ticker} className="flex flex-col items-center min-w-[100px] group">
                    <div className="bg-gray-900 border border-gray-800 p-3 rounded-xl w-full mb-3 group-hover:border-gray-600 transition-colors">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span className="font-bold text-white">{ticker}</span>
                            <span>${gameState!.portfolio[ticker].price.toFixed(0)}</span>
                        </div>
                        <div className="font-mono text-purple-400 text-lg font-bold">
                            {allocations[ticker]}%
                        </div>
                    </div>
                    
                    {/* Range Input Styling */}
                    <input 
                        type="range" 
                        min="0" max="100" 
                        value={allocations[ticker]}
                        aria-label={`Allocation percentage for ${ticker}`} 
                        onChange={(e) => setAllocations({...allocations, [ticker]: parseInt(e.target.value)})}
                        className="
                            w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer
                            [&::-webkit-slider-thumb]:appearance-none
                            [&::-webkit-slider-thumb]:w-4
                            [&::-webkit-slider-thumb]:h-4
                            [&::-webkit-slider-thumb]:bg-purple-500
                            [&::-webkit-slider-thumb]:rounded-full
                            [&::-webkit-slider-thumb]:transition-transform
                            [&::-webkit-slider-thumb]:hover:scale-125
                        "
                    />
                </div>
            ))}
         </div>

         {/* Next Turn Button (Hidden if Event is Active) */}
         {!eventMsg && gameState!.turn < 20 && (
             <button
                onClick={handleNextTurn}
                className="px-16 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-bold text-lg tracking-widest shadow-[0_0_40px_rgba(168,85,247,0.4)] transition-all hover:scale-105"
             >
                EXECUTE TURN
             </button>
         )}

         {gameState!.turn >= 20 && (
             <div className="text-2xl font-bold text-green-400 animate-pulse">
                 SIMULATION COMPLETE
                 {/* Trigger Modal Logic Here (Same as previous turn) */}
             </div>
         )}

      </div>

      {/* Game Over Modal Integration */}
      {gameState!.turn >= 20 && (
        <GameOverModal 
            history={gameState!.history} 
            portfolio={gameState!.portfolio}
            onRestart={() => router.push('/')} 
        />
      )}
    </main>
  );
}

// --- REUSED MODAL COMPONENT (Simplified for brevity) ---
function GameOverModal({ history, portfolio, onRestart }: any) {
    // ... (Same as previous turn's modal code) ...
    const score = calculateSharpeRatio(history);
    const finalValue = history[history.length - 1];
    const [username, setUsername] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const saveScore = async () => {
        if (!username) return;
        setSaving(true);
        try {
            const gameDate = new Date().toISOString().split('T')[0]; 
            await addDoc(collection(db, 'scores'), {
                username,
                score: parseFloat(score.toFixed(2)),
                finalPortfolioValue: finalValue,
                date: serverTimestamp(),
                gameDate
            });
            if (auth.currentUser) {
                 await setDoc(doc(db, 'users', auth.currentUser.uid), { lastPlayedDate: gameDate }, { merge: true });
            }
            setSaved(true);
        } catch (err) { console.error(err); } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 backdrop-blur-md">
            <div className="bg-gray-900 border border-purple-500 p-8 rounded-2xl max-w-md w-full text-center">
                <h2 className="text-3xl text-white mb-4 font-bold">Result: {score.toFixed(2)}</h2>
                {!saved ? (
                    <div className="space-y-4">
                        <input className="w-full bg-black p-3 text-white border border-gray-700 rounded" placeholder="Name" value={username} onChange={e=>setUsername(e.target.value)} />
                        <button onClick={saveScore} className="w-full bg-purple-600 py-3 text-white rounded font-bold">{saving?"Saving...":"Submit"}</button>
                    </div>
                ) : (
                    <button onClick={() => window.location.href='/leaderboard'} className="w-full bg-gray-800 py-3 text-white rounded">Leaderboard</button>
                )}
            </div>
        </div>
    )
}

export default function Game() {
    return <Suspense fallback={null}><GameContent /></Suspense>
}