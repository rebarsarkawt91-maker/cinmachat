import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SocialAuthProvider } from './context/SocialAuthContext.tsx';

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
