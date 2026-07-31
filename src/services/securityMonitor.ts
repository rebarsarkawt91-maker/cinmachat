import {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "../lib/firebase";

// ---------------------------------------------------------------------------
// Security Monitor service (Module 8 - بەکارهێنەران و مافەکان).
//
// The legacy Render backend (cinemachat-server.onrender.com) is dead, so all
// /api/* session tracking, IP logging and user management calls returned 404.
// This service is the Firestore replacement: it persists an enriched,
// dedicated security record per user (admin_security_users), captures the
// client IP client-side, and appends every meaningful action to the
// user_activity_logs collection — fully isolated from the regular `users`
// collection so tracking data never cross-contaminates app data.
// ---------------------------------------------------------------------------

let cachedIpPromise: Promise<string> | null = null;

/**
 * Resolve the client's public IP client-side (the old server-side x-forwarded
 * capture is gone with the dead backend). Results are cached for the page
 * lifetime and the promise is safe to await from multiple call sites.
 */
export const getClientIp = (): Promise<string> => {
  if (!cachedIpPromise) {
    cachedIpPromise = (async () => {
      const endpoints = [
        "https://api.ipify.org?format=json",
        "https://api64.ipify.org?format=json",
      ];
      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data && data.ip) {
              return String(data.ip).substring(0, 64);
            }
          }
        } catch (err) {
          // Try the next endpoint; IP capture is best-effort only.
        }
      }
      return "";
    })();
  }
  return cachedIpPromise;
};

export interface SecurityProfileInput {
  uid: string;
  name: string;
  phone: string;
  uniqueCode: string;
  residence?: string;
  country?: string;
  role?: string;
}

export interface SecurityProfileResult {
  firstSeen: string;
  isBanned: boolean;
}

/**
 * Upsert the dedicated admin_security_users/{uid} record. Keeps the enriched
 * session / tracking data (IP, location, role, login history) out of the app
 * `users` collection. Returns the first-seen timestamp and whether the user is
 * currently banned so callers can enforce the block.
 */
export const syncSecurityProfile = async (
  profile: SecurityProfileInput,
  ip: string,
  isNewSession: boolean,
): Promise<SecurityProfileResult> => {
  const ref = doc(db, "admin_security_users", profile.uid);
  try {
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    const now = new Date().toISOString();
    const firstSeen = existing.firstSeen || now;
    const wasBanned = existing.status === "banned";

    await setDoc(
      ref,
      {
        uid: profile.uid,
        name: profile.name || "بێ ناو",
        phone: profile.phone || "",
        uniqueCode: profile.uniqueCode || "",
        residence: profile.residence || "",
        country: profile.country || "",
        role: profile.role || "Member",
        deviceIp: ip,
        isOnline: true,
        status: wasBanned ? "banned" : "active",
        firstSeen,
        lastLoginAt: now,
        lastActive: serverTimestamp(),
        loginCount: isNewSession
          ? (existing.loginCount || 0) + 1
          : existing.loginCount || 0,
      },
      { merge: true },
    );

    return { firstSeen, isBanned: wasBanned };
  } catch (err) {
    console.warn("Security profile sync failed:", err);
    return { firstSeen: new Date().toISOString(), isBanned: false };
  }
};

/**
 * Mark the user offline in the dedicated security record (mirror of the
 * `users` presence update, kept in the isolated collection for the admin).
 */
export const markSecurityOffline = async (uid: string) => {
  try {
    await updateDoc(doc(db, "admin_security_users", uid), {
      isOnline: false,
      lastActive: serverTimestamp(),
    });
  } catch (err) {
    // Best-effort; user may have been deleted or never synced.
  }
};

export interface ActivityInput {
  uid: string;
  name?: string;
  uniqueCode?: string;
  action: string;
  detail?: string;
  role?: string;
  deviceIp?: string;
}

/**
 * Append a security/activity event to user_activity_logs. Every event carries
 * the exact ISO timestamp so the admin panel can render precise history dates.
 */
export const logUserActivity = async (activity: ActivityInput) => {
  try {
    await addDoc(collection(db, "user_activity_logs"), {
      uid: activity.uid,
      name: activity.name || "بێ ناو",
      uniqueCode: activity.uniqueCode || "",
      action: activity.action,
      detail: activity.detail || "",
      role: activity.role || "Member",
      deviceIp: activity.deviceIp || "",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Activity log write failed:", err);
  }
};
