import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeSceneBlurConfig, validateSceneBlurConfig, type SceneBlurConfig } from "../lib/sceneBlur";
import { api } from "../services/api";

const REFRESH_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;
const REFRESH_ERROR = "ڕێکخستنی تەڵخکردن نوێ نەکرایەوە.";

interface SceneBlurState {
  key: string;
  config: SceneBlurConfig;
  loading: boolean;
  error: string | null;
}

/** Keep all viewers on the saved movie settings without fetching the full catalog. */
export function useMovieSceneBlur({ movieId, initialConfig, enabled }: {
  movieId: string | null | undefined;
  initialConfig: unknown;
  enabled: boolean;
}) {
  const id = String(movieId || "").trim();
  // The serialized value, rather than the input object's identity, controls
  // resets. Unrelated parent renders must not replace a newer server response.
  const initialKey = JSON.stringify(normalizeSceneBlurConfig(initialConfig));
  const initial = useMemo<SceneBlurConfig>(() => JSON.parse(initialKey), [initialKey]);
  const key = JSON.stringify([id, enabled, initialKey]);
  const selectedKey = useRef(key);
  selectedKey.current = key;
  const activeRequest = useRef<AbortController | null>(null);
  const [state, setState] = useState<SceneBlurState>(() => ({
    key,
    config: initial,
    loading: Boolean(enabled && id),
    error: null,
  }));

  useEffect(() => {
    let active = true;
    let pending = false;
    let controller: AbortController | null = null;
    const current = () => active && selectedKey.current === key;
    setState({ key, config: initial, loading: Boolean(enabled && id), error: null });
    if (!enabled || !id) return () => { active = false; };

    const refresh = async () => {
      if (!current() || pending) return;
      pending = true;
      const request = new AbortController();
      controller = request;
      activeRequest.current = request;
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        request.abort();
      }, REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(api.resolveApiUrl(`/api/movies/${encodeURIComponent(id)}/scene-blur`), {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) throw new Error("Scene blur settings unavailable");
        const payload = await response.json();
        if (payload?.success !== true || String(payload.movieId) !== id ||
            !payload.sceneBlur || typeof payload.sceneBlur !== "object") {
          throw new Error("Invalid scene blur response");
        }
        const config = validateSceneBlurConfig(payload.sceneBlur);
        if (current() && !request.signal.aborted) {
          setState({ key, config, loading: false, error: null });
        }
      } catch {
        // A failed refresh retains the last known mask. Aborted requests for
        // another movie, an unmounted player, or a completed save stay silent.
        if (current() && (!request.signal.aborted || timedOut)) {
          setState(previous => ({
            key,
            config: previous.key === key ? previous.config : initial,
            loading: false,
            error: REFRESH_ERROR,
          }));
        }
      } finally {
        window.clearTimeout(timeout);
        pending = false;
        if (activeRequest.current === request) activeRequest.current = null;
      }
    };

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
      if (activeRequest.current === controller) activeRequest.current = null;
    };
  }, [key, id, enabled, initial]);

  const updateConfig = useCallback((value: unknown) => {
    if (selectedKey.current !== key) return;
    // An earlier GET must not overwrite a just-saved administrative change.
    activeRequest.current?.abort();
    setState({ key, config: normalizeSceneBlurConfig(value), loading: false, error: null });
  }, [key]);

  // Render the new movie's initial settings immediately, before effect cleanup,
  // so a previous movie's ranges never appear for even one render.
  const visible = state.key === key ? state : {
    key, config: initial, loading: Boolean(enabled && id), error: null,
  };
  return { config: visible.config, loading: visible.loading, error: visible.error, updateConfig };
}
