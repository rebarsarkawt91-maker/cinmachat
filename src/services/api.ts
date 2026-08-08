/**
 * API Service for CinemaChat
 */

export const api = {
  resolveApiUrl(url: string): string {
    // Use same-origin relative paths so Firebase Hosting redirects /api/* to the
    // Render backend via firebase.json redirects. No hardcoded Render URLs needed.
    return url;
  },

  async baseFetch(url: string, options: any = {}, retries = 5): Promise<any> {
    const targetUrl = api.resolveApiUrl(url);
    try {
      const response = await fetch(targetUrl, {
        ...options,
        headers: {
          'Accept': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 429 || text.includes('Rate exceeded') || text.includes('Too Many Requests') || text.includes('Quota exceeded')) {
          console.warn(`[api Service] Rate limit response detected for ${url}`);
          if (retries > 0) {
            console.log(`[api Service] Rate limited for ${url}. Retrying in 2.5s... (${retries} retries left)`);
            await new Promise(r => setTimeout(r, 2500));
            return api.baseFetch(url, options, retries - 1);
          }
          if (url.includes('/api/config')) {
            return {
              ads: {},
              socialLinks: {},
              youtubeChannelUrl: 'https://www.youtube.com/',
              youtubeUrl: 'https://www.youtube.com/',
              tiktokUrl: 'https://www.tiktok.com/',
              instagramUrl: 'https://www.instagram.com/',
              facebookUrl: 'https://www.facebook.com/'
            };
          }
          if (url.includes('/api/stats')) {
            return { visitors: 0 };
          }
          if (url.includes('/api/status')) {
            return { connected: true, webhook: true };
          }
          if (url.includes('/api/tracker')) {
            return { text: "بەخێربێن بۆ CinamaChat", type: "normal" };
          }
          if (url.includes('/api/movies')) {
            return { status: 'ok', results: [] };
          }
        }

        if (retries > 0 && (
          response.status === 502 || 
          response.status === 503 || 
          response.status === 504 ||
          text.includes('Starting Server') ||
          text.includes('is starting')
        )) {
          console.log(`Server not ready (${response.status}) for ${url}. Retrying in 3s...`);
          await new Promise(r => setTimeout(r, 3000));
          return api.baseFetch(url, options, retries - 1);
        }
        
        // Return default config/stats rather than throwing if it's config or stats
        if (url.includes('/api/config')) {
          return {
            ads: {},
            socialLinks: {},
            youtubeChannelUrl: 'https://www.youtube.com/',
            youtubeUrl: 'https://www.youtube.com/',
            tiktokUrl: 'https://www.tiktok.com/',
            instagramUrl: 'https://www.instagram.com/',
            facebookUrl: 'https://www.facebook.com/'
          };
        }
        if (url.includes('/api/stats')) {
          return { visitors: 0 };
        }
        
        throw new Error(`Server returned status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        if (retries > 0 && (text.includes('Starting Server') || text.includes('is starting'))) {
          console.log(`Received HTML startup page for ${url}. Retrying in 3s...`);
          await new Promise(r => setTimeout(r, 3000));
          return api.baseFetch(url, options, retries - 1);
        }
        
        if (url.includes('/api/config')) {
          return {
            ads: {},
            socialLinks: {},
            youtubeChannelUrl: 'https://www.youtube.com/',
            youtubeUrl: 'https://www.youtube.com/',
            tiktokUrl: 'https://www.tiktok.com/',
            instagramUrl: 'https://www.instagram.com/',
            facebookUrl: 'https://www.facebook.com/'
          };
        }
        
        throw new Error(`Invalid response format for ${url}`);
      }

      return await response.json();
    } catch (error) {
      if (retries > 0) {
        console.log(`Fetch error for ${url}: ${error}. Retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
        return api.baseFetch(url, options, retries - 1);
      }
      
      // Fallbacks if we can't fetch at all (network error or offline)
      if (url.includes('/api/config')) {
        return {
          ads: {},
          socialLinks: {},
          youtubeChannelUrl: 'https://www.youtube.com/',
          youtubeUrl: 'https://www.youtube.com/',
          tiktokUrl: 'https://www.tiktok.com/',
          instagramUrl: 'https://www.instagram.com/',
          facebookUrl: 'https://www.facebook.com/'
        };
      }
      if (url.includes('/api/stats')) {
        return { visitors: 0 };
      }
      
      throw error;
    }
  },
  async checkHealth() {
    try {
      return await api.baseFetch('/api/health');
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'error', message: 'Offline' };
    }
  },

  async getMovies() {
    try {
      const data = await api.baseFetch('/api/movies');
      return data.results || [];
    } catch (error) {
      console.error('Movies fetch failed:', error);
      return [];
    }
  },

  // Lightweight live-metrics poll (liveViewers + likes). Uses a plain GET so the
  // 30s card-refresh cycle never gets stuck in baseFetch's retry/backoff loop.
  async getMoviesLive() {
    try {
      const res = await fetch(api.resolveApiUrl('/api/movies'), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (error) {
      return [];
    }
  },

  // Bulk live metrics for arbitrary movie ids (Firestore movies included). The
  // 30s card-refresh cycle uses this so "watching now" badges work even for
  // movies that are absent from the server movie cache.
  async getLiveStats(ids: string[]) {
    try {
      const res = await fetch(api.resolveApiUrl('/api/movies/live'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data.stats || {};
    } catch (error) {
      return {};
    }
  },

  // Registers a per-movie heartbeat and returns the current concurrent viewer
  // count. Best-effort: falls back to { viewers: 0 } when the backend is down.
  // `session` is a per-tab id (live viewers = distinct tabs), `deviceId` is the
  // persistent device identity used by the server to dedupe lifetime views.
  async sendMovieView(movieId: string, session: string, deviceId?: string) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/movies/${encodeURIComponent(movieId)}/view`), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ session, deviceId })
      });
      if (!res.ok) return { ok: false, viewers: 0, views: 0 };
      return await res.json();
    } catch (error) {
      return { ok: false, viewers: 0, views: 0 };
    }
  },

  // Bulk live-viewer counts for Drama Rooms (distinct sessions across each
  // room's dramas, unioned server-side). Room cards poll this every 30s so the
  // "watching now" badge reflects real activity without reloading the catalog.
  async getDramaRoomLiveStats(ids: string[]) {
    try {
      const res = await fetch(api.resolveApiUrl('/api/drama-rooms/live'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data.stats || {};
    } catch (error) {
      return {};
    }
  },

  // Toggles a per-user like on a movie. Best-effort mirror of Firestore likes.
  async toggleLike(movieId: string, uid: string) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/movies/${encodeURIComponent(movieId)}/like`), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ uid })
      });
      if (!res.ok) return { ok: false, likes: 0, liked: false };
      return await res.json();
    } catch (error) {
      return { ok: false, likes: 0, liked: false };
    }
  },

  // --- User ratings (CinemaChat rating) ---
  // Submit a 0.5-10 score for a movie; returns the aggregated rating + count.
  async rateMovie(movieId: string, uid: string, score: number) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/movies/${encodeURIComponent(movieId)}/rate`), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ uid, score })
      });
      if (!res.ok) return { ok: false, ccRating: 0, ratingCount: 0, userRating: 0 };
      return await res.json();
    } catch (error) {
      return { ok: false, ccRating: 0, ratingCount: 0, userRating: 0 };
    }
  },

  // Submit a 0.5-10 score for a Drama Room; returns the aggregated room rating
  // + count. Stored per roomId in db.roomRatings — fully isolated from movies.
  async rateDramaRoom(roomId: string, uid: string, score: number) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/drama-rooms/${encodeURIComponent(roomId)}/rate`), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ uid, score })
      });
      if (!res.ok) return { ok: false, ccRating: 0, ratingCount: 0, userRating: 0 };
      return await res.json();
    } catch (error) {
      return { ok: false, ccRating: 0, ratingCount: 0, userRating: 0 };
    }
  },

  // Fetch a movie's aggregated rating + the caller's own rating.
  async getMovieRating(movieId: string, uid: string) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/movies/${encodeURIComponent(movieId)}/rating?uid=${encodeURIComponent(uid)}`), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return { ccRating: 0, ratingCount: 0, userRating: 0 };
      return await res.json();
    } catch (error) {
      return { ccRating: 0, ratingCount: 0, userRating: 0 };
    }
  },

  // --- Trending ---
  // Server-computed trending ranking, sortable by trending score or live viewers.
  async getTrending(sort: 'trending' | 'live' = 'trending', limit = 20) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/movies/trending?sort=${sort}&limit=${limit}`), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return { results: [], topLiveId: '' };
      return await res.json();
    } catch (error) {
      return { results: [], topLiveId: '' };
    }
  },

  // --- Smart search ---
  // Fuzzy title + multi-genre search with live suggestions.
  async searchMovies(q: string, genres: string[] = [], limit = 50) {
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      for (const g of genres) params.append('genres', g);
      if (limit) params.set('limit', String(limit));
      const res = await fetch(api.resolveApiUrl(`/api/search?${params.toString()}`), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return { results: [], suggestions: [] };
      return await res.json();
    } catch (error) {
      return { results: [], suggestions: [] };
    }
  },

  // AI semantic search: natural-language description -> ranked movie list.
  async aiSearch(query: string) {
    try {
      const res = await fetch(api.resolveApiUrl('/api/search/ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ query })
      });
      if (!res.ok) return { results: [], ai: false, keywords: [], genres: [], titles: [] };
      return await res.json();
    } catch (error) {
      return { results: [], ai: false, keywords: [], genres: [], titles: [] };
    }
  },

  // Live title suggestions while the user types.
  async getSearchSuggestions(q: string) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/search/suggestions?q=${encodeURIComponent(q)}`), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (error) {
      return [];
    }
  },

  // Recent searches for the current identity.
  async getSearchHistory(identity: string) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/search/history?identity=${encodeURIComponent(identity)}`), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.history || [];
    } catch (error) {
      return [];
    }
  },

  // Record a search term (feeds history + trending searches).
  async recordSearch(query: string, identity: string) {
    try {
      const res = await fetch(api.resolveApiUrl('/api/search/history'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ query, identity })
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.history || [];
    } catch (error) {
      return [];
    }
  },

  // Trending / popular search terms.
  async getTrendingSearches() {
    try {
      const res = await fetch(api.resolveApiUrl('/api/search/trending'), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (error) {
      return [];
    }
  },

  // --- Continue watching ---
  // Persist playback progress per identity.
  async saveProgress(movieId: string, identity: string, progress: number, duration: number) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/movies/${encodeURIComponent(movieId)}/progress`), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ identity, progress, duration })
      });
      if (!res.ok) return { ok: false };
      return await res.json();
    } catch (error) {
      return { ok: false };
    }
  },

  // Continue-watching list enriched with full movie objects.
  async getContinueWatching(identity: string) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/movies/continue-watching?identity=${encodeURIComponent(identity)}`), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (error) {
      return [];
    }
  },

  // --- Favorites (backend mirror; Firestore users/{uid} is the primary store) ---
  async getFavorites(uid: string) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/favorites?uid=${encodeURIComponent(uid)}`), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (error) {
      return [];
    }
  },

  async addFavorite(movieId: string, uid: string) {
    try {
      await fetch(api.resolveApiUrl(`/api/favorites/${encodeURIComponent(movieId)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ uid })
      });
    } catch (error) { /* best-effort */ }
  },

  async removeFavorite(movieId: string, uid: string) {
    try {
      await fetch(api.resolveApiUrl(`/api/favorites/${encodeURIComponent(movieId)}?uid=${encodeURIComponent(uid)}`), {
        method: 'DELETE'
      });
    } catch (error) { /* best-effort */ }
  },

  async getStats(sessionId?: string) {
    try {
      const query = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
      return await api.baseFetch(`/api/stats${query}`);
    } catch { return { visitors: 0 }; }
  },

  async getTrackerText() {
    try {
      return await api.baseFetch('/api/tracker');
    } catch { return { text: "بەخێربێن بۆ CinamaChat - نوێترین فیلم و زنجیرەکان لێرە ببینە", type: "normal" }; }
  },

  async updateTrackerText(text: string, type: string = "normal") {
    try {
      await api.baseFetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type })
      });
      return true;
    } catch { return false; }
  },

  async getSystemStatus() {
    try {
      return await api.baseFetch('/api/status');
    } catch { return { connected: false, webhook: false }; }
  },

  async getConfig() {
    try {
      return await api.baseFetch('/api/config');
    } catch (error) { 
      console.error('Config fetch failed:', error);
      return null; 
    }
  },

  async updateConfig(newAds?: any, newSocialLinks?: any) {
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newAds, newSocialLinks })
      });
      return response.ok;
    } catch { return false; }
  },

  async notifySuccess(movieTitle: string) {
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieTitle })
      });
    } catch (error) { console.error('Notify failed:', error); }
  }
};
