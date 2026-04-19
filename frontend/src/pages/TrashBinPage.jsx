import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../apiClient';

const TrashBinPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trashData, setTrashData] = useState([]);
  const [workingKey, setWorkingKey] = useState('');

  const loadTrash = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.get('/repositories/trash-items');
      if (!response.data?.success) {
        throw new Error('Unable to load trash items');
      }

      setTrashData(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError.response?.data?.message || loadError.message || 'Unable to load trash items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const restoreItem = async (repositoryId, trashName) => {
    setWorkingKey(`restore:${repositoryId}:${trashName}`);
    setError('');
    try {
      const response = await apiClient.post(`/repositories/${repositoryId}/trash/restore`, { trashName });
      if (!response.data?.success) {
        throw new Error('Failed to restore item');
      }
      await loadTrash();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || 'Failed to restore item');
    } finally {
      setWorkingKey('');
    }
  };

  const deletePermanently = async (repositoryId, trashName) => {
    const confirmed = window.confirm('Permanently delete this item from trash? This cannot be undone.');
    if (!confirmed) return;

    setWorkingKey(`delete:${repositoryId}:${trashName}`);
    setError('');
    try {
      const response = await apiClient.delete(`/repositories/${repositoryId}/trash/item`, {
        params: { trashName }
      });
      if (!response.data?.success) {
        throw new Error('Failed to permanently delete item');
      }
      await loadTrash();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || 'Failed to permanently delete item');
    } finally {
      setWorkingKey('');
    }
  };

  const emptyRepositoryTrash = async (repositoryId, repositoryName) => {
    const confirmed = window.confirm(`Empty trash for ${repositoryName}? This cannot be undone.`);
    if (!confirmed) return;

    setWorkingKey(`empty:${repositoryId}`);
    setError('');
    try {
      const response = await apiClient.delete(`/repositories/${repositoryId}/trash/empty`);
      if (!response.data?.success) {
        throw new Error('Failed to empty repository trash');
      }
      await loadTrash();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || 'Failed to empty repository trash');
    } finally {
      setWorkingKey('');
    }
  };

  const emptyAllTrash = async () => {
    const confirmed = window.confirm('Empty trash for all repositories? This cannot be undone.');
    if (!confirmed) return;

    setWorkingKey('empty-all');
    setError('');
    try {
      const response = await apiClient.delete('/repositories/trash-items/empty-all');
      if (!response.data?.success) {
        throw new Error('Failed to empty all trash');
      }
      await loadTrash();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || 'Failed to empty all trash');
    } finally {
      setWorkingKey('');
    }
  };

  const totalItems = useMemo(() => {
    return trashData.reduce((sum, repo) => sum + (Array.isArray(repo.items) ? repo.items.length : 0), 0);
  }, [trashData]);

  if (loading) {
    return (
      <div className="page-enter">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '30px', margin: 0, letterSpacing: '-0.02em' }}>Trash Bin</h1>
          <div style={{ color: 'var(--text3)', marginTop: '4px', fontSize: '13px' }}>{totalItems} deleted item(s)</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button type="button" className="btn btn-danger" onClick={emptyAllTrash} disabled={workingKey === 'empty-all' || totalItems === 0}>
            {workingKey === 'empty-all' ? 'Emptying...' : 'Empty Trash'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/repositories')}>
            Back to Repositories
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '12px', borderColor: 'rgba(255,77,106,0.35)', color: 'var(--red)', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: '12px' }}>
        {trashData.map((repo) => {
          const items = Array.isArray(repo.items) ? repo.items : [];
          return (
            <div key={repo.repositoryId} className="card" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '20px', fontFamily: 'var(--mono)' }}>{repo.repositoryName}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => emptyRepositoryTrash(repo.repositoryId, repo.repositoryName)}
                    disabled={workingKey === `empty:${repo.repositoryId}` || items.length === 0}
                  >
                    {workingKey === `empty:${repo.repositoryId}` ? 'Emptying...' : 'Empty Trash'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate(`/repositories/${repo.repositoryId}/explorer`)}
                  >
                    Open Repo
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div style={{ color: 'var(--text3)', fontSize: '13px' }}>Trash is empty for this repository.</div>
              ) : (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {items.map((item) => (
                    <div key={`${repo.repositoryId}-${item.name}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: '10px', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '14px', color: 'var(--text)' }}>{item.originalName || item.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{item.originalPath || item.trashPath}</div>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text2)', textTransform: 'uppercase' }}>{item.type}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{item.deletedAt ? new Date(item.deletedAt).toLocaleString() : 'unknown time'}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-success btn-xs"
                          onClick={() => restoreItem(repo.repositoryId, item.name)}
                          disabled={workingKey === `restore:${repo.repositoryId}:${item.name}`}
                        >
                          {workingKey === `restore:${repo.repositoryId}:${item.name}` ? 'Restoring...' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-xs"
                          onClick={() => deletePermanently(repo.repositoryId, item.name)}
                          disabled={workingKey === `delete:${repo.repositoryId}:${item.name}`}
                        >
                          {workingKey === `delete:${repo.repositoryId}:${item.name}` ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TrashBinPage;
