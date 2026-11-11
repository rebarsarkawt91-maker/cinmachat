import { Eye, EyeOff } from "lucide-react";

/** Only publishers can open the shared movie's timing editor. */
export function AdminSceneBlurButton({ canAdminister, active, expanded, onToggle }: {
  canAdminister: boolean;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!canAdminister) return null;
  const label = "ڕێکخستنی تەڵخکردنی دیمەن";
  return <button
    type="button"
    data-testid="admin-scene-blur"
    aria-label={label}
    aria-expanded={expanded}
    aria-controls="scene-blur-editor"
    title={label}
    onClick={onToggle}
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors active:scale-95 md:h-10 md:w-10 ${active
      ? "border-amber-300 bg-amber-400 text-black"
      : "border-white/10 bg-black/60 text-white hover:bg-white/10"}`}
  >
    {active ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
  </button>;
}
