import React, { useState, useEffect } from 'react';
import { 
  Routes, 
  Route, 
  useNavigate, 
  Navigate, 
  Outlet, 
  useLocation 
} from 'react-router-dom';
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  Timestamp, // <-- NEW IMPORT
  collection, // <-- NEW IMPORT
  addDoc, // <-- NEW IMPORT
  query, // <-- NEW IMPORT
  orderBy, // <-- NEW IMPORT
  limit, // <-- NEW IMPORT
  getDocs // <-- NEW IMPORT
} from 'firebase/firestore';

// --- TYPE DEFINITIONS ---
type SimulationState = {
  turn: number;
  portfolioValue: number;
  simulationParameters: any;
  driftedAllocation?: { [key: string]: number };
  event?: any;
  allocation: { [key: string]: number };
  history: { turn: number, value: number }[];
};

type ScoreEntry = {
  id?: string;
  userId: string;
  username: string;
  score: number;
  date: Timestamp;
};

//================================================================
// 1. MAIN APP COMPONENT
//================================================================
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="app-container"><h1>Loading...</h1></div>;
  }

  return (
    <Routes>
      {user ? (
        <Route path="/" element={<ProtectedLayout user={user} />}>
          <Route index element={<LobbyScreen user={user} />} />
          <Route path="select" element={<AssetSelectScreen />} />
          <Route path="game" element={<GameScreen />} /> 
          <Route path="results" element={<ResultsScreen user={user} />} />
          <Route path="login" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <>
          <Route path="/" element={<LoginScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}

//================================================================
// 2. PROTECTED LAYOUT
//================================================================
// --- UPDATED to receive user prop ---
const ProtectedLayout: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut(auth);
  };
  return (
    <div className="app-container">
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#aaa' }}>{user.displayName}</span>
        <button onClick={handleSignOut} style={{ background: '#4E4E4E', color: 'white' }}>
          Sign Out
        </button>
      </div>
      <Outlet /> 
    </div>
  );
};

//================================================================
// 3. LOGIN SCREEN
//================================================================
const LoginScreen: React.FC = () => {
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName,
          lastPlayed: null, 
        });
      }
    } catch (error) {
      console.error("Google sign-in error:", error);
    }
  };
  return (
    <div className="app-container" style={{ textAlign: 'center' }}>
      <h1>Welcome to Quant Lab</h1>
      <p>A daily simulation game for active portfolio management.</p>
      <button onClick={handleGoogleLogin}>
        Sign In with Google
      </button>
    </div>
  );
};

//================================================================
// 4. LOBBY SCREEN
//================================================================
interface LobbyScreenProps { user: User; }
const LobbyScreen = ({ user }: LobbyScreenProps) => {
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    const checkLastPlayed = async () => {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const today = new Date().toISOString().split('T')[0];
        const playedDate = userSnap.data().lastPlayed; 
        if (playedDate === today) setLastPlayed('today');
        else setLastPlayed(null);
      }
      setLoading(false);
    };
    checkLastPlayed();
  }, [user.uid]);

  if (loading) return <h2>Loading...</h2>;
  
  if (lastPlayed === 'today') return (
    <>
      <h2>You've already played today.</h2>
      <p>"Come back tomorrow."</p>
    </>
  );

  return (
    <>
      <h2>Welcome, {user.displayName || 'Player'}!</h2>
      <p>Ready to build your portfolio?</p>
      <button onClick={() => navigate('/select')}>Start New Simulation</button>
    </>
  );
};

