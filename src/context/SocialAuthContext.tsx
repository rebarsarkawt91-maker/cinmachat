import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  auth, 
  db,
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  doc, 
  getDoc, 
  updateDoc,
  collection,
  query,
  where,
  getDocs
} from '../lib/firebase';
import { SocialUser } from '../types';

type FirebaseUser = any;
type ProfileUpdateInput = Partial<Pick<
  SocialUser,
  | 'displayName'
  | 'name'
  | 'username'
  | 'phone'
  | 'phoneNumber'
  | 'email'
  | 'bio'
  | 'gender'
  | 'birthday'
  | 'age'
  | 'country'
  | 'city'
  | 'residence'
  | 'language'
  | 'avatar'
  | 'avatarUrl'
  | 'cover'
>>;

interface SocialAuthContextType {
  currentUser: FirebaseUser | null;
  socialProfile: SocialUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateSocialProfile: (updates: ProfileUpdateInput) => Promise<void>;
}

const SocialAuthContext = createContext<SocialAuthContextType | undefined>(undefined);

const normalizePhoneNumber = (value?: string) =>
  String(value || '')
    .trim()
    .replace(/[()\-\s]/g, '')
    .replace(/^00/, '+');

const cleanProfileText = (value?: string, maxLength = 160) =>
  String(value || '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim()
    .slice(0, maxLength);

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

  const updateSocialProfile = async (updates: ProfileUpdateInput) => {
    if (!currentUser || !socialProfile) {
      throw new Error('پێویستە سەرەتا بچیتە ژوورەوە.');
    }

    const normalizedPhone = normalizePhoneNumber(updates.phoneNumber || updates.phone);
    const payload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.displayName !== undefined || updates.name !== undefined) {
      const displayName = cleanProfileText(updates.displayName || updates.name, 60);
      if (!displayName) throw new Error('ناوی پیشاندان پێویستە.');
      payload.displayName = displayName;
      payload.name = displayName;
    }

    if (updates.username !== undefined) {
      const username = cleanProfileText(updates.username, 32).toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      if (username && username.length < 3) throw new Error('Username دەبێت بەلایەنی کەم ٣ پیت بێت.');
      payload.username = username;
    }

    if (updates.phone !== undefined || updates.phoneNumber !== undefined) {
      if (!/^\+?\d{8,15}$/.test(normalizedPhone)) {
        throw new Error('تکایە ژمارەی مۆبایلی دروست بنووسە، لەگەڵ country code ئەگەر پێویست بوو.');
      }

      if (currentUser.uid !== 'admin_local_bypass') {
        const checks = [
          query(collection(db, 'users'), where('phoneNumber', '==', normalizedPhone)),
          query(collection(db, 'users'), where('phone', '==', normalizedPhone)),
        ];
        for (const phoneQuery of checks) {
          const snapshot = await getDocs(phoneQuery);
          const duplicate = snapshot.docs.some((item: any) => item.id !== currentUser.uid);
          if (duplicate) {
            throw new Error('ئەم ژمارەی مۆبایلە پێشتر بەکارهاتووە.');
          }
        }
      }

      payload.phone = normalizedPhone;
      payload.phoneNumber = normalizedPhone;
    }

    if (updates.email !== undefined) payload.email = cleanProfileText(updates.email, 120);
    if (updates.bio !== undefined) payload.bio = cleanProfileText(updates.bio, 280);
    if (updates.gender !== undefined) payload.gender = cleanProfileText(updates.gender, 40);
    if (updates.birthday !== undefined) payload.birthday = cleanProfileText(updates.birthday, 20);
    if (updates.age !== undefined) payload.age = cleanProfileText(updates.age, 20);
    if (updates.country !== undefined) payload.country = cleanProfileText(updates.country, 60);
    if (updates.city !== undefined) payload.city = cleanProfileText(updates.city, 60);
    if (updates.residence !== undefined) payload.residence = cleanProfileText(updates.residence, 100);
    if (updates.language !== undefined) payload.language = cleanProfileText(updates.language, 20);
    if (updates.avatar !== undefined || updates.avatarUrl !== undefined) {
      const avatar = cleanProfileText(updates.avatar || updates.avatarUrl, 500);
      payload.avatar = avatar;
      payload.avatarUrl = avatar;
    }
    if (updates.cover !== undefined) payload.cover = cleanProfileText(updates.cover, 500);

    if (currentUser.uid === 'admin_local_bypass') {
      const mergedProfile = { ...socialProfile, ...payload } as SocialUser;
      try {
        localStorage.setItem("cinemachat_local_admin_profile", JSON.stringify({
          name: mergedProfile.name,
          phone: mergedProfile.phone,
          uniqueCode: mergedProfile.uniqueCode,
        }));
      } catch (e) {}
      setSocialProfile(mergedProfile);
      return;
    }

    await updateDoc(doc(db, 'users', currentUser.uid), payload);
    setSocialProfile((previous) => previous ? ({ ...previous, ...payload } as SocialUser) : previous);
  };

  return (
    <SocialAuthContext.Provider value={{ currentUser, socialProfile, loading, logout, updateSocialProfile }}>
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
