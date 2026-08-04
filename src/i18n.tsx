import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { Globe, ChevronDown, Check } from "lucide-react";

// ============================================================================
// Lightweight UI i18n layer
// ----------------------------------------------------------------------------
// Purpose:
//   - Provide a compact language selector for the top header.
//   - Stay completely non-disruptive: every existing string is the exact
//     Sorani Kurdish (ckb) default, and any missing translation falls back
//     to ckb, then to the key itself.
//   - Language preference is persisted in localStorage so it survives reloads.
//   - New UI strings can be added to TRANSLATIONS under their language code
//     without touching any component logic.
// ============================================================================

export type LangCode = "ckb" | "kmr" | "en" | "ar" | "tr" | "fa" | "zh" | "hi" | "ne" | "de" | "sv";

export interface LanguageDef {
  code: LangCode;
  label: string; // English name shown in the dropdown
  short: string; // compact code shown on the header button
  rtl?: boolean; // render this label right-to-left
}

export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { code: "ckb", label: "Kurdish (Sorani)", short: "KU" },
  { code: "kmr", label: "Kurdish (Kurmancî)", short: "KM" },
  { code: "en", label: "English", short: "EN" },
  { code: "ar", label: "Arabic", short: "AR", rtl: true },
  { code: "tr", label: "Turkish", short: "TR" },
  { code: "fa", label: "Persian", short: "FA", rtl: true },
  { code: "zh", label: "Chinese", short: "ZH" },
  { code: "hi", label: "Hindi", short: "HI" },
  { code: "ne", label: "Nepali", short: "NE" },
  { code: "de", label: "German", short: "DE" },
  { code: "sv", label: "Swedish", short: "SV" },
];

const DEFAULT_LANG: LangCode = "ckb";
const STORAGE_KEY = "cinemachat_ui_lang";

// ----------------------------------------------------------------------------
// Module-level store: keeps the current language, persists it, and lets React
// components subscribe through useI18n() (via useSyncExternalStore).
// ----------------------------------------------------------------------------
let currentLang: LangCode = readInitialLang();
const listeners = new Set<() => void>();

function readInitialLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
      return saved as LangCode;
    }
  } catch (e) {
    // localStorage unavailable — keep the default.
  }
  return DEFAULT_LANG;
}

function emitChange() {
  listeners.forEach((fn) => fn());
}

export function getLang(): LangCode {
  return currentLang;
}

export function setLanguage(code: string) {
  if (!SUPPORTED_LANGUAGES.some((l) => l.code === code)) return;
  currentLang = code as LangCode;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch (e) {
    // Ignore persistence failures; keep the in-memory switch.
  }
  emitChange();
}

// ----------------------------------------------------------------------------
// Translations.
// The `ckb` (Sorani Kurdish) entries are the live source of truth and must stay
// byte-identical to the hardcoded UI strings so the default experience changes
// nothing. Every other language only needs a key to opt in; missing keys fall
// back to ckb automatically.
// ----------------------------------------------------------------------------
type Dict = Record<string, string>;

