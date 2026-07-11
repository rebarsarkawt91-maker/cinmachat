// Dynamic, LocalStorage-synced Client-Side Mock Database & Authentication Layer
// Created to temporarily bypass real Firebase server calls as requested by the user.

import { useState } from 'react';

// --- MOCK LOCAL REPOSITORY ---
const DB_STORAGE_KEY = "@cinma_mock_db";
const AUTH_STORAGE_KEY = "@cinma_mock_user";

const getStore = () => {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {
      config: {
        friends_room: {
          videoUrl: "https://www.youtube.com/watch?v=Rsztt5qDj_A",
          roomVideoUrl: "https://www.youtube.com/watch?v=Rsztt5qDj_A"
        },
        featured: {
          videoUrl: "https://www.youtube.com/watch?v=Rsztt5qDj_A",
          title: "Featured Movie",
          url: "https://www.youtube.com/watch?v=Rsztt5qDj_A"
        }
      },
      users: {},
      syncGroups: {},
      invitations: []
    };
  } catch {
    return {};
  }
};

const saveStore = (store: any) => {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event("storage"));
  } catch (e) {
    console.error("Storage save failed:", e);
  }
};

// --- MULTI-TAB LIVE SYNC TRIGGERS ---
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    listeners.forEach(cb => cb());
  });
}

// --- FIREBASE APP MOCKS ---
export const initializeApp = () => ({ name: "[MockApp]" });
export const getApps = () => [];
export const getApp = () => ({ name: "[MockApp]" });

// --- FIREBASE AUTH MOCKS ---
class MockUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  phoneNumber: string | null;

  constructor(data: any) {
    this.uid = data.uid || "mock_uid_" + Math.random().toString(36).substring(2, 9);
    this.email = data.email || null;
    this.displayName = data.displayName || "گەڕۆکی میوان";
    this.isAnonymous = data.isAnonymous ?? true;
    this.phoneNumber = data.phoneNumber || null;
  }
}

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? new MockUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

const authStateListeners = new Set<(user: any) => void>();

export const getAuth = () => {
  const authObj: any = {
    get currentUser() {
      return getStoredUser();
    }
  };
  authObj.onAuthStateChanged = (callback: (user: any) => void) => {
    return onAuthStateChanged(authObj, callback);
  };
  return authObj;
};

export const onAuthStateChanged = (authObj: any, callback: (user: any) => void) => {
  const current = getStoredUser();
  callback(current);
  authStateListeners.add(callback);
  return () => {
    authStateListeners.delete(callback);
  };
};

export const signInWithEmailAndPassword = async (authObj: any, email: string, password: any) => {
  const mockU = new MockUser({ email, displayName: email.split('@')[0], isAnonymous: false });
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockU));
  authStateListeners.forEach(cb => cb(mockU));
  return { user: mockU };
};

export const createUserWithEmailAndPassword = async (authObj: any, email: string, password: any) => {
  const mockU = new MockUser({ email, displayName: email.split('@')[0], isAnonymous: false });
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockU));
  authStateListeners.forEach(cb => cb(mockU));
  return { user: mockU };
};

export const signInWithCustomToken = async (authObj: any, token: string) => {
  const mockU = new MockUser({ uid: "custom_" + token.substring(0, 10), isAnonymous: false });
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockU));
  authStateListeners.forEach(cb => cb(mockU));
  return { user: mockU };
};

export const signInAnonymously = async (authObj: any) => {
  const mockU = new MockUser({ isAnonymous: true });
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockU));
  authStateListeners.forEach(cb => cb(mockU));
  return { user: mockU };
};

export const signInWithPopup = async (authObj: any, provider: any) => {
  const mockU = new MockUser({ email: "google@cinema.mock", displayName: "بەکارهێنەری گووگڵ", isAnonymous: false });
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockU));
  authStateListeners.forEach(cb => cb(mockU));
  return { user: mockU };
};

export const signOut = async (authObj: any) => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  authStateListeners.forEach(cb => cb(null));
};

export const updateProfile = async (user: any, profileData: any) => {
  const current = getStoredUser();
  if (current) {
    const updated = { ...current, displayName: profileData.displayName || current.displayName };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
    authStateListeners.forEach(cb => cb(updated));
  }
};

export class GoogleAuthProvider {
  static credential() { return {}; }
}

// --- FIREBASE FIRESTORE MOCKS ---
export const initializeFirestore = () => ({ name: "[MockFirestore]" });
export const setLogLevel = () => {};

export const doc = (dbRef: any, collectionName: string, ...rest: string[]) => {
  const pathParts = [collectionName, ...rest];
  const docId = pathParts[pathParts.length - 1];
  const colPath = pathParts.slice(0, -1).join('/');
  return { type: 'doc', col: colPath, id: docId, path: pathParts.join('/') };
};

