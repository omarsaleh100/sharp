'use client';
  
  import { useState, useEffect, useRef } from 'react';
  import { useRouter } from 'next/navigation';
  import { db, auth, GoogleAuthProvider } from '@/lib/firebase';
  import { doc, onSnapshot } from 'firebase/firestore';
  import { onAuthStateChanged, signOut, signInWithPopup } from 'firebase/auth';
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
    
    const [user, setUser] = useState<any>(null);
    const [showProfile, setShowProfile] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
  
    useEffect(() => {
      const unsubscribeAuth = onAuthStateChanged(auth, (u) => { setUser(u); });
      const configRef = doc(db, 'config', 'dailyAssets');
      const unsubscribeAssets = onSnapshot(configRef, (docSnap) => {
        let hasData = false;
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.assets && data.assets.length > 0) {
            setAssets(data.assets);
            if (data.lastUpdated) {
                 const d = new Date(data.lastUpdated);
                 setLastUpdated(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ET');
            }
            hasData = true;
          }
        }
        
        if (hasData) {
            setLoading(false);
        } else {
            fetch('https://us-central1-sharp-80263.cloudfunctions.net/generate_daily_market', { mode: 'no-cors' })
                .catch(err => console.error("Auto-generation failed:", err));
        }
      });
      return () => { unsubscribeAuth(); unsubscribeAssets(); }
    }, []);
  
    useEffect(() => {
      if (!loading && !isSyncing && assets.length > 0 && scrollContainerRef.current) {
          setTimeout(() => {
              if (scrollContainerRef.current) {
                  const scrollWidth = scrollContainerRef.current.scrollWidth;
                  const setWidth = scrollWidth / 5; 
                  scrollContainerRef.current.scrollLeft = setWidth * 2; 
              }
          }, 100);
      }
    }, [loading, isSyncing, assets.length, selected.length]);
  
    const handleSyncMarket = async () => {
      setIsSyncing(true);
      try {
          await fetch('https://us-central1-sharp-80263.cloudfunctions.net/generate_daily_market', { mode: 'no-cors' });
      } catch (err) { console.error(err); } 
      finally { setTimeout(() => setIsSyncing(false), 1000); }
    };
  
    const toggleAsset = (symbol: string, originLayoutId?: string) => {
      if (selected.includes(symbol)) {
        setSelected(selected.filter(s => s !== symbol));
      } else {
        if (selected.length < 4) {
            setSelected([...selected, symbol]);
            if (originLayoutId) {
                setSelectionOrigins(prev => ({ ...prev, [symbol]: originLayoutId }));
            }
        }
      }
    };
  
    const handleStart = () => {
      if (selected.length !== 4) return;
      router.push(`/game?tickers=${selected.join(',')}`);
    };
  
    const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollLeft, scrollWidth } = scrollContainerRef.current;
      const setWidth = scrollWidth / 5; 
      if (scrollLeft <= setWidth * 1.5) { 
          scrollContainerRef.current.scrollLeft += setWidth;
      } else if (scrollLeft >= setWidth * 3.5) { 
          scrollContainerRef.current.scrollLeft -= setWidth;
      }
    };

    const handleProfileClick = () => {
        if (user) { setShowProfile(true); } else { setShowAuthModal(true); }
    };

    const handleSignIn = async () => {
        try { await signInWithPopup(auth, new GoogleAuthProvider()); setShowAuthModal(false); } catch (error) { console.error(error); }
    };

    const handleSignOut = async () => {
        try { await signOut(auth); setShowSignOutConfirm(false); setShowProfile(false); } catch (error) { console.error(error); }
    }
  
    const selectedAssets = assets.filter(a => selected.includes(a.symbol));
    const poolAssets = assets.filter(a => !selected.includes(a.symbol));
  
    const AssetSkeleton = () => (
      <div className="flex-shrink-0 w-24 h-24 md:w-40 md:h-32 bg-gray-900/50 border border-gray-800 rounded-lg md:rounded-xl p-3 md:p-4 flex flex-col justify-between animate-pulse">
        <div><div className="h-4 w-10 md:w-16 bg-gray-800 rounded mb-2"></div></div>
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
                          <h3 className="text-sm md:text-lg font-bold text-gray-300 group-hover:text-white">{asset.symbol}</h3>
                          <div className="text-[8px] md:text-[10px] text-gray-600 uppercase">Price</div>
                          <div className="text-[10px] md:text-sm font-mono text-gray-400">${asset.price.toFixed(2)}</div>
                      </div>
                      <div>
                          <div className="flex justify-between text-[8px] md:text-[10px] text-gray-600 mb-1 uppercase">
                              <span>Risk</span>
                              <span>{(asset.volatility * 100).toFixed(0)}%</span>
                          </div>
                          <div className="relative h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                              <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-gray-500 to-red-600" />
                              <div className="absolute top-0 right-0 h-full bg-gray-800" style={{ width: `${100 - Math.min(asset.volatility * 100, 100)}%` }} />
                          </div>
                      </div>
                  </motion.div>
              );
          })}
      </AnimatePresence>
    );
  
    const renderSkeletons = (suffix: string) => (
      <>{Array.from({ length: 8 }).map((_, i) => <AssetSkeleton key={`skel_${suffix}_${i}`} />)}</>
    );
  
    return (
      <main className="h-screen bg-black text-white flex flex-col relative overflow-hidden font-sans">
        
        <header className="home-header">
          {user && (
              <button 
                  onClick={() => router.push('/leaderboard')}
                  className="absolute left-4 top-3 md:left-8 md:top-8 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-gray-900 border border-gray-700 
                         flex items-center justify-center hover:bg-gray-800 transition-all z-50
                         text-[10px] md:text-sm font-bold text-gray-400 hover:text-white hover:border-yellow-600 w-auto gap-2 group"
              >
                  <span className="text-sm md:text-base group-hover:scale-110 transition-transform">🏆</span>
                  <span className="hidden md:inline">Leaderboard</span>
              </button>
          )}

          <div className="flex flex-col items-center">
            <h1 className="home-title">Sharp</h1>
            <div className="flex flex-col items-center gap-1">
                <button onClick={handleSyncMarket} disabled={isSyncing || loading} className="btn-refresh">
                   {(isSyncing || loading) && <span className="animate-spin">⟳</span>}
                   Refresh Market Data
                </button>
                {lastUpdated && !loading && <span className="text-[8px] md:text-[10px] text-gray-600 font-mono">{lastUpdated}</span>}
            </div>
          </div>

          <button onClick={handleProfileClick} className="btn-profile group">
              {user ? "Profile" : "Sign in"}
          </button>
        </header>
  
        <div className="flex-grow flex flex-col items-center justify-center relative z-0 w-full px-2 md:px-4 pb-32 md:pb-48">
          {(selectedAssets.length === 0 || loading || isSyncing) && (
              <div className="absolute text-gray-600 text-xs md:text-xl animate-pulse tracking-widest uppercase font-light text-center">
                  {(loading || isSyncing) ? "LOADING..." : "SELECT 4 ASSETS"}
              </div>
          )}
  
          <div className="flex items-center justify-center gap-2 md:gap-4 flex-wrap w-full max-w-7xl">
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
                                      <h3 className="text-lg md:text-2xl font-bold text-white mb-1">{asset.symbol}</h3>
                                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-purple-main shadow-[0_0_10px_#AD47FF]"></div>
                                  </div>
                                  <div className="text-gray-main text-[8px] md:text-xs uppercase tracking-wider mt-1 md:mt-2">Price</div>
                                  <div className="text-base md:text-xl font-mono text-white">${asset.price.toFixed(2)}</div>
                              </div>
                              <div>
                                  <div className="flex justify-between text-[8px] md:text-[10px] text-gray-500 mb-1 uppercase">
                                      <span>Risk</span>
                                      <span>{(asset.volatility * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="relative h-1 md:h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                      <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-gray-500 to-red-600" />
                                      <div className="absolute top-0 right-0 h-full bg-gray-800" style={{ width: `${100 - Math.min(asset.volatility * 100, 100)}%` }} />
                                  </div>
                              </div>
                          </motion.div>
                      );
                  })}
              </AnimatePresence>
          </div>
        </div>
  
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center w-full gap-3 md:gap-6 pb-4 md:pb-8 z-20 bg-gradient-to-t from-black via-black to-transparent pt-10">
          <div className="relative w-full max-w-7xl h-28 md:h-40">
              <div className="absolute left-0 top-0 bottom-0 w-12 md:w-24 bg-gradient-to-r from-black to-transparent z-30 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-12 md:w-24 bg-gradient-to-l from-black to-transparent z-30 pointer-events-none" />
              <div ref={scrollContainerRef} onScroll={handleScroll} className="w-full h-full overflow-x-auto no-scrollbar flex items-center px-6 md:px-12">
                  <div className="flex items-center gap-2 md:gap-3">
                      {(loading || isSyncing) ? (
                          <>{renderSkeletons('p2')}{renderSkeletons('p1')}{renderSkeletons('main')}{renderSkeletons('n1')}{renderSkeletons('n2')}</>
                      ) : (
                          <>{renderPoolItems(poolAssets, 'p2')}{renderPoolItems(poolAssets, 'p1')}{renderPoolItems(poolAssets, 'main')}{renderPoolItems(poolAssets, 'n1')}{renderPoolItems(poolAssets, 'n2')}</>
                      )}
                  </div>
              </div>
          </div>
          <button onClick={handleStart} disabled={selected.length !== 4 || loading || isSyncing} className={`btn-start-simulation ${(selected.length === 4 && !loading && !isSyncing) ? 'btn-start-active' : 'btn-start-disabled'}`}>
            {loading || isSyncing ? 'Scanning...' : (selected.length < 4 ? `Pick ${4 - selected.length}` : 'Initialize')}
          </button>
        </div>

        <AnimatePresence>
            {showProfile && (
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="absolute top-14 md:top-20 right-4 md:right-8 z-50 bg-gray-900 border border-gray-700 rounded-xl p-4 md:p-6 shadow-2xl w-64 md:w-72"
                >
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-white font-bold">Profile</h3>
                        <button onClick={() => setShowProfile(false)} className="text-gray-500 hover:text-white">&times;</button>
                    </div>
                    <div className="mb-6">
                        <div className="text-xs text-gray-500 uppercase mb-1">Signed in as</div>
                        <div className="text-purple-400 font-bold truncate">{user?.displayName || "Trader"}</div>
                        <div className="text-xs text-gray-600 truncate">{user?.email}</div>
                    </div>
                    <button onClick={() => setShowSignOutConfirm(true)} className="w-full py-2 bg-red-900/20 border border-red-900/50 text-red-400 rounded hover:bg-red-900/40 transition-colors text-xs uppercase tracking-wider">
                        Sign Out
                    </button>
                </motion.div>
            )}
        </AnimatePresence>

        <AnimatePresence>
            {showAuthModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-gray-900 border border-gray-700 rounded-xl p-6 md:p-8 text-center max-w-xs md:max-w-sm w-full shadow-2xl"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg md:text-xl text-white font-bold">Welcome Trader</h3>
                            <button onClick={() => setShowAuthModal(false)} className="text-gray-500 hover:text-white">&times;</button>
                        </div>
                        <button 
                            onClick={handleSignIn}
                            className="w-full bg-white text-black font-bold py-3 rounded hover:scale-105 transition-transform mb-4 flex items-center justify-center gap-2 text-sm md:text-base"
                        >
                            Sign in with Google
                        </button>
                        <p className="text-[10px] md:text-xs text-gray-500">Sign in to save your high scores and compete on the global leaderboard.</p>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        <AnimatePresence>
            {showSignOutConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center px-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-gray-900 border border-gray-700 rounded-xl p-6 md:p-8 text-center max-w-sm w-full"
                    >
                        <h3 className="text-lg md:text-xl text-white font-bold mb-2">Are you sure?</h3>
                        <p className="text-sm text-gray-400 mb-6">You will be signed out of your current session.</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => setShowSignOutConfirm(false)} className="px-4 md:px-6 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 text-sm">Cancel</button>
                            <button onClick={handleSignOut} className="px-4 md:px-6 py-2 bg-red-600 text-white rounded hover:bg-red-500 font-bold text-sm">Sign Out</button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
      </main>
    );
  }