import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
import {
  getPublicMemberCode,
  hydrateGoogleCinemaChatProfile,
  normalizeProfilePhone,
} from '../services/socialProfileProvisioning';
import { api } from '../services/api';

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
  | 'address'
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

const GOOGLE_AUTH_FLAG_KEY = "cinemachat_google_redirect_pending";
const EMAIL_PASSWORD_AUTH_FLAG_KEY = "cinemachat_email_password_signin";

const navigateToHome = () => {
  if (typeof window === 'undefined') return;
  window.location.replace('/');
};

const cleanProfileText = (value?: string, maxLength = 160) =>
  String(value || '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim()
    .slice(0, maxLength);

const PROFILE_HYDRATION_TIMEOUT_MS = 30000;

const withProfileTimeout = async <T,>(
  promise: Promise<T>,
  message = 'Profile loading is taking longer than expected.',
): Promise<T> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), PROFILE_HYDRATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

const makeRecoverableGoogleProfile = (user: FirebaseUser): SocialUser => ({
  uid: user.uid,
  name: user.displayName || 'Google User',
  displayName: user.displayName || 'Google User',
  phone: '',
  phoneNumber: '',
  email: user.email || '',
  uniqueCode: '',
  googlePhotoUrl: user.photoURL || '',
  isOnline: true,
  role: 'user',
  userRole: 'user',
  provider: 'google',
  authProvider: 'google',
  profileStatus: 'recoverable-error',
} as SocialUser);

