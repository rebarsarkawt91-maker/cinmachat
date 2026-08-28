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

if (window.__CINEMACHAT_EMBED_MODE__) {
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
