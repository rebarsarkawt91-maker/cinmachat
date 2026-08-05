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
  async sendMovieView(movieId: string, session: string) {
    try {
      const res = await fetch(api.resolveApiUrl(`/api/movies/${encodeURIComponent(movieId)}/view`), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ session })
      });
      if (!res.ok) return { ok: false, viewers: 0, views: 0 };
      return await res.json();
    } catch (error) {
      return { ok: false, viewers: 0, views: 0 };
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
