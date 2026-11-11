import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { isSceneBlurActive, type SceneBlurConfig } from "../lib/sceneBlur";

interface SceneBlurPlaybackOptions {
  config: SceneBlurConfig;
  root: RefObject<HTMLElement | null>;
  sourceUrl: string | null;
  currentTime: number;
  duration: number;
  playing: boolean;
  playbackRate: number;
  enabled: boolean;
}

interface ProviderClock {
  source: string;
  time: number;
  duration: number;
  at: number;
  playing: boolean;
  rate: number;
}

/**
 * Native media is masked against video.currentTime, including immediate seeks.
 * External iframe clocks are approximate: providers can report several seconds
 * apart, and a provider-native seek cannot be known until its next report.
 * Their conservative window starts early and stays masked until a fresh clock
 * confirms the range ended. No metadata means leave verification/Play readable.
 */
export function useSceneBlurPlayback(options: SceneBlurPlaybackOptions): boolean {
  const { config, root, sourceUrl, currentTime, duration, playing, playbackRate, enabled } = options;
  const usable = enabled && config.enabled && config.ranges.length > 0 && Boolean(sourceUrl);
  const latest = useRef(options);
  latest.current = options;
  const clock = useRef<ProviderClock | null>(null);
  const previous = useRef({ source: sourceUrl, time: currentTime, duration });
  const awaitingNewClock = useRef(false);
  const refresh = useRef<() => void>(() => {});
  const maskRef = useRef({ source: sourceUrl, active: false });
  const [mask, setMask] = useState(maskRef.current);

  const commit = useCallback((source: string | null, active: boolean) => {
    // Source resets are separate; ordinary playback ticks only publish actual
    // boolean transitions, avoiding React renders on every animation frame.
    if (maskRef.current.source === source && maskRef.current.active === active) return;
    const next = { source, active };
    maskRef.current = next;
    setMask(next);
  }, []);

  useEffect(() => {
    const prior = previous.current;
    const sourceChanged = prior.source !== sourceUrl;
    const clockChanged = prior.time !== currentTime || prior.duration !== duration;
    previous.current = { source: sourceUrl, time: currentTime, duration };
    if (sourceChanged) {
      clock.current = null;
      // A new iframe can briefly inherit the preceding movie's React clock.
      // Do not treat unchanged old metadata as a report from the new source.
      awaitingNewClock.current = !clockChanged;
    }
    if (clockChanged) awaitingNewClock.current = false;
    if (!usable || !sourceUrl || !Number.isFinite(currentTime) || currentTime < 0 ||
        !Number.isFinite(duration) || duration <= 0) {
      clock.current = null;
    } else if (!awaitingNewClock.current) {
      const last = clock.current;
      if (!last || last.source !== sourceUrl || last.time !== currentTime ||
          last.duration !== duration || last.playing !== playing) {
        clock.current = {
          source: sourceUrl, time: currentTime, duration, playing,
          at: performance.now(), rate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
        };
      }
    }
    refresh.current();
  }, [sourceUrl, currentTime, duration, playing, playbackRate, usable]);

  useEffect(() => {
    commit(sourceUrl, false);
    if (!usable) {
      clock.current = null;
      return;
    }
    let live = true;
    let animation = 0;
    let video: HTMLVideoElement | null = null;
    const events = ["seeking", "seeked", "timeupdate", "play", "playing", "pause", "waiting", "ended", "loadedmetadata"] as const;

    const read = () => {
      const value = latest.current;
      if (!live || value.sourceUrl !== sourceUrl || !value.enabled || !value.config.enabled || !value.config.ranges.length) {
        commit(sourceUrl, false);
        return;
      }
      if (video?.isConnected) {
        // Never advance native subtitles/masking from elapsed wall time: a
        // paused, seeking or buffering video can stay on exactly the same frame.
        commit(sourceUrl, isSceneBlurActive(value.config, video.currentTime));
        return;
      }
      const report = clock.current;
      if (!report || report.source !== sourceUrl || report.duration <= 0) {
        commit(sourceUrl, false);
        return;
      }
      const age = Math.max(0, performance.now() - report.at) / 1000;
      const advancing = value.playing && report.playing;
      if (advancing && age > 6) {
        commit(sourceUrl, true);
        return;
      }
      const currentRate = Number.isFinite(value.playbackRate) && value.playbackRate > 0 ? value.playbackRate : 1;
      // Retain the faster rate until a fresh clock after a speed change. This
      // errs toward covering early instead of revealing an uncertain frame.
      const estimated = report.time + (advancing ? age * Math.max(report.rate, currentRate) : 0);
      commit(sourceUrl, value.config.ranges.some(range => range.end > report.time && range.start <= estimated + 1));
    };
    const animate = () => {
      animation = 0;
      if (video && !video.isConnected) bindVideo();
      read();
      if (live && (video ? !video.paused && !video.ended : latest.current.playing)) {
        animation = requestAnimationFrame(animate);
      }
    };
    const update = () => {
      if (!live) return;
      bindVideo();
      read();
      const advancing = video ? !video.paused && !video.ended : latest.current.playing;
      if (advancing && !animation) animation = requestAnimationFrame(animate);
      if (!advancing && animation) { cancelAnimationFrame(animation); animation = 0; }
    };
    function bindVideo() {
      const candidate = root.current?.querySelector<HTMLVideoElement>("video:not([data-player-ad])") ?? null;
      if (candidate === video) return;
      events.forEach(event => video?.removeEventListener(event, update));
      video = candidate;
      events.forEach(event => video?.addEventListener(event, update));
    }
    refresh.current = update;
    const observer = new MutationObserver(update);
    if (root.current) observer.observe(root.current, { childList: true, subtree: true });
    update();

    return () => {
      live = false;
      cancelAnimationFrame(animation);
      observer.disconnect();
      events.forEach(event => video?.removeEventListener(event, update));
      if (refresh.current === update) refresh.current = () => {};
    };
  }, [root, sourceUrl, usable, commit]);

  useEffect(() => { refresh.current(); }, [config]);
  return usable && mask.source === sourceUrl && mask.active;
}
