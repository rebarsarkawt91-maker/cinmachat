import type { SocialPlatform } from "./types";

export type OAuthPlatform = Exclude<SocialPlatform, "telegram">;

export interface SocialAccountChoice {
  id: string;
  name: string;
  handle?: string;
}

export interface SocialAccountStatus extends SocialAccountChoice {
  verifiedAt: string;
  needsReconnect: boolean;
}

export interface SocialConnectionStatus {
  available: boolean;
  account: SocialAccountStatus | null;
  flow?: {
    id: string;
    phase: "waiting" | "exchanging" | "choose" | "denied";
    choices?: SocialAccountChoice[];
    errorCode?: SocialConnectionErrorCode;
  };
}

export interface SocialConnectionOverview {
  canManage: boolean;
  origin: string;
  storageReady: boolean;
  platforms: Record<SocialPlatform, SocialConnectionStatus>;
}

export type SocialConnectionErrorCode =
  | "owner_required"
  | "same_origin_required"
  | "connection_unavailable"
  | "invalid_input"
  | "flow_expired"
  | "consent_denied"
  | "missing_permissions"
  | "no_eligible_account"
  | "select_youtube_channel"
  | "grant_unavailable"
  | "telegram_post_permission"
  | "account_changed"
  | "provider_unavailable";
