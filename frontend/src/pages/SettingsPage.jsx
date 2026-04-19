import React, { useState } from 'react';

const SettingsPage = () => {
  const defaultSettings = {
    emailNotifications: true,
    collaborationAlerts: true,
    repositoryUpdateEmails: true,
    darkMode: true,
    language: 'en'
  };

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('devdock.settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  const [savedSettings, setSavedSettings] = useState(() => {
    const saved = localStorage.getItem('devdock.settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  const handleToggle = (key) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleCancel = () => {
    setSettings(savedSettings);
  };

  const handleSave = () => {
    localStorage.setItem('devdock.settings', JSON.stringify(settings));
    setSavedSettings(settings);
    alert('Settings saved successfully.');
  };

  return (
    <div className="page-enter">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Settings</span>
        </div>
        <div className="card-body">
          {/* Notifications */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Notifications</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Email Notifications</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Receive email updates about your account</div>
              </div>
              <button
                onClick={() => handleToggle('emailNotifications')}
                className={`btn ${settings.emailNotifications ? 'btn-success' : 'btn-ghost'}`}
                style={{ width: '48px', height: '24px', padding: '0', position: 'relative', borderRadius: '12px' }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  background: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  right: settings.emailNotifications ? '2px' : 'auto',
                  left: settings.emailNotifications ? 'auto' : '2px',
                  transition: 'all 0.2s'
                }}></div>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Defect Alerts</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Get notified when collaborators update your repositories</div>
              </div>
              <button
                onClick={() => handleToggle('collaborationAlerts')}
                className={`btn ${settings.collaborationAlerts ? 'btn-success' : 'btn-ghost'}`}
                style={{ width: '48px', height: '24px', padding: '0', position: 'relative', borderRadius: '12px' }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  background: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  right: settings.collaborationAlerts ? '2px' : 'auto',
                  left: settings.collaborationAlerts ? 'auto' : '2px',
                  transition: 'all 0.2s'
                }}></div>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Repository Update Emails</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Receive summary when commit activity happens</div>
              </div>
              <button
                onClick={() => handleToggle('repositoryUpdateEmails')}
                className={`btn ${settings.repositoryUpdateEmails ? 'btn-success' : 'btn-ghost'}`}
                style={{ width: '48px', height: '24px', padding: '0', position: 'relative', borderRadius: '12px' }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  background: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  right: settings.repositoryUpdateEmails ? '2px' : 'auto',
                  left: settings.repositoryUpdateEmails ? 'auto' : '2px',
                  transition: 'all 0.2s'
                }}></div>
              </button>
            </div>
          </div>

          {/* Appearance */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Appearance</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Dark Mode</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Use dark theme across the application</div>
              </div>
              <button
                onClick={() => handleToggle('darkMode')}
                className={`btn ${settings.darkMode ? 'btn-success' : 'btn-ghost'}`}
                style={{ width: '48px', height: '24px', padding: '0', position: 'relative', borderRadius: '12px' }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  background: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  right: settings.darkMode ? '2px' : 'auto',
                  left: settings.darkMode ? 'auto' : '2px',
                  transition: 'all 0.2s'
                }}></div>
              </button>
            </div>
          </div>

          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn btn-ghost" onClick={handleCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
