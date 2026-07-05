import React, { useEffect, useState } from 'react';

const DISMISSED_KEY = 'eliteOnlineHealthcareInstallDismissed';

const isAppInstalled = () => (
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
);

function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

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

  const dismissPrompt = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, 'true');
  };

  const installApp = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'accepted') {
      setVisible(false);
    }
  };

  if (!visible || !deferredPrompt) return null;

  return (
    <div className="install-app-prompt" role="region" aria-label="Install app prompt">
      <div>
        <strong>Install Elite Online Healthcare</strong>
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
