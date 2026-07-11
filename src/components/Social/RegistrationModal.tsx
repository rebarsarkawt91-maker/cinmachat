import React, { useState } from 'react';
import { 
  auth, 
  db,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  updateProfile,
  signInWithCustomToken,
  GoogleAuthProvider,
  signInWithPopup,
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  getDocs, 
  collection, 
  query, 
  where
} from '../../lib/firebase';
import { X, User, Phone, Lock, Sparkles, LogIn, Calendar, Users, MapPin, Globe, Mail, QrCode } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';
import jsQR from 'jsqr';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "signup";
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({ isOpen, onClose, initialMode }) => {
  const [isLogin, setIsLogin] = useState(initialMode === "login");
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    age: '',
    gender: 'نێر',
    residence: '',
    country: 'کوردستان',
  });

  // Update isLogin when initialMode changes and modal opens
  React.useEffect(() => {
    if (isOpen && initialMode) {
      setIsLogin(initialMode === "login");
    }
  }, [isOpen, initialMode]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdminBypass, setShowAdminBypass] = useState(false);

  const qrInputRef = React.useRef<HTMLInputElement>(null);

  const handleDirectIdLogin = async (codeToSubmit: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login-by-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueCode: codeToSubmit })
      });

      if (!res.ok) {
        throw new Error("fail");
      }

      const data = await res.json();
      if (data.success && data.customToken) {
        const { signInWithCustomToken } = await import('firebase/auth');
        await signInWithCustomToken(auth, data.customToken);
        onClose();
        window.location.reload();
      } else {
        setError('ئەم کۆدەی ID-یە هەڵەیە، تکایە جارێکی تر هەوڵ بدە');
      }
    } catch (err) {
      console.error("Direct card ID login failed:", err);
      setError('ئەم کۆدەی ID-یە هەڵەیە، تکایە جارێکی تر هەوڵ بدە');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("قەبارەی وێنەی کۆدی QR نابێت لە ٢ مێگابایت گەورەتر بێت!");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          e.target.value = "";
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code && code.data && code.data.trim()) {
            let extractedCode = code.data.trim();
            setFormData(prev => ({ ...prev, phone: extractedCode }));
            handleDirectIdLogin(extractedCode);
          } else {
            setError('ئەم وێنەیە گونجاو نییە، تکایە وێنەی QRـی دروست هەڵبژێرە');
          }
        } catch (err) {
          console.error("Error decoding QR code:", err);
          setError('ئەم وێنەیە گونجاو نییە، تکایە وێنەی QRـی دروست هەڵبژێرە');
        }
        e.target.value = "";
      };
      img.onerror = () => {
        setError('ئەم وێنەیە گونجاو نییە، تکایە وێنەی QRـی دروست هەڵبژێرە');
        e.target.value = "";
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    let targetEmail = "";

    // Rate Limiting Guard
    const rateLimitKey = 'cc_reg_attempts';
    const now = Date.now();
    const attemptsStr = sessionStorage.getItem(rateLimitKey) || '[]';
    let attempts: number[] = JSON.parse(attemptsStr);
    attempts = attempts.filter((timestamp: number) => now - timestamp < 60000);
    
    if (!isLogin && attempts.length >= 3) {
      setError("کەمێک چاوەڕوان بە! ناتوانیت زیاتر لە ٣ جار ئەکاونت دروست بکەیت لە یەک خولەکدا.");
      setIsLoading(false);
      return;
    }

    if (!isLogin) {
      attempts.push(now);
      sessionStorage.setItem(rateLimitKey, JSON.stringify(attempts));
    }

    // Input Sanitization
    const sanitizedName = (formData.name || "").replace(/<\/?[^>]+(>|$)/g, "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").trim();

    try {
      // Verify if any of the login fields matches the Admin Master Secret Key
      try {
        const verifyRes = await fetch("/api/admin/verify-secret-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: formData.phone,
            password: formData.password,
            name: formData.name || sanitizedName
          })
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData.isSecret) {
            localStorage.setItem("cinemachat_local_admin_profile", JSON.stringify({
              name: verifyData.displayName || "admin",
              phone: verifyData.phone || "07701966640",
              uniqueCode: "CC-ADM-001"
            }));
            localStorage.setItem("cinemachat_admin", JSON.stringify(verifyData.adminUser));

            onClose();
            window.location.reload();
            return;
          }
        }
      } catch (apiErr) {
        console.error("Admin secret verification failed:", apiErr);
      }

      if (isLogin) {
        const loginIdentifier = formData.phone.trim();
        
        if (loginIdentifier.includes("@")) {
          // Normal email/password login
          await signInWithEmailAndPassword(auth, loginIdentifier, formData.password);
        } else {
          // Try ID login first
          const res = await fetch("/api/auth/login-by-id", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uniqueCode: loginIdentifier })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.customToken) {
              await signInWithCustomToken(auth, data.customToken);
              onClose();
              window.location.reload();
              return;
            }
          }
          
          // Legacy fallback
          if (/^\d+$/.test(loginIdentifier)) {
            targetEmail = `${loginIdentifier}@cinamachat.com`;
          } else {
            const cleanUsername = loginIdentifier.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
            targetEmail = `${cleanUsername}@cinamachat.com`;
          }
          await signInWithEmailAndPassword(auth, targetEmail, formData.password);
        }
      } else {
        // Registration
        targetEmail = formData.email?.trim() || "";
        const uniqueCode = `CC-CC-${Math.floor(1000 + Math.random() * 9000)}`;
        try {
          const res = await fetch("/api/auth/register-by-id", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: sanitizedName,
              email: targetEmail,
              password: formData.password,
              uniqueCode,
              phone: formData.phone,
              age: formData.age,
              gender: formData.gender,
              residence: formData.residence,
              country: formData.country
            })
          });

          const data = await res.json();
          if (data.success && data.customToken) {
            await signInWithCustomToken(auth, data.customToken);
          } else {
            throw new Error(data.error || "هەڵەیەک لە تۆمارکردن ڕوویدا");
          }
        } catch (err: any) {
          throw err;
        }
      }

      onClose();
      window.location.reload();
    } catch (err: any) {
      console.error("Auth error occurred:", err);
      let errorMsg = "هەڵەیەک ڕوویدا، تکایە دووبارە هەوڵبدەرەوە.";
      const errCode = err.code || "";
      
      if (errCode === 'auth/email-already-in-use' || errCode === 'email-already-in-use' || err.message?.includes('already-in-use')) {
        errorMsg = "ئەم ئیمەیڵە پێشتر بەکارهاتووە، تکایە ئیمەیڵێکی تر بەکاربهێنە.";
      } else if (errCode === 'auth/invalid-email' || err.message?.includes('invalid-email')) {
        errorMsg = "ئیمەیڵەکە نادروستە! تکایە شێوازێکی دروست بنووسە.";
      } else if (errCode === 'auth/weak-password' || err.message?.includes('weak-password')) {
        errorMsg = "وشەی تێپەڕ زۆر لاوازە! تکایە وشەیەکی تێپەڕی بەهێزتر بەکاربهێنە (بەلایەنی کەم ٦ پیت یان ژمارە).";
      } else if (errCode === 'auth/user-not-found' || err.message?.includes('user-not-found')) {
        errorMsg = "ئەم بەکارهێنەرە بوونی نییە! تکایە ئەکاونت دروست بکە.";
      } else if (errCode === 'auth/wrong-password' || errCode === 'auth/invalid-credential' || err.message?.includes('wrong-password') || err.message?.includes('invalid-credential')) {
        errorMsg = "وشەی تێپەڕ یان ناوی بەکارهێنەر نادروستە! تکایە دڵنیاببەوە لە زانیارییەکانت.";
      } else if (err.message) {
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef).catch(() => null);

      if (userSnap && userSnap.exists()) {
        await updateDoc(userDocRef, { isOnline: true }).catch(() => {});
      } else {
        const uniqueCode = `CC-CC-${Math.floor(1000 + Math.random() * 9000)}`;
        await setDoc(userDocRef, {
          uid: user.uid,
          name: user.displayName || 'Google User',
          phone: user.phoneNumber || 'Google Account',
          email: user.email,
          uniqueCode,
          isOnline: true,
          createdAt: new Date().toISOString(),
          role: 'user',
        }, { merge: true });

        await setDoc(doc(db, 'syncGroups', user.uid), {
          id: user.uid,
          name: `ژووری ${user.displayName || 'Google User'}`,
          creatorId: user.uid,
          memberIds: [user.uid],
          playback: { isPlaying: false, currentTime: 0, updatedAt: new Date().toISOString() },
          createdAt: new Date().toISOString()
        }, { merge: true });
      }

      onClose();
      window.location.reload();
    } catch (err: any) {
      console.error("Google auth error:", err);
      setError("چوونەژوورەوە بە گووگڵ سەرکەوتوو نەبوو. تکایە دووبارە هەوڵبدەرەوە.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/95 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-[310px] mx-auto bg-[#08080a] border border-gray-800/40 rounded-xl shadow-2xl text-right select-none overflow-hidden"
      >
        {/* Header Section */}
        <div className="p-3.5 pb-1 text-center relative">
          <button 
            type="button"
            onClick={onClose}
            className="absolute top-3 left-3 p-1 hover:bg-white/5 rounded-md text-gray-500 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          
          <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 mx-auto mb-1.5">
            <span className="text-red-500 text-sm">{isLogin ? '🔑' : '✨'}</span>
          </div>
          <h2 className="text-sm font-black text-white tracking-wide kurdish-text">
            {isLogin ? 'چوونەژوورەوەی ئەندام' : 'تۆمارکردنی خێرا'}
          </h2>
          <p className="text-[10px] text-gray-400 mt-0.5 kurdish-text">
            {isLogin ? 'تکایە زانیارییەکانت بنووسە بۆ چوونەژوورەوە' : 'بۆ چوونە ژوورەوە زانیارییەکانی خوارەوە پڕ بکەرەوە'}
          </p>
        </div>

        <div className="p-3.5 pt-1">
          <form onSubmit={handleSubmit} className="space-y-2.5">
            {isLogin && showAdminBypass ? (
              <>
                <div id="admin-bypass-name-group">
                  <label className="block text-[10px] font-bold text-gray-400 mb-1 mr-1 kurdish-text">ناوی بەکارهێنەری سەرپەرشتیار (Admin Name)</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-[#101014] border border-gray-800/50 focus:border-red-500/40 text-white rounded-lg py-1 px-2.5 text-[11px] text-right outline-none transition-all placeholder:text-gray-600 kurdish-text"
                      placeholder="ناوەکەت بنووسە"
                      id="admin-bypass-name-input"
                    />
                  </div>
                </div>

                <div id="admin-bypass-secret-group">
                  <label className="block text-[10px] font-bold text-gray-400 mb-1 mr-1 kurdish-text">کۆدی نهێنی سەرپەرشتیار (Admin Secret Key)</label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-[#101014] border border-gray-800/50 focus:border-red-500/40 text-white rounded-lg py-1 px-2.5 text-[11px] text-center outline-none transition-all placeholder:text-gray-600 font-mono"
                      placeholder="••••••••"
                      id="admin-bypass-secret-input"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {!isLogin && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-1 mr-1 kurdish-text">ناوی بەکارهێنەر (Username) <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full bg-[#101014] border border-gray-800/50 focus:border-red-500/40 text-white rounded-lg py-1 px-2.5 text-[11px] text-right outline-none transition-all placeholder:text-gray-600 kurdish-text"
                          placeholder="dekan"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-1 mr-1 kurdish-text">ئیمەیڵ (Email) <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full bg-[#101014] border border-gray-800/50 focus:border-red-500/40 text-white rounded-lg py-1"
                          placeholder="username@example.com"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-1 mr-1 kurdish-text flex items-center justify-between">
                    <span>
                      {isLogin ? "ناسنامەی CC-ID یان ئیمەیڵ یان مۆبایل" : "ژمارەی مۆبایل (دڵخواز)"}
                    </span>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={() => qrInputRef.current?.click()}
                        className="text-[9px] text-red-500 hover:text-red-400 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        title="سکانکردنی کۆدی QRی کارتی ئەندامێتی"
                      >
                        <QrCode className="w-3 h-3 text-red-500" />
                        سکانکردنی QR کارت
                      </button>
                    )}
                  </label>
                  
                  {isLogin && (
                    <input
                      type="file"
                      ref={qrInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleLoginQRUpload}
                    />
                  )}

                  <div className={`relative ${!isLogin || formData.phone.includes('@') ? 'dir-ltr' : 'dir-rtl'}`}>
                    <input
                      type="text"
                      required={isLogin}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-[#101014] border border-gray-800/50 focus:border-red-500/40 text-white rounded-lg py-1 px-2.5 text-[11px] outline-none transition-all placeholder:text-gray-600 text-center"
                      placeholder={isLogin ? "بۆ نموونە: CC-ADM-001 یان ئیمەیڵ" : "07700000000"}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-1 mr-1 kurdish-text">وشەی تێپەڕ (Password) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-[#101014] border border-gray-800/50 focus:border-red-500/40 text-white rounded-lg py-1 px-2.5 text-[11px] text-center outline-none transition-all placeholder:text-gray-600"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </>
            )}

            {isLogin && (
              <div className="text-center pt-0.5" id="admin-bypass-toggle-container">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminBypass(!showAdminBypass);
                    setError(null);
                    setFormData({
                      name: '',
                      phone: '',
                      email: '',
                      password: '',
                      age: '',
                      gender: 'نێر',
                      residence: '',
                      country: 'کوردستان',
                    });
                  }}
                  className="text-[9px] text-red-500 hover:text-red-400 font-bold kurdish-text transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
                  id="admin-bypass-toggle-btn"
                >
                  <span>{showAdminBypass ? "↩ چوونەژوورەوەی ئاسایی ئەندامان" : "🔐 چوونەژوورەوەی سەرپەرشتیار بە کلیل"}</span>
                </button>
              </div>
            )}

            {!isLogin && (
              <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2 text-center">
                <p className="text-[9px] text-gray-400 leading-relaxed kurdish-text">
                  🔒 ناسنامەی بەستنەوەی ژوورەکەت (<span className="text-red-500 font-mono font-bold">CC-ID</span>) بە ئۆتۆماتیکی دروست دەبێت.
                </p>
              </div>
            )}

            {error && (
              <p className="text-red-500 text-[9px] font-bold kurdish-text text-center px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg shadow-lg shadow-red-600/10 transition-all mt-1 flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isLogin ? '🔑' : '🚀'}</span>
                  <span className="kurdish-text font-black">
                    {isLogin ? 'چوونەژوورەوە' : 'تۆمارکردن و بینین'}
                  </span>
                </>
              )}
            </button>

            <div className="flex items-center my-2.5">
              <div className="flex-1 border-t border-gray-800/60"></div>
              <span className="px-2 text-[8px] text-gray-500 font-black uppercase tracking-wider font-mono">OR</span>
              <div className="flex-1 border-t border-gray-800/60"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full bg-[#101014]/60 hover:bg-white/5 text-white text-[10px] font-black py-1.5 px-3 rounded-lg border border-gray-800/60 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="font-mono">Continue with Google</span>
            </button>
          </form>

          <div className="mt-3 pt-3 border-t border-gray-900/60 text-center">
            <button 
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              className="text-gray-500 hover:text-white text-[10px] font-bold kurdish-text transition-colors cursor-pointer"
            >
              {isLogin ? 'ئەکاونتت نییە؟ تۆمارکردنی نوێ' : 'پێشتر ئەکاونتت هەیە؟ بچۆ ژوورەوە'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
