import { SocialUser } from "../types";
import {
  getPublicMemberCode,
  isPlaceholderProfileValue,
  normalizeProfileEmail,
  normalizeProfilePhone,
} from "./socialProfileProvisioning";

/**
 * Account readiness for the CinemaChat private flow.
 *
 * A user is only "ready" once they own a canonical, identity-stable profile:
 * a real Firebase UID, a display name, a unique username, a CinemaChat member
 * code (CC-ID), and at least one verifiable identity (email or normalized
 * mobile). Everything else (guest, loading, incomplete, backend error) must
 * gate the CinemaChat entry instead of half-opening it.
 */
export type AccountReadinessState =
  | "checking"
  | "guest"
  | "authenticated-incomplete"
  | "ready"
  | "error";

export type MissingAccountField =
  | "displayName"
  | "username"
  | "memberCode"
  | "identity";

/** Optional/recommended profile fields. Filling them is NOT required to enter
 *  CinemaChat (the hard gate above stays), but the app gently prompts for them
 *  so rooms and friend sync can show a richer profile (Name/Age/Address). */
export type RecommendedMissingField = "age" | "address";

export interface AccountReadiness {
  state: AccountReadinessState;
  ready: boolean;
  /** Human-understandable field keys the user still needs to fill in. */
  missingFields: MissingAccountField[];
  /** Optional fields the user is missing (recommended, not required). */
  recommendedMissingFields: RecommendedMissingField[];
  /** Set only when the readiness check itself failed (backend unreachable). */
  error?: string;
}

type UserLike = {
  uid?: string;
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  providerData?: Array<{ providerId?: string | null }>;
};

const providerIdsOf = (user?: UserLike | null): Set<string> =>
  new Set((user?.providerData || []).map((p) => p?.providerId).filter(Boolean) as string[]);

/** Google accounts verify identity through their verified Google email; the
 *  profile still needs a display name + unique code, but no password/phone. */
const hasVerifiedGoogleIdentity = (user?: UserLike | null, profile?: SocialUser | null): boolean => {
  const providers = providerIdsOf(user);
  const email = normalizeProfileEmail(profile?.email || user?.email);
  return !!email && (user?.emailVerified !== false || providers.has("google.com"));
};

/**
 * Single source of truth for "can this user enter CinemaChat?".
 *
 * @param user   Firebase auth user (null for guests)
 * @param profile Canonical social profile (null while loading / for guests)
 * @param loading Whether the auth/profile layer is still resolving
 */
export const getAccountReadiness = (
  user: UserLike | null,
  profile: SocialUser | null,
  loading: boolean,
): AccountReadiness => {
  if (loading) {
    return { state: "checking", ready: false, missingFields: [], recommendedMissingFields: [] };
  }

  if (!user) {
    return { state: "guest", ready: false, missingFields: [], recommendedMissingFields: [] };
  }

  // Only a real Firebase UID can own a canonical account. The local admin
  // bypass is a dev-only shell and never counts as an account.
  const uid = String(user.uid || "");
  const isRealUid = uid.length >= 20 && !uid.includes("localhost");
  if (!isRealUid) {
    return { state: "guest", ready: false, missingFields: [], recommendedMissingFields: [] };
  }

  if (!profile) {
    return {
      state: "error",
      ready: false,
      missingFields: [],
      recommendedMissingFields: [],
      error: "No canonical profile found for this account.",
    };
  }

  const missingFields: MissingAccountField[] = [];

  const displayName = String(
    profile.displayName || profile.name || user.displayName || user.name || "",
  ).trim();
  if (isPlaceholderProfileValue(displayName)) missingFields.push("displayName");

  const username = String(profile.username || "").trim();
  if (!username || isPlaceholderProfileValue(username)) missingFields.push("username");

  const memberCode = getPublicMemberCode(profile, uid);
  if (!memberCode) missingFields.push("memberCode");

  const phone = normalizeProfilePhone(profile.phoneNumber || profile.phone);
  const email = normalizeProfileEmail(profile.email || user.email);
  const hasIdentity = hasVerifiedGoogleIdentity(user, profile) || !!phone;
  if (!hasIdentity) missingFields.push("identity");

  // Optional (recommended, non-blocking) fields — Name/Age/Address that friend
  // sync and profile display prefer to have. Never gates entry.
  const recommendedMissingFields: RecommendedMissingField[] = [];
  const ageValue = String(profile.age ?? "").trim();
  if (!ageValue || isPlaceholderProfileValue(ageValue)) recommendedMissingFields.push("age");
  const addressValue = String(profile.address ?? "").trim();
  if (!addressValue || isPlaceholderProfileValue(addressValue)) {
    recommendedMissingFields.push("address");
  }

  if (missingFields.length > 0) {
    return {
      state: "authenticated-incomplete",
      ready: false,
      missingFields,
      recommendedMissingFields,
    };
  }

  return {
    state: "ready",
    ready: true,
    missingFields: [],
    recommendedMissingFields,
  };
};
