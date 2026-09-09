import { Download, CheckCircle2, Bell } from "lucide-react";
import { usePwaInstall } from "../../pwa/PwaProvider";

type Variant = "floating" | "search" | "footer";

export function PwaInstallButton({ variant, className = "" }: { variant: Variant; className?: string }) {
  const { install, isInstalled, notificationPermission, requestNotifications } = usePwaInstall();

  const floating = variant === "floating";
  const compact = variant === "footer";
  const canAskNotifications = isInstalled && variant === "footer" && notificationPermission === "default";
  const label = canAskNotifications ? "چالاککردنی ئاگادارکردنەوە" : isInstalled ? "دامەزراوە" : "دابەزاندنی ئەپ";
  return (
    <button
      type="button"
      onClick={() => {
        if (!isInstalled) void install();
        else if (canAskNotifications) void requestNotifications();
      }}
      aria-label={label}
      title={label}
      className={`${floating ? "fixed bottom-[7.9rem] left-6 z-50 h-11 w-11 rounded-full" : compact ? "h-10 rounded-xl px-3" : "rounded-2xl px-4 py-3"} inline-flex items-center justify-center gap-2 border border-red-500/45 bg-[#15171c] text-white shadow-xl shadow-red-950/30 transition hover:border-red-400 hover:bg-red-600 ${isInstalled ? "border-emerald-500/30 text-emerald-400 hover:bg-[#15171c]" : ""} ${className}`}
    >
      {canAskNotifications ? <Bell className="h-5 w-5" /> : isInstalled ? <CheckCircle2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
      {!floating && <span className="text-xs font-black kurdish-text">{label}</span>}
    </button>
  );
}
