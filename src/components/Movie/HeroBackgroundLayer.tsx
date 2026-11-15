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

// The first group follows the smoke, waves, nebulae and light trails in the
// references. The darker options use softer light and a smaller color range.
export const HERO_BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  preset(1, 'دووکەڵی ڕەنگاوڕەنگ', 0, 1.13, ['#e7430c', '#381bcb', '#ec0186']),
  preset(2, 'سینەمای سوور', 0, 1, ['#b82937', '#390909', '#e6535e']),
  preset(3, 'دووکەڵی مۆر و شین', 0, 1.14, ['#ca188e', '#006ac9', '#64c8fb']),
  preset(4, 'شەپۆلی نیۆن', 2, 1.00, ['#154be1', '#7707cf', '#c660ff']),
  preset(5, 'هەورە ئەستێرەییەکان', 3, 1.07, ['#830b86', '#0579c1', '#f570fc']),
  preset(6, 'گەردوونی شین و زێڕین', 3, 1.18, ['#0b5cad', '#ae470c', '#ffd198']),
  preset(7, 'بازنەی خۆر', 4, 1.14, ['#843407', '#f25c0e', '#ffe0a6']),
  preset(8, 'کونی ڕەش', 4, 1.05, ['#b44a09', '#5c0836', '#ffc96d']),
  preset(9, 'بازنەی نیۆن', 4, 1.00, ['#ae3307', '#72168d', '#fdad48']),
  preset(10, 'ئاسۆی ڕەنگاوڕەنگ', 5, 1.09, ['#a31baa', '#04578c', '#ef8f49']),
  preset(11, 'شەپۆلی فیرووزەیی', 2, 1.08, ['#111571', '#007b89', '#53dcf8']),
  preset(12, 'تیشکی سینەما', 7, 0.65, ['#202533', '#565e68', '#b7c7da']),
  preset(13, 'دووکەڵی مۆری تاریک', 1, 0.70, ['#311344', '#37143f', '#ac518f']),
  preset(14, 'مەرەکەبی شین', 1, 0.67, ['#092443', '#105480', '#3d86ba']),
  preset(15, 'تۆڕی خاڵی شین', 8, 0.62, ['#05203c', '#0a3e6a', '#387ab2']),
  preset(16, 'تیشک لە ژێر ئاو', 9, 0.63, ['#04303c', '#075663', '#52adbc']),
  preset(17, 'تۆزی زێڕین', 10, 0.60, ['#3a2917', '#775215', '#cfab57']),
  preset(18, 'بازنەکانی گەردوون', 11, 0.52, ['#5b2a21', '#251c46', '#bc7159']),
  preset(19, 'شەپۆلی زێڕینی تاریک', 2, 0.53, ['#523316', '#241914', '#b57b39']),
  preset(20, 'ڕێڕەوی تیشکی زێڕین', 12, 0.59, ['#624015', '#2c1418', '#d8a760']),
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
  const design = HERO_BACKGROUND_PRESETS[mode - 1];
  return design && design.id !== DEFAULT_HERO_BACKGROUND_ID
    ? <AnimatedBackdrop design={design} pageBackground={pageBackground} />
    : null;
}
