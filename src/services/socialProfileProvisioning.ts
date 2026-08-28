import { SocialUser } from "../types";
import {
  collection,
  db,
  getDocs,
  limit,
  query,
  where,
} from "../lib/firebase";

export const LEGACY_PROFILE_PLACEHOLDERS = new Set([
  "",
  "---",
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
