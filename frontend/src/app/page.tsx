'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';

interface Asset {
  symbol: string;
  price: number;
  volatility: number;
}

export default function AssetSelection() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Auth logic
    });

    const configRef = doc(db, 'config', 'dailyAssets');
    const unsubscribeAssets = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAssets(data.assets || []);
        if (data.lastUpdated) {
             const d = new Date(data.lastUpdated);
             setLastUpdated(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ET');
        }
      }
      setLoading(false);
    });

    return () => {
        unsubscribeAuth();
        unsubscribeAssets();
    }
  }, []);

  const handleSyncMarket = async () => {
    setIsSyncing(true);
    try {
        await fetch('http://127.0.0.1:5001/sharp-80263/us-central1/generate_daily_market', { mode: 'no-cors' });
    } catch (err) { console.error(err); } 
    finally { setTimeout(() => setIsSyncing(false), 1000); }
  };

  const toggleAsset = (symbol: string) => {
    if (selected.includes(symbol)) {
      setSelected(selected.filter(s => s !== symbol));
    } else {
      if (selected.length < 5) {
        setSelected([...selected, symbol]);
      }
    }
  };

  const handleStart = () => {
    if (selected.length < 3) return;
    router.push(`/game?tickers=${selected.join(',')}`);
  };

  const selectedAssets = assets.filter(a => selected.includes(a.symbol));
  const poolAssets = assets.filter(a => !selected.includes(a.symbol));

  if (loading) return <div className="flex h-screen items-center justify-center bg-black text-white">Loading Market...</div>;

  return (
    <main className="h-screen bg-black text-white flex flex-col relative overflow-hidden font-sans">
      
      {/* Header */}
      <header className="w-full py-6 text-center z-10 shrink-0">
        <h1 className="text-5xl font-bold mb-2 text-blue-main tracking-tight">Sharp</h1>
        
        <div className="flex flex-col items-center gap-1">
            <button 
                onClick={handleSyncMarket}
                disabled={isSyncing}
                className="text-[10px] uppercase tracking-wider flex items-center gap-2 px-3 py-1 rounded bg-gray-900 border border-gray-800 text-gray-main hover:text-white hover:border-gray-600 transition-colors"
            >
               {isSyncing && <span className="animate-spin">⟳</span>}
               Refresh Market Data
            </button>
            {lastUpdated && <span className="text-[10px] text-gray-600 font-mono">{lastUpdated}</span>}
        </div>
      </header>

      {/* Main Stage (Selected Assets) */}
      {/* Added pb-40 to prevent overlap with the fixed bottom bar */}
      <div className="flex-grow flex flex-col items-center justify-center relative z-0 w-full px-4 pb-48">
        
        {selectedAssets.length === 0 && (
            <div className="absolute text-gray-600 text-xl animate-pulse tracking-widest uppercase font-light">
                Select 3-5 Assets
            </div>
        )}

        {/* Grid for Selected Items */}
        <div className="flex items-center justify-center gap-4 flex-wrap w-full max-w-7xl">
            <AnimatePresence mode="popLayout">
                {selectedAssets.map((asset) => (
                    <motion.div
                        layout // <--- This is the fix: Animates siblings when one is removed
                        layoutId={asset.symbol}
                        key={asset.symbol}
                        onClick={() => toggleAsset(asset.symbol)}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className="
                            relative group cursor-pointer 
                            w-44 h-60 /* Adjusted size to fit 5 perfectly */
                            bg-[#0D0D12] rounded-2xl 
                            border-[2px] border-purple-main 
                            shadow-[0_0_40px_rgba(173,71,255,0.3)]
                            hover:shadow-[0_0_60px_rgba(173,71,255,0.5)]
                            flex flex-col p-5 justify-between
                            transition-shadow duration-300
                        "
                    >
                        <div>
                            <div className="flex justify-between items-start">
                                <h3 className="text-2xl font-bold text-white mb-1">{asset.symbol}</h3>
                                <div className="w-2 h-2 rounded-full bg-purple-main shadow-[0_0_10px_#AD47FF]"></div>
                            </div>
                            <div className="text-gray-main text-xs uppercase tracking-wider mt-2">Price</div>
                            <div className="text-xl font-mono text-white">${asset.price.toFixed(2)}</div>
                        </div>

                        <div>
                            <div className="flex justify-between text-[10px] text-gray-500 mb-1 uppercase">
                                <span>Risk</span>
                                <span>{(asset.volatility * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-purple-main to-blue-main" 
                                    style={{ width: `${Math.min(asset.volatility * 150, 100)}%` }} 
                                />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
      </div>

      {/* Bottom Section Wrapper - Fixed to bottom to prevent layout jumps */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center w-full gap-6 pb-8 z-20 bg-gradient-to-t from-black via-black to-transparent pt-10">
        
        {/* Horizontal Scroll (Pool Assets) */}
        <div className="relative w-full max-w-7xl h-40">
            {/* Fade Blur Overlay */}
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-black to-transparent z-20 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-black to-transparent z-20 pointer-events-none" />
            
            <div className="w-full h-full overflow-x-auto no-scrollbar flex items-center px-12 gap-3 mask-fade-left">
                <AnimatePresence mode="popLayout">
                    {poolAssets.map((asset) => (
                        <motion.div
                            layout // <--- Animates siblings in the pool list
                            layoutId={asset.symbol}
                            key={asset.symbol}
                            onClick={() => toggleAsset(asset.symbol)}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            whileHover={{ y: -5, borderColor: '#2C7FFF' }}
                            className="
                                flex-shrink-0 w-40 h-32 
                                bg-[#0F1016] border border-gray-800 
                                rounded-xl cursor-pointer p-4 
                                flex flex-col justify-between 
                                hover:bg-gray-900 transition-all duration-200
                            "
                        >
                            <div>
                                <h3 className="text-lg font-bold text-gray-300 group-hover:text-white">{asset.symbol}</h3>
                                <div className="text-[10px] text-gray-600 uppercase">Price</div>
                                <div className="text-sm font-mono text-gray-400">${asset.price.toFixed(2)}</div>
                            </div>
                            
                            {/* Mini Risk Bar */}
                            <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-main opacity-50" style={{ width: `${Math.min(asset.volatility * 150, 100)}%` }} />
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleStart}
          disabled={selected.length < 3}
          className={`
            px-12 py-4 rounded-full font-bold text-sm tracking-widest uppercase transition-all duration-300
            ${selected.length >= 3 
              ? 'bg-white text-black hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.2)]' 
              : 'bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed'}
          `}
        >
          {selected.length < 3 ? `Select ${3 - selected.length} more` : 'Initialize Simulation'}
        </button>

      </div>

    </main>
  );
}