import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SocialAuthProvider } from './context/SocialAuthContext.tsx';

declare global {
  interface Window {
    __CINEMACHAT_EMBED_MODE__?: boolean;
  }
}

const isFirebaseAuthCallbackRoute = window.location.pathname.startsWith('/__/auth/');

const renderGoogleAuthHoldingScreen = () => {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `
    <main style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;text-align:center;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
      <section aria-live="polite" role="status" style="display:flex;flex-direction:column;align-items:center;">
        <div style="font-size:clamp(32px,8vw,56px);font-weight:900;font-style:italic;letter-spacing:-0.02em;">CINAMACHAT</div>
        <p style="font-size:14px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:#f87171;margin:12px 0 0;">Signing in...</p>
        <div style="width:40px;height:40px;border-radius:9999px;border:2px solid rgba(255,255,255,.2);border-top-color:#ef4444;margin-top:32px;animation:cinemachat-auth-spin .8s linear infinite;"></div>
        <p dir="rtl" style="font-size:20px;line-height:1.8;font-weight:900;margin:32px 0 0;">چاوەڕێ بکە... بە هەژمارەکەت دەچیتە ژورەوە.</p>
        <p style="font-size:14px;font-weight:700;color:#a1a1aa;margin:8px 0 0;">Please wait... Signing you in.</p>
      </section>
    </main>
    <style>@keyframes cinemachat-auth-spin{to{transform:rotate(360deg)}}</style>
  `;
};

if (isFirebaseAuthCallbackRoute) {
  renderGoogleAuthHoldingScreen();
} else if (window.__CINEMACHAT_EMBED_MODE__) {
  // Keep host domain URL (www.cinamachat.com) and show live app in iframe only.
  // Prevent mounting the local React bundle in this mode.
} else {

// Clean handling of third-party video and web media playback interruption exceptions
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (!reason) return;
  const reasonStr = (reason.message || reason.name || String(reason)).toLowerCase();
  if (
    reasonStr.includes('play()') || 
    reasonStr.includes('interrupted') || 
    reasonStr.includes('media was removed') || 
    reasonStr.includes('pause()') || 
    reasonStr.includes('user gesture') ||
    reasonStr.includes('abort')
  ) {
    event.preventDefault();
  }
});

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SocialAuthProvider>
        <App />
      </SocialAuthProvider>
    </StrictMode>,
  );
}
