'use client';
  
  import { useState, useEffect, useRef } from 'react';
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
    const [selectionOrigins, setSelectionOrigins] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
  
    useEffect(() => {
      const unsubscribeAuth = onAuthStateChanged(auth, (user) => { /* Auth */ });
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
      return () => { unsubscribeAuth(); unsubscribeAssets(); }
    }, []);
  
    // Initialize Scroll Position to Center (5 Sets -> Start at 2/5)
    useEffect(() => {
      if (!loading && !isSyncing && assets.length > 0 && scrollContainerRef.current) {
          setTimeout(() => {
              if (scrollContainerRef.current) {
                  // Start at the beginning of the 3rd set (index 2)
                  const scrollWidth = scrollContainerRef.current.scrollWidth;
                  const setWidth = scrollWidth / 5; 
                  scrollContainerRef.current.scrollLeft = setWidth * 2; 
              }
          }, 100);
      }
    }, [loading, isSyncing, assets.length, selected.length]); // Re-center when list changes size
  
    const handleSyncMarket = async () => {
      setIsSyncing(true);
      try {
          await fetch('http://127.0.0.1:5001/sharp-80263/us-central1/generate_daily_market', { mode: 'no-cors' });
      } catch (err) { console.error(err); } 
      finally { setTimeout(() => setIsSyncing(false), 1000); }
    };
  
    const toggleAsset = (symbol: string, originLayoutId?: string) => {
      if (selected.includes(symbol)) {
        setSelected(selected.filter(s => s !== symbol));
      } else {
        // CHANGED: Limit strictly to 4 assets
        if (selected.length < 4) {
            setSelected([...selected, symbol]);
            if (originLayoutId) {
                setSelectionOrigins(prev => ({ ...prev, [symbol]: originLayoutId }));
            }
        }
      }
    };
  
    const handleStart = () => {
      // CHANGED: Only start if exactly 4 selected
      if (selected.length !== 4) return;
      router.push(`/game?tickers=${selected.join(',')}`);
    };
  
    // Robust Bidirectional Infinite Scroll Logic
    const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      
      const { scrollLeft, scrollWidth } = scrollContainerRef.current;
      const setWidth = scrollWidth / 5; // We have 5 sets now
  
      // Thresholds: Keep user roughly within the middle set (Set 3)
      // If we scroll too far left (into Set 2), jump right to Set 3
      if (scrollLeft <= setWidth * 1.5) { 
          scrollContainerRef.current.scrollLeft += setWidth;
      } 
      // If we scroll too far right (into Set 4), jump left to Set 3
      else if (scrollLeft >= setWidth * 3.5) { 
          scrollContainerRef.current.scrollLeft -= setWidth;
      }
    };
  
    const selectedAssets = assets.filter(a => selected.includes(a.symbol));
    const poolAssets = assets.filter(a => !selected.includes(a.symbol));
  
    const AssetSkeleton = () => (
      <div className="flex-shrink-0 w-40 h-32 bg-gray-900/50 border border-gray-800 rounded-xl p-4 flex flex-col justify-between animate-pulse">
        <div>
          <div className="h-5 w-16 bg-gray-800 rounded mb-2"></div>
          <div className="h-3 w-10 bg-gray-800/60 rounded"></div>
        </div>
        <div className="h-1 w-full bg-gray-800/60 rounded-full"></div>
      </div>
    );
  
    const renderPoolItems = (items: Asset[], suffix: string) => (
      <AnimatePresence mode="popLayout">
          {items.map((asset) => {
              const itemLayoutId = `${asset.symbol}_${suffix}`;
              
              return (
                  <motion.div
                      layout
                      layoutId={itemLayoutId}
                      key={itemLayoutId}
                      onClick={() => toggleAsset(asset.symbol, itemLayoutId)}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      whileHover={{ y: -5, borderColor: '#2C7FFF' }}
                      className="card-asset-pool"
                  >
                      <div>
                          <h3 className="text-lg font-bold text-gray-300 group-hover:text-white">{asset.symbol}</h3>
                          <div className="text-[10px] text-gray-600 uppercase">Price</div>
                          <div className="text-sm font-mono text-gray-400">${asset.price.toFixed(2)}</div>
                      </div>
                      
                      <div>
                          <div className="flex justify-between text-[10px] text-gray-600 mb-1 uppercase">
                              <span>Risk</span>
                              <span>{(asset.volatility * 100).toFixed(0)}%</span>
                          </div>
                          <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                              <div 
                                  className="h-full bg-gray-500" 
                                  style={{ width: `${Math.min(asset.volatility * 100, 100)}%` }} 
                              />
                          </div>
                      </div>
                  </motion.div>
              );
          })}
      </AnimatePresence>
    );
  
    const renderSkeletons = (suffix: string) => (
      <>
          {Array.from({ length: 8 }).map((_, i) => (
              <AssetSkeleton key={`skel_${suffix}_${i}`} />
          ))}
      </>
    );
  
    return (
      <main className="h-screen bg-black text-white flex flex-col relative overflow-hidden font-sans">
        
        <header className="home-header">
          <h1 className="home-title">Sharp</h1>
          <div className="flex flex-col items-center gap-1">
              <button onClick={handleSyncMarket} disabled={isSyncing || loading} className="btn-refresh">
                 {(isSyncing || loading) && <span className="animate-spin">⟳</span>}
                 Refresh Market Data
              </button>
              {lastUpdated && !loading && <span className="text-[10px] text-gray-600 font-mono">{lastUpdated}</span>}
          </div>
        </header>
  
        <div className="flex-grow flex flex-col items-center justify-center relative z-0 w-full px-4 pb-48">
          {selectedAssets.length === 0 && !loading && !isSyncing && (
              <div className="absolute text-gray-600 text-xl animate-pulse tracking-widest uppercase font-light">
                  {/* CHANGED: Updated text */}
                  SELECT 4 ASSETS
              </div>
          )}
  
          <div className="flex items-center justify-center gap-4 flex-wrap w-full max-w-7xl">
              <AnimatePresence mode="popLayout">
                  {selectedAssets.map((asset) => {
                      const originId = selectionOrigins[asset.symbol] || `${asset.symbol}_main`;
                      
                      return (
                          <motion.div
                              layout 
                              layoutId={originId}
                              key={asset.symbol}
                              onClick={() => toggleAsset(asset.symbol)}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              className="card-asset-selected group"
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
                                  <div className="relative h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                      <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-gray-500 to-red-600" />
                                      <div 
                                          className="absolute top-0 right-0 h-full bg-gray-800" 
                                          style={{ width: `${100 - Math.min(asset.volatility * 100, 100)}%` }} 
                                      />
                                  </div>
                              </div>
                          </motion.div>
                      );
                  })}
              </AnimatePresence>
          </div>
        </div>
  
        {/* Bottom Section */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center w-full gap-6 pb-8 z-20 bg-gradient-to-t from-black via-black to-transparent pt-10">
          
          {/* Horizontal Scroll - INFINITE LOOP (Manual) */}
          <div className="relative w-full max-w-7xl h-40">
              {/* Fades - Positioned absolutely outside the scroll container */}
              <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-black to-transparent z-30 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-black to-transparent z-30 pointer-events-none" />
              
              <div 
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="w-full h-full overflow-x-auto no-scrollbar flex items-center px-12"
              >
                  <div className="flex items-center gap-3">
                      {(loading || isSyncing) ? (
                          <>
                              {renderSkeletons('p2')}
                              {renderSkeletons('p1')}
                              {renderSkeletons('main')}
                              {renderSkeletons('n1')}
                              {renderSkeletons('n2')}
                          </>
                      ) : (
                          <>
                              {renderPoolItems(poolAssets, 'p2')}
                              {renderPoolItems(poolAssets, 'p1')}
                              {renderPoolItems(poolAssets, 'main')}
                              {renderPoolItems(poolAssets, 'n1')}
                              {renderPoolItems(poolAssets, 'n2')}
                          </>
                      )}
                  </div>
              </div>
          </div>
  
          <button
            onClick={handleStart}
            // CHANGED: Disabled unless exactly 4
            disabled={selected.length !== 4 || loading || isSyncing}
            className={`
              btn-start-simulation
              ${(selected.length === 4 && !loading && !isSyncing) ? 'btn-start-active' : 'btn-start-disabled'}
            `}
          >
            {/* CHANGED: Count down from 4 */}
            {loading || isSyncing ? 'Scanning Market...' : (selected.length < 4 ? `Select ${4 - selected.length} more` : 'Initialize Simulation')}
          </button>
  
        </div>
      </main>
    );
  }
  