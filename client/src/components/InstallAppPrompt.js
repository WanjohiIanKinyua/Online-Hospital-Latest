import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const DISMISSED_KEY = 'eliteOnlineHospitalInstallDismissed';
const PUBLIC_PATHS = new Set(['/', '/about', '/login', '/register', '/forgot-password', '/reset-password']);

const isAppInstalled = () => (
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
);

function InstallAppPrompt() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const isPublicPage = PUBLIC_PATHS.has(location.pathname);

  useEffect(() => {
    if (isAppInstalled() || localStorage.getItem(DISMISSED_KEY) === 'true') {
      return undefined;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
      localStorage.setItem(DISMISSED_KEY, 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (
      isPublicPage &&
      !isAppInstalled() &&
      localStorage.getItem(DISMISSED_KEY) !== 'true'
    ) {
      setVisible(true);
    }
  }, [isPublicPage]);

  const dismissPrompt = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, 'true');
  };

  const installApp = async () => {
    if (!deferredPrompt) {
      window.alert('To install the app, open your browser menu and choose "Install app" or "Add to home screen".');
      return;
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'accepted') {
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="install-app-prompt" role="region" aria-label="Install app prompt">
      <div>
        <strong>Install Elite Online Hospital</strong>
        <span>Get faster access from your home screen.</span>
      </div>
      <div className="install-app-actions">
        <button type="button" className="install-app-button" onClick={installApp}>
          Install App
        </button>
        <button type="button" className="install-app-dismiss" onClick={dismissPrompt} aria-label="Dismiss install app prompt">
          x
        </button>
      </div>
    </div>
  );
}

export default InstallAppPrompt;
