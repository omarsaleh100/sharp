'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { simulateStep } from '@/lib/math'; // Import the math we just wrote
import { calculateSharpeRatio } from '@/lib/math';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface AssetData {
  shares: number;
  price: number;
  mu: number;    // Drift
  sigma: number; // Volatility
}

interface GameState {
  turn: number;
  max_turns: number;
  cash: number;
  portfolio: Record<string, AssetData>;
  history: number[]; // To track portfolio value over time
}

function GameContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [eventMsg, setEventMsg] = useState<string | null>(null);
  const router = useRouter();

  // 1. Initialize Game on Load
  useEffect(() => {
    const initGame = async () => {
      const tickers = searchParams.get('tickers')?.split(',') || [];
      if (tickers.length === 0) return;

      try {
        // Call your Python Backend
        // Note: In dev, this points to localhost:5001. In prod, it will be your live URL.
        // We use the relative path "/api" and set up a proxy in next.config.js ideally,
        // but for this MVP let's assume standard Firebase Functions emulation port.
        const response = await fetch('http://127.0.0.1:5001/sharp-80263/us-central1/start_simulation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedTickers: tickers })
        });

        const data = await response.json();
        
        if (data.error) throw new Error(data.error);

        setGameState({ ...data, history: [data.cash] });
        
        // Default allocation: Equal split
        const initialAlloc: Record<string, number> = {}; // <--- Add type here
        tickers.forEach((t: string) => { 
            initialAlloc[t] = 100 / tickers.length 
        });
        setAllocations(initialAlloc);
        
        setLoading(false);
      } catch (err) {
        console.error("Game Init Failed:", err);
        alert("Failed to start game. Is the Python emulator running?");
      }
    };

    initGame();
  }, [searchParams]);

  // 2. Rebalance Portfolio (Buy/Sell based on sliders)
  const rebalance = () => {
    if (!gameState) return;
    
    let currentTotalValue = gameState.cash;
    // Add value of currently held stock
    Object.entries(gameState.portfolio).forEach(([ticker, data]) => {
        currentTotalValue += data.shares * data.price;
    });

    const newPortfolio = { ...gameState.portfolio };
    let remainingCash = currentTotalValue;

    Object.keys(newPortfolio).forEach(ticker => {
        const targetPct = (allocations[ticker] || 0) / 100;
        const targetValue = currentTotalValue * targetPct;
        const price = newPortfolio[ticker].price;
        
        // Calculate new share count
        newPortfolio[ticker].shares = targetValue / price;
        remainingCash -= targetValue;
    });

    return { ...gameState, portfolio: newPortfolio, cash: remainingCash };
  };

  // 3. The "Next Turn" Loop
  const nextTurn = () => {
    if (!gameState) return;
    
    // A. First, rebalance based on user choices
    const rebalancedState = rebalance();
    if (!rebalancedState) return;

    // B. Simulate 1 Quarter (approx 63 trading days)
    // We simulate day-by-day for accuracy, but show the result instantly
    const dt = 1/252;
    const daysPerTurn = 63; 
    const newPortfolio = { ...rebalancedState.portfolio };

    // Run the math engine
    for (let day = 0; day < daysPerTurn; day++) {
        Object.keys(newPortfolio).forEach(ticker => {
            const asset = newPortfolio[ticker];
            asset.price = simulateStep(asset.price, asset.mu, asset.sigma, dt);
        });
    }

    // C. Calculate new Total Portfolio Value
    let totalValue = rebalancedState.cash;
    Object.values(newPortfolio).forEach(a => totalValue += a.price * a.shares);

    // D. Random Events (Simple MVP Logic)
    let message = null;
    const roll = Math.random();
    if (roll > 0.9) {
        message = "MARKET CRASH: Volatility spikes!";
        // In a full version, we'd update sigmas here
    } else if (roll < 0.1) {
        message = "TECH BOOM: Optimism rises.";
    }
    setEventMsg(message);

    // E. Update State
    setGameState({
        ...rebalancedState,
        portfolio: newPortfolio,
        turn: rebalancedState.turn + 1,
        history: [...rebalancedState.history, totalValue]
    });
  };

  // UI Helpers
  const getTotalValue = () => {
    if (!gameState) return 0;
    let val = gameState.cash;
    Object.values(gameState.portfolio).forEach(a => val += a.price * a.shares);
    return val;
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-black text-white">Initializing Quant Engine...</div>;

  return (
    <main className="min-h-screen bg-black text-white p-6 font-sans flex flex-col">
      {/* Header Stats */}
      <header className="flex justify-between items-end border-b border-gray-800 pb-6 mb-8">
        <div>
            <h2 className="text-gray-400 text-sm uppercase tracking-wider">Portfolio Value</h2>
            <div className="text-5xl font-bold font-mono text-green-400">
                ${getTotalValue().toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
        </div>
        <div className="text-right">
            <div className="text-gray-400 text-sm uppercase">Turn</div>
            <div className="text-4xl font-bold">{gameState?.turn} / {gameState?.max_turns}</div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-grow">
        
        {/* Left Col: Controls */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
                <h3 className="text-xl font-bold mb-4">Target Allocation</h3>
                {Object.keys(gameState!.portfolio).map(ticker => (
                    <div key={ticker} className="mb-4">
                        <div className="flex justify-between mb-1">
                            <span className="font-bold">{ticker}</span>
                            <span className="font-mono">{allocations[ticker]}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="100" 
                            value={allocations[ticker]}
                            aria-label={`Allocation percentage for ${ticker}`} 
                            onChange={(e) => setAllocations({...allocations, [ticker]: parseInt(e.target.value)})}
                            className="w-full accent-purple-500"
                        />
                    </div>
                ))}
                <div className="text-xs text-gray-500 mt-2 text-center">
                    Total: {Object.values(allocations).reduce((a,b)=>a+b,0)}% (Must be 100%)
                </div>
            </div>

            <button
                onClick={nextTurn}
                disabled={gameState!.turn >= 20}
                className="w-full py-4 bg-white text-black font-bold text-xl rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            >
                {gameState!.turn >= 20 ? "Simulation Complete" : "Execute Next Turn"}
            </button>

            {eventMsg && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg text-center font-bold"
                >
                    {eventMsg}
                </motion.div>
            )}
        </div>

        {/* Right Col: Visualization */}
        <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Asset Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {Object.entries(gameState!.portfolio).map(([ticker, data]) => (
                    <motion.div 
                        layout
                        key={ticker} 
                        className="bg-gray-900 p-4 rounded-xl border border-gray-800"
                    >
                        <div className="text-gray-500 text-xs mb-1">PRICE</div>
                        <div className="text-2xl font-mono">${data.price.toFixed(2)}</div>
                        <div className="text-xs mt-2 text-purple-400 font-bold">{ticker}</div>
                    </motion.div>
                ))}
            </div>

            {/* Simple History Chart (Visual Bar) */}
            <div className="flex-grow bg-gray-900 rounded-xl border border-gray-800 p-6 relative flex items-end gap-1 overflow-hidden">
                {gameState?.history.map((val, i) => (
                    <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${(val / 1500000) * 100}%` }} // Normalize roughly
                        className="flex-1 bg-purple-500/50 hover:bg-purple-400 transition-colors rounded-t-sm min-w-[10px]"
                    />
                ))}
                <div className="absolute top-4 left-4 text-gray-500 font-mono text-sm">
                    PORTFOLIO HISTORY
                </div>
            </div>
        </div>
      </div>
      {gameState && gameState.turn >= 20 && (
        <GameOverModal 
            history={gameState.history} 
            portfolio={gameState.portfolio}
            onRestart={() => router.push('/')} 
        />
      )}
    </main>
)}

import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { auth } from '@/lib/firebase'; // Make sure auth is imported

function GameOverModal({ history, portfolio, onRestart }: { history: number[], portfolio: any, onRestart: () => void }) {
    const score = calculateSharpeRatio(history);
    const finalValue = history[history.length - 1];
    const profit = ((finalValue - 1000000) / 1000000) * 100;
    
    const [username, setUsername] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const saveScore = async () => {
        if (!username) return;
        setSaving(true);
        
        try {
            // 1. Get Today's Game Date
            const configRef = doc(db, 'config', 'dailyAssets');
            const configSnap = await getDoc(configRef);
            const gameDate = configSnap.exists() ? configSnap.data().date : new Date().toISOString().split('T')[0];

            // 2. Save Score
            await addDoc(collection(db, 'scores'), {
                username,
                score: parseFloat(score.toFixed(2)),
                finalPortfolioValue: finalValue,
                date: serverTimestamp(),
                gameDate: gameDate
            });

            // 3. Mark User as Played (if logged in)
            if (auth.currentUser) {
                const userRef = doc(db, 'users', auth.currentUser.uid);
                // Use setDoc with merge in case doc doesn't exist
                await setDoc(userRef, { lastPlayedDate: gameDate }, { merge: true });
            }

            setSaved(true);
        } catch (err) {
            console.error("Error saving score:", err);
            alert("Could not save score.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-md overflow-y-auto py-10">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-gray-900 border border-purple-500 p-8 rounded-2xl max-w-2xl w-full text-center shadow-[0_0_50px_rgba(168,85,247,0.3)]"
            >
                <h2 className="text-3xl font-bold text-white mb-2">Simulation Complete</h2>
                
                {/* --- NEW: Market Intel Section --- */}
                <div className="text-left bg-black/50 p-6 rounded-xl border border-gray-800 mb-8">
                    <h3 className="text-gray-400 uppercase text-xs font-bold mb-4 tracking-wider">Market Intelligence Report</h3>
                    <div className="space-y-3">
                        {Object.entries(portfolio).map(([ticker, data]: [string, any]) => (
                            <div key={ticker} className="flex gap-4">
                                <span className="font-bold text-purple-400 w-16 shrink-0">{ticker}</span>
                                <p className="text-gray-300 text-sm italic">"{data.narrative}"</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-gray-800 p-4 rounded-lg">
                        <div className="text-xs text-gray-500 uppercase">Total Return</div>
                        <div className={`text-2xl font-mono font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {profit > 0 ? '+' : ''}{profit.toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-lg border border-purple-500/30">
                        <div className="text-xs text-purple-300 uppercase">Sharpe Ratio</div>
                        <div className="text-3xl font-mono font-bold text-white">
                            {score.toFixed(2)}
                        </div>
                    </div>
                </div>

                {/* Save Form */}
                {!saved ? (
                    <div className="space-y-3">
                        <input 
                            type="text" 
                            placeholder="Enter Trader Name"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-purple-500 text-center"
                        />
                        <button 
                            onClick={saveScore}
                            disabled={!username || saving}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Submit Score to Leaderboard"}
                        </button>
                    </div>
                ) : (
                    <div>
                        <div className="text-green-400 font-bold text-lg mb-4">
                            Score Saved! See you tomorrow.
                        </div>
                        <button 
                            onClick={() => window.location.href = '/leaderboard'}
                            className="px-6 py-2 bg-gray-800 rounded-full hover:bg-gray-700"
                        >
                            Go to Leaderboard
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

export default function Game() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <GameContent />
        </Suspense>
    )
}