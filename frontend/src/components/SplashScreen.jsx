import React, { useState } from 'react';

const SplashScreen = () => {
  const [logoLoaded, setLogoLoaded] = useState(false);

  return (
    <div className="splash-screen" role="status" aria-live="polite" aria-label="Loading DevDock">
      <div className="splash-orb" />
      <div className="splash-card">
        <div className="splash-logo-wrap">
          {!logoLoaded && <div className="splash-logo-fallback" aria-hidden="true">DD</div>}
          <img
            className={`splash-logo ${logoLoaded ? 'is-ready' : ''}`}
            src="/favicon.png"
            alt="DevDock logo"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onLoad={() => setLogoLoaded(true)}
            onError={() => setLogoLoaded(false)}
          />
        </div>
        <h1 className="splash-title">DevDock</h1>
        <p className="splash-subtitle">Collaborative code publishing platform</p>
        <div className="splash-progress" />
      </div>
    </div>
  );
};

export default SplashScreen;
