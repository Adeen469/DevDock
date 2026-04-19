import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkAuth } = useAuth();

  useEffect(() => {
    const completeOAuthLogin = async () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error || !token) {
        navigate('/login?error=oauth_failed', { replace: true });
        return;
      }

      localStorage.setItem('token', token);
      await checkAuth();
      navigate('/dashboard', { replace: true });
    };

    completeOAuthLogin();
  }, [checkAuth, navigate, searchParams]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      color: 'var(--text2)'
    }}>
      Completing sign in...
    </div>
  );
};

export default OAuthCallbackPage;
