import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
  normalizeProfilePhone,
} from '../services/socialProfileProvisioning';
import { getAccountReadiness, AccountReadiness } from '../services/accountReadiness';
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
  | 'moviePreference'
  | 'location'
>>;

interface SocialAuthContextType {
  currentUser: FirebaseUser | null;
  socialProfile: SocialUser | null;
  loading: boolean;
  /** Account readiness for the CinemaChat private flow (guest/incomplete/ready). */
  accountReadiness: AccountReadiness;
  logout: () => Promise<void>;
  updateSocialProfile: (updates: ProfileUpdateInput) => Promise<void>;
  /** Re-runs the canonical profile hydration for the current user (retry). */
  refreshProfile: () => Promise<void>;
}

const SocialAuthContext = createContext<SocialAuthContextType | undefined>(undefined);

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

export const SocialAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [socialProfile, setSocialProfile] = useState<SocialUser | null>(null);
  const [loading, setLoading] = useState(true);
  const authEventVersionRef = useRef(0);
  const logoutBusyRef = useRef(false);

  // Derive account readiness from the canonical auth/profile state. Single
  // source of truth shared by the CinemaChat gate, profile menu and modals.
  const accountReadiness = getAccountReadiness(currentUser, socialProfile, loading);

  // Fetches the canonical server profile and merges it over the Firestore-based
  // profile so newer server data always wins after reload/sign-in. An empty
  // server uniqueCode is never allowed to clobber a valid client-side code.
  const loadServerCanonicalProfile = useCallback(
    async (user: FirebaseUser, baseProfile: SocialUser | null) => {
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
    },
    [],
  );

  // Loads the canonical profile for a signed-in user. Extracted so both the
  // onAuthStateChanged listener and refreshProfile() share ONE hydration path.
  const hydrateProfile = useCallback(
    async (user: FirebaseUser, authEventVersion: number) => {
      setLoading(true);
      try {
        // Read this account's existing profile, then overlay the canonical
        // server record (server wins on reload).
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
      } catch (error) {
        if (authEventVersion !== authEventVersionRef.current) return;
        console.error("Profile Fetch Error:", error);
      } finally {
        if (authEventVersion === authEventVersionRef.current) {
          setLoading(false);
        }
      }
    },
    [loadServerCanonicalProfile],
  );

  const refreshProfile = useCallback(async (): Promise<void> => {
    const user = currentUser;
    if (!user || user.uid === "admin_local_bypass") return;
    const authEventVersion = ++authEventVersionRef.current;
    setCurrentUser(user);
    await hydrateProfile(user, authEventVersion);
  }, [currentUser, hydrateProfile]);

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
          email: adminData.email || "admin@localhost.local",
          emailVerified: true,
          getIdToken: async () => "local_admin_token"
        } as any);
        setSocialProfile({
          uid: "admin_local_bypass",
          name: adminData.name || "admin",
          role: "super_admin",
          userRole: "super_admin",
          phone: adminData.phone || "",
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
        await hydrateProfile(user, authEventVersion);
      } else {
        setSocialProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, [hydrateProfile]);

  const logout = async () => {
    // Guard against double-clicks / concurrent invocations (the UI button is
    // also disabled via logoutBusy, but a second call can still race in).
    if (logoutBusyRef.current) return;
    logoutBusyRef.current = true;
    setLoading(true);

    // Clear every client-side account marker FIRST so a reload can never
    // re-hydrate a "signed in" shell from a stale local bypass/flag.
    try {
      localStorage.removeItem("cinemachat_local_admin_profile");
      localStorage.removeItem("cinemachat_admin");
    } catch (e) {}

    if (currentUser && currentUser.uid !== "admin_local_bypass") {
      await updateDoc(doc(db, 'users', currentUser.uid), { isOnline: false }).catch(() => {});
    }

    try {
      await firebaseSignOut(auth);
    } catch (error) {
      // Never leave the UI half-signed-in: if the SDK call fails (e.g. a flaky
      // network) we still clear the local session state and reload. The reloaded
      // app reflects the real Firebase auth state instead of a stale shell.
      console.warn("[SocialAuth] signOut() failed; clearing local session state anyway:", error);
    }

    setCurrentUser(null);
    setSocialProfile(null);
    setLoading(false);
    logoutBusyRef.current = false;
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
            throw new Error('ئەم ژمارە مۆبایلە پێشتر تۆمار کراوە.');
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
    if (updates.moviePreference !== undefined) payload.moviePreference = cleanProfileText(updates.moviePreference, 200);
    if (updates.location !== undefined && updates.location !== null) {
      const loc = updates.location as { latitude?: number; longitude?: number; region?: string; address?: string };
      if (typeof loc.latitude === "number" && typeof loc.longitude === "number") {
        payload.location = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          ...(loc.region ? { region: cleanProfileText(loc.region, 100) } : {}),
          ...(loc.address ? { address: cleanProfileText(loc.address, 200) } : {}),
        };
      }
    }

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
    <SocialAuthContext.Provider value={{ currentUser, socialProfile, loading, accountReadiness, logout, updateSocialProfile, refreshProfile }}>
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
