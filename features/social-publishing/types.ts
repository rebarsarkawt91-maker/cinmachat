export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "youtube",
  "telegram",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialMediaType = "text" | "image" | "video";
export type SocialContentKind = "news" | "trailer" | "promotion";
export type PlatformDeliveryStatus =
  | "queued"
  | "retrying"
  | "succeeded"
  | "failed"
  | "simulated";
export type SocialJobStatus =
  | "queued"
  | "processing"
  | "retrying"
  | "succeeded"
  | "partial"
  | "failed"
  | "simulated"
  | "cancelled";

export interface SocialMedia {
  type: SocialMediaType;
  url?: string;
  rightsConfirmed?: boolean;
  /** Relative to the server's SOCIAL_PUBLISHING_MEDIA_DIR; used for YouTube uploads. */
  storagePath?: string;
  mimeType?: string;
}

export interface SocialPublicationInput {
  contentKind?: SocialContentKind;
  automation?: { scheduleId: string; weekday: string; slotId: string; format: "reels" | "feed" | "stories" | "carousel"; category: string; adminOverride?: boolean };
  provenance?: {
    source: "official-news" | "licensed-trailer" | "cinemachat-catalog" | "verified-editorial";
    sourceUrl?: string;
    verifiedAt: string;
    licenseId?: string;
    catalogTitleId?: string;
    kurdishSubtitleStatus?: "available" | "unavailable" | "unknown";
  };
  platforms: SocialPlatform[];
  caption: string;
  title?: string;
  description?: string;
  media?: SocialMedia;
  scheduledAt: string;
}

export interface PlatformDelivery {
  status: PlatformDeliveryStatus;
  attempts: number;
  updatedAt: string;
  nextAttemptAt?: string;
  providerPostId?: string;
  errorCode?: string;
}

export interface SocialPublicationJob extends SocialPublicationInput {
  id: string;
  status: SocialJobStatus;
  /** Jobs stay blocked from delivery until an authenticated admin approves them. */
  approvalStatus?: "pending" | "approved";
  approvedAt?: string;
  approvedBy?: string;
  platformStatus: Partial<Record<SocialPlatform, PlatformDelivery>>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  attempts: number;
  dueAt: number;
  leaseUntil?: number;
}

export interface SocialPublishResult {
  providerPostId?: string;
}

export interface SocialPlatformAdapter {
  isConfigured(): boolean;
  publish(publication: SocialPublicationJob): Promise<SocialPublishResult>;
}

export type SocialAdapters = Record<SocialPlatform, SocialPlatformAdapter>;

export interface SocialPlatformReadiness {
  configured: boolean;
}

export interface SocialPublishingReadiness {
  mode: "DRY_RUN" | "LIVE";
  livePublishingEnabled: boolean;
  platforms: Record<SocialPlatform, SocialPlatformReadiness>;
}