const TRANSLATIONS: Record<string, Dict> = {
  ckb: {
    loginRegister: "چوونە ژوورەوە / خۆتۆمارکردن",
    officialPlatform: "Official Platform",
    secureConnection: "Secure Connection",
    authorizedOnly: "Authorized Only",
    broadcast: "پەخشی فەرمی 📺",
    dms: "پەیامەکان (DMs)",
    myId: "ناسنامەی من",
    admin: "Admin",
    newTag: "NEW:",
    searchFilter: "گەڕان و فلتەرکردن",
    searchPlaceholder: "گەڕان بۆ فیلم یان زنجیرە...",
  },
  kmr: {
    loginRegister: "Têketin / Tomarkirin",
    officialPlatform: "Platforma Fermî",
    secureConnection: "Têkiliya Ewle",
    authorizedOnly: "Tenê Destûrdar",
    broadcast: "Weşana Fermî 📺",
    dms: "Peyam (DMs)",
    myId: "Nasnameya Min",
    admin: "Admin",
    newTag: "NÛ:",
    searchFilter: "Lêgerîn û Fîltrekirin",
    searchPlaceholder: "Lêgerîna film an rêzefîlmekê...",
  },
  en: {
    loginRegister: "Login / Register",
    officialPlatform: "Official Platform",
    secureConnection: "Secure Connection",
    authorizedOnly: "Authorized Only",
    broadcast: "Official Broadcast 📺",
    dms: "Messages (DMs)",
    myId: "My ID",
    admin: "Admin",
    newTag: "NEW:",
    searchFilter: "Search & Filter",
    searchPlaceholder: "Search for a movie or series...",
  },
  ar: {
    loginRegister: "تسجيل الدخول / إنشاء حساب",
    officialPlatform: "المنصة الرسمية",
    secureConnection: "اتصال آمن",
    authorizedOnly: "المصرح لهم فقط",
    broadcast: "البث الرسمي 📺",
    dms: "الرسائل",
    myId: "هويتي",
    admin: "المشرف",
    newTag: "جديد:",
    searchFilter: "البحث والتصفية",
    searchPlaceholder: "ابحث عن فيلم أو مسلسل...",
  },
  tr: {
    loginRegister: "Giriş / Kayıt Ol",
    officialPlatform: "Resmî Platform",
    secureConnection: "Güvenli Bağlantı",
    authorizedOnly: "Yalnızca Yetkili",
    broadcast: "Resmî Yayın 📺",
    dms: "Mesajlar",
    myId: "Kimliğim",
    admin: "Yönetici",
    newTag: "YENİ:",
    searchFilter: "Ara ve Filtrele",
    searchPlaceholder: "Bir film veya dizi arayın...",
  },
  fa: {
    loginRegister: "ورود / ثبت‌نام",
    officialPlatform: "پلتفرم رسمی",
    secureConnection: "اتصال امن",
    authorizedOnly: "فقط مجازها",
    broadcast: "پخش رسمی 📺",
    dms: "پیام‌ها",
    myId: "شناسنامه من",
    admin: "مدیر",
    newTag: "جدید:",
    searchFilter: "جستجو و فیلتر",
    searchPlaceholder: "جستجوی فیلم یا سریال...",
  },
  zh: {
    loginRegister: "登录 / 注册",
    officialPlatform: "官方平台",
    secureConnection: "安全连接",
    authorizedOnly: "仅限授权",
    broadcast: "官方直播 📺",
    dms: "私信",
    myId: "我的身份",
    admin: "管理",
    newTag: "新：",
    searchFilter: "搜索与筛选",
    searchPlaceholder: "搜索电影或剧集...",
  },
  hi: {
    loginRegister: "लॉगिन / रजिस्टर",
    officialPlatform: "आधिकारिक मंच",
    secureConnection: "सुरक्षित कनेक्शन",
    authorizedOnly: "केवल अधिकृत",
    broadcast: "आधिकारिक प्रसारण 📺",
    dms: "संदेश",
    myId: "मेरी पहचान",
    admin: "व्यवस्थापक",
    newTag: "नया:",
    searchFilter: "खोजें और फ़िल्टर करें",
    searchPlaceholder: "फिल्म या सीरीज़ खोजें...",
  },
  ne: {
    loginRegister: "लगइन / दर्ता",
    officialPlatform: "आधिकारिक प्लेटफर्म",
    secureConnection: "सुरक्षित जडान",
    authorizedOnly: "केवल अधिकृत",
    broadcast: "आधिकारिक प्रसारण 📺",
    dms: "सन्देश",
    myId: "मेरो परिचय",
    admin: "प्रशासक",
    newTag: "नयाँ:",
    searchFilter: "खोज्नुहोस् र फिल्टर गर्नुहोस्",
    searchPlaceholder: "फिल्म वा शृंखला खोज्नुहोस्...",
  },
  de: {
    loginRegister: "Anmelden / Registrieren",
    officialPlatform: "Offizielle Plattform",
    secureConnection: "Sichere Verbindung",
    authorizedOnly: "Nur Berechtigte",
    broadcast: "Offizieller Livestream 📺",
    dms: "Nachrichten",
    myId: "Meine ID",
    admin: "Admin",
    newTag: "NEU:",
    searchFilter: "Suchen & Filtern",
    searchPlaceholder: "Nach Film oder Serie suchen...",
  },
  sv: {
    loginRegister: "Logga in / Registrera",
    officialPlatform: "Officiell plattform",
    secureConnection: "Säker anslutning",
    authorizedOnly: "Endast behöriga",
    broadcast: "Officiell sändning 📺",
    dms: "Meddelanden",
    myId: "Mitt ID",
    admin: "Admin",
    newTag: "NYTT:",
    searchFilter: "Sök och filtrera",
    searchPlaceholder: "Sök efter en film eller serie...",
  },
};

export function t(key: string): string {
  const dict = TRANSLATIONS[currentLang];
  const fallback = TRANSLATIONS[DEFAULT_LANG];
  return (dict && dict[key]) || (fallback && fallback[key]) || key;
}

// Hook for React components: re-renders whenever the language changes.
export function useI18n() {
  const lang = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => currentLang,
    () => currentLang
  );
  return { lang, t };
}

// ----------------------------------------------------------------------------
// LanguageSelector — compact header dropdown.
// Renders a small globe button with the active language's short code and opens
// a right-aligned list of all supported languages. Closes on outside click or
// on selection. Sized for mobile so it never overflows the header.
// ----------------------------------------------------------------------------
export function LanguageSelector() {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const active = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        title={active.label}
        className="flex items-center gap-1 p-1 md:p-1.5 bg-white/5 border border-white/10 rounded-lg hover:bg-brand-primary/10 transition-all text-gray-400 hover:text-brand-primary active:scale-95"
      >
        <Globe className="w-3 h-3 md:w-3.5 md:h-3.5" />
        <span className="text-[8px] font-black uppercase tracking-widest text-inherit">
          {active.short}
        </span>
        <ChevronDown
          className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-2 w-40 origin-top-right bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl z-[120] max-h-60 overflow-y-auto overscroll-contain py-1"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              type="button"
              key={l.code}
              role="option"
              aria-selected={l.code === lang}
              onClick={() => {
                setLanguage(l.code);
                setOpen(false);
              }}
              dir={l.rtl ? "rtl" : "ltr"}
              className={`w-full text-left px-2.5 py-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-[11px] font-semibold transition-colors flex items-center justify-between ${
                l.code === lang
                  ? "text-brand-primary bg-brand-primary/10"
                  : "text-gray-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="truncate">{l.label}</span>
              {l.code === lang && <Check className="w-3 h-3 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
