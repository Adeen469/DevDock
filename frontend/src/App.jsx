import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import SplashScreen from './components/SplashScreen.jsx';

// Pages
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import OAuthCallbackPage from './pages/OAuthCallbackPage.jsx';
import Repositories from './pages/Repositories.jsx';
import RepoExplorer from './pages/RepoExplorer.jsx';
import RepositorySetupPage from './pages/RepositorySetupPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import TrashBinPage from './pages/TrashBinPage.jsx';

const SPLASH_SEEN_KEY = 'devdock.splashSeen.v1';

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return localStorage.getItem(SPLASH_SEEN_KEY) !== 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!showSplash) {
      return undefined;
    }

    const splashDurationMs = 3000;
    const timerId = window.setTimeout(() => {
      try {
        localStorage.setItem(SPLASH_SEEN_KEY, 'true');
      } catch {
        // Ignore storage failures.
      }
      setShowSplash(false);
    }, splashDurationMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<OAuthCallbackPage />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Repositories />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Layout>
                  <Repositories />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/repositories"
            element={
              <ProtectedRoute>
                <Layout>
                  <Repositories />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/repositories/trash"
            element={
              <ProtectedRoute>
                <Layout>
                  <TrashBinPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/repositories/:id/explorer"
            element={
              <ProtectedRoute>
                <RepoExplorer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/repositories/new"
            element={
              <ProtectedRoute>
                <RepositorySetupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Layout>
                  <ChatPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <Layout>
                  <ChatPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/messages/:randomUserId"
            element={
              <ProtectedRoute>
                <Layout>
                  <ChatPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProfilePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <SettingsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
