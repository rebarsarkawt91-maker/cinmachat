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
}

export interface SocialUser {
  uid: string;
  name: string;
  phone: string;
  uniqueCode: string;
  avatarUrl?: string;
  avatar?: string;
  currentRoomId?: string;
  isOnline?: boolean;
  createdAt?: string;
  age?: string;
  gender?: string;
  residence?: string;
  country?: string;
  role?: string;
  userRole?: string;
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
