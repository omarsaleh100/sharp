'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

interface ScoreEntry {
  id: string;
  username: string;
  score: number; // Sharpe Ratio
  finalPortfolioValue: number;
}

export default function LeaderboardPage() {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameDate, setGameDate] = useState<string>('');
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));

    const fetchLeaderboard = async () => {
      try {
        // 1. Get Today's Game Date (Official Source of Truth)
        const configRef = doc(db, 'config', 'dailyAssets');
        const configSnap = await getDoc(configRef);
        
        if (!configSnap.exists()) return;
        const today = configSnap.data().date;
        setGameDate(today);

        // 2. Query Scores for TODAY, ordered by Score
        // Note: This requires a Firestore Index (see step 2 of instructions)
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
    <main className="min-h-screen bg-black text-white p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
            Daily Leaderboard
          </h1>
          <p className="text-gray-500 uppercase tracking-widest text-sm">
            {gameDate} • Top Traders
          </p>
        </header>

        {/* List */}
        <div className="space-y-4">
          {scores.length === 0 ? (
            <div className="text-center text-gray-600 py-10">
              No trades recorded yet today. Be the first!
            </div>
          ) : (
            scores.map((entry, index) => {
              const isMe = user && entry.username === user.displayName; // Or however you store auth name
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

        {/* Back Button */}
        <div className="mt-12 text-center">
          <button 
            onClick={() => router.push('/')}
            className="text-gray-500 hover:text-white transition-colors text-sm"
          >
            &larr; Back to Market
          </button>
        </div>
      </div>
    </main>
  );
}