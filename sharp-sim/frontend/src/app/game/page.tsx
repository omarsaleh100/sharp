'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { simulateStep, calculateSharpeRatio } from '@/lib/math';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

/* ... Types and WarpSpeed Component (unchanged) ... */
// (Assuming WarpSpeed is defined here as in previous version)
// --- WARP SPEED COMPONENT (Keep as is) ---
const WarpSpeed = ({ active, speed = 1 }: { active: boolean; speed?: number }) => {
    // ... (Previous implementation) ...
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let animationFrameId: number;
        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;
        const handleResize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
        window.addEventListener('resize', handleResize);
        class Star {
            x: number; y: number; z: number;
            constructor() { this.x = Math.random() * w - w / 2; this.y = Math.random() * h - h / 2; this.z = Math.random() * 2000; }
            update() { this.z -= 10 * speed; if (this.z <= 1) { this.z = 2000; this.x = Math.random() * w - w / 2; this.y = Math.random() * h - h / 2; } }
            draw() {
                if (!ctx) return;
                const sx = (this.x / this.z) * 500 + w / 2; const sy = (this.y / this.z) * 500 + h / 2;
                const prevZ = this.z + (20 * speed); const px = (this.x / prevZ) * 500 + w / 2; const py = (this.y / prevZ) * 500 + h / 2;
                if (sx < 0 || sx > w || sy < 0 || sy > h) return;
                const opacity = (2000 - this.z) / 2000;
                ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.strokeStyle = `rgba(173, 71, 255, ${opacity})`; ctx.lineWidth = 1; ctx.stroke();
            }
        }
        const stars = Array.from({ length: 400 }, () => new Star());
        const render = () => {
            if (!active) { ctx.clearRect(0, 0, w, h); return; }
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(0, 0, w, h);
            stars.forEach(star => { star.update(); star.draw(); });
            animationFrameId = requestAnimationFrame(render);
        };
        render();
        return () => { window.removeEventListener('resize', handleResize); cancelAnimationFrame(animationFrameId); };
    }, [active, speed]);
    return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />;
};

// --- MAIN GAME COMPONENT ---
function GameContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<any | null>(null); // Typed 'any' for brevity, use Interface in real code
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [eventMsg, setEventMsg] = useState<string | null>(null);
  const [gameSpeed, setGameSpeed] = useState(1);
  const router = useRouter();

  useEffect(() => {
    const initGame = async () => {
      const tickers = searchParams.get('tickers')?.split(',') || [];
      if (tickers.length === 0) return;
      try {
        const response = await fetch('http://127.0.0.1:5001/sharp-80263/us-central1/start_simulation', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedTickers: tickers })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setGameState({ ...data, history: [data.cash] });
        const initialAlloc: Record<string, number> = {};
        tickers.forEach((t: string) => { 
            initialAlloc[t] = Math.floor(100 / tickers.length);
        });
        setAllocations(initialAlloc);
        setLoading(false);
      } catch (err) { console.error(err); }
    };
    initGame();
  }, [searchParams]);

  const getTotalValue = () => {
    if (!gameState) return 0;
    let val = gameState.cash;
    Object.values(gameState.portfolio).forEach((a: any) => val += a.price * a.shares);
    return val;
  };

  const handleNextTurn = () => {
    if (!gameState) return;
    // ... (Rebalance & Simulate logic same as before) ...
    let currentTotalValue = gameState.cash;
    Object.entries(gameState.portfolio).forEach(([_, data]: any) => currentTotalValue += data.shares * data.price);
    const newPortfolio = { ...gameState.portfolio };
    let remainingCash = currentTotalValue;
    Object.keys(newPortfolio).forEach(ticker => {
        const targetPct = (allocations[ticker] || 0) / 100;
        const targetValue = currentTotalValue * targetPct;
        newPortfolio[ticker].shares = targetValue / newPortfolio[ticker].price;
        remainingCash -= targetValue;
    });
    const dt = 1/252; const daysPerTurn = 63; 
    for (let day = 0; day < daysPerTurn; day++) {
        Object.keys(newPortfolio).forEach(ticker => {
            const asset = newPortfolio[ticker];
            asset.price = simulateStep(asset.price, asset.mu, asset.sigma, dt);
        });
    }
    const roll = Math.random();
    let evt = null;
    if (roll > 0.85) evt = "Market Crash! AI bubble burst, volatility spiking.";
    else if (roll < 0.1) evt = "Tech Boom! Unprecedented growth sector-wide.";
    let newVal = remainingCash;
    Object.values(newPortfolio).forEach((a: any) => newVal += a.price * a.shares);
    setEventMsg(evt);
    setGameState({ ...gameState, cash: remainingCash, portfolio: newPortfolio, turn: gameState.turn + 1, history: [...gameState.history, newVal] });
    if (evt) setGameSpeed(0); else setGameSpeed(1);
  };

  const handleContinue = () => { setEventMsg(null); setGameSpeed(1); };

  if (loading) return <div className="h-screen bg-black text-white flex items-center justify-center">Initializing Quant Engine...</div>;

  const totalVal = getTotalValue();
  const prevVal = gameState?.history[gameState.history.length - 2] || 1000000;
  const isProfit = totalVal >= prevVal;

  return (
    <main className="h-screen bg-black text-white overflow-hidden relative font-sans flex flex-col items-center justify-center">
      
      <WarpSpeed active={!eventMsg && (gameState?.turn || 0) < 20} speed={gameSpeed} />
      
      {/* The Orb */}
      <motion.div 
        animate={{ scale: eventMsg ? 1.2 : 1 }}
        transition={{ duration: 0.5 }}
        className={`orb-core ${eventMsg ? 'orb-event' : ''}`}
      />

      {/* HUD */}
      <div className="game-hud-container">
        <div className="flex items-end gap-1 h-12 w-48 opacity-80">
             {gameState?.history.map((val: number, i: number) => {
                 const pVal = gameState.history[i-1] || 1000000;
                 const color = val >= pVal ? 'bg-green-500' : 'bg-red-500';
                 return (
                     <motion.div 
                        key={i} initial={{ height: 0 }} animate={{ height: `${Math.min((val/1500000)*100, 100)}%` }}
                        className={`flex-1 ${color} min-w-[4px] rounded-t-sm`}
                     />
                 )
             })}
        </div>
        <div className="text-center">
            <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Portfolio Value</div>
            <div className={`text-4xl font-mono font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                ${totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
        </div>
        <div className="text-right">
            <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Turn</div>
            <div className="text-4xl font-bold text-white">
                {gameState?.turn} <span className="text-gray-600 text-2xl">/ 20</span>
            </div>
        </div>
      </div>

      {/* Event Overlay */}
      <AnimatePresence>
          {eventMsg && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                className="absolute z-30 text-center max-w-xl"
            >
                <h2 className="event-overlay-title">MARKET EVENT</h2>
                <p className="event-overlay-text">{eventMsg}</p>
                <div className="flex gap-4 justify-center">
                    <button onClick={handleContinue} className="btn-event-action">Adjust & Continue</button>
                </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Bottom Controls */}
      <div className="control-panel-container">
         <div className="flex gap-6 mb-8 w-full max-w-5xl overflow-x-auto no-scrollbar justify-center">
            {Object.keys(gameState!.portfolio).map(ticker => (
                <div key={ticker} className="flex flex-col items-center min-w-[100px] group">
                    <div className="control-card">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span className="font-bold text-white">{ticker}</span>
                            <span>${gameState!.portfolio[ticker].price.toFixed(0)}</span>
                        </div>
                        <div className="font-mono text-purple-400 text-lg font-bold">{allocations[ticker]}%</div>
                    </div>
                    <input 
                        type="range" min="0" max="100" value={allocations[ticker]}
                        aria-label={`Allocation percentage for ${ticker}`}
                        onChange={(e) => setAllocations({...allocations, [ticker]: parseInt(e.target.value)})}
                        className="control-slider"
                    />
                </div>
            ))}
         </div>

         {!eventMsg && gameState!.turn < 20 && (
             <button onClick={handleNextTurn} className="btn-execute-turn">EXECUTE TURN</button>
         )}

         {gameState!.turn >= 20 && (
             <div className="text-2xl font-bold text-green-400 animate-pulse">SIMULATION COMPLETE</div>
         )}
      </div>

      {/* Game Over Modal (Simplified logic reuse) */}
      {gameState!.turn >= 20 && (
        <GameOverModal history={gameState!.history} onRestart={() => router.push('/')} />
      )}
    </main>
  );
}

function GameOverModal({ history, onRestart }: any) {
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
                username, score: parseFloat(score.toFixed(2)), finalPortfolioValue: finalValue, date: serverTimestamp(), gameDate
            });
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

export default function Game() { return <Suspense fallback={null}><GameContent /></Suspense> }