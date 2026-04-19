import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../apiClient';

const RepositorySetupPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    description: '',
    visibility: 'private'
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (creating) return;

    if (!form.name.trim()) {
      setError('Repository name is required.');
      return;
    }

    if (!['public', 'private'].includes(form.visibility)) {
      setError('Visibility is required.');
      return;
    }

    setCreating(true);
    try {
      const response = await apiClient.post('/repositories', {
        name: form.name.trim(),
        description: form.description.trim(),
        visibility: form.visibility
      });

      if (!response.data?.success || !response.data?.data?.id) {
        throw new Error('Failed to create repository');
      }

      navigate(`/repositories/${response.data.data.id}/explorer`);
    } catch (createError) {
      if (createError.response?.status === 429) {
        setError('Too many requests. Please wait a moment before trying again.');
        return;
      }

      setError(createError.response?.data?.message || createError.message || 'Failed to create repository');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 18px' }}>
      <div className="card" style={{ maxWidth: '840px', margin: '0 auto', padding: '28px' }}>
        <div style={{ marginBottom: '18px' }}>
          <h1 style={{ margin: 0, fontSize: '34px', letterSpacing: '-0.02em' }}>Create Repository</h1>
          <p style={{ margin: '8px 0 0 0', color: 'var(--text2)' }}>
            Create a focused workspace. This page intentionally hides the app sidebar.
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,77,106,0.12)', border: '1px solid rgba(255,77,106,0.24)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Repository Name *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={onChange}
                placeholder="my-repository"
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={onChange}
                placeholder="Optional description"
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Visibility *</label>
              <select
                name="visibility"
                value={form.visibility}
                onChange={onChange}
                required
                style={inputStyle}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '22px', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/repositories')}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const labelStyle = {
  display: 'block',
  marginBottom: '7px',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text)'
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '14px'
};

export default RepositorySetupPage;
