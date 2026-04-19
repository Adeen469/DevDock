import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import API_BASE_URL from '../config';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Login failed');
    }
    
    setLoading(false);
  };

  const handleOAuthLogin = (provider) => {
    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '40px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img 
              src="/favicon.png" 
              alt="DevDock Logo" 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>
            Welcome Back
          </h1>
          <p style={{ color: 'var(--text2)' }}>
            Sign in to your DevDock account
          </p>
        </div>

        {error && (
          <div style={{
            padding: '12px',
            background: 'rgba(255, 77, 106, 0.1)',
            border: '1px solid rgba(255, 77, 106, 0.2)',
            borderRadius: '6px',
            color: 'var(--red)',
            marginBottom: '20px',
            fontSize: '13px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '8px',
              color: 'var(--text)'
            }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text)',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '8px',
              color: 'var(--text)'
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text)',
                fontSize: '14px'
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginBottom: '16px' }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>or continue with</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <button
            onClick={() => handleOAuthLogin('google')}
            className="btn btn-ghost"
          >
            <svg style={{ width: '16px', height: '16px', marginRight: '8px' }} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.11827 1.48828C9.65827 1.48828 10.9703 2.04206 12.0583 3.02606L14.4823 0.602051C13.0063 -0.773949 10.9263 -1.51172 8.11827 -1.51172C4.97827 -1.51172 2.26627 0.290051 0.92627 3.02606L3.65427 5.17005C4.31427 3.36805 6.02227 1.48828 8.11827 1.48828Z"/>
              <path d="M15.4779 8.16846C15.4779 7.64646 15.4379 7.14646 15.3499 6.66446H8.118V9.62646H12.238C12.058 10.5825 11.514 11.4345 10.706 11.9745V13.8825H13.162C14.598 12.5625 15.4779 10.6185 15.4779 8.16846Z"/>
              <path d="M8.118 15.5125C10.174 15.5125 11.898 14.8305 13.162 13.6745L10.706 11.7665C10.022 12.2285 9.142 12.5065 8.118 12.5065C6.022 12.5065 4.314 10.6265 3.654 8.8245L1.114 10.7925C2.454 13.5285 5.166 15.3305 8.118 15.3305V15.5125Z"/>
              <path d="M3.65427 8.82446C3.48227 8.34246 3.39427 7.82646 3.39427 7.30446C3.39427 6.78246 3.48227 6.26646 3.65427 5.78446V3.81646H1.11427C0.41827 5.19646 0 6.72646 0 8.30446C0 9.88246 0.41827 11.4125 1.11427 12.7925L3.65427 8.82446Z"/>
            </svg>
            Google
          </button>
          <button
            onClick={() => handleOAuthLogin('github')}
            className="btn btn-ghost"
          >
            <svg style={{ width: '16px', height: '16px', marginRight: '8px' }} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.31C3.72 14.46 3.25 13 3.25 13c-.36-.92-.89-1.16-.89-1.16-.73-.5.05-.49.05-.49.8.06 1.23.82 1.23.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.45.55.38C13.71 14.53 16 11.53 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            GitHub
          </button>
        </div>

        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: 'var(--text2)'
        }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
