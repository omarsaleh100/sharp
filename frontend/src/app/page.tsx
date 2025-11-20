'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore'; // <--- Changed getDoc to onSnapshot
import { motion } from 'framer-motion';

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

  // 1. Real-time Listener for Assets
  useEffect(() => {
    const docRef = doc(db, 'config', 'dailyAssets');
    
    // This listener fires immediately, and again whenever the DB changes
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
          const data = docSnap.data();
          setAssets(data.assets || []);
          if (data.lastUpdated) {
              // Force Toronto Time (ET)
              const timeString = new Date(data.lastUpdated).toLocaleTimeString('en-US', {
                  timeZone: 'America/New_York',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
              });
              setLastUpdated(`${timeString} ET`);
          }
      }
      setLoading(false);
  });

    return () => unsubscribe();
  }, []);

  // 2. Function to Trigger Manual Update
  const handleSyncMarket = async () => {
    setIsSyncing(true);
    try {
        // Call the backend function directly
        await fetch('http://127.0.0.1:5001/sharp-80263/us-central1/generate_daily_market', {
            mode: 'no-cors' // <--- ADD THIS LINE
        });
        
        // The onSnapshot listener above will catch the DB change automatically!
    } catch (err) {
        console.error("Sync failed:", err);
        // alert("Failed to sync..."); // You can comment this out now since it might be a false alarm
    } finally {
        // Give it a fake buffer time just so the spinner doesn't flicker too fast
        setTimeout(() => setIsSyncing(false), 1000);
    }
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

  const handleStart = async () => {
    if (selected.length < 3) return;
    const query = selected.join(',');
    router.push(`/game?tickers=${query}`);
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-black text-white">Connecting to Market Feed...</div>;

  return (
    <main className="min-h-screen bg-black text-white p-8 font-sans">
      <header className="max-w-4xl mx-auto mb-12 text-center relative">
        <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
          Quant Lab
        </h1>
        <p className="text-gray-400 mb-4">
          Select 3-5 assets to seed your portfolio.
        </p>
        
        <div className="flex items-center justify-center gap-4">
            <button 
                onClick={handleSyncMarket}
                disabled={isSyncing}
                className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors flex items-center gap-2"
            >
                {isSyncing ? (
                    <span className="animate-spin">⟳</span>
                ) : (
                    <span>↻</span>
                )}
                {isSyncing ? "Syncing Prices..." : "Refresh Market Data"}
            </button>
            {lastUpdated && (
                <span className="text-xs text-gray-600">Updated: {lastUpdated}</span>
            )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
        {assets.map((asset) => {
          const isSelected = selected.includes(asset.symbol);
          return (
            <motion.div
              layout
              key={asset.symbol}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleAsset(asset.symbol)}
              className={`
                cursor-pointer p-4 rounded-xl border-2 transition-all duration-200
                ${isSelected 
                  ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.5)]' 
                  : 'border-gray-800 bg-gray-900 hover:border-gray-600'}
              `}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-lg">{asset.symbol}</span>
                {isSelected && <span className="text-purple-400 text-xs">✓</span>}
              </div>
              <div className="text-xs text-gray-500">Price</div>
              <div className="font-mono text-sm">${asset.price.toFixed(2)}</div>
              
              <div className="mt-2 w-full bg-gray-800 h-1 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500" 
                  style={{ width: `${Math.min(asset.volatility * 100, 100)}%` }} 
                />
              </div>
              <div className="text-[10px] text-gray-600 mt-1">Risk: {(asset.volatility * 100).toFixed(1)}%</div>
            </motion.div>
          );
        })}
      </div>

      <div className="fixed bottom-8 left-0 right-0 flex justify-center">
        <button
          onClick={handleStart}
          disabled={selected.length < 3}
          className={`
            px-8 py-4 rounded-full font-bold text-lg transition-all duration-300
            ${selected.length >= 3 
              ? 'bg-white text-black hover:scale-105 shadow-lg shadow-white/20' 
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'}
          `}
        >
          {selected.length < 3 ? `Select ${3 - selected.length} more` : 'Initialize Simulation'}
        </button>
      </div>
    </main>
  );
}