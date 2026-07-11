import { initializeApp } from "firebase/app";
import { 
  getFirestore,
  collectionGroup,
  query,
  onSnapshot,
  orderBy,
  limit,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
  collection,
  where,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  arrayUnion,
  getDocFromServer
} from "firebase/firestore";
import { 
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithCustomToken
} from "firebase/auth";
import { 
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBW10i0jYNsrVPOGkCruWbtIkPshJ-RYlk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "studio-9115705870-8d920.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "studio-9115705870-8d920",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "studio-9115705870-8d920.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1059402213124",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1059402213124:web:323ab9cab26ddeb2ad5251",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || undefined
};

const app = initializeApp(firebaseConfig);

const dbId = import.meta.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-55969a39-e1e4-4db8-b903-7cd1590abfb9";
export const db = getFirestore(app, dbId);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Re-export SDK functions needed by App.tsx
export {
  collectionGroup,
  query,
  onSnapshot,
  orderBy,
  limit,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
  collection,
  where,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  arrayUnion,
  getDocFromServer,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithCustomToken,
  ref,
  uploadBytes,
  getDownloadURL
};
