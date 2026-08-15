import { SocialUser } from "../types";
import {
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "../lib/firebase";

type FirebaseLikeUser = {
  uid?: string;
  displayName?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  photoURL?: string | null;
  providerData?: Array<{ providerId?: string | null }>;
};

export const LEGACY_PROFILE_PLACEHOLDERS = new Set([
  "",
  "---",
  "google account",
  "not added",
  "n/a",
  "na",
  "null",
  "undefined",
  "unknown",
]);

export const normalizeProfileEmail = (value?: string | null) =>
  String(value || "").trim().toLowerCase();

export const isPlaceholderProfileValue = (value?: string | null) =>
  LEGACY_PROFILE_PLACEHOLDERS.has(String(value || "").trim().toLowerCase());

export const cleanProfilePhone = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (isPlaceholderProfileValue(raw)) return "";
  return raw;
};

export const isValidProfilePhone = (value?: string | null) => {
  const phone = cleanProfilePhone(value).replace(/[()\-\s]/g, "").replace(/^00/, "+");
  return /^\+?\d{8,15}$/.test(phone);
};

export const normalizeProfilePhone = (value?: string | null) => {
  const phone = cleanProfilePhone(value).replace(/[()\-\s]/g, "").replace(/^00/, "+");
  return isValidProfilePhone(phone) ? phone : "";
};

export const looksLikeFirebaseUid = (value?: string | null, currentUid?: string) => {
  const code = String(value || "").trim();
  if (!code) return false;
  if (currentUid && code === currentUid) return true;
  return /^[A-Za-z0-9_-]{20,}$/.test(code) && !code.includes("-");
};

export const isValidCinemaChatCode = (value?: string | null, currentUid?: string) => {
  const code = String(value || "").trim().toUpperCase();
  if (isPlaceholderProfileValue(code) || looksLikeFirebaseUid(code, currentUid)) return false;
  return /^CC-[A-Z0-9]+-[A-Z0-9]+$/.test(code);
};

export const getPublicMemberCode = (profile?: Partial<SocialUser> | null, currentUid?: string) => {
  const code = String(profile?.uniqueCode || "").trim().toUpperCase();
  return isValidCinemaChatCode(code, currentUid || profile?.uid) ? code : "";
};

export const profileDisplayValue = (value?: string | null, fallback = "Not added") => {
  const clean = String(value || "").trim();
  return isPlaceholderProfileValue(clean) ? fallback : clean;
};

const getProviderIds = (user: FirebaseLikeUser) =>
  new Set((user.providerData || []).map((item) => item?.providerId).filter(Boolean) as string[]);

const hasVerifiedGoogleEmail = (user: FirebaseLikeUser) => {
  const providers = getProviderIds(user);
  return !!normalizeProfileEmail(user.email) && (user.emailVerified !== false || providers.has("google.com"));
};

const profileFromDoc = (snapshot: any) => ({
  id: snapshot.id as string,
  data: snapshot.data() as Record<string, any>,
});

const shouldBackfillProfileByEmail = (profile: Record<string, any>, user: FirebaseLikeUser) => {
  if (!hasVerifiedGoogleEmail(user)) return false;
  if (!getPublicMemberCode(profile as Partial<SocialUser>, user.uid)) return true;
  if (!normalizeProfilePhone(profile.phoneNumber || profile.phone)) return true;
  if (isPlaceholderProfileValue(profile.name || profile.displayName || profile.username)) return true;
  return false;
};

const mergeExistingProfileSources = (
  uidSource: ReturnType<typeof profileFromDoc> | null,
  emailSource: ReturnType<typeof profileFromDoc> | null,
  userUid: string,
) => {
  if (!uidSource) return emailSource?.data || {};
  if (!emailSource) return uidSource.data;

  const merged = { ...emailSource.data, ...uidSource.data };
  const backfillKeys = [
    "name",
    "displayName",
    "username",
    "email",
    "emailLower",
    "uniqueCode",
    "phone",
    "phoneNumber",
    "avatar",
    "avatarUrl",
    "bio",
    "birthday",
    "age",
    "gender",
    "country",
    "city",
    "residence",
    "language",
    "cover",
  ];

  backfillKeys.forEach((key) => {
    const currentValue = uidSource.data?.[key];
    const fallbackValue = emailSource.data?.[key];
    if (key === "uniqueCode") {
      if (!isValidCinemaChatCode(currentValue, userUid) && isValidCinemaChatCode(fallbackValue, userUid)) {
        merged[key] = fallbackValue;
      }
      return;
    }
    if (key === "phone" || key === "phoneNumber") {
      if (!normalizeProfilePhone(currentValue) && normalizeProfilePhone(fallbackValue)) {
        merged[key] = fallbackValue;
      }
      return;
    }
    if (isPlaceholderProfileValue(currentValue) && !isPlaceholderProfileValue(fallbackValue)) {
      merged[key] = fallbackValue;
    }
  });

  return merged;
};