//================================================================
// 5. SCREEN 1: ASSET SELECT
//================================================================
const AssetSelectScreen: React.FC = () => {
  const [tickers, setTickers] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTickers = async () => {
      try {
        const docRef = doc(db, 'config', 'dailyAssets');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTickers(docSnap.data().tickers);
        } else {
          setError("Could not load daily assets. (Did you deploy & run the function?)");
        }
      } catch (err) {
        setError("Error fetching assets."); console.error(err);
      }
      setLoading(false);
    };
    fetchTickers();
  }, []);

  const handleCheckboxChange = (ticker: string) => {
    setSelectedTickers(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  };

  const handleStartSimulation = async () => {
    setError(null);
    if (selectedTickers.length < 3 || selectedTickers.length > 5) {
      setError("Please select 3 to 5 assets to begin."); return;
    }
    setLoading(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL;
      const response = await fetch(`${apiUrl}/start_simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: selectedTickers })
      });
      if (!response.ok) throw new Error('API server is not responding. Did you start it?');
      const simulationState: SimulationState = await response.json();

      const initialAllocation = Object.fromEntries(
        selectedTickers.map(ticker => [ticker, 1 / selectedTickers.length])
      );
      simulationState.allocation = initialAllocation;
      simulationState.history = [
        { turn: 0, value: simulationState.portfolioValue }
      ];

      navigate('/game', { state: { simulationState } });
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading && tickers.length === 0) return <h2>Loading daily assets...</h2>;
  return (
    <div>
      <h2>Step 1: Build Your Portfolio</h2>
      <p>Select 3 to 5 assets to use in your 20-turn simulation.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '20px 0' }}>
        {tickers.map(ticker => (
          <label key={ticker} style={{ fontSize: '1.2rem' }}>
            <input
              type="checkbox"
              checked={selectedTickers.includes(ticker)}
              onChange={() => handleCheckboxChange(ticker)}
              style={{ width: '20px', height: '20px', marginRight: '10px', verticalAlign: 'middle' }}
            />
            {ticker}
          </label>
        ))}
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={handleStartSimulation} disabled={loading}>
        {loading ? "Initializing..." : "Start Simulation"}
      </button>
    </div>
  );
};

//================================================================
// 6. SCREEN 2: THE GAME
//================================================================
const GameScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [simState, setSimState] = useState<SimulationState | null>(location.state?.simulationState);
  
  const [allocations, setAllocations] = useState<{ [key: string]: number }>(
    () => simState?.allocation || simState?.driftedAllocation || {}
  );
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!simState) {
      navigate('/select');
    }
  }, [simState, navigate]);

  const handleSliderChange = (ticker: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setAllocations(prev => ({
      ...prev,
      [ticker]: newValue / 100
    }));
  };
  
  const totalAllocation = Object.values(allocations).reduce((sum, val) => sum + val, 0);

  const handleNextTurn = async () => {
    setError(null);
    setLoading(true);

    if (Math.round(totalAllocation * 100) !== 100) {
      setError("Your allocations must add up to 100%.");
      setLoading(false);
      return;
    }

    try {
      const apiUrl = process.env.REACT_APP_API_URL;
      const response = await fetch(`${apiUrl}/next_turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulationParameters: simState?.simulationParameters,
          allocation: allocations,
          portfolioValue: simState?.portfolioValue,
          turn: simState?.turn
        })
      });

      if (!response.ok) throw new Error('API server is not responding.');
      
      const nextState = await response.json();

      setSimState(prev => {
        if (!prev) return null;
        const newHistory = [...prev.history, { turn: nextState.turn, value: nextState.newValue }];
        
        return {
          ...prev,
          turn: nextState.turn,
          portfolioValue: nextState.newValue,
          driftedAllocation: nextState.driftedAllocation,
          event: nextState.event,
          history: newHistory,
          allocation: nextState.driftedAllocation
        };
      });
      
      if (nextState.turn === 20) {
        const finalHistory = [...(simState?.history || []), { turn: nextState.turn, value: nextState.newValue }];
        navigate('/results', { state: { finalHistory } });
        return;
      }
      
      setAllocations(nextState.driftedAllocation);

    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (!simState) return null;

  const tickers = Object.keys(allocations);

  return (
    <div style={{ width: '100%' }}>
      <h2>Turn: {simState.turn} / 20</h2>
      <h3>Portfolio Value: ${simState.portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
      
      {simState.event && (
        <div style={{ background: '#4E4E4E', padding: '10px', borderRadius: '8px', margin: '20px 0' }}>
          <h4>{simState.event.name}</h4>
          <p>{simState.event.message}</p>
        </div>
      )}
      
      <h4>Rebalance Your Portfolio</h4>
      {tickers.map(ticker => {
        const value = Math.round(allocations[ticker] * 100);
        return (
          // *** ACCESSIBILITY FIX: Added <label> ***
          <label key={ticker} style={{ display: 'block', marginBottom: '15px' }}>
            <strong>{ticker}: {value}%</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={value}
              onChange={(e) => handleSliderChange(ticker, e)}
              aria-label={`${ticker} allocation`} // Explicit label for screen readers
            />
          </label>
        );
      })}
      
      <h4 style={{ color: Math.round(totalAllocation * 100) === 100 ? 'green' : 'red' }}>
        Total Allocation: {Math.round(totalAllocation * 100)}%
      </h4>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={handleNextTurn} disabled={loading} style={{ width: '100%' }}>
        {loading ? "Simulating..." : "Next Turn"}
      </button>
    </div>
  );
};

