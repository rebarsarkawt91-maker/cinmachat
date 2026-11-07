import React from 'react';
import { rgbCss } from '../../fx/colorMath';
import { useAmbientColors } from '../../fx/useAmbientColors';
import { useFxSettings } from '../../fx/fxSettings';

export default function AmbientGlow({ rootRef, poster, palette, pulse = false }: {
  rootRef: React.RefObject<HTMLElement | null>; poster?: string; palette?: string[]; pulse?: boolean;
}) {
  const settings = useFxSettings();
  const active = settings.enabled && settings.glow.enabled;
  const { zones } = useAmbientColors({ active, rootRef, mode: settings.glow.mode, poster, palette, customColors: settings.glow.colors });
  if (!active) return null;
  const alpha = Math.max(0.08, settings.glow.intensity / 100 * 0.62);
  const duration = settings.glow.speed === 'slow' ? '9s' : settings.glow.speed === 'fast' ? '3.5s' : '6s';
  const style = { '--fx-top': rgbCss(zones.top), '--fx-right': rgbCss(zones.right), '--fx-bottom': rgbCss(zones.bottom), '--fx-left': rgbCss(zones.left), '--fx-alpha': alpha, '--fx-duration': duration, filter: `saturate(${settings.glow.saturation}%)` } as React.CSSProperties;
  return <div aria-hidden className={`cinemafx-ambient ${pulse ? 'cinemafx-pulse' : ''}`} style={style}>
    <span className="cinemafx-ambient__edge cinemafx-ambient__edge--top" />
    <span className="cinemafx-ambient__edge cinemafx-ambient__edge--right" />
    <span className="cinemafx-ambient__edge cinemafx-ambient__edge--bottom" />
    <span className="cinemafx-ambient__edge cinemafx-ambient__edge--left" />
  </div>;
}
