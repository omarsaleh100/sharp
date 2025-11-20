import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase (Singleton Pattern)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// --- CRITICAL: Connect to Emulators in Dev Mode ---
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  console.log("🔌 Connecting to Firebase Emulators...");
  
  // Firestore (Port 8080)
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  
  // Auth (Port 9099)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  
  // Storage (Port 9199 - optional, check firebase.json if you enabled it)
  // connectStorageEmulator(storage, '127.0.0.1', 9199);
  
  // Functions (Port 5001)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export { app, db, auth, storage, functions, GoogleAuthProvider };