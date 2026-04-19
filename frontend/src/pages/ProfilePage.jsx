import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../apiClient';

const ProfilePage = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    repositories: 0,
    publicRepositories: 0,
    totalCommits: 0,
    totalFiles: 0
  });

  useEffect(() => {
    fetchStats();
  }, [user?.id]);

  const fetchStats = async () => {
    try {
      const mineRes = await apiClient.get('/repositories/mine');
      const repos = mineRes.data?.success ? mineRes.data.data : [];
      const totalCommits = repos.reduce((sum, repo) => sum + Number(repo.analytics?.totalCommits || 0), 0);
      const totalFiles = repos.reduce((sum, repo) => sum + Number(repo.analytics?.totalFiles || 0), 0);

      setStats({
        repositories: repos.length,
        publicRepositories: repos.filter((repo) => repo.visibility === 'public').length,
        totalCommits,
        totalFiles
      });
    } catch (error) {
      console.error('Failed to load profile stats:', error);
      setStats({ repositories: 0, publicRepositories: 0, totalCommits: 0, totalFiles: 0 });
    }
  };

  const visibilityCoverage = useMemo(() => {
    if (stats.repositories === 0) return 0;
    return Math.round((stats.publicRepositories / stats.repositories) * 100);
  }, [stats.publicRepositories, stats.repositories]);

  return (
    <div className="page-enter">
      <div className="grid-2">
        {/* Profile Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Profile Information</span>
          </div>
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div className="avatar" style={{
              width: '80px',
              height: '80px',
              fontSize: '24px',
              margin: '0 auto 16px'
            }}>
              {user?.name?.charAt(0) || 'U'}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
              {user?.name || 'User'}
            </h2>
            <p style={{ color: 'var(--text2)', marginBottom: '16px' }}>
              {user?.email || 'user@example.com'}
            </p>
            <span className="badge badge-blue">Account</span>
            
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Member Since</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{formatMemberSince(user?.createdAt)}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Repositories</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{stats.repositories}</div>
              </div>
              <Link to="/settings" className="nav-item" style={{ marginTop: '16px' }}>
                <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="3"/>
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2"/>
                </svg>
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Activity Stats */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Activity Statistics</span>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text2)' }}>Repositories</span>
                <span style={{ fontWeight: '600' }}>{stats.repositories}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${Math.min(stats.repositories * 10, 100)}%`, background: 'var(--accent)' }}></div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text2)' }}>Public Repositories</span>
                <span style={{ fontWeight: '600' }}>{stats.publicRepositories}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${Math.min(stats.publicRepositories * 12, 100)}%`, background: 'var(--red)' }}></div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text2)' }}>Total Commits</span>
                <span style={{ fontWeight: '600' }}>{stats.totalCommits}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${Math.min(stats.totalCommits * 5, 100)}%`, background: 'var(--green)' }}></div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text2)' }}>Public Visibility Ratio</span>
                <span style={{ fontWeight: '600' }}>{visibilityCoverage}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${visibilityCoverage}%`, background: 'var(--yellow)' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatMemberSince(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleString(undefined, {
    month: 'long',
    year: 'numeric'
  });
}

export default ProfilePage;