export const collection = (dbRef: any, collectionName: string, ...rest: string[]) => {
  const pathParts = [collectionName, ...rest];
  return { type: 'collection', col: pathParts.join('/') };
};

export const query = (refObj: any, ...constraints: any[]) => {
  return refObj;
};

export const where = (field: string, op: string, val: any) => {
  return { type: 'where', field, op, val };
};

export const orderBy = (field: string, direction?: string) => ({ type: 'orderBy', field, direction });
export const limit = (num: number) => ({ type: 'limit', num });
export const collectionGroup = (dbRef: any, colId: string) => ({ type: 'collectionGroup', colId });

export const getDoc = async (docRef: any) => {
  const store = getStore();
  const colData = store[docRef.col] || {};
  const data = colData[docRef.id];
  return {
    id: docRef.id,
    exists: () => !!data,
    data: () => data || null
  };
};

export const getDocFromServer = getDoc;

export const setDoc = async (docRef: any, data: any, options?: any) => {
  const store = getStore();
  if (!store[docRef.col]) store[docRef.col] = {};
  
  if (options?.merge) {
    store[docRef.col][docRef.id] = {
      ...(store[docRef.col][docRef.id] || {}),
      ...data
    };
  } else {
    store[docRef.col][docRef.id] = data;
  }
  
  saveStore(store);
};

export const updateDoc = async (docRef: any, data: any) => {
  const store = getStore();
  if (!store[docRef.col]) store[docRef.col] = {};
  store[docRef.col][docRef.id] = {
    ...(store[docRef.col][docRef.id] || {}),
    ...data
  };
  saveStore(store);
};

export const addDoc = async (colRef: any, data: any) => {
  const store = getStore();
  if (!store[colRef.col]) store[colRef.col] = {};
  const newId = "doc_" + Math.random().toString(36).substring(2, 9);
  store[colRef.col][newId] = data;
  saveStore(store);
  return { id: newId };
};

export const deleteDoc = async (docRef: any) => {
  const store = getStore();
  if (store[docRef.col] && store[docRef.col][docRef.id]) {
    delete store[docRef.col][docRef.id];
    saveStore(store);
  }
};

export const getDocs = async (queryRef: any) => {
  const store = getStore();
  const colData = store[queryRef.col] || {};
  const docsList = Object.keys(colData).map(id => ({
    id,
    data: () => colData[id],
    exists: () => true
  }));
  return {
    empty: docsList.length === 0,
    docs: docsList,
    forEach: (cb: any) => docsList.forEach(cb)
  };
};

export const onSnapshot = (targetRef: any, next: (snap: any) => void, errorCallback?: (err: any) => void) => {
  const triggerUpdate = () => {
    try {
      const store = getStore();
      if (targetRef.type === 'doc') {
        const colData = store[targetRef.col] || {};
        const docVal = colData[targetRef.id];
        next({
          id: targetRef.id,
          exists: () => !!docVal,
          data: () => docVal || null
        });
      } else {
        const colData = store[targetRef.col] || {};
        const docsList = Object.keys(colData).map(id => ({
          id,
          data: () => colData[id],
          exists: () => true
        }));
        next({
          empty: docsList.length === 0,
          docs: docsList,
          forEach: (cb: any) => docsList.forEach(cb)
        });
      }
    } catch (err) {
      if (errorCallback) errorCallback(err);
    }
  };

  // Immediate push of current value
  triggerUpdate();

  // Add tab listener
  listeners.add(triggerUpdate);
  return () => {
    listeners.delete(triggerUpdate);
  };
};

export const serverTimestamp = () => new Date().toISOString();
export const arrayUnion = (...items: any[]) => items;

// --- FIREBASE STORAGE MOCK ---
export const getStorage = () => ({ name: "[MockStorage]" });
export const ref = (storageRef: any, pathName: string) => ({ pathName });
export const uploadBytes = async (refObj: any, bytes: any) => {
  console.log("Mock Storage uploaded bytes to:", refObj.pathName);
  return { ref: refObj };
};
export const getDownloadURL = async (refObj: any) => {
  return "https://images.unsplash.com/photo-1616530940355-351fabd9524b?auto=format&fit=crop&q=80&w=400";
};

// --- REALTIME DATABASE MOCK ---
export const getDatabase = () => ({ name: "[MockRealTimeDatabase]" });
export const onValue = (dbRef: any, callback: (snap: any) => void) => {
  const trigger = () => {
    callback({
      val: () => ({ videoUrl: "https://www.youtube.com/watch?v=Rsztt5qDj_A" })
    });
  };
  trigger();
  listeners.add(trigger);
  return () => {
    listeners.delete(trigger);
  };
};
export const update = async (dbRef: any, values: any) => {
  console.log("Mock RTDB update:", values);
};

// Default DB reference
export const db = initializeFirestore() as any;
export const auth = getAuth() as any;
export const storage = getStorage() as any;
