import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  auth, 
  db,
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  updateDoc
} from '../lib/firebase';
import { SocialUser } from '../types';

type FirebaseUser = any;

interface SocialAuthContextType {
  currentUser: FirebaseUser | null;
  socialProfile: SocialUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const SocialAuthContext = createContext<SocialAuthContextType | undefined>(undefined);

export const SocialAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [socialProfile, setSocialProfile] = useState<SocialUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if there is a local admin bypass in local storage
    let isLocalBypass = null;
    try {
      isLocalBypass = localStorage.getItem("cinemachat_local_admin_profile");
    } catch (e) {}

    if (isLocalBypass) {
      try {
        const adminData = JSON.parse(isLocalBypass);
        setCurrentUser({
          uid: "admin_local_bypass",
          displayName: adminData.name || "admin",
          email: "admin@cinemachat.com",
          emailVerified: true,
          getIdToken: async () => "local_admin_token"
        } as any);
        setSocialProfile({
          uid: "admin_local_bypass",
          name: adminData.name || "admin",
          role: "super_admin",
          userRole: "super_admin",
          phone: adminData.phone || "07701966640",
          uniqueCode: adminData.uniqueCode || "CC-ADM-001",
          avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde",
          isOnline: true
        });
        setLoading(false);
        return;
      } catch (err) {
        console.warn("Failed to parse admin bypass data:", err);
      }
    }

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        setLoading(true);
        // Point 38: Fetch social profile once instead of listening continuously
        const userDocRef = doc(db, 'users', user.uid);
        try {
          const profileSnap = await getDoc(userDocRef);
          if (profileSnap.exists()) {
            const data = profileSnap.data() as SocialUser;
            data.userRole = data.userRole || data.role;
            
            // Fix legacy users missing or outdated format uniqueCode
            if (!data.uniqueCode || (data.uniqueCode.startsWith("CC-") && !data.uniqueCode.startsWith("CC-CC-"))) {
              const baseNum = data.uniqueCode ? data.uniqueCode.replace("CC-", "") : Math.floor(1000 + Math.random() * 9000);
              const uniqueCode = `CC-CC-${baseNum}`;
              await updateDoc(userDocRef, { uniqueCode }).catch(() => {});
              data.uniqueCode = uniqueCode;
            }
            
            setSocialProfile(data);
            
            // Mark online status once
            if (!data.isOnline) {
              await updateDoc(userDocRef, { isOnline: true }).catch(() => {});
            }
          } else {
            setSocialProfile(null);
          }
        } catch (error) {
          console.error("Profile Fetch Error (Likely Quota):", error);
          if (error instanceof Error && error.message.includes("quota")) {
            // If quota hit, we might still have user in memory but can't fetch profile
          }
        }
        setLoading(false);
      } else {
        setSocialProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  const logout = async () => {
    try {
      localStorage.removeItem("cinemachat_local_admin_profile");
      localStorage.removeItem("cinemachat_admin");
    } catch (e) {}

    if (currentUser && currentUser.uid !== "admin_local_bypass") {
      await updateDoc(doc(db, 'users', currentUser.uid), { isOnline: false }).catch(() => {});
    }

    try {
      await firebaseSignOut(auth);
    } catch (e) {}

    setCurrentUser(null);
    setSocialProfile(null);
  };

  return (
    <SocialAuthContext.Provider value={{ currentUser, socialProfile, loading, logout }}>
      {children}
    </SocialAuthContext.Provider>
  );
};

export const useSocialAuth = () => {
  const context = useContext(SocialAuthContext);
  if (context === undefined) {
    throw new Error('useSocialAuth must be used within a SocialAuthProvider');
  }
  return context;
};