//================================================================
// 7. SCREEN 3: RESULTS (FULLY BUILT)
//================================================================
const ResultsScreen: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const finalHistory = location.state?.finalHistory as { turn: number, value: number }[] | undefined;
  
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!finalHistory) {
      navigate('/');
      return;
    }

    const calculateAndSave = async () => {
      // --- 1. Calculate Score (Sharpe Ratio) ---
      // This is a simplified version. A real one would use risk-free rate.
      const returns = finalHistory.slice(1).map((entry, i) => {
        const prevValue = finalHistory[i].value;
        return (entry.value - prevValue) / prevValue;
      });
      const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(returns.map(r => Math.pow(r - meanReturn, 2)).reduce((a, b) => a + b, 0) / returns.length);
      // Annualize the (quarterly) Sharpe Ratio
      const finalSharpeRatio = (meanReturn / stdDev) * Math.sqrt(4); 

      // --- 2. Write Score to Firestore ---
      const newScore: Omit<ScoreEntry, 'id'> = {
        userId: user.uid,
        username: user.displayName || 'Anonymous',
        score: finalSharpeRatio,
        date: Timestamp.now()
      };
      await addDoc(collection(db, 'scores'), newScore);

      // --- 3. Update User's lastPlayed date ---
      const userRef = doc(db, 'users', user.uid);
      const today = new Date().toISOString().split('T')[0];
      await setDoc(userRef, { lastPlayed: today }, { merge: true });

      // --- 4. Display Leaderboard ---
      const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(10));
      const querySnapshot = await getDocs(q);
      const scores: ScoreEntry[] = [];
      querySnapshot.forEach(doc => {
        scores.push({ id: doc.id, ...doc.data() as ScoreEntry });
      });
      setLeaderboard(scores);
      
      setLoading(false);
    };

    calculateAndSave();
  }, [finalHistory, navigate, user.uid, user.displayName]);

  if (!finalHistory) return null;

  const finalValue = finalHistory[20].value;
  const initialValue = finalHistory[0].value;
  const totalReturn = (finalValue / initialValue - 1) * 100;

  return (
    <div style={{width: '100%'}}>
      <h2>Simulation Complete!</h2>
      <p>Final Portfolio Value: ${finalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <h3>Your Score (Total Return): {totalReturn.toFixed(2)}%</h3>
      
      {loading ? (
        <p>Calculating score and loading leaderboard...</p>
      ) : (
        <>
          <h3>Today's Leaderboard</h3>
          <ol style={{ paddingLeft: '20px' }}>
            {leaderboard.map((entry, index) => (
              <li key={entry.id} style={{ marginBottom: '10px' }}>
                <strong>{entry.username}</strong>
                <span style={{ float: 'right' }}>
                  {entry.score.toFixed(4)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      
      <button onClick={() => navigate('/')} style={{ width: '100%', marginTop: '20px' }}>
        Back to Lobby
      </button>
    </div>
  );
};

export default App;