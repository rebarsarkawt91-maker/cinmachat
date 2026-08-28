import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
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
  arrayRemove,
  runTransaction,
  increment,
  getDocFromServer
} from "firebase/firestore";
import { 
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
  reauthenticateWithCredential,
  browserLocalPersistence,
  setPersistence,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithCustomToken,
  connectAuthEmulator
} from "firebase/auth";
import { 
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

const CINEMACHAT_AUTH_DOMAIN = "auth.cinamachat.com";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDQBu-FwP9w7O6KqaWQOsqyTP6NudH9eBI",
  authDomain: CINEMACHAT_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0240212572",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0240212572.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "996348355298",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:996348355298:web:fb59d6d18224c89f9634bb",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://gen-lang-client-0240212572-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
// Always use the project's default Firestore database.
// A stale build-time VITE_FIREBASE_DATABASE_ID can point at a deleted AI Studio
// database and leave the app stuck on its initial loading screen.
export const db = getFirestore(app);

// Local development runs against the local Firestore emulator so the app's
// writes are validated by this repo's own firestore.rules (deterministic —
// no dependency on the deployed production ruleset). Vite sets import.meta.env
// .DEV only for `npm run dev`; production builds never connect to the emulator.
// Override with VITE_USE_FIRESTORE_EMULATOR=false to test against production.
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIRESTORE_EMULATOR !== "false") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const auth = getAuth(app);
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("[Firebase Auth] Could not enforce local persistence:", err?.code || err?.message || err);
});

// Local E2E/testing runs against the local Auth emulator so anonymous sign-in
// (which the join-room flow relies on) produces tokens the Firestore emulator
// accepts — anonymous auth is DISABLED on the real Firebase project
// (ADMIN_ONLY_OPERATION), so it would fail in a plain `npm run dev`. Gated
// behind VITE_USE_AUTH_EMULATOR === "true" so normal dev flow (real Firebase
// project) and production are completely unchanged.
if (import.meta.env.DEV && import.meta.env.VITE_USE_AUTH_EMULATOR === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
}
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
  arrayRemove,
  runTransaction,
  increment,
  getDocFromServer,
  onAuthStateChanged,
  signInAnonymously,
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
  reauthenticateWithCredential,
  browserLocalPersistence,
  setPersistence,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithCustomToken,
  ref,
  uploadBytes,
  getDownloadURL
};