export const SocialAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [socialProfile, setSocialProfile] = useState<SocialUser | null>(null);
  const [loading, setLoading] = useState(true);
  const authEventVersionRef = useRef(0);

  // Fetches the canonical server profile and merges it over the Firestore-based
  // profile so newer server data always wins after reload/sign-in. An empty
  // server uniqueCode is never allowed to clobber a valid client-side code.
  const loadServerCanonicalProfile = async (user: FirebaseUser, baseProfile: SocialUser | null) => {
    try {
      const idToken = await user.getIdToken();
      const serverProfile = await api.getProfile(user.uid, idToken);
      if (!serverProfile) return baseProfile;
      const merged = { ...(baseProfile || {}), ...serverProfile } as SocialUser;
      const baseCode = getPublicMemberCode(baseProfile, user.uid);
      if (baseCode && !getPublicMemberCode(serverProfile, user.uid)) {
        merged.uniqueCode = baseCode;
      }
      return merged;
    } catch (error) {
      console.warn("Could not load canonical profile from server:", error);
      return baseProfile;
    }
  };

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

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      const authEventVersion = ++authEventVersionRef.current;
      setCurrentUser(user);
      
      if (user) {
        setLoading(true);
        const isGoogleUser = user.providerData?.some(
          (provider: { providerId?: string }) => provider.providerId === 'google.com',
        );
        const isEmailPasswordSignIn = sessionStorage.getItem(EMAIL_PASSWORD_AUTH_FLAG_KEY) === '1';
        const shouldHydrateGoogleProfile = isGoogleUser && !isEmailPasswordSignIn;
        try {
          if (shouldHydrateGoogleProfile) {
            const profile = await withProfileTimeout(
              hydrateGoogleCinemaChatProfile(user),
              'Profile loading is taking longer than expected.',
            );
            const canonicalProfile = await loadServerCanonicalProfile(user, profile);
            if (authEventVersion === authEventVersionRef.current) {
              setSocialProfile(canonicalProfile);
            }
          } else {
            // Email/password path: read this account's existing profile, then
            // overlay the canonical server record (server wins on reload).
            const userDocRef = doc(db, 'users', user.uid);
            const profileSnap = await getDoc(userDocRef);
            if (authEventVersion !== authEventVersionRef.current) return;

            const baseProfile = profileSnap.exists()
              ? (profileSnap.data() as SocialUser)
              : null;
            if (baseProfile) baseProfile.userRole = baseProfile.userRole || baseProfile.role;

            const canonicalProfile = await loadServerCanonicalProfile(user, baseProfile);
            if (authEventVersion !== authEventVersionRef.current) return;

            if (canonicalProfile) {
              // Only mint a member code when NO canonical source (server or
              // Firestore) already has one; never regenerate existing codes.
              if (!getPublicMemberCode(canonicalProfile, user.uid) && profileSnap.exists()) {
                const baseNum = baseProfile?.uniqueCode
                  ? baseProfile.uniqueCode.replace('CC-', '')
                  : Math.floor(1000 + Math.random() * 9000);
                const uniqueCode = `CC-CC-${baseNum}`;
                await updateDoc(userDocRef, { uniqueCode }).catch(() => {});
                canonicalProfile.uniqueCode = uniqueCode;
              }

              if (authEventVersion === authEventVersionRef.current) {
                setSocialProfile(canonicalProfile);
              }
              if (!canonicalProfile.isOnline) {
                await updateDoc(userDocRef, { isOnline: true }).catch(() => {});
              }
            } else if (authEventVersion === authEventVersionRef.current) {
              setSocialProfile(null);
            }
          }
        } catch (error) {
          if (authEventVersion !== authEventVersionRef.current) return;
          if (shouldHydrateGoogleProfile) {
            console.error("Profile hydration error:", error);
            setSocialProfile((previous) => previous ?? makeRecoverableGoogleProfile(user));
          } else {
            console.error("Profile Fetch Error:", error);
          }
        } finally {
          if (isEmailPasswordSignIn) {
            sessionStorage.removeItem(EMAIL_PASSWORD_AUTH_FLAG_KEY);
          }
          if (authEventVersion === authEventVersionRef.current) {
            setLoading(false);
          }
        }
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
    setLoading(true);
    try {
      localStorage.removeItem("cinemachat_local_admin_profile");
      localStorage.removeItem("cinemachat_admin");
      sessionStorage.removeItem(GOOGLE_AUTH_FLAG_KEY);
      sessionStorage.removeItem(EMAIL_PASSWORD_AUTH_FLAG_KEY);
    } catch (e) {}

    if (currentUser && currentUser.uid !== "admin_local_bypass") {
      await updateDoc(doc(db, 'users', currentUser.uid), { isOnline: false }).catch(() => {});
    }

    try {
      await firebaseSignOut(auth);
    } catch (error) {
      setLoading(false);
      throw error;
    }

    setCurrentUser(null);
    setSocialProfile(null);
    setLoading(false);
    navigateToHome();
  };

  const updateSocialProfile = async (updates: ProfileUpdateInput) => {
    if (!currentUser || !socialProfile) {
      throw new Error('پێویستە سەرەتا بچیتە ژوورەوە.');
    }

    const normalizedPhone = normalizeProfilePhone(updates.phoneNumber || updates.phone);
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
      if (normalizedPhone && !/^\+?\d{8,15}$/.test(normalizedPhone)) {
        throw new Error('تکایە ژمارەی مۆبایلی دروست بنووسە، لەگەڵ country code ئەگەر پێویست بوو.');
      }

      if (normalizedPhone && currentUser.uid !== 'admin_local_bypass') {
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
    if (updates.address !== undefined) payload.address = cleanProfileText(updates.address, 200);
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

    // Save to the server FIRST (canonical store) and wait for success. The
    // Firestore mirror and shared client state are only updated afterwards.
    const idToken = await currentUser.getIdToken();
    const savedProfile = await api.saveProfile(currentUser.uid, idToken, payload);

    setSocialProfile((previous) =>
      previous
        ? ({ ...previous, ...payload, ...(savedProfile || {}) } as SocialUser)
        : previous,
    );
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), payload);
    } catch (error) {
      console.warn('Profile saved on server but Firestore mirror failed:', error);
    }
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
