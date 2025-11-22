'use client';
  
  import { useState, useEffect } from 'react';
  import { db, auth } from '@/lib/firebase';
  import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
  import { onAuthStateChanged } from 'firebase/auth';
  import { useRouter } from 'next/navigation';
  import { motion, AnimatePresence } from 'framer-motion';
  
  interface ScoreEntry {
    id: string;
    username: string;
    score: number; // Sharpe Ratio
    finalPortfolioValue: number;
    eventHistory?: any[]; // Add event history to interface
  }
  
  export default function LeaderboardPage() {
    const [scores, setScores] = useState<ScoreEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [gameDate, setGameDate] = useState<string>('');
    const [user, setUser] = useState<any>(null);
    const [selectedEvents, setSelectedEvents] = useState<any[] | null>(null); // For Modal
    const router = useRouter();
  
    useEffect(() => {
      const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
  
      const fetchLeaderboard = async () => {
        try {
          const configRef = doc(db, 'config', 'dailyAssets');
          const configSnap = await getDoc(configRef);
          
          if (!configSnap.exists()) return;
          const today = configSnap.data().date;
          setGameDate(today);
  
          const q = query(
            collection(db, 'scores'),
            where('gameDate', '==', today),
            orderBy('score', 'desc'),
            limit(50)
          );
  
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ScoreEntry[];
  
          setScores(data);
        } catch (err) {
          console.error("Error fetching leaderboard:", err);
        } finally {
          setLoading(false);
        }
      };
  
      fetchLeaderboard();
      return () => unsubscribe();
    }, []);
  
    if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading Rankings...</div>;
  
    return (
      <main className="min-h-screen bg-black text-white p-8 font-sans relative">
        <div className="max-w-2xl mx-auto">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
              Daily Leaderboard
            </h1>
            <p className="text-gray-500 uppercase tracking-widest text-sm">
              {gameDate} • Top Traders
            </p>
          </header>
  
          <div className="space-y-4">
            {scores.length === 0 ? (
              <div className="text-center text-gray-600 py-10">
                No trades recorded yet today. Be the first!
              </div>
            ) : (
              scores.map((entry, index) => {
                const isMe = user && entry.username === user.displayName;
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    key={entry.id}
                    className={`
                      flex items-center justify-between p-4 rounded-xl border 
                      ${index === 0 ? 'bg-yellow-900/20 border-yellow-600/50' : 'bg-gray-900 border-gray-800'}
                      ${isMe ? 'ring-2 ring-purple-500' : ''}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`
                        w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm
                        ${index === 0 ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400'}
                      `}>
                        #{index + 1}
                      </div>
                      <div>
                        <div className="font-bold text-white">
                          {entry.username}
                          {isMe && <span className="ml-2 text-[10px] bg-purple-600 px-2 py-0.5 rounded-full text-white">YOU</span>}
                        </div>
                        <div className="text-xs text-gray-500">
                          PnL: {((entry.finalPortfolioValue - 1000000) / 1000000 * 100).toFixed(2)}%
                        </div>
                        
                        {/* Event Summary Button */}
                        {entry.eventHistory && entry.eventHistory.length > 0 && (
                            <button 
                              onClick={() => setSelectedEvents(entry.eventHistory || [])}
                              className="mt-2 text-[10px] uppercase tracking-wider text-purple-400 hover:text-purple-300 flex items-center gap-1"
                            >
                              <span className="text-lg leading-none">ⓘ</span> View Events
                            </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xs text-gray-500 uppercase">Sharpe</div>
                      <div className="text-xl font-mono font-bold text-purple-400">
                        {entry.score.toFixed(2)}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
  
          <div className="mt-12 text-center">
            <button 
              onClick={() => router.push('/')}
              className="text-gray-500 hover:text-white transition-colors text-sm"
            >
              &larr; Back to Market
            </button>
          </div>
        </div>
  
        {/* Events Modal */}
        <AnimatePresence>
          {selectedEvents && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedEvents(null)}>
                  <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }} 
                      animate={{ scale: 1, opacity: 1 }} 
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full p-6 shadow-2xl overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                  >
                      <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-bold text-white">Session Events</h3>
                          <button onClick={() => setSelectedEvents(null)} className="text-gray-500 hover:text-white text-2xl">&times;</button>
                      </div>
                      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar">
                          {selectedEvents.map((evt, i) => (
                              <div key={i} className="bg-black/50 p-4 rounded border border-gray-800">
                                  <div className="flex justify-between mb-1">
                                      <span className="text-xs font-bold text-purple-400 uppercase">Turn {evt.turn}</span>
                                      <span className="text-xs text-gray-600">Global Event</span>
                                  </div>
                                  <div className="font-bold text-white mb-1">{evt.headline}</div>
                                  <div className="text-sm text-gray-400 mb-2">{evt.description}</div>
                                  <div className="text-xs text-green-400/80 bg-green-900/10 p-2 rounded border border-green-900/30">
                                      IMPACT: {evt.summary}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </motion.div>
              </div>
          )}
        </AnimatePresence>
      </main>
    );
  }
  