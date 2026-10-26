import type { PlayerTextAd } from '../../lib/playerAds';

/** React text rendering escapes markup; the color has already passed hex validation. */
export function PlayerTextAdvertisement({ ad, onClose }: { ad: PlayerTextAd; onClose: () => void }) {
  return <aside className="cinema-player-text-ad" aria-label="ڕیکلامی تێکست" data-testid="player-text-ad"
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <span className="cinema-player-ad-label">ڕیکلام</span>
    <button type="button" className="cinema-player-ad-close" aria-label="داخستنی ڕیکلامی تێکست" onClick={onClose}>×</button>
    <p dir="auto" style={{ color: ad.color, fontWeight: 800 }}>{ad.text}</p>
  </aside>;
}
