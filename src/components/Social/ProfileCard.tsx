import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { SocialUser } from '../../types';
import { saveAs } from 'file-saver';
import { 
  User, 
  Phone, 
  Shield, 
  Calendar, 
  Download, 
  Share2, 
  Send, 
  X, 
  Eye, 
  EyeOff, 
  MapPin, 
  Globe, 
  UserCircle,
  Hash,
  Link2
} from 'lucide-react';
import { motion } from 'motion/react';
import html2canvas from 'html2canvas';

interface ProfileCardProps {
  user: SocialUser;
  onClose?: () => void;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ user, onClose }) => {
  const [showPhone, setShowPhone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const getFormattedDate = (createdAtVal: any) => {
    if (!createdAtVal) {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    try {
      let d: Date;
      if (typeof createdAtVal.toDate === 'function') {
        d = createdAtVal.toDate();
      } else if (typeof createdAtVal === 'object' && createdAtVal !== null && typeof createdAtVal.seconds === 'number') {
        d = new Date(createdAtVal.seconds * 1000);
      } else if (typeof createdAtVal === 'object' && createdAtVal !== null && typeof createdAtVal._seconds === 'number') {
        d = new Date(createdAtVal._seconds * 1000);
      } else {
        d = new Date(createdAtVal);
      }

      if (isNaN(d.getTime())) {
        const fallback = new Date();
        const year = fallback.getFullYear();
        const month = String(fallback.getMonth() + 1).padStart(2, '0');
        const day = String(fallback.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (err) {
      const fallback = new Date();
      const year = fallback.getFullYear();
      const month = String(fallback.getMonth() + 1).padStart(2, '0');
      const day = String(fallback.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  };

  const handleCopyLink = () => {
    if (!user?.uid) return;
    const directLink = window.location.origin + '/room/' + user.uid;
    navigator.clipboard.writeText(directLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      alert("کۆپی کرا! لینکەکە: " + directLink);
    });
  };

  const handleSaveImage = async () => {
    const targetElement = document.getElementById('card-to-download') || cardRef.current;
    if (!targetElement) return;
    setIsSaving(true);

    // Extract all styles active on the current page to sanitize them in-memory first
    let compiledCss = '';
    try {
      // 1. Gather all <style> text
      const styleElements = Array.from(document.querySelectorAll('style'));
      styleElements.forEach(el => {
        compiledCss += (el.textContent || '') + '\n';
      });

      // 2. Gather all rules from active styleSheets (such as linked CSS stylesheets)
      const sheets = Array.from(document.styleSheets);
      sheets.forEach(sheet => {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (rules) {
            for (let i = 0; i < rules.length; i++) {
              compiledCss += rules[i].cssText + '\n';
            }
          }
        } catch (e) {
          // Fall back gracefully if cross-origin or security prevents reading cssRules
          if (sheet.ownerNode && sheet.ownerNode.textContent) {
            compiledCss += sheet.ownerNode.textContent + '\n';
          }
        }
      });
    } catch (err) {
      console.error('Error compiling css rules: ', err);
    }

    // High fidelity sanitization of oklch and oklab colors for the html2canvas internal parser
    const sanitizeOklColorStyle = (cssText: string) => {
      // Regex detects oklch(...) or oklab(...) patterns and replaces them with a fallback safe standard tone
      return cssText.replace(/(oklch|oklab)\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, 'rgb(31, 41, 55)');
    };

    const sanitizedCombinedCss = sanitizeOklColorStyle(compiledCss);

    // Temporarily mock document.styleSheets to bypass oklch parsing issues
    const tempCleanStyle = document.createElement('style');
    tempCleanStyle.textContent = sanitizedCombinedCss;
    document.head.appendChild(tempCleanStyle);

    Object.defineProperty(document, 'styleSheets', {
      get() {
        return [tempCleanStyle.sheet].filter(Boolean);
      },
      configurable: true
    });

    // Highly robust window.getComputedStyle proxy to catch any oklch/oklab outputs
    const patchWindowGetComputedStyle = (win: any) => {
      if (!win) return () => {};
      const orig = win.getComputedStyle;
      if (!orig) return () => {};

      win.getComputedStyle = function (el: Element, pseudoElt?: string) {
        const style = orig.call(this, el, pseudoElt);
        if (!style) return style;

        return new Proxy(style, {
          get(target, prop) {
            const val = Reflect.get(target, prop);
            
            if (prop === 'getPropertyValue') {
              return function (propertyName: string) {
                const value = target.getPropertyValue(propertyName);
                if (typeof value === 'string' && (value.includes('oklch') || value.includes('oklab'))) {
                  return value.replace(/(oklch|oklab)\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, 'rgb(31, 41, 55)');
                }
                return value;
              };
            }

            if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
              return val.replace(/(oklch|oklab)\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, 'rgb(31, 41, 55)');
            }

            if (typeof val === 'function') {
              return val.bind(target);
            }

            return val;
          }
        });
      };

      return () => {
        win.getComputedStyle = orig;
      };
    };

    const restoreMainGCS = patchWindowGetComputedStyle(window);
    let restoreCloneGCS = () => {};

    try {
      const canvas = await html2canvas(targetElement, {
        backgroundColor: '#09090b',
        scale: 3, // High scale for clear/vibrant card details as requested
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => {
          // Wrap clonedDoc's window to also proxy getComputedStyle
          const defaultView = clonedDoc.defaultView;
          if (defaultView) {
            restoreCloneGCS = patchWindowGetComputedStyle(defaultView);
          }

          // Remove linked stylesheets except for google fonts
          const links = Array.from(clonedDoc.querySelectorAll('link[rel="stylesheet"]'));
          links.forEach((link: any) => {
            const href = link.getAttribute('href') || '';
            if (!href.includes('fonts.googleapis.com') && !href.includes('fonts.gstatic.com')) {
              link.remove();
            }
          });

          // Remove cloned style tags to avoid redundant or un-sanitized sheets in clone
          const styleTags = Array.from(clonedDoc.querySelectorAll('style'));
          styleTags.forEach(st => st.remove());

          // Inject our pre-sanitized combined stylesheet
          const cleanStyleEl = clonedDoc.createElement('style');
          cleanStyleEl.textContent = sanitizedCombinedCss;
          clonedDoc.head.appendChild(cleanStyleEl);

          // Mock clonedDoc.styleSheets to avoid oklch errors inside the clean cloned document context
          Object.defineProperty(clonedDoc, 'styleSheets', {
            get() {
              return [cleanStyleEl.sheet].filter(Boolean);
            },
            configurable: true
          });

          // Force micro-overrides on explicit card classes for bulletproof visual representation
          const elements = clonedDoc.querySelectorAll('*');
          elements.forEach((el: any) => {
            try {
              if (el.className && typeof el.className === 'string') {
                const classes = el.className;
                if (classes.includes('text-red-500')) {
                  el.style.color = '#ef4444';
                }
                if (classes.includes('text-gray-400')) {
                  el.style.color = '#9ca3af';
                }
                if (classes.includes('text-gray-500')) {
                  el.style.color = '#6b7280';
                }
                if (classes.includes('bg-red-950/30')) {
                  el.style.backgroundColor = 'rgba(127, 29, 29, 0.3)';
                }
                if (classes.includes('bg-[#0a0a0c]')) {
                  el.style.backgroundColor = '#0a0a0c';
                }
                if (classes.includes('border-gray-800/40')) {
                  el.style.borderColor = 'rgba(31, 41, 55, 0.4)';
                }
                if (classes.includes('border-red-500/20')) {
                  el.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                }
                if (classes.includes('bg-red-500/10')) {
                  el.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                }
                if (classes.includes('bg-white')) {
                  el.style.backgroundColor = '#ffffff';
                }
              }

              // Double check stylesheet-computed oklab/oklch and override inline
              const comp = window.getComputedStyle(el);
              const styleKeys = ['color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'];
              styleKeys.forEach((key) => {
                const val = comp[key as any];
                if (val && (val.includes('oklab') || val.includes('oklch'))) {
                  if (key === 'color') el.style.color = '#ffffff';
                  else if (key === 'backgroundColor') el.style.backgroundColor = 'transparent';
                  else el.style.borderColor = 'transparent';
                }
              });
            } catch (e) {
              // ignore
            }
          });
        }
      });

      // Save using file-saver with custom name matching CinemaChat_Card_ADM001.png format
      canvas.toBlob((blob) => {
        if (blob) {
          const cleanCode = (user?.uniqueCode || 'ADM001').replace(/^CC-/, '').replace(/[^a-zA-Z0-9]/g, '');
          saveAs(blob, `CinemaChat_Card_${cleanCode}.png`);
        } else {
          const link = document.createElement('a');
          const cleanCode = (user?.uniqueCode || 'ADM001').replace(/^CC-/, '').replace(/[^a-zA-Z0-9]/g, '');
          link.download = `CinemaChat_Card_${cleanCode}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        }
      }, 'image/png');
    } catch (err) {
      console.error('Error saving image:', err);
    } finally {
      restoreMainGCS();
      restoreCloneGCS();
      if (tempCleanStyle.parentNode) {
        tempCleanStyle.parentNode.removeChild(tempCleanStyle);
      }
      delete (document as any).styleSheets;
      setIsSaving(false);
    }
  };

  const handleWhatsAppShare = () => {
    const text = `Join me on CinemaChat! My Unique ID is ${user.uniqueCode} 🎬\n\n${window.location.origin}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="w-full max-w-sm mx-auto p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative group"
      >
        {/* qawghî serîkî kartaka (Card Container) */}
        <div 
          ref={cardRef}
          id="card-to-download"
          className="relative w-full max-w-sm mx-auto bg-[#0a0a0c] border border-gray-800/40 rounded-2xl p-5 text-center shadow-2xl overflow-hidden select-none"
        >
          {/* Close Button Overlay (Not in original snippet but needed for UX) */}
          {onClose && (
            <button 
              onClick={onClose}
              className="absolute top-2 left-2 z-20 w-8 h-8 rounded-lg bg-white/5 hover:bg-red-600/20 flex items-center justify-center text-gray-500 hover:text-red-500 border border-white/10 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* bashî sarawa: nasnama u hemakan */}
          <div className="flex justify-between items-center mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-950/30 flex items-center justify-center border border-red-500/20">
              <span className="text-red-500 text-sm">🛡️</span>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-red-500 font-bold tracking-widest uppercase">CINEMACHAT MEMBER</p>
              <h2 className="text-xl font-black text-white tracking-wider">CC-{user.uniqueCode}</h2>
            </div>
          </div>

          {/* bashî nawarast: zanyarî bakarener */}
          <div className="flex items-center justify-end gap-3 mb-5 bg-gradient-to-l from-gray-900/40 to-transparent p-2 rounded-xl">
            <div className="text-right">
              <h3 className="text-base font-bold text-white kurdish-text">{user.name}</h3>
              <p className="text-xs text-gray-400 flex items-center justify-end gap-1 dir-ltr">
                <span>{user.phone || "---"}</span> 📞
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-red-500 text-lg">👤</span>
              )}
            </div>
          </div>

          {/* 🔳 bashî QR kod */}
          <div className="bg-white p-4 rounded-2xl my-4 mx-auto w-48 h-48 flex flex-col items-center justify-center shadow-inner">
            <div className="w-[140px] h-[140px] flex items-center justify-center">
              <QRCodeSVG 
                value={`CC-${user.uniqueCode}` || "UNKNOWN"} 
                size={140}
                level="H"
                includeMargin={false}
                fgColor="#000000"
              />
            </div>
            <p className="text-[9px] font-black tracking-widest text-gray-400 mt-2 uppercase">
              SCAN TO WATCH TOGETHER
            </p>
          </div>

          {/* bashî khwarawa: protokol u rekawt */}
          <div className="flex justify-between items-center text-xs border-t border-gray-900 pt-3 px-1">
            <div className="text-left">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">REGISTRED ON</p>
              <p className="text-white font-mono font-bold">
                {getFormattedDate(user.createdAt)} 📅
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">PROTOCOL</p>
              <p className="text-red-500 font-mono font-bold">SECURE-CCv2</p>
            </div>
          </div>
        </div>

        {/* Unified low-profile Action List (بڕگەی کردارەکان) */}
        <div className="mt-3 bg-[#0a0a0c]/90 border border-gray-800/40 rounded-xl overflow-hidden shadow-xl" dir="rtl">
          {/* Row 1: Copy Link */}
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/5 active:bg-white/10 border-b border-gray-800/30 transition-colors cursor-pointer text-right"
          >
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-black text-gray-300 kurdish-text">کۆپیکردنی بەستەر</span>
            </div>
            <span className="text-[9px] font-medium text-gray-500">
              {copied ? "کۆپی کرا! ✓" : "کۆپی"}
            </span>
          </button>

          {/* Row 2: Send to WhatsApp */}
          <button
            onClick={handleWhatsAppShare}
            className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/5 active:bg-white/10 border-b border-gray-800/30 transition-colors cursor-pointer text-right"
          >
            <div className="flex items-center gap-2">
              <Share2 className="w-3.5 h-3.5 text-green-400" />
              <span className="text-[11px] font-black text-gray-300 kurdish-text">ناردن بۆ واتسئاپ</span>
            </div>
            <span className="text-[9px] font-medium text-gray-500">ناردن</span>
          </button>

          {/* Row 3: Download Card */}
          <button
            onClick={handleSaveImage}
            disabled={isSaving}
            className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer text-right disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              {isSaving ? (
                <div className="w-3.5 h-3.5 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className="text-[11px] font-black text-gray-300 kurdish-text">داگرتنی کارت</span>
            </div>
            <span className="text-[9px] font-medium text-gray-500">داگرتن</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
