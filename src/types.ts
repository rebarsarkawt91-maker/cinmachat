export interface Movie {
  id: string;
  title: string;
  year?: string;
  quality: string;
  tags: string[]; 
  image: string;
  description: string;
  whatsappLink: string;
  downloadLink?: string;
  rating?: string;
  trailerLink?: string;
  isNetflixOriginal?: boolean;
  isTrending?: boolean;
  views?: number;
  duration?: string;
  likes?: number;
  likedBy?: string[];
  liveViewers?: number;
  isLive?: boolean;
  date: string;
  type?: 'movie' | 'tv' | 'video' | 'photo';
  videoUrl?: string;
  streamingUrl?: string;
  trailerUrl?: string;
  embedUrl?: string;
  isYouTube?: boolean;
  isTooLarge?: boolean;
  subtitleUrl?: string;
  videoId?: string;
  category?: string;
  hdtodayUrl?: string;
  vidsrcUrl?: string;
  youtubeMovieUrl?: string;
  otherVideoUrl?: string;
  vidmolyUrl?: string;
  streamwishUrl?: string;
  fileLrunUrl?: string;
  external_link?: string;
  externalMovieLink?: string;
  // --- Live metrics / social metrics (server-enriched) ---
  /** Total number of users who added this movie to their favorites. */
  favoriteCount?: number;
  /** Aggregated CinemaChat user rating (0-10, server-computed). */
  ccRating?: number;
  /** Number of users who rated this movie on CinemaChat. */
  ratingCount?: number;
  /** The current user's own CinemaChat rating for this movie (0 when none). */
  userRating?: number;
  /** Server-computed trending score (live viewers + likes + favorites + views + IMDb + recency). */
  trendingScore?: number;
  /** Language of the movie (e.g. Kurdish, English, Arabic, Turkish). */
  language?: string;
  /** IMDb rating passed through for display (alias of rating). */
  imdbRating?: string;
}

export interface SocialUser {
  uid: string;
  name: string;
  displayName?: string;
  username?: string;
  phone: string;
  phoneNumber?: string;
  email?: string;
  uniqueCode: string;
  avatarUrl?: string;
  avatar?: string;
  cover?: string;
  bio?: string;
  birthday?: string;
  city?: string;
  address?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    region?: string;
    address?: string;
  };
  language?: string;
  theme?: string;
  accent?: string;
  notificationSettings?: Record<string, boolean>;
  privacySettings?: Record<string, boolean>;
  socialConnections?: Record<string, unknown>;
  currentRoomId?: string;
  isOnline?: boolean;
  createdAt?: string;
  updatedAt?: string;
  age?: string;
  gender?: string;
  residence?: string;
  country?: string;
  role?: string;
  userRole?: string;
  /** Optional movie/watch preference chosen during onboarding (movie id or title). */
  moviePreference?: string;
}

export interface PlaylistItem {
  id: string;
  title: string;
  url: string;
  image: string;
  isYouTube?: boolean;
}

export interface SyncGroup {
  id: string;
  name: string;
  creatorId: string;
  memberIds: string[];
  currentMovieId?: string;
  playlist?: PlaylistItem[];
  currentPlaylistIndex?: number;
  autoLoop?: boolean;
  playback: {
    isPlaying: boolean;
    currentTime: number;
    updatedAt: string;
  };
  videoData?: {
    id: string;
    title: string;
    image: string;
    url?: string;
    videoUrl?: string;
    isYouTube?: boolean;
    videoId?: string;
    category?: string;
    description?: string;
    quality?: string;
    tags?: string[];
  };
  activeSubtitles?: { start: number, end: number, text: string }[];
  isVIP?: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  type?: 'text' | 'voice';
  audio?: string;
  createdAt: string;
}

export interface EmojiReaction {
  id: string;
  senderId: string;
  type: string;
  createdAt: string;
}

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  isAdmin: boolean;
}
