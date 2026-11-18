import { useEffect, useRef, type CSSProperties } from 'react';
import { createHeroBackgroundRenderer, type ShaderPreset } from './heroBackgroundShader';
import '../../styles/heroBackgroundLayer.css';

export const DEFAULT_HERO_BACKGROUND_ID = 2;

type BackgroundPreset = ShaderPreset & { label: string; swatch: string };

function preset(
  id: number,
  label: string,
  shape: number,
  light: number,
  colors: ShaderPreset['colors'],
): BackgroundPreset {
  const [primary, secondary, accent] = colors;
  return { id, label, shape, light, colors, swatch: `linear-gradient(135deg, ${primary}, ${secondary} 70%, ${accent})` };
}

// Mode 2 is the only built-in background. All other modes are empty slots for
// an explicitly uploaded/linked background, so a new transparent HTML/video
// file can never inherit one of the retired shader presets underneath it.
export const HERO_BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  preset(2, 'سینەمای سوور', 0, 1, ['#b82937', '#390909', '#e6535e']),
];

const FRAME_INTERVAL = 1000 / 24;

function AnimatedBackdrop({ design, pageBackground = false }: { design: BackgroundPreset; pageBackground?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const updatePreset = useRef<((preset: BackgroundPreset) => void) | null>(null);
  const initialPreset = useRef(design);

  useEffect(() => {
    const element = host.current;
    const surface = canvas.current;
    if (!element || !surface) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const smallScreen = window.matchMedia('(max-width: 768px)');
    let current = initialPreset.current;
    let renderer: ReturnType<typeof createHeroBackgroundRenderer> = null;
    let inView = typeof IntersectionObserver === 'undefined';
    let frame = 0;
    let lastFrame = 0;
    let seconds = 0;
    let measuredWidth = 0;
    let measuredHeight = 0;

    // The page-wide modes follow the document scroll as well as the clock,
    // matching the supplied scroll reference while keeping the canvas fixed
    // behind the complete site.
    const scrollOffset = () => pageBackground && typeof window !== 'undefined' ? window.scrollY / 420 : 0;

    const isVisible = () => inView && !document.hidden;
    const animate = () => isVisible() && !motion.matches;
    const draw = () => {
      renderer?.draw(seconds + scrollOffset());
      if (renderer) element.dataset.renderer = 'webgl';
    };

    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      const maxWidth = smallScreen.matches ? 420 : 768;
      const maxHeight = smallScreen.matches ? 380 : 400;
      // CSS scales low-resolution fog smoothly. Cap pixels on high-DPI devices.
      const scale = Math.min(0.8, maxWidth / width, maxHeight / height);
      measuredWidth = Math.max(1, Math.round(width * scale));
      measuredHeight = Math.max(1, Math.round(height * scale));
      if (surface.width !== measuredWidth || surface.height !== measuredHeight) {
        surface.width = measuredWidth;
        surface.height = measuredHeight;
      }
      if (isVisible()) draw();
    };

    const tick = (now: number) => {
      frame = 0;
      if (!renderer || !animate()) return;
      if (!lastFrame || now - lastFrame >= FRAME_INTERVAL - 2) {
        seconds += lastFrame ? Math.min(80, now - lastFrame) / 1000 : 0;
        lastFrame = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };

    const syncMotion = () => {
      if (animate()) element.dataset.motion = 'on';
      else delete element.dataset.motion;
      if (!animate() || !renderer) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        lastFrame = 0;
      } else if (!frame) {
        frame = requestAnimationFrame(tick);
      }
    };

    const init = () => {
      // Avoid initializing a graphics context for an off-screen hero.
      if (renderer) return;
      try { renderer = createHeroBackgroundRenderer(surface); }
      catch { renderer = null; }
      if (renderer) {
        renderer.setPreset(current);
        resize();
      }
    };

    const onVisible = () => {
      if (isVisible()) {
        init();
        draw();
      }
      syncMotion();
    };
    const onScroll = () => {
      if (isVisible()) draw();
    };
    const lost = (event: Event) => {
      event.preventDefault();
      renderer = null;
      delete element.dataset.renderer;
      syncMotion();
    };
    const restored = () => {
      if (isVisible()) onVisible();
    };

    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      onVisible();
    });
    const sizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(element);
    sizeObserver?.observe(element);
    if (!sizeObserver) window.addEventListener('resize', resize);
    smallScreen.addEventListener('change', resize);
    motion.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', onVisible);
    if (pageBackground) window.addEventListener('scroll', onScroll, { passive: true });
    surface.addEventListener('webglcontextlost', lost);
    surface.addEventListener('webglcontextrestored', restored);
    onVisible();

    updatePreset.current = (next) => {
      current = next;
      renderer?.setPreset(next);
      if (isVisible()) draw();
    };

    return () => {
      updatePreset.current = null;
      observer?.disconnect();
      sizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      smallScreen.removeEventListener('change', resize);
      motion.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', onVisible);
      if (pageBackground) window.removeEventListener('scroll', onScroll);
      surface.removeEventListener('webglcontextlost', lost);
      surface.removeEventListener('webglcontextrestored', restored);
      if (frame) cancelAnimationFrame(frame);
      renderer?.dispose();
    };
  }, [pageBackground]);

  useEffect(() => { updatePreset.current?.(design); }, [design]);
  const [primary, secondary, accent] = design.colors;
  const style = {
    '--hero-backdrop-primary': primary,
    '--hero-backdrop-secondary': secondary,
    '--hero-backdrop-accent': accent,
    '--hero-backdrop-light': design.light,
    '--hero-backdrop-angle': `${21 + (design.id * 27) % 136}deg`,
  } as CSSProperties;
  return (
    <div ref={host} className="hero-background-layer" data-background-mode={design.id}
      data-background-shape={design.shape} data-page-background={pageBackground ? 'true' : undefined}
      aria-hidden="true" style={style}>
      <div className="hero-background-layer__fallback" />
      <canvas ref={canvas} className="hero-background-layer__canvas" width={1} height={1} />
    </div>
  );
}

/** The classic setting keeps the existing cinema photograph untouched. */
export function HeroBackgroundLayer({ mode, pageBackground = false }: { mode: number; pageBackground?: boolean }) {
  const design = HERO_BACKGROUND_PRESETS.find(item => item.id === mode);
  return design && design.id !== DEFAULT_HERO_BACKGROUND_ID
    ? <AnimatedBackdrop design={design} pageBackground={pageBackground} />
    : null;
}
