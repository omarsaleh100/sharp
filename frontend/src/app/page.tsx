'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
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
  const [hasPlayed, setHasPlayed] = useState(false); // <--- NEW STATE
  const router = useRouter();

  // 1. Listen for Auth & Game Status
  useEffect(() => {
    let unsubscribeAssets: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        // A. Get the Official "Game Date" from Config
        const configRef = doc(db, 'config', 'dailyAssets');
        const configSnap = await getDoc(configRef);
        
        if (!configSnap.exists()) {
             setLoading(false);
             return;
        }

        const gameDate = configSnap.data().date; // e.g. "2025-11-20"

        // B. Check if User Played Today (Only if logged in)
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.lastPlayedDate === gameDate) {
              setHasPlayed(true);
            }
          }
        }

        // C. Listen to Asset Updates (Real-time)
        unsubscribeAssets = onSnapshot(configRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setAssets(data.assets || []);
            if (data.lastUpdated) {
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

      } catch (err) {
        console.error("Error initializing:", err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeAssets) unsubscribeAssets();
    };
  }, []);

  // 2. Manual Sync Function
  const handleSyncMarket = async () => {
    setIsSyncing(true);
    try {
        await fetch('http://127.0.0.1:5001/sharp-80263/us-central1/generate_daily_market', {
            mode: 'no-cors'
        });
    } catch (err) {
        console.error("Sync failed:", err);
    } finally {
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

  if (loading) return <div className="flex h-screen items-center justify-center bg-black text-white">Checking Market Status...</div>;

  // --- NEW: LOCKOUT SCREEN ---
  if (hasPlayed) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center font-sans">
        <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl"
        >
            <h1 className="text-3xl font-bold text-red-500 mb-4">Markets Closed</h1>
            <p className="text-gray-400 mb-8">
                You have already traded for today. <br/>
                The market will reopen tomorrow with new assets.
            </p>
            
            <button 
                onClick={() => router.push('/leaderboard')}
                className="w-full py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition-transform"
            >
                View Daily Leaderboard
            </button>
        </motion.div>
      </main>
    );
  }

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