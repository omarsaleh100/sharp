'use client';
    
    import { useState, useEffect, useRef, Suspense } from 'react';
    import { useRouter, useSearchParams } from 'next/navigation';
    import { motion, AnimatePresence } from 'framer-motion';
    import { simulateStep, calculateSharpeRatio } from '@/lib/math';
    import { db, auth } from '@/lib/firebase';
    import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
    
    /* --- EVENT POOL --- */
    const EVENT_POOL = [
      {
        id: 'evt_election',
        headline: "Surprise Election Result",
        description: "A populist candidate wins in a major economy, promising protectionism.",
        type: 'major',
        impact: (a: any) => { a.sigma *= 1.4; a.mu -= 0.02; },
        summary: "Unexpected populist victory caused 40% volatility spike and broad equity contraction due to tariff fears."
      },
      {
        id: 'evt_fusion',
        headline: "Nuclear Fusion Breakthrough",
        description: "Scientists achieve net energy gain, promising cheap future power.",
        type: 'major',
        impact: (a: any) => { if(['NVDA','AMD','TSLA','GOOGL','MSFT'].includes(a.symbol)) { a.mu += 0.04; } else { a.mu += 0.01; } },
        summary: "Net energy gain achievement sparked rally in tech/industrials; energy stocks surged on commercialization prospects."
      },
      {
        id: 'evt_pandemic',
        headline: "New Viral Strain Detected",
        description: "WHO issues warning about a highly contagious respiratory virus.",
        type: 'major',
        impact: (a: any) => { a.sigma *= 1.8; a.mu -= 0.05; a.price *= 0.92; },
        summary: "Contagious virus warning triggered 8% market drop and doubled volatility as capital fled to bonds."
      },
      {
        id: 'evt_peace',
        headline: "Historic Peace Treaty Signed",
        description: "Long-standing conflict in the Middle East comes to an end.",
        type: 'major',
        impact: (a: any) => { a.sigma *= 0.7; a.mu += 0.02; },
        summary: "Peace treaty reduced geopolitical risk, dropping volatility by 30% and fueling a broad-based relief rally."
      },
      {
        id: 'evt_ai_reg',
        headline: "Strict AI Regulations Passed",
        description: "Global summit agrees on pausing advanced AI development.",
        type: 'major',
        impact: (a: any) => { if(['NVDA','AMD','GOOGL','MSFT','META'].includes(a.symbol)) { a.mu -= 0.04; a.sigma *= 1.2; } },
        summary: "Strict AI regulations cooled the tech sector, causing a sharp rotation out of growth stocks."
      },
      {
        id: 'evt_oil_shock',
        headline: "OPEC Cuts Production",
        description: "Oil prices skyrocket as supply is artificially constrained.",
        type: 'major',
        impact: (a: any) => { a.mu -= 0.01; a.sigma *= 1.1; }, 
        summary: "OPEC production cuts spiked oil prices, squeezing margins and stalling broader economic growth."
      },
      {
        id: 'evt_cyber',
        headline: "Massive Banking Cyberattack",
        description: "Major financial institutions paralyzed for 48 hours.",
        type: 'major',
        impact: (a: any) => { if(['JPM','BAC','GS','SPY'].includes(a.symbol)) { a.price *= 0.85; a.sigma *= 2.0; } else { a.sigma *= 1.2; } },
        summary: "Banking cyberattack caused liquidity panic; financials plummeted 15% with doubled volatility."
      },
      {
        id: 'evt_tax_cut',
        headline: "Corporate Tax Cut Announced",
        description: "Government slashes rates to stimulate stagnation.",
        type: 'major',
        impact: (a: any) => { a.mu += 0.03; a.price *= 1.05; },
        summary: "Corporate tax slash boosted earnings forecasts, driving a 5% market-wide rally."
      },
      {
        id: 'evt_semiconductor',
        headline: "Semiconductor Shortage",
        description: "Supply chain disruption halts electronics manufacturing.",
        type: 'major',
        impact: (a: any) => { if(['NVDA','AMD','TSLA','AAPL'].includes(a.symbol)) { a.price *= 0.9; a.sigma *= 1.3; } },
        summary: "Chip shortage halted electronics manufacturing, hitting tech and EV stocks with heavy selling pressure."
      },
      {
        id: 'evt_rate_hike',
        headline: "Central Bank Hikes Rates",
        description: "Aggressive move to curb runaway inflation.",
        type: 'major',
        impact: (a: any) => { a.mu -= 0.03; a.price *= 0.96; },
        summary: "Aggressive rate hike tightened capital; markets repriced 4% lower on higher borrowing costs."
      },
      {
        id: 'evt_stimulus',
        headline: "Massive Stimulus Package",
        description: "Government prints money to avert recession.",
        type: 'major',
        impact: (a: any) => { a.mu += 0.02; a.sigma *= 1.1; }, 
        summary: "Liquidity injection prevented recession and rallied markets, though inflation fears increased volatility."
      },
      {
        id: 'evt_trade_war',
        headline: "Trade War Escalates",
        description: "Superpowers impose 50% tariffs on all goods.",
        type: 'major',
        impact: (a: any) => { a.mu -= 0.03; a.sigma *= 1.3; },
        summary: "50% tariffs strangled global trade, causing equities to slump as efficiency plummeted."
      },
      {
        id: 'evt_asteroid',
        headline: "Asteroid Mining Mission Launches",
        description: "Private company targets platinum-rich asteroid.",
        type: 'major',
        impact: (a: any) => { if(['TSLA','SPCE','BA'].includes(a.symbol)) { a.mu += 0.05; } },
        summary: "Asteroid mining mission launched speculative frenzy, driving a targeted rally in aerospace stocks."
      },
      {
        id: 'evt_crypto',
        headline: "Major Crypto Exchange Collapse",
        description: "Fraud uncovered, billions lost in digital assets.",
        type: 'major',
        impact: (a: any) => { if(['COIN','HOOD'].includes(a.symbol)) { a.price *= 0.7; a.sigma *= 2.5; } },
        summary: "Crypto exchange fraud collapsed digital assets; exposed stocks crashed 30% with extreme volatility."
      },
      {
        id: 'evt_biotech',
        headline: "Cure for Alzheimer's Found",
        description: "Biotech firm announces successful Phase 3 trials.",
        type: 'major',
        impact: (a: any) => { a.mu += 0.01; }, 
        summary: "Alzheimer's cure success lifted healthcare sector and overall market sentiment on innovation optimism."
      }
    ];

    // Helper to generate Neutral Market Updates
    const getNeutralMarketUpdate = (portfolioChangePct: number) => {
        if (portfolioChangePct > 5) return { headline: "Bull Market Acceleration", description: "Strong momentum carries the portfolio significantly higher as investor sentiment peaks." };
        if (portfolioChangePct > 1) return { headline: "Steady Market Growth", description: "Indices tick upward amidst balanced trading volume and stable macroeconomic data." };
        if (portfolioChangePct > -1) return { headline: "Market Consolidation", description: "Volatility compresses as traders await new catalysts; prices remain largely range-bound." };
        if (portfolioChangePct > -5) return { headline: "Minor Correction", description: "Profit-taking leads to a slight pullback across major sectors; fundamentals remain intact." };
        return { headline: "Market Pullback", description: "Bearish sentiment weighs on asset prices as risk-off behavior dominates the session." };
    };
    
    /* --- COMPONENTS --- */

    const WarpSpeed = ({ active, paused, speed = 1 }: { active: boolean; paused: boolean; speed?: number }) => {
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
                update() { 
                    if (paused) return; 
                    this.z -= 10 * speed; 
                    if (this.z <= 1) { this.z = 2000; this.x = Math.random() * w - w / 2; this.y = Math.random() * h - h / 2; } 
                }
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
        }, [active, paused, speed]);
        return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />;
    };
    
    const PortfolioLineGraph = ({ history }: { history: number[] }) => {
        if (!history || history.length < 1) return <div className="w-full h-full bg-gray-900/20 rounded" />;
        
        const min = Math.min(...history, 1000000) * 0.99;
        const max = Math.max(...history, 1000000) * 1.01;
        const range = max - min || 1;
        
        const points = history.map((val, i) => {
            const x = (i / (Math.max(history.length - 1, 1))) * 100; 
            const y = 100 - ((val - min) / range) * 100; 
            return `${x},${y}`;
        }).join(' ');
    
        const isProfit = history[history.length - 1] >= 1000000;
        const color = isProfit ? '#4ade80' : '#f87171'; 
    
        return (
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="lineGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={`M 0,100 ${points.split(' ').map(p => 'L ' + p).join(' ')} L 100,100 Z`} fill="url(#lineGrad)" stroke="none" />
                <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    };
    
    // --- MAIN GAME COMPONENT ---
    function GameContent() {
      const searchParams = useSearchParams();
      const [loading, setLoading] = useState(true);
      const [gameState, setGameState] = useState<any | null>(null); 
      const [allocations, setAllocations] = useState<Record<string, number>>({});
      
      // Game State
      const [isSimulating, setIsSimulating] = useState(false);
      const [eventMsg, setEventMsg] = useState<any | null>(null);
      const [availableEvents, setAvailableEvents] = useState([...EVENT_POOL]);
      const [eventHistory, setEventHistory] = useState<any[]>([]);
      const [priceChanges, setPriceChanges] = useState<Record<string, { direction: 'up' | 'down' | 'same', pct: number }>>({});
      const [flashing, setFlashing] = useState(false);

      // Visual History for the graph (High Resolution)
      const [visualHistory, setVisualHistory] = useState<number[]>([]);

      // Date State
      const [startDate] = useState(new Date());
      const [rapidDate, setRapidDate] = useState<Date | null>(null); 
    
      const router = useRouter();
    
      // Flash Effect Timer
      useEffect(() => {
        if (flashing) {
            const timer = setTimeout(() => setFlashing(false), 500);
            return () => clearTimeout(timer);
        }
      }, [flashing]);

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
            
            data.max_turns = 10;
            setGameState({ ...data, history: [data.cash] });
            setVisualHistory([data.cash]); 
            
            const initialAlloc: Record<string, number> = {};
            tickers.forEach((t: string) => { initialAlloc[t] = Math.floor(100 / tickers.length); });
            setAllocations(initialAlloc);
            setLoading(false);
            setRapidDate(new Date()); 
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

      // CHANGED: Now accepts a Date object to support live updates during simulation
      const getMajorDateDisplayFromDate = (d: Date) => {
        const month = d.toLocaleString('default', { month: 'short' });
        const year = d.getFullYear();
        const quarter = Math.floor((d.getMonth() + 3) / 3); 
        return `Q${quarter} ${month} ${year}`;
      };

      const getMinorDateDisplay = (dateObj: Date) => {
        return dateObj.toLocaleDateString('en-GB');
      };
    
      // --- MAIN EXECUTION LOGIC ---
      const handleExecuteTurn = () => {
        if (!gameState || isSimulating) return;
        
        setIsSimulating(true); 
        setEventMsg(null); 

        // 1. Rebalance Portfolio First
        let currentTotalValue = gameState.cash;
        Object.entries(gameState.portfolio).forEach(([_, data]: any) => currentTotalValue += data.shares * data.price);
        const prevPortfolioValue = currentTotalValue; 

        const newPortfolio = JSON.parse(JSON.stringify(gameState.portfolio));
        let remainingCash = currentTotalValue;
        
        Object.keys(newPortfolio).forEach(ticker => {
            const targetPct = (allocations[ticker] || 0) / 100;
            const targetValue = currentTotalValue * targetPct;
            newPortfolio[ticker].shares = targetValue / newPortfolio[ticker].price;
            remainingCash -= targetValue;
        });

        // 2. Prepare for Simulation
        const nextTurn = gameState.turn + 1;
        const startSimDate = new Date(startDate);
        startSimDate.setMonth(startSimDate.getMonth() + (gameState.turn * 6));
        
        let currentEvent = null;
        const isMajorTurn = [2, 4, 6, 8].includes(nextTurn); 

        if (isMajorTurn && availableEvents.length > 0) {
            const idx = Math.floor(Math.random() * availableEvents.length);
            const evt = availableEvents[idx];
            const newAvailable = [...availableEvents];
            newAvailable.splice(idx, 1);
            setAvailableEvents(newAvailable);
            
            Object.values(newPortfolio).forEach((asset: any) => evt.impact(asset));
            currentEvent = evt;
            
            const historyItem = { turn: nextTurn, ...evt };
            setEventHistory([...eventHistory, historyItem]);
        }

        // 3. Run Progressive Simulation Loop
        const DURATION = 5000; 
        const TOTAL_DAYS = 126; 
        const dt = 1/252; 
        const UPDATE_INTERVAL = 100; // CHANGED: 100ms for both graph and prices
        
        let dayCount = 0;
        const startTime = Date.now();

        const simInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / DURATION, 1);
            
            // A. Calculate days passed
            const targetDay = Math.floor(progress * TOTAL_DAYS);
            const daysToSimulate = targetDay - dayCount;

            // B. Run Math
            if (daysToSimulate > 0) {
                for (let i = 0; i < daysToSimulate; i++) {
                    Object.keys(newPortfolio).forEach(ticker => {
                        const asset = newPortfolio[ticker];
                        asset.price = simulateStep(asset.price, asset.mu, asset.sigma, dt);
                    });
                }
                dayCount = targetDay;
            }

            // C. Update Rapid Date
            const timeDiff = (1000 * 60 * 60 * 24 * TOTAL_DAYS); 
            const currentDate = new Date(startSimDate.getTime() + (timeDiff * progress));
            setRapidDate(currentDate);

            // D. Calculate Current Value
            let tempVal = remainingCash;
            Object.values(newPortfolio).forEach((a: any) => tempVal += a.price * a.shares);

            // E. Update Visual State (Both Graph & Prices update every 100ms tick)
            setVisualHistory(prev => [...prev, tempVal]);
            setGameState((prev: any) => ({
                ...prev,
                portfolio: newPortfolio, 
                // Sync official history with visual temporarily for graph coherence
                history: [...prev.history.slice(0, prev.turn + 1), tempVal] 
            }));

            // F. End Condition
            if (progress >= 1) {
                clearInterval(simInterval);
                finalizeTurn(newPortfolio, remainingCash, currentEvent, prevPortfolioValue, nextTurn);
            }
        }, UPDATE_INTERVAL); // Changed to 100ms
      };

      const finalizeTurn = (finalPortfolio: any, finalCash: number, event: any, prevValue: number, nextTurn: number) => {
            const newChanges: Record<string, { direction: 'up' | 'down' | 'same', pct: number }> = {};
            Object.keys(finalPortfolio).forEach(ticker => {
                const oldPrice = gameState.portfolio[ticker].price; 
                const newPrice = finalPortfolio[ticker].price;
                const delta = newPrice - oldPrice;
                const pct = (delta / oldPrice) * 100;
                newChanges[ticker] = {
                    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
                    pct: Math.abs(pct)
                };
            });
            setPriceChanges(newChanges);
            setFlashing(true);

            let finalVal = finalCash;
            Object.values(finalPortfolio).forEach((a: any) => finalVal += a.price * a.shares);

            let messagePayload = null;
            if (event) {
                messagePayload = { ...event };
            } else {
                const pctChange = ((finalVal - prevValue) / prevValue) * 100;
                messagePayload = { type: 'neutral', ...getNeutralMarketUpdate(pctChange) };
            }

            setEventMsg(messagePayload); 
            
            setGameState((prev: any) => ({ 
                ...prev, 
                cash: finalCash, 
                portfolio: finalPortfolio, 
                turn: nextTurn, 
                history: [...prev.history, finalVal] 
            }));
            
            setVisualHistory(prev => [...prev, finalVal]);

            setIsSimulating(false);
      };
    
      if (loading) return <div className="h-screen bg-black text-white flex items-center justify-center">Initializing Quant Engine...</div>;
    
      const totalVal = getTotalValue();
      const prevVal = gameState?.history[gameState.history.length - 2] || 1000000;
      const isProfit = totalVal >= prevVal;
      const totalAllocation = Object.values(allocations).reduce((sum, val) => sum + val, 0);
      const isTurnZero = gameState?.turn === 0;
    
      return (
        <main className="h-screen bg-black text-white overflow-hidden relative font-sans flex flex-col items-center justify-center">
          
          <WarpSpeed 
            active={!isTurnZero && (gameState?.turn || 0) < 10} 
            paused={!isSimulating} 
            speed={1.5} 
          />
          
          <div className="absolute z-10 flex flex-col items-center justify-center">
             {/* CHANGED: Increased bottom margin (mb-80) to push text higher */}
             {isTurnZero && !isSimulating && (
                 <div className="mb-80 text-center animate-pulse">
                     <div className="text-purple-300 uppercase tracking-[0.2em] text-lg font-bold bg-black/50 px-6 py-3 rounded-full border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.4)] backdrop-blur-sm">
                         Allocate & Diversify Below
                     </div>
                 </div>
             )}

             <AnimatePresence mode="wait">
                {eventMsg ? (
                    <motion.div 
                        key="event-card"
                        initial={{ opacity: 0, scale: 0.8 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        exit={{ opacity: 0, scale: 0.8 }}
                        className={`text-center max-w-lg p-8 rounded-2xl border backdrop-blur-xl shadow-2xl 
                            ${eventMsg.type === 'major' 
                                ? 'bg-black/90 border-red-500/50 shadow-red-900/20' 
                                : 'bg-gray-900/90 border-blue-500/30 shadow-blue-900/20'
                            }`}
                    >
                        <div className={`text-xs uppercase tracking-widest mb-2 font-bold 
                            ${eventMsg.type === 'major' ? 'text-red-400' : 'text-blue-400'}`}>
                            {/* CHANGED: Use rapidDate/getMajorDateDisplayFromDate here too? 
                                Actually, event happens AT the turn end, so gameState.turn is correct, 
                                but we need the function that takes a turn number. 
                                Wait, the turn number increases AFTER finalize. 
                                Let's stick to the existing helper for static turn-based dates here. */}
                            {eventMsg.type === 'major' ? 'Breaking News' : 'Market Update'} • {getMajorDateDisplayFromDate(rapidDate || startDate)}
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-4 leading-tight">{eventMsg.headline}</h2>
                        <p className="text-md text-gray-300 leading-relaxed">{eventMsg.description}</p>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="orb"
                        animate={{ scale: isSimulating ? [1, 1.05, 1] : 1 }} 
                        transition={{ duration: 2, repeat: isSimulating ? Infinity : 0 }}
                        className="orb-core"
                    />
                )}
             </AnimatePresence>
          </div>
    
          <div className="game-hud-container">
            <div className="flex flex-col h-full justify-start w-48">
                 <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Portfolio History</div>
                 <div className="h-12 w-full relative">
                     <PortfolioLineGraph history={visualHistory} />
                 </div>
            </div>
    
            <div className="text-center">
                <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Portfolio Value</div>
                <div className={`text-4xl font-mono font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                    ${totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
            </div>

            <div className="text-right">
                <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                    Turn {gameState?.turn} / 10
                </div>
                <div className="text-2xl font-bold text-white tracking-tight">
                    {/* CHANGED: Now uses rapidDate to count up the Quarter/Month/Year */}
                    {getMajorDateDisplayFromDate(rapidDate || startDate)}
                </div>
                <div className="text-sm font-mono text-purple-400 mt-1">
                    {rapidDate ? getMinorDateDisplay(rapidDate) : getMinorDateDisplay(startDate)}
                </div>
            </div>
          </div>
    
          <div className="control-panel-container">
             <div className={`allocation-tracker ${totalAllocation === 100 ? 'text-valid' : 'text-invalid'}`}>
                TOTAL: {totalAllocation}%
             </div>
    
             <div className="flex gap-6 mb-8 w-full max-w-5xl overflow-x-auto no-scrollbar justify-center">
                {Object.keys(gameState!.portfolio).map(ticker => {
                    const change = priceChanges[ticker] || { direction: 'same', pct: 0 };
                    const isUp = change.direction === 'up';
                    const isDown = change.direction === 'down';
                    
                    const priceStyle = flashing 
                        ? (isUp ? 'text-green-400 scale-110' : isDown ? 'text-red-400 scale-110' : 'text-gray-400')
                        : 'text-gray-400';

                    const pctColor = isUp ? 'text-green-400' : isDown ? 'text-red-400' : 'text-gray-600';
                    const arrow = isUp ? '▲' : isDown ? '▼' : '';

                    // CHANGED: Decreased alpha from 0.5 (implied) to 0.2
                    const cardGlow = isTurnZero 
                        ? "ring-2 ring-inset ring-purple-400 shadow-[0_0_40px_rgba(192,132,252,0.2)] bg-purple-900/10" 
                        : "";

                    return (
                        <div key={ticker} className="flex flex-col items-center min-w-[100px] group">
                            <div className={`control-card transition-all duration-500 ${cardGlow}`}>
                                <div className="flex justify-between text-xs mb-1 text-gray-400">
                                    <span className="font-bold text-white">{ticker}</span>
                                    <span className={`font-mono font-bold transition-all duration-300 ${priceStyle}`}>
                                        ${gameState!.portfolio[ticker].price.toFixed(0)}
                                    </span>
                                </div>
                                
                                <div className="flex justify-between items-end">
                                    <div className="font-mono text-purple-400 text-lg font-bold">
                                        {allocations[ticker]}%
                                    </div>
                                    <div className={`text-[10px] font-mono mb-1 flex items-center justify-end gap-1 ${pctColor}`}>
                                        {change.direction !== 'same' && <span>{arrow}</span>}
                                        {change.pct.toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                            <input 
                                type="range" min="0" max="100" value={allocations[ticker]}
                                disabled={isSimulating} 
                                aria-label={`Allocation percentage for ${ticker}`}
                                onChange={(e) => setAllocations({...allocations, [ticker]: parseInt(e.target.value)})}
                                className={`control-slider ${isSimulating ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                        </div>
                    );
                })}
             </div>
    
             {gameState!.turn < 10 && (
                 <button 
                    onClick={handleExecuteTurn} 
                    disabled={totalAllocation !== 100 || isSimulating}
                    className={`
                        btn-execute-turn 
                        ${(totalAllocation !== 100 || isSimulating) ? 'opacity-50 cursor-not-allowed hover:scale-100 shadow-none' : ''}
                    `}
                 >
                    {isSimulating ? "SIMULATING MARKET..." : (gameState!.turn === 0 ? "BEGIN" : "EXECUTE TURN")}
                 </button>
             )}
    
             {gameState!.turn >= 10 && (
                 <div className="text-2xl font-bold text-green-400 animate-pulse">SIMULATION COMPLETE</div>
             )}
          </div>
    
          {gameState!.turn >= 10 && (
            <GameOverModal 
                history={gameState!.history} 
                eventHistory={eventHistory} 
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
                    eventHistory: sanitizedEvents 
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