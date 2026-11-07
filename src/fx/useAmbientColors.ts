import { useEffect, useState, type RefObject } from 'react';
import { averageRgba, smoothRgb, type Rgb } from './colorMath';
import type { GlowMode } from './fxSettings';

export interface AmbientZones { top: Rgb; right: Rgb; bottom: Rgb; left: Rgb }
const FALLBACK: AmbientZones = {
  top: { r: 229, g: 9, b: 20 }, right: { r: 245, g: 158, b: 11 },
  bottom: { r: 90, g: 10, b: 20 }, left: { r: 229, g: 9, b: 20 },
};

function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(value) ? { r: value >> 16, g: (value >> 8) & 255, b: value & 255 } : FALLBACK.top;
}
const fromColors = (colors: string[]): AmbientZones => {
  const values = colors.length ? colors.map(hexRgb) : [FALLBACK.top, FALLBACK.right];
  return { top: values[0], right: values[1] || values[0], bottom: values[2] || values[0], left: values[1] || values[0] };
};

export function useAmbientColors(options: {
  active: boolean; rootRef: RefObject<HTMLElement | null>; mode: GlowMode;
  poster?: string; palette?: string[]; customColors: string[];
}): { zones: AmbientZones; posterFallback: boolean } {
  const [zones, setZones] = useState<AmbientZones>(() => fromColors(options.customColors));
  const [posterFallback, setPosterFallback] = useState(false);

  useEffect(() => {
    if (!options.active) return;
    let cancelled = false;
    let timer = 0;
    let frameCallback = 0;
    let observer: IntersectionObserver | null = null;
    let visible = true;
    const root = options.rootRef.current;
    const video = root?.querySelector<HTMLVideoElement>('video') || null;
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const width = mobile ? 16 : 32, height = mobile ? 9 : 18;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const applyImage = (source: CanvasImageSource) => {
      if (!context) return;
      context.drawImage(source, 0, 0, width, height);
      const top = averageRgba(context.getImageData(0, 0, width, Math.max(1, Math.floor(height / 3))).data);
      const bottom = averageRgba(context.getImageData(0, Math.floor(height * 2 / 3), width, Math.max(1, height - Math.floor(height * 2 / 3))).data);
      const left = averageRgba(context.getImageData(0, 0, Math.max(1, Math.floor(width / 3)), height).data);
      const right = averageRgba(context.getImageData(Math.floor(width * 2 / 3), 0, Math.max(1, width - Math.floor(width * 2 / 3)), height).data);
      setZones((previous) => ({ top: smoothRgb(previous.top, top), right: smoothRgb(previous.right, right), bottom: smoothRgb(previous.bottom, bottom), left: smoothRgb(previous.left, left) }));
    };

    const usePoster = () => {
      setPosterFallback(true);
      if (options.palette?.length) { setZones(fromColors(options.palette.slice(0, 3))); return; }
      if (!options.poster) { setZones(FALLBACK); return; }
      const image = new Image(); image.crossOrigin = 'anonymous';
      image.onload = () => { if (!cancelled) { try { applyImage(image); } catch { setZones(FALLBACK); } } };
      image.onerror = () => { if (!cancelled) setZones(FALLBACK); };
      image.src = options.poster;
    };

    if (options.mode === 'custom') { setZones(fromColors(options.customColors)); return; }
    if (options.mode === 'poster' || !video || !context) { usePoster(); return; }
    setPosterFallback(false);
    observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; }, { threshold: 0.05 });
    if (root) observer.observe(root);
    const sample = () => {
      if (cancelled) return;
      if (!document.hidden && visible && !video.paused && video.readyState >= 2) {
        try { applyImage(video); }
        catch (error) { if (error instanceof DOMException && error.name === 'SecurityError') usePoster(); else usePoster(); return; }
      }
      if ('requestVideoFrameCallback' in video && typeof video.requestVideoFrameCallback === 'function') frameCallback = video.requestVideoFrameCallback(sample);
      else timer = window.setTimeout(sample, mobile ? 125 : 84);
    };
    sample();
    return () => {
      cancelled = true; observer?.disconnect(); window.clearTimeout(timer);
      if (frameCallback && 'cancelVideoFrameCallback' in video && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(frameCallback);
    };
  }, [options.active, options.mode, options.poster, options.palette?.join('|'), options.customColors.join('|'), options.rootRef]);

  return { zones, posterFallback };
}
