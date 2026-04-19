import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="route-skeleton">
        <div className="route-skeleton-sidebar">
          <div className="skeleton-block" style={{ height: '36px', width: '72%', marginBottom: '18px' }} />
          <div className="skeleton-block" style={{ height: '18px', marginBottom: '10px' }} />
          <div className="skeleton-block" style={{ height: '18px', marginBottom: '10px' }} />
          <div className="skeleton-block" style={{ height: '18px', marginBottom: '10px' }} />
        </div>
        <div className="route-skeleton-main">
          <div className="skeleton-block" style={{ height: '44px', width: '100%', marginBottom: '16px' }} />
          <div className="skeleton-grid-2">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
