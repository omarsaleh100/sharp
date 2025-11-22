'use client';
    
    import { useState, useEffect, useRef, Suspense } from 'react';
    import { useRouter, useSearchParams } from 'next/navigation';
    import { motion, AnimatePresence } from 'framer-motion';
    import { simulateStep, calculateSharpeRatio } from '@/lib/math';
    import { db, auth } from '@/lib/firebase';
    import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
    
    /* --- EVENT POOL --- */
    // 15 Unique Events with Detailed Summaries
    const EVENT_POOL = [
      {
        id: 'evt_election',
        headline: "Surprise Election Result",
        description: "A populist candidate wins in a major economy, promising protectionism.",
        impact: (a: any) => { a.sigma *= 1.4; a.mu -= 0.02; },
        summary: "The unexpected victory of a populist candidate advocating for protectionist policies sent shockwaves through the global markets. Investors reacted with immediate uncertainty, causing volatility to spike by roughly 40% as capital fled to safer havens. The looming threat of new tariffs and trade barriers dampened growth expectations, leading to a broad contraction in equity prices as the market priced in a potential slowdown in international trade."
      },
      {
        id: 'evt_fusion',
        headline: "Nuclear Fusion Breakthrough",
        description: "Scientists achieve net energy gain, promising cheap future power.",
        impact: (a: any) => { if(['NVDA','AMD','TSLA','GOOGL','MSFT'].includes(a.symbol)) { a.mu += 0.04; } else { a.mu += 0.01; } },
        summary: "The announcement of a net energy gain from nuclear fusion was hailed as a turning point for humanity. This breakthrough promises a future of limitless, clean energy, drastically reducing long-term operational costs for energy-intensive industries. Tech and industrial sectors rallied significantly, anticipating a new era of efficiency and reduced overhead, while energy stocks surged on the prospect of commercializing this revolutionary technology."
      },
      {
        id: 'evt_pandemic',
        headline: "New Viral Strain Detected",
        description: "WHO issues warning about a highly contagious respiratory virus.",
        impact: (a: any) => { a.sigma *= 1.8; a.mu -= 0.05; a.price *= 0.92; },
        summary: "News of a highly contagious viral strain triggered a rapid 'risk-off' sentiment across global exchanges. Memories of past lockdowns fueled panic selling, driving the market down by approximately 8% in a single session. Volatility nearly doubled as uncertainty regarding supply chain disruptions and potential quarantine measures forced investors to liquidate equity positions in favor of cash and bonds."
      },
      {
        id: 'evt_peace',
        headline: "Historic Peace Treaty Signed",
        description: "Long-standing conflict in the Middle East comes to an end.",
        impact: (a: any) => { a.sigma *= 0.7; a.mu += 0.02; },
        summary: "The signing of a historic peace treaty in a volatile region brought a wave of relief to global markets. The reduction in geopolitical risk premiums led to a 30% drop in volatility, as the fear of supply shocks dissipated. Investor confidence soared, unlocking capital that had been sidelined, resulting in a steady, broad-based rally as focus shifted back to fundamental economic growth."
      },
      {
        id: 'evt_ai_reg',
        headline: "Strict AI Regulations Passed",
        description: "Global summit agrees on pausing advanced AI development.",
        impact: (a: any) => { if(['NVDA','AMD','GOOGL','MSFT','META'].includes(a.symbol)) { a.mu -= 0.04; a.sigma *= 1.2; } },
        summary: "The imposition of strict global AI regulations acted as a sudden brake on the overheated tech sector. Major tech giants, previously pricing in exponential unrestrained growth, faced an immediate reality check. The market repriced these assets downwards to account for slower innovation cycles and increased compliance costs, leading to a sharp rotation out of growth stocks and increased sector-specific volatility."
      },
      {
        id: 'evt_oil_shock',
        headline: "OPEC Cuts Production",
        description: "Oil prices skyrocket as supply is artificially constrained.",
        impact: (a: any) => { a.mu -= 0.01; a.sigma *= 1.1; }, 
        summary: "OPEC's decision to cut production created an immediate supply deficit, sending crude prices soaring. This energy shock reverberated through the economy, increasing input costs for manufacturing and transportation. The broader market faced headwinds as profit margins squeezed, leading to a stagnation in growth and a tick up in volatility as investors grappled with the inflationary implications."
      },
      {
        id: 'evt_cyber',
        headline: "Massive Banking Cyberattack",
        description: "Major financial institutions paralyzed for 48 hours.",
        impact: (a: any) => { if(['JPM','BAC','GS','SPY'].includes(a.symbol)) { a.price *= 0.85; a.sigma *= 2.0; } else { a.sigma *= 1.2; } },
        summary: "A sophisticated cyberattack paralyzing major banking institutions froze the financial nervous system for 48 hours. The inability to process transactions caused a liquidity crisis and sparked systemic panic. Financial stocks plummeted by over 15% while volatility doubled, as fears of compromised data and long-term infrastructure damage drove a massive sell-off in the banking sector."
      },
      {
        id: 'evt_tax_cut',
        headline: "Corporate Tax Cut Announced",
        description: "Government slashes rates to stimulate stagnation.",
        impact: (a: any) => { a.mu += 0.03; a.price *= 1.05; },
        summary: "The government's announcement of a corporate tax rate slash provided an immediate boost to bottom-line projections. Analysts rushed to upgrade earnings forecasts, fueling a 5% market-wide rally. The injection of fiscal stimulus revitalized investor appetite, shifting the narrative from stagnation to expansion as companies were expected to reinvest the savings into growth and dividends."
      },
      {
        id: 'evt_semiconductor',
        headline: "Semiconductor Shortage",
        description: "Supply chain disruption halts electronics manufacturing.",
        impact: (a: any) => { if(['NVDA','AMD','TSLA','AAPL'].includes(a.symbol)) { a.price *= 0.9; a.sigma *= 1.3; } },
        summary: "A critical disruption in the semiconductor supply chain brought electronics manufacturing to a grinding halt. With chips being the lifeblood of modern tech, shortages led to production delays across automotive and consumer electronics. Tech stocks, particularly hardware and EV manufacturers, faced significant selling pressure as revenue guidance was slashed, driving up volatility in the sector."
      },
      {
        id: 'evt_rate_hike',
        headline: "Central Bank Hikes Rates",
        description: "Aggressive move to curb runaway inflation.",
        impact: (a: any) => { a.mu -= 0.03; a.price *= 0.96; },
        summary: "The Central Bank's aggressive interest rate hike to combat runaway inflation tightened financial conditions overnight. The higher cost of capital increased borrowing costs for corporations, cooling growth prospects. Equity markets repriced lower by roughly 4% as the discount rate for future cash flows rose, signaling an end to the era of cheap money."
      },
      {
        id: 'evt_stimulus',
        headline: "Massive Stimulus Package",
        description: "Government prints money to avert recession.",
        impact: (a: any) => { a.mu += 0.02; a.sigma *= 1.1; }, 
        summary: "To avert a looming recession, the government unleashed a massive liquidity injection into the economy. While this monetary expansion prevented a credit freeze and boosted short-term growth numbers, it also sparked fears of currency debasement. The market rallied on the influx of cash, but underlying volatility increased as investors hedged against the long-term inflationary consequences of money printing."
      },
      {
        id: 'evt_trade_war',
        headline: "Trade War Escalates",
        description: "Superpowers impose 50% tariffs on all goods.",
        impact: (a: any) => { a.mu -= 0.03; a.sigma *= 1.3; },
        summary: "The escalation of trade tensions between superpowers, featuring 50% tariffs, effectively erected walls around major economies. The disruption to global free trade strangled growth forecasts, as multinational corporations faced soaring costs and restricted market access. Equities slumped and volatility rose as the market adjusted to a less efficient, fragmented global economic landscape."
      },
      {
        id: 'evt_asteroid',
        headline: "Asteroid Mining Mission Launches",
        description: "Private company targets platinum-rich asteroid.",
        impact: (a: any) => { if(['TSLA','SPCE','BA'].includes(a.symbol)) { a.mu += 0.05; } },
        summary: "The launch of a credible private mission to mine a platinum-rich asteroid sparked a speculative frenzy in the aerospace sector. Investors bet heavily on the potential for a resource abundance that could crash raw material costs and open new frontiers. While speculative, this optimism drove a targeted rally in space-adjacent stocks, decoupling them from broader market trends."
      },
      {
        id: 'evt_crypto',
        headline: "Major Crypto Exchange Collapse",
        description: "Fraud uncovered, billions lost in digital assets.",
        impact: (a: any) => { if(['COIN','HOOD'].includes(a.symbol)) { a.price *= 0.7; a.sigma *= 2.5; } },
        summary: "The collapse of a major cryptocurrency exchange due to fraud sent shockwaves through the digital asset ecosystem. The contagion effect was immediate, crashing crypto-exposed stocks by nearly 30% and spiking their volatility. Institutional trust evaporated, leading to a flight from speculative assets back to traditional fiat-based securities."
      },
      {
        id: 'evt_biotech',
        headline: "Cure for Alzheimer's Found",
        description: "Biotech firm announces successful Phase 3 trials.",
        impact: (a: any) => { a.mu += 0.01; }, 
        summary: "The confirmation of a successful cure for Alzheimer's disease in Phase 3 trials was a monumental victory for the healthcare sector. Beyond the specific firm, the breakthrough lifted overall market sentiment, viewed as a triumph of human innovation. The optimism spilled over into the broader market, providing a slight nudge to growth expectations and a stabilizing effect on volatility."
      }
    ];
    
    /* ... Types and WarpSpeed Component (unchanged) ... */
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
    
    // --- SVG LINE GRAPH COMPONENT ---
    const PortfolioLineGraph = ({ history }: { history: number[] }) => {
        if (!history || history.length < 1) return <div className="w-full h-full bg-gray-900/20 rounded" />;
        
        const min = Math.min(...history, 1000000) * 0.99;
        const max = Math.max(...history, 1000000) * 1.01;
        const range = max - min || 1;
        
        // Generate points for the line
        const points = history.map((val, i) => {
            const x = (i / (Math.max(history.length - 1, 1))) * 100; 
            const y = 100 - ((val - min) / range) * 100; 
            return `${x},${y}`;
        }).join(' ');
    
        const isProfit = history[history.length - 1] >= 1000000;
        const color = isProfit ? '#4ade80' : '#f87171'; // green-400 or red-400
    
        return (
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="lineGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path 
                    d={`M 0,100 ${points.split(' ').map(p => 'L ' + p).join(' ')} L 100,100 Z`} 
                    fill="url(#lineGrad)" 
                    stroke="none" 
                />
                <polyline 
                    points={points} 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="2" 
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
    };
    
    // --- MAIN GAME COMPONENT ---
    function GameContent() {
      const searchParams = useSearchParams();
      const [loading, setLoading] = useState(true);
      const [gameState, setGameState] = useState<any | null>(null); 
      const [allocations, setAllocations] = useState<Record<string, number>>({});
      const [eventMsg, setEventMsg] = useState<any | null>(null);
      const [gameSpeed, setGameSpeed] = useState(1);
      
      // New State for Events
      const [availableEvents, setAvailableEvents] = useState([...EVENT_POOL]);
      const [eventHistory, setEventHistory] = useState<any[]>([]);
    
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
        
        let currentTotalValue = gameState.cash;
        Object.entries(gameState.portfolio).forEach(([_, data]: any) => currentTotalValue += data.shares * data.price);
        
        const newPortfolio = JSON.parse(JSON.stringify(gameState.portfolio)); // Deep Clone
        let remainingCash = currentTotalValue;
        
        // 1. Rebalance
        Object.keys(newPortfolio).forEach(ticker => {
            const targetPct = (allocations[ticker] || 0) / 100;
            const targetValue = currentTotalValue * targetPct;
            newPortfolio[ticker].shares = targetValue / newPortfolio[ticker].price;
            remainingCash -= targetValue;
        });
    
        // 2. Check for Events (Turns 5, 10, 15, 19)
        const nextTurn = gameState.turn + 1;
        let currentEvent = null;
    
        if ([5, 10, 15, 19].includes(nextTurn) && availableEvents.length > 0) {
            const idx = Math.floor(Math.random() * availableEvents.length);
            const evt = availableEvents[idx];
            
            // Remove used event
            const newAvailable = [...availableEvents];
            newAvailable.splice(idx, 1);
            setAvailableEvents(newAvailable);
    
            // Apply Impact
            Object.values(newPortfolio).forEach((asset: any) => evt.impact(asset));
            
            // Record History
            const historyItem = { turn: nextTurn, ...evt };
            setEventHistory([...eventHistory, historyItem]);
            
            currentEvent = evt;
        }
    
        // 3. Simulate
        const dt = 1/252; const daysPerTurn = 63; 
        for (let day = 0; day < daysPerTurn; day++) {
            Object.keys(newPortfolio).forEach(ticker => {
                const asset = newPortfolio[ticker];
                asset.price = simulateStep(asset.price, asset.mu, asset.sigma, dt);
            });
        }
    
        // 4. Calculate Result
        let newVal = remainingCash;
        Object.values(newPortfolio).forEach((a: any) => newVal += a.price * a.shares);
        
        // 5. Update State
        setEventMsg(currentEvent); // Show modal if event happened
        setGameState({ 
            ...gameState, 
            cash: remainingCash, 
            portfolio: newPortfolio, 
            turn: nextTurn, 
            history: [...gameState.history, newVal] 
        });
        
        if (currentEvent) setGameSpeed(0); else setGameSpeed(1);
      };
    
      const handleContinue = () => { setEventMsg(null); setGameSpeed(1); };
    
      if (loading) return <div className="h-screen bg-black text-white flex items-center justify-center">Initializing Quant Engine...</div>;
    
      const totalVal = getTotalValue();
      const prevVal = gameState?.history[gameState.history.length - 2] || 1000000;
      const isProfit = totalVal >= prevVal;
      const totalAllocation = Object.values(allocations).reduce((sum, val) => sum + val, 0);
    
      return (
        <main className="h-screen bg-black text-white overflow-hidden relative font-sans flex flex-col items-center justify-center">
          
          <WarpSpeed active={!eventMsg && (gameState?.turn || 0) < 20} speed={gameSpeed} />
          
          <motion.div 
            animate={{ scale: eventMsg ? 1.2 : 1 }}
            transition={{ duration: 0.5 }}
            className={`orb-core ${eventMsg ? 'orb-event' : ''}`}
          />
    
          <div className="game-hud-container">
            <div className="flex flex-col h-full justify-start w-48">
                 <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Portfolio History</div>
                 <div className="h-12 w-full relative">
                     <PortfolioLineGraph history={gameState?.history || []} />
                 </div>
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
    
          <AnimatePresence>
              {eventMsg && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute z-30 text-center max-w-xl bg-black/80 p-8 rounded-2xl border border-red-500/50 backdrop-blur-xl"
                >
                    <div className="text-xs text-red-400 uppercase tracking-widest mb-2">Breaking News • Turn {gameState.turn}</div>
                    <h2 className="event-overlay-title text-4xl mb-4">{eventMsg.headline}</h2>
                    <p className="text-lg text-gray-300 mb-6 leading-relaxed">{eventMsg.description}</p>
                    
                    {/* HIDDEN SUMMARY IN GAME - Will only show in Leaderboard */}
                    {/* <div className="bg-red-900/20 border border-red-500/30 p-3 rounded mb-6 text-sm text-red-200 font-mono">
                        ANALYSIS: {eventMsg.summary}
                    </div> 
                    */}
    
                    <div className="flex gap-4 justify-center">
                        <button onClick={handleContinue} className="btn-event-action">Acknowledge & Trade</button>
                    </div>
                </motion.div>
              )}
          </AnimatePresence>
    
          <div className="control-panel-container">
             <div className={`allocation-tracker ${totalAllocation === 100 ? 'text-valid' : 'text-invalid'}`}>
                TOTAL: {totalAllocation}%
             </div>
    
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
                 <button 
                    onClick={handleNextTurn} 
                    disabled={totalAllocation !== 100}
                    className={`
                        btn-execute-turn 
                        ${totalAllocation !== 100 ? 'opacity-50 cursor-not-allowed hover:scale-100 shadow-none' : ''}
                    `}
                 >
                    EXECUTE TURN
                 </button>
             )}
    
             {gameState!.turn >= 20 && (
                 <div className="text-2xl font-bold text-green-400 animate-pulse">SIMULATION COMPLETE</div>
             )}
          </div>
    
          {gameState!.turn >= 20 && (
            <GameOverModal 
                history={gameState!.history} 
                eventHistory={eventHistory} // Pass history to save
                onRestart={() => router.push('/')} 
            />
          )}
        </main>
      );
    }
    
    function GameOverModal({ history, eventHistory, onRestart }: any) {
        const score = calculateSharpeRatio(history);
        const finalValue = history[history.length - 1];
        const [username, setUsername] = useState('');
        const [saving, setSaving] = useState(false);
        const [saved, setSaved] = useState(false);
    
        const saveScore = async () => {
            if (!username) return;
            setSaving(true);
            try {
                // SANITIZE: Remove 'impact' function from each event before saving
                const sanitizedEvents = eventHistory?.map((evt: any) => {
                    const { impact, ...cleanEvent } = evt;
                    return cleanEvent;
                }) || [];
    
                const gameDate = new Date().toISOString().split('T')[0]; 
                await addDoc(collection(db, 'scores'), {
                    username, 
                    score: parseFloat(score.toFixed(2)), 
                    finalPortfolioValue: finalValue, 
                    date: serverTimestamp(), 
                    gameDate,
                    eventHistory: sanitizedEvents // Save sanitized version
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
    