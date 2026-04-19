import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../apiClient';

const DEBOUNCE_MS = 350;

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function truncate(text, max = 50) {
  const value = String(text || '').trim();
  if (!value) return 'No description';
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function formatDate(value, withTime = false) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

const Repositories = () => {
  const navigate = useNavigate();

  const [searchMode, setSearchMode] = useState('keyword');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [repositories, setRepositories] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    visibility: 'private',
    collaborate: false,
    collaboratorQuery: '',
    collaboratorPermission: 'write'
  });

  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const response = await apiClient.get('/auth/me');
        setCurrentUser(response.data?.data || null);
      } catch {
        setCurrentUser(null);
      }
    };

    loadCurrentUser();

    const fetchDiscover = async () => {
      setLoading(true);
      setListError('');
      try {
        const response = await apiClient.get('/repositories/discover', {
          params: {
            q: debouncedQuery.trim(),
            mode: searchMode
          }
        });

        setRepositories(response.data?.data || []);
      } catch (error) {
        console.error('Failed to fetch repositories', error);
        const message = error.response?.status === 429
          ? 'Too many requests. Please wait a moment and try again.'
          : error.response?.data?.message || error.message || 'Failed to fetch repositories.';
        setListError(message);
        setRepositories([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDiscover();
  }, [debouncedQuery, searchMode]);

  const deleteRepository = async (repo) => {
    if (!repo?.id) return;

    const expected = `${repo.ownerName || 'owner'}/${repo.name}`;
    const typed = window.prompt(`Type ${expected} or ${repo.name} to confirm deletion:`);
    if (!typed) return;

    const acknowledged = window.confirm('This will permanently delete the repository. Continue?');
    if (!acknowledged) return;

    setDeletingRepoId(repo.id);
    try {
      await apiClient.delete(`/repositories/${repo.id}`, {
        data: {
          confirmText: typed.trim(),
          acknowledgeRisk: true
        }
      });

      setRepositories((prev) => prev.filter((entry) => entry.id !== repo.id));
    } catch (error) {
      window.alert(error.response?.data?.message || 'Failed to delete repository.');
    } finally {
      setDeletingRepoId('');
    }
  };

  const preparedRepositories = useMemo(() => {
    const filtered = repositories.filter((repo) => {
      if (visibilityFilter === 'all') return true;
      return repo.visibility === visibilityFilter;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        return String(a.name || '').localeCompare(String(b.name || ''));
      }

      if (sortBy === 'commits') {
        const commitsA = Number(a.analytics?.totalCommits || 0);
        const commitsB = Number(b.analytics?.totalCommits || 0);
        return commitsB - commitsA;
      }

      const tsA = new Date(a.updatedAt || a.analytics?.lastUpdatedAt || 0).getTime();
      const tsB = new Date(b.updatedAt || b.analytics?.lastUpdatedAt || 0).getTime();
      return tsB - tsA;
    });

    return sorted;
  }, [repositories, visibilityFilter, sortBy]);

  const visibleRepositories = useMemo(() => {
    const limit = viewMode === 'grid' ? 30 : 10;
    return preparedRepositories.slice(0, limit);
  }, [preparedRepositories, viewMode]);

  const submitCreateRepository = async (event) => {
    event.preventDefault();

    if (creating) return;

    if (!form.name.trim()) {
      window.alert('Repository name is required.');
      return;
    }

    setCreating(true);
    try {
      const createResponse = await apiClient.post('/repositories', {
        name: form.name.trim(),
        description: form.description.trim(),
        visibility: form.visibility
      });

      const createdRepo = createResponse.data?.data;
      if (!createdRepo?.id) {
        throw new Error('Repository was created but no id was returned');
      }

      if (form.collaborate && form.collaboratorQuery.trim()) {
        await apiClient.post(`/repositories/${createdRepo.id}/collaborators`, {
          userQuery: form.collaboratorQuery.trim(),
          permission: form.collaboratorPermission
        });
      }

      setShowCreateModal(false);
      setForm({
        name: '',
        description: '',
        visibility: 'private',
        collaborate: false,
        collaboratorQuery: '',
        collaboratorPermission: 'write'
      });
      navigate(`/repositories/${createdRepo.id}/explorer`);
    } catch (error) {
      console.error('Create repository failed', error);
      if (error.response?.status === 429) {
        window.alert('Too many requests. Please wait a moment before creating another repository.');
        return;
      }

      window.alert(error.response?.data?.message || error.message || 'Failed to create repository.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`repo-home ${showCreateModal ? 'modal-active' : ''}`}>
      <div className="repo-home-content page-enter">
        <section className="repo-search-zone card">
          <h1 className="repo-search-title">Find DevDock Repositories</h1>

          {listError && (
            <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,209,102,0.12)', border: '1px solid rgba(255,209,102,0.24)', color: 'var(--yellow)' }}>
              {listError}
            </div>
          )}

          <div className="repo-search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="repo-search-input"
              placeholder="Search repositories by name, description, owner, or language"
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSearchMode((prev) => (prev === 'keyword' ? 'vector' : 'keyword'))}
              title="Toggle between keyword and vector search"
            >
              {searchMode === 'keyword' ? 'Keyword Search' : 'Vector Search'}
            </button>
          </div>

          <div className="repo-controls-row">
            <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)} className="repo-select">
              <option value="all">Filter: All</option>
              <option value="public">Filter: Public</option>
              <option value="private">Filter: Private</option>
            </select>

            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="repo-select">
              <option value="latest">Sort: Latest</option>
              <option value="name">Sort: Name</option>
              <option value="commits">Sort: Commit Count</option>
            </select>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'))}
            >
              {viewMode === 'list' ? 'Grid View' : 'List View'}
            </button>

            <button type="button" className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              Create Your Own Repo
            </button>
          </div>
        </section>

        <section className={`repo-results ${viewMode === 'grid' ? 'grid-mode' : 'list-mode'}`}>
          {loading && (
            <>
              <div className="repo-card skeleton-card" />
              <div className="repo-card skeleton-card" />
              <div className="repo-card skeleton-card" />
            </>
          )}

          {!loading && visibleRepositories.length === 0 && (
            <div className="card repo-empty">No repositories found.</div>
          )}

          {!loading && visibleRepositories.map((repo) => (
            <article className="card repo-card" key={repo.id}>
              <div className="repo-card-head">
                <button type="button" className="repo-name-btn" onClick={() => navigate(`/repositories/${repo.id}/explorer`)}>
                  {repo.name}
                </button>
                <span className={`badge ${repo.visibility === 'public' ? 'badge-blue' : 'badge-gray'}`}>
                  {repo.visibility}
                </span>
              </div>

              <p className="repo-description">{truncate(repo.description, 50)}</p>

              <div className="repo-meta-grid">
                <span>Commits: {repo.analytics?.totalCommits ?? 0}</span>
                <span>Last update: {formatDate(repo.analytics?.lastUpdatedAt || repo.updatedAt)}</span>
                <button
                  type="button"
                  className="owner-link"
                  onClick={() => navigate(`/profile?user=${encodeURIComponent(String(repo.ownerId || ''))}`)}
                >
                  Owner: {repo.ownerName || repo.ownerEmail || 'Unknown'}
                </button>
              </div>

              {currentUser?.id && String(currentUser.id) === String(repo.ownerId) && (
                <div className="repo-owner-actions">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => deleteRepository(repo)}
                    disabled={deletingRepoId === repo.id}
                  >
                    {deletingRepoId === repo.id ? 'Deleting...' : 'Delete Repository'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      </div>

      {showCreateModal && (
        <div className="repo-create-overlay" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="repo-create-card card" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <span className="card-title">Create Repository</span>
            </div>
            <form className="card-body repo-create-form" onSubmit={submitCreateRepository}>
              <input
                className="repo-input"
                placeholder="Repository name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />

              <textarea
                className="repo-input"
                placeholder="Repository description (optional)"
                rows={3}
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />

              <select
                className="repo-input"
                value={form.visibility}
                onChange={(event) => setForm((prev) => ({ ...prev, visibility: event.target.value }))}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>

              <label className="repo-checkbox-row">
                <input
                  type="checkbox"
                  checked={form.collaborate}
                  onChange={(event) => setForm((prev) => ({ ...prev, collaborate: event.target.checked }))}
                />
                Want to collaborate?
              </label>

              {form.collaborate && (
                <>
                  <input
                    className="repo-input"
                    placeholder="Collaborator username or email (DevDock user)"
                    value={form.collaboratorQuery}
                    onChange={(event) => setForm((prev) => ({ ...prev, collaboratorQuery: event.target.value }))}
                  />
                  <select
                    className="repo-input"
                    value={form.collaboratorPermission}
                    onChange={(event) => setForm((prev) => ({ ...prev, collaboratorPermission: event.target.value }))}
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="admin">Admin</option>
                  </select>
                </>
              )}

              <div className="card-footer" style={{ padding: 0, borderTop: 'none' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)} disabled={creating}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create & Open'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Repositories;
