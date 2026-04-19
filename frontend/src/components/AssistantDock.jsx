import React, { useEffect, useState } from 'react';
import apiClient from '../apiClient';

const FALLBACK_MODELS = [
  { name: 'healer' },
  { name: 'hunter' },
  { name: 'nvidia' },
  { name: 'arcee' },
  { name: 'stepfun' },
  { name: 'meta' },
  { name: 'google' },
  { name: 'openai' }
];

const AssistantDock = () => {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(360);
  const [resizing, setResizing] = useState(false);
  const [models, setModels] = useState([]);
  const [modelName, setModelName] = useState('');
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await apiClient.get('/ai/models');
        if (response.data?.success) {
          const list = response.data.data || [];
          if (list.length > 0) {
            setModels(list);
            setModelName((prev) => prev || list[0].name);
            return;
          }
        }
      } catch {
        // Ignore and fallback below.
      }

      setModels(FALLBACK_MODELS);
      setModelName((prev) => prev || FALLBACK_MODELS[0].name);
    };

    loadModels();
  }, []);

  useEffect(() => {
    if (!models.length) return;
    if (!modelName) {
      setModelName(models[0].name);
    }
  }, [models, modelName]);

  useEffect(() => {
    if (!resizing) return undefined;

    const onMove = (event) => {
      const next = Math.max(280, Math.min(720, window.innerWidth - event.clientX));
      setWidth(next);
    };

    const onUp = () => setResizing(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  const askAssistant = async () => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setReply('Prompt sent. Thinking...');
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/ai/assistant-chat', {
        message: trimmed,
        modelName: modelName || undefined
      });

      if (!response.data?.success) {
        throw new Error('Assistant request failed');
      }

      setReply(response.data.data?.reply || 'No response');
      setQuestion('');
    } catch (askError) {
      setError(askError.response?.data?.message || askError.message || 'Assistant is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };

  const handlePromptKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) return;

    event.preventDefault();
    askAssistant();
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen((prev) => !prev)}
        style={{ marginLeft: '8px' }}
      >
        AI Assistant
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            top: '56px',
            right: 0,
            width: `${width}px`,
            height: 'calc(100vh - 56px)',
            background: 'var(--bg2)',
            borderLeft: '1px solid var(--border)',
            zIndex: 1000,
            display: 'grid',
            gridTemplateRows: '44px auto 1fr auto'
          }}
        >
          <div
            onMouseDown={() => setResizing(true)}
            style={{
              position: 'absolute',
              left: '-6px',
              top: 0,
              width: '12px',
              height: '100%',
              cursor: 'col-resize'
            }}
            title="Drag to resize"
          />

          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Assistant</strong>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)}>Close</button>
          </div>

          <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Model</label>
            <select
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }}
            >
              {!modelName && <option value="">Select model</option>}
              {models.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>

          <div style={{ padding: '12px', overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text2)' }}>
            {error && <div style={{ color: 'var(--red)', marginBottom: '8px' }}>{error}</div>}
            {reply || 'Ask anything about programming, DevDock, AI/ML, science, DSA, cybersecurity basics, biology, and technology.'}
          </div>

          <div style={{ padding: '12px', borderTop: '1px solid var(--border)', display: 'grid', gap: '8px' }}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              rows={4}
              placeholder="Ask the assistant..."
              style={{ width: '100%', resize: 'vertical', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}
            />
            <button type="button" className="btn btn-primary" onClick={askAssistant} disabled={loading}>
              {loading ? 'Thinking...' : 'Ask'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AssistantDock;
