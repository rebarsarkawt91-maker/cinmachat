import type { PointerEventHandler } from "react";
import { usesProviderTouchControls } from "../../utils/playerControls";

/** Preserve the source's native play/verification gestures for the known relay. */
export function PlayerInteractionLayer({ url, onPointerMove, onPointerDown }: {
  url: string;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
}) {
  if (usesProviderTouchControls(url)) return null;
  return <div
    data-testid="player-interaction-layer"
    className="absolute inset-0 z-[42] cursor-default"
    onPointerMove={onPointerMove}
    onPointerDown={onPointerDown}
    aria-hidden="true"
  />;
}
