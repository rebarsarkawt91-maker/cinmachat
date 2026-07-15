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
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDQBu-FwP9w7O6KqaWQOsqyTP6NudH9eBI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0240212572.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0240212572",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0240212572.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "996348355298",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:996348355298:web:fb59d6d18224c89f9634bb",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://gen-lang-client-0240212572-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);

const dbId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
export const db = dbId ? getFirestore(app, dbId) : getFirestore(app);
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