const findProfileByEmail = async (user: FirebaseLikeUser) => {
  const email = normalizeProfileEmail(user.email);
  if (!email || !hasVerifiedGoogleEmail(user)) return null;

  const usersRef = collection(db, "users");
  const candidates = [
    query(usersRef, where("email", "==", email), limit(2)),
    query(usersRef, where("emailLower", "==", email), limit(2)),
  ];

  for (const candidate of candidates) {
    const snapshot = await getDocs(candidate);
    const match = snapshot.docs.find((item: any) => item.id !== user.uid);
    if (match) return profileFromDoc(match);
  }

  return null;
};

const uniqueCodeExists = async (code: string, currentUid: string) => {
  const snapshot = await getDocs(
    query(collection(db, "users"), where("uniqueCode", "==", code), limit(2)),
  );
  return snapshot.docs.some((item: any) => item.id !== currentUid && item.data()?.uid !== currentUid);
};

const createUniqueCinemaChatCode = async (currentUid: string) => {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = `CC-CC-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await uniqueCodeExists(code, currentUid))) return code;
  }
  throw new Error("Could not create a unique CinemaChat member code.");
};

const mergeProviderIds = (existing: Record<string, any>, user: FirebaseLikeUser) => {
  const merged = new Set<string>();
  if (Array.isArray(existing.providerIds)) {
    existing.providerIds.forEach((value: unknown) => {
      if (typeof value === "string" && value.trim()) merged.add(value.trim());
    });
  }
  getProviderIds(user).forEach((value) => merged.add(value));
  if (merged.size === 0) merged.add("google.com");
  return Array.from(merged);
};

export const hydrateGoogleCinemaChatProfile = async (user: FirebaseLikeUser): Promise<SocialUser> => {
  if (!user?.uid) throw new Error("Google sign-in returned no user");

  const userDocRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userDocRef);
  const uidSource = userSnap.exists() ? profileFromDoc(userSnap) : null;
  const emailSource = !uidSource || shouldBackfillProfileByEmail(uidSource.data, user)
    ? await findProfileByEmail(user)
    : null;
  const existing = mergeExistingProfileSources(uidSource, emailSource, user.uid);

  const existingCode = getPublicMemberCode(existing as Partial<SocialUser>, user.uid);
  const uniqueCode = existingCode || await createUniqueCinemaChatCode(user.uid);
  const phone = normalizeProfilePhone(existing.phoneNumber || existing.phone || user.phoneNumber);
  const email = normalizeProfileEmail(existing.email || user.email);
  const displayName = profileDisplayValue(existing.displayName || existing.name || existing.username || user.displayName, "Google User");
  const googlePhotoUrl = profileDisplayValue(existing.googlePhotoUrl || user.photoURL, "");
  const avatar = profileDisplayValue(existing.avatar || existing.avatarUrl, "");

  const profile = {
    ...existing,
    uid: user.uid,
    name: displayName,
    displayName,
    username: profileDisplayValue(existing.username, ""),
    phone,
    phoneNumber: phone,
    email,
    emailLower: email,
    uniqueCode,
    avatar,
    avatarUrl: avatar,
    googlePhotoUrl,
    isOnline: true,
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString(),
    role: existing.role || existing.userRole || "user",
    userRole: existing.userRole || existing.role || "user",
    authProvider: existing.authProvider
      ? String(existing.authProvider).includes("google")
        ? existing.authProvider
        : `${existing.authProvider},google`
      : "google",
    provider: existing.provider || "google",
    providerIds: mergeProviderIds(existing, user),
    linkedProfileDocId: emailSource && emailSource.id !== user.uid ? emailSource.id : existing.linkedProfileDocId,
  } as SocialUser;

  await setDoc(userDocRef, profile, { merge: true });
  return profile;
};
