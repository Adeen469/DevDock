import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ensureMonacoEnvironment } from '../monacoSetup';
import Editor from '@monaco-editor/react';
import apiClient from '../apiClient';
import AssistantDock from '../components/AssistantDock';

ensureMonacoEnvironment();

const CONTROLS_PANEL_MIN_HEIGHT = 76;
const CONTROLS_PANEL_MAX_HEIGHT = 236;
const AI_INLINE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'go', 'ruby', 'php', 'json', 'html', 'css', 'sql', 'yaml', 'markdown', 'shell', 'powershell', 'plaintext'];
const DRAFT_STORAGE_PREFIX = 'devdock-last-edit';

function buildDraftStorageKey(repoId, filePath) {
  return `${DRAFT_STORAGE_PREFIX}:${repoId}:${filePath}`;
}

function saveLocalDraft(repoId, filePath, value) {
  if (!repoId || !filePath) return;

  const payload = {
    content: String(value || ''),
    savedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(buildDraftStorageKey(repoId, filePath), JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

function readLocalDraft(repoId, filePath) {
  if (!repoId || !filePath) return null;

  try {
    const raw = localStorage.getItem(buildDraftStorageKey(repoId, filePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.content !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearLocalDraft(repoId, filePath) {
  if (!repoId || !filePath) return;

  try {
    localStorage.removeItem(buildDraftStorageKey(repoId, filePath));
  } catch {
    // Ignore storage failures.
  }
}

function suggestLocalInlineCompletion(language, linePrefix, lineSuffix) {
  const lang = String(language || '').toLowerCase();
  const before = String(linePrefix || '');
  const after = String(lineSuffix || '');
  const trimmed = before.trim();

  if (!trimmed) {
    return '';
  }

  const semicolonLanguages = new Set(['javascript', 'typescript']);
  if (!semicolonLanguages.has(lang)) {
    return '';
  }

  if (trimmed.endsWith(';') || after.trimStart().startsWith(';')) {
    return '';
  }

  const looksLikeImport = /^import\s+.+\s+from\s+['"][^'"]+['"]$/.test(trimmed);
  const looksLikeExportFrom = /^export\s+.+\s+from\s+['"][^'"]+['"]$/.test(trimmed);
  if (looksLikeImport || looksLikeExportFrom) {
    return ';';
  }

  return '';
}

function sanitizeInlineCompletion(raw, language) {
  const lang = String(language || '').toLowerCase();
  let text = String(raw || '')
    .replace(/^```[a-zA-Z]*\s*/g, '')
    .replace(/```$/g, '')
    .replace(/\r/g, '')
    .trimStart();

  if (!text.trim()) {
    return '';
  }

  const firstLine = text.split('\n')[0] || '';

  // Reject narrative-like completions in inline mode.
  if (/^(Here|Use|You|This|Add|Then)\b/i.test(firstLine)) {
    return '';
  }

  // Keep inline AI completion short and focused.
  if (text.length > 180) {
    text = firstLine;
  }

  if (lang === 'javascript' || lang === 'typescript') {
    // Avoid low-quality English word completions where punctuation is expected.
    if (/^[A-Za-z]+\s*$/.test(firstLine) && firstLine.length <= 12) {
      return '';
    }
  }

  return text;
}

function getPermissionLevel(repository, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!repository || !normalizedUserId) return 'read';
  if (String(repository.ownerId || '') === normalizedUserId) return 'owner';

  const collaborators = Array.isArray(repository.collaborators) ? repository.collaborators : [];
  const found = collaborators.find((entry) => String(entry?.userId || '') === normalizedUserId);
  return found?.permission || 'read';
}

const RepoExplorer = () => {
  const { id } = useParams();

  const [repository, setRepository] = useState(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [tree, setTree] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [fileData, setFileData] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [controlsPanelHeight, setControlsPanelHeight] = useState(174);
  const [isResizingControls, setIsResizingControls] = useState(false);
  const [runJobId, setRunJobId] = useState(null);
  const [runStatus, setRunStatus] = useState('idle');
  const [runningAction, setRunningAction] = useState(false);
  const [showErrorPanel, setShowErrorPanel] = useState(true);
  const [uploadingItems, setUploadingItems] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [newItemType, setNewItemType] = useState('file');
  const [newItemPath, setNewItemPath] = useState('');
  const [newItemContent, setNewItemContent] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [docxInitialHtml, setDocxInitialHtml] = useState('');
  const [docxDraft, setDocxDraft] = useState('');
  const [securityScan, setSecurityScan] = useState({ loading: false, findings: [], riskLevel: 'low', aiSummary: '' });
  const [draggingPath, setDraggingPath] = useState('');
  const [dropTargetPath, setDropTargetPath] = useState('');
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    node: null
  });
  const [activeNode, setActiveNode] = useState(null);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [clipboardItem, setClipboardItem] = useState(() => {
    try {
      const raw = localStorage.getItem('repo_explorer_clipboard');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const filesInputRef = useRef(null);
  const foldersInputRef = useRef(null);
  const quickOpenInputRef = useRef(null);
  const aiInlineProviderRef = useRef(null);
  const aiInlineLastRef = useRef({ ts: 0, key: '' });
  const aiInlineCacheRef = useRef(new Map());
  const isEditModeRef = useRef(false);
  const selectedFilePathRef = useRef('');

  const isDocxBinary = isDocxFileData(fileData, selectedFilePath) && fileData?.encoding === 'base64';
  const permissionLevel = useMemo(() => getPermissionLevel(repository, currentUserId), [repository, currentUserId]);
  const canWrite = permissionLevel === 'owner' || permissionLevel === 'admin' || permissionLevel === 'write';
  const dirty = isDocxBinary
    ? isEditMode && docxDraft !== docxInitialHtml
    : fileData?.editable && fileData?.encoding === 'utf8' && draft !== fileData.content;

  useEffect(() => {
    if (canWrite) return;
    setIsEditMode(false);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, [canWrite]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = 'You have unsaved repository changes.';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!selectedFilePath || !fileData?.editable || fileData?.encoding !== 'utf8') {
      return;
    }

    const timer = window.setTimeout(() => {
      if (dirty) {
        saveLocalDraft(id, selectedFilePath, draft);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [id, selectedFilePath, fileData, draft, dirty]);

  useEffect(() => {
    isEditModeRef.current = isEditMode;
  }, [isEditMode]);

  useEffect(() => {
    selectedFilePathRef.current = selectedFilePath;
  }, [selectedFilePath]);

  useEffect(() => {
    return () => {
      if (aiInlineProviderRef.current) {
        aiInlineProviderRef.current.dispose();
        aiInlineProviderRef.current = null;
      }
    };
  }, []);

  const handleEditorMount = (_, monacoInstance) => {
    if (aiInlineProviderRef.current) {
      aiInlineProviderRef.current.dispose();
      aiInlineProviderRef.current = null;
    }

    aiInlineProviderRef.current = monacoInstance.languages.registerInlineCompletionsProvider(AI_INLINE_LANGUAGES, {
      provideInlineCompletions: async (model, position, _context, token) => {
        if (!isEditModeRef.current) {
          return { items: [] };
        }

        const currentLanguage = model.getLanguageId();
        if (!AI_INLINE_LANGUAGES.includes(currentLanguage)) {
          return { items: [] };
        }

        const currentLine = model.getLineContent(position.lineNumber);
        const linePrefix = currentLine.slice(0, Math.max(0, position.column - 1));
        const lineSuffix = currentLine.slice(Math.max(0, position.column - 1));

        const localCompletion = suggestLocalInlineCompletion(currentLanguage, linePrefix, lineSuffix);
        if (localCompletion) {
          return {
            items: [
              {
                insertText: localCompletion,
                range: new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, position.column)
              }
            ]
          };
        }

        const prefixRange = {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        };
        const prefixText = model.getValueInRange(prefixRange);
        if (!prefixText || prefixText.trim().length < 12) {
          return { items: [] };
        }

        const suffixRange = {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: model.getLineCount(),
          endColumn: model.getLineMaxColumn(model.getLineCount())
        };
        const suffixText = model.getValueInRange(suffixRange);

        const prefixTail = prefixText.slice(-600);
        const suffixHead = suffixText.slice(0, 200);
        const key = `${currentLanguage}|${prefixTail}|${suffixHead}`;

        if (aiInlineCacheRef.current.has(key)) {
          const cached = aiInlineCacheRef.current.get(key);
          if (!cached) {
            return { items: [] };
          }

          return {
            items: [
              {
                insertText: cached,
                range: new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, position.column)
              }
            ]
          };
        }

        const now = Date.now();
        if (now - aiInlineLastRef.current.ts < 900 && aiInlineLastRef.current.key !== key) {
          return { items: [] };
        }

        aiInlineLastRef.current = { ts: now, key };

        try {
          const response = await apiClient.post('/ai/code-complete', {
            prefix: prefixText.slice(-4000),
            suffix: suffixText.slice(0, 1000),
            language: currentLanguage,
            filePath: selectedFilePathRef.current || '',
            maxTokens: 60
          });

          if (token.isCancellationRequested) {
            return { items: [] };
          }

          const completion = sanitizeInlineCompletion(response.data?.data?.completion || '', currentLanguage);
          if (!completion.trim()) {
            aiInlineCacheRef.current.set(key, '');
            return { items: [] };
          }

          aiInlineCacheRef.current.set(key, completion);
          return {
            items: [
              {
                insertText: completion,
                range: new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, position.column)
              }
            ]
          };
        } catch {
          return { items: [] };
        }
      },
      freeInlineCompletions: () => {}
    });
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const [repoResponse, treeResponse, meResponse] = await Promise.all([
          apiClient.get(`/repositories/${id}`),
          apiClient.get(`/repositories/${id}/file-tree`, { params: { maxDepth: 8, maxEntries: 3000 } }),
          apiClient.get('/auth/me')
        ]);

        if (!repoResponse.data.success || !treeResponse.data.success) {
          throw new Error('Unable to load repository explorer');
        }

        const nextRepo = repoResponse.data.data;
        const nextTree = treeResponse.data.data?.tree || null;
        const userId = String(meResponse.data?.data?.id || '').trim();

        setRepository(nextRepo);
        setTree(nextTree);
        setCurrentUserId(userId);

        const firstFile = findFirstFilePath(nextTree);
        if (firstFile !== null) {
          setSelectedFilePath(firstFile);
          await loadFile(firstFile);
        }

        if (nextTree?.type === 'directory') {
          const roots = new Set([nextTree.path || '']);
          setExpanded(roots);
        }
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || err.message || 'Failed to load repository explorer');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  useEffect(() => {
    const scanRepo = async () => {
      setSecurityScan((prev) => ({ ...prev, loading: true }));
      try {
        const response = await apiClient.get(`/repositories/${id}/security-scan`);
        if (response.data?.success) {
          const payload = response.data.data || {};
          setSecurityScan({
            loading: false,
            findings: Array.isArray(payload.findings) ? payload.findings : [],
            riskLevel: payload.riskLevel || 'low',
            aiSummary: payload.aiSummary || ''
          });
        } else {
          setSecurityScan({ loading: false, findings: [], riskLevel: 'low', aiSummary: '' });
        }
      } catch {
        setSecurityScan({ loading: false, findings: [], riskLevel: 'low', aiSummary: '' });
      }
    };

    scanRepo();
  }, [id]);

  useEffect(() => {
    if (!isResizing) return undefined;

    const handleMouseMove = (event) => {
      const nextWidth = Math.max(240, Math.min(620, event.clientX));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!isResizingControls) return undefined;

    const handleMouseMove = (event) => {
      const min = CONTROLS_PANEL_MIN_HEIGHT;
      const max = CONTROLS_PANEL_MAX_HEIGHT;
      const viewportTop = 56;
      const next = Math.max(min, Math.min(max, event.clientY - viewportTop));
      setControlsPanelHeight(next);
    };

    const handleMouseUp = () => setIsResizingControls(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingControls]);

  useEffect(() => {
    if (!runJobId) return undefined;

    const timer = setInterval(async () => {
      try {
        const statusResponse = await apiClient.get(`/repositories/${id}/run/${runJobId}/status`);

        if (statusResponse.data.success) {
          const data = statusResponse.data.data;
          setRunStatus(data.status || 'idle');
        }
      } catch (pollError) {
        console.error(pollError);
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [id, runJobId]);

  useEffect(() => {
    if (!error) return;
    setShowErrorPanel(true);
  }, [error]);

  useEffect(() => {
    const hideContextMenu = () => setContextMenu((prev) => ({ ...prev, visible: false }));
    window.addEventListener('click', hideContextMenu);
    window.addEventListener('scroll', hideContextMenu);
    return () => {
      window.removeEventListener('click', hideContextMenu);
      window.removeEventListener('scroll', hideContextMenu);
    };
  }, []);

  useEffect(() => {
    try {
      if (!clipboardItem) {
        localStorage.removeItem('repo_explorer_clipboard');
        return;
      }
      localStorage.setItem('repo_explorer_clipboard', JSON.stringify(clipboardItem));
    } catch {
      // Ignore localStorage failures.
    }
  }, [clipboardItem]);

  const flatTreeCount = useMemo(() => countNodes(tree), [tree]);
  const repositoryFiles = useMemo(() => collectFilePaths(tree), [tree]);
  const filteredQuickOpenFiles = useMemo(() => {
    const query = quickOpenQuery.trim().toLowerCase();
    if (!query) {
      return repositoryFiles.slice(0, 40);
    }

    return repositoryFiles
      .filter((entry) => entry.toLowerCase().includes(query))
      .slice(0, 60);
  }, [quickOpenQuery, repositoryFiles]);

  useEffect(() => {
    if (!quickOpenVisible) return;
    setTimeout(() => {
      quickOpenInputRef.current?.focus();
    }, 0);
  }, [quickOpenVisible]);

  const refreshTree = async () => {
    const treeResponse = await apiClient.get(`/repositories/${id}/file-tree`, { params: { maxDepth: 8, maxEntries: 3000 } });
    if (!treeResponse.data.success) {
      throw new Error('Unable to refresh repository tree');
    }
    setTree(treeResponse.data.data?.tree || null);
  };

  const loadFile = async (filePath) => {
    setLoadingFile(true);
    setError('');

    try {
      const response = await apiClient.get(`/repositories/${id}/file`, {
        params: { filePath }
      });

      if (!response.data.success) {
        throw new Error('Unable to load file content');
      }

      setFileData(response.data.data);
      setDocxInitialHtml('');
      setDocxDraft('');
      if (response.data.data.encoding === 'utf8') {
        const serverText = response.data.data.content || '';
        const localDraft = readLocalDraft(id, filePath);
        if (localDraft && localDraft.content !== serverText) {
          const recover = window.confirm('A newer local draft exists for this file. Recover it?');
          setDraft(recover ? localDraft.content : serverText);
        } else {
          setDraft(serverText);
        }
        setIsEditMode(false);
      } else {
        setDraft('');
        setIsEditMode(false);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Failed to load file');
      setFileData(null);
    } finally {
      setLoadingFile(false);
    }
  };

  const openFile = async (filePath) => {
    if (dirty) {
      const confirmed = window.confirm('You have unsaved changes. Continue without saving?');
      if (!confirmed) return;
    }

    const flagged = securityScan.findings.find((item) => item.filePath === filePath);
    if (flagged) {
      const allowed = window.confirm(`Security warning: this file was flagged (${flagged.reason}). Do you still want to open it?`);
      if (!allowed) return;
    }

    setSelectedFilePath(filePath);
    setActiveNode({ path: filePath, type: 'file', name: pathBaseName(filePath) });
    await loadFile(filePath);
  };

  const toggleFolder = (folderPath) => {
    setActiveNode({ path: folderPath, type: 'directory', name: pathBaseName(folderPath) || repository?.name || 'root' });
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    if (!selectedFilePath || !fileData?.editable) return;

    setSaving(true);
    setError('');

    try {
      let payload;
      if (isDocxFileData(fileData, selectedFilePath) && fileData.encoding === 'base64') {
        payload = {
          filePath: selectedFilePath,
          content: docxDraft,
          contentFormat: 'docx-html'
        };
      } else if (fileData.encoding === 'utf8') {
        payload = {
          filePath: selectedFilePath,
          content: draft
        };
      } else {
        throw new Error('This file type cannot be saved in current mode');
      }

      const response = await apiClient.put(`/repositories/${id}/file`, payload);

      if (!response.data.success) {
        throw new Error('Failed to save file');
      }

      if (isDocxFileData(fileData, selectedFilePath)) {
        setDocxInitialHtml(docxDraft);
      } else {
        setFileData((prev) => prev ? { ...prev, content: draft } : prev);
        clearLocalDraft(id, selectedFilePath);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async () => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    if (!fileData?.editable || fileData.encoding !== 'utf8') {
      setError('Only editable text files can be saved as new files.');
      return;
    }

    const suggested = selectedFilePath || 'src/new-file.txt';
    const targetPath = window.prompt('Save As: enter repository path', suggested);
    if (!targetPath || !targetPath.trim()) {
      return;
    }

    const normalized = normalizeDirPath(targetPath);
    if (!normalized) {
      setError('Invalid target path for Save As.');
      return;
    }

    if (normalized === selectedFilePath) {
      await handleSave();
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await apiClient.post(`/repositories/${id}/workspace/create-item`, {
        itemType: 'file',
        targetPath: normalized,
        content: draft
      });

      if (!response.data?.success) {
        throw new Error('Failed to save as new file');
      }

      await refreshTree();
      await openFile(normalized);
    } catch (saveAsError) {
      console.error(saveAsError);
      setError(saveAsError.response?.data?.message || saveAsError.message || 'Failed to save file as new path');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedFilePath && selectedFilePath !== '') return;

    try {
      const response = await apiClient.get(`/repositories/${id}/file/download`, {
        params: { filePath: selectedFilePath },
        responseType: 'blob'
      });

      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = selectedFilePath ? selectedFilePath.split('/').pop() : 'repository-file';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Failed to download file');
    }
  };

  const handleRun = async () => {
    await startRunRequest(`/repositories/${id}/run`, { mode: 'repository' });
  };

  const handleRunFile = async () => {
    if (!selectedFilePath) {
      setError('Select a file first to run that file.');
      return;
    }

    await startRunRequest(`/repositories/${id}/run-file`, { filePath: selectedFilePath });
  };

  const startRunRequest = async (endpoint, payload) => {
    setRunningAction(true);

    try {
      const response = await apiClient.post(endpoint, payload);
      if (!response.data.success) {
        throw new Error('Failed to start run');
      }

      const runData = response.data.data;
      setRunJobId(runData.jobId);
      setRunStatus(runData.status || 'queued');

      const outputUrl = `${window.location.origin}/repositories/${id}/run/${runData.jobId}/output`;
      window.open(outputUrl, '_blank', 'noopener,noreferrer');
    } catch (runError) {
      console.error(runError);
      setError(runError.response?.data?.message || runError.message || 'Failed to start run');
    } finally {
      setRunningAction(false);
    }
  };

  const handleStopRun = async () => {
    if (!runJobId) return;

    setRunningAction(true);
    try {
      await apiClient.post(`/repositories/${id}/run/${runJobId}/stop`);
      setRunStatus('stopped');
    } catch (stopError) {
      console.error(stopError);
      setError(stopError.response?.data?.message || stopError.message || 'Failed to stop run');
    } finally {
      setRunningAction(false);
    }
  };

  const handleUploadItems = async (fileList, destinationDir = '') => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    const files = Array.from(fileList || []);
    if (!files.length) return;

    setUploadingItems(true);
    setError('');

    try {
      const formData = new FormData();
      const relativePaths = [];

      const normalizedDestination = normalizeDirPath(destinationDir);

      files.forEach((file) => {
        formData.append('files', file);
        const relativePath = file.webkitRelativePath || file.name;
        relativePaths.push(normalizedDestination ? `${normalizedDestination}/${relativePath}` : relativePath);
      });

      formData.append('relativePaths', JSON.stringify(relativePaths));

      const response = await apiClient.post(`/repositories/${id}/workspace/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!response.data?.success) {
        throw new Error('Failed to upload files/folders');
      }

      await refreshTree();
    } catch (uploadError) {
      console.error(uploadError);
      setError(uploadError.response?.data?.message || uploadError.message || 'Failed to upload files/folders');
    } finally {
      setUploadingItems(false);
      if (filesInputRef.current) filesInputRef.current.value = '';
      if (foldersInputRef.current) foldersInputRef.current.value = '';
    }
  };

  const handleCreateItem = async () => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    if (!newItemPath.trim()) {
      setError('Path is required to create a file or folder');
      return;
    }

    setCreatingItem(true);
    setError('');

    try {
      const response = await apiClient.post(`/repositories/${id}/workspace/create-item`, {
        itemType: newItemType,
        targetPath: newItemPath.trim(),
        content: newItemType === 'file' ? newItemContent : ''
      });

      if (!response.data?.success) {
        throw new Error('Failed to create item');
      }

      setNewItemPath('');
      setNewItemContent('');
      await refreshTree();
    } catch (createError) {
      console.error(createError);
      setError(createError.response?.data?.message || createError.message || 'Failed to create item');
    } finally {
      setCreatingItem(false);
    }
  };

  const handleCommit = async () => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    setCommitting(true);
    setError('');

    try {
      const response = await apiClient.post(`/repositories/${id}/workspace/commit`, {
        message: commitMessage.trim()
      });

      if (!response.data?.success) {
        throw new Error('Failed to commit changes');
      }

      setCommitMessage('');
      await refreshTree();
    } catch (commitError) {
      console.error(commitError);
      setError(commitError.response?.data?.message || commitError.message || 'Failed to commit changes');
    } finally {
      setCommitting(false);
    }
  };

  const copyItem = async (node, cut = false) => {
    if (cut && !canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    if (!node?.path && node?.path !== '') return;

    const payload = {
      mode: cut ? 'cut' : 'copy',
      repoId: id,
      path: node.path || '',
      type: node.type,
      name: node.name
    };

    setClipboardItem(payload);
    setContextMenu((prev) => ({ ...prev, visible: false }));

    try {
      if (!cut && node.type === 'file') {
        const response = await apiClient.get(`/repositories/${id}/file`, {
          params: { filePath: node.path || '' }
        });
        const data = response.data?.data;
        if (data?.encoding === 'utf8' && typeof data.content === 'string') {
          await navigator.clipboard.writeText(data.content);
          return;
        }
      }

      await navigator.clipboard.writeText(payload.path || payload.name || '');
    } catch {
      // Clipboard can be blocked by browser permissions.
    }
  };

  const deleteItem = async (node, permanent = false) => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    if (!node?.path && node?.path !== '') return;

    const confirmMessage = permanent
      ? `Permanently delete ${node.type} "${node.name}"? This cannot be undone.`
      : `Move ${node.type} "${node.name}" to trash?`;
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    try {
      await apiClient.delete(`/repositories/${id}/workspace/item`, {
        params: { targetPath: node.path || '', permanent }
      });

      if ((node.path || '') === selectedFilePath) {
        setSelectedFilePath('');
        setFileData(null);
      }

      setContextMenu((prev) => ({ ...prev, visible: false }));
      await refreshTree();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || `Failed to ${permanent ? 'permanently delete' : 'move item to trash'}`);
    }
  };

  const restoreTrashItem = async (node) => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    const nodePath = String(node?.path || '').replace(/\\/g, '/');
    if (!nodePath.startsWith('.trash/')) {
      setError('Selected item is not in trash.');
      return;
    }

    const trashName = nodePath.slice('.trash/'.length);
    if (!trashName) {
      setError('Invalid trash item path.');
      return;
    }

    try {
      const response = await apiClient.post(`/repositories/${id}/trash/restore`, { trashName });
      if (!response.data?.success) {
        throw new Error('Failed to restore item');
      }

      if ((node.path || '') === selectedFilePath) {
        setSelectedFilePath('');
        setFileData(null);
      }

      setContextMenu((prev) => ({ ...prev, visible: false }));
      await refreshTree();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || 'Failed to restore item');
    }
  };

  const renameItem = async (node) => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    if (!node?.path && node?.path !== '') return;

    const currentPath = node.path || '';
    const currentName = node.name || '';
    const nextName = window.prompt('Rename to:', currentName);
    if (!nextName || nextName.trim() === '' || nextName.trim() === currentName) {
      return;
    }

    const parentDir = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '';
    const targetPath = parentDir ? `${parentDir}/${nextName.trim()}` : nextName.trim();

    try {
      await apiClient.post(`/repositories/${id}/workspace/rename`, {
        sourcePath: currentPath,
        targetPath
      });

      if (selectedFilePath === currentPath && node.type === 'file') {
        setSelectedFilePath(targetPath);
      }

      setContextMenu((prev) => ({ ...prev, visible: false }));
      await refreshTree();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || 'Failed to rename item');
    }
  };

  const moveItemPrompt = async (node) => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    if (!node?.path && node?.path !== '') return;

    const destinationDir = window.prompt('Move to directory path (blank for root):', '');
    if (destinationDir === null) return;

    try {
      await apiClient.post(`/repositories/${id}/workspace/move`, {
        sourcePath: node.path || '',
        destinationDir: normalizeDirPath(destinationDir)
      });

      setContextMenu((prev) => ({ ...prev, visible: false }));
      await refreshTree();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || 'Failed to move item');
    }
  };

  const pasteInto = async (targetNode) => {
    if (!canWrite) {
      setError('You have read-only access to this repository.');
      return;
    }

    if (!clipboardItem) {
      setError('Clipboard is empty. Use copy or cut first.');
      return;
    }

    if (clipboardItem.repoId !== id) {
      setError('Cross-repository paste is not available in this browser sandbox.');
      return;
    }

    const destinationDir = targetNode?.type === 'directory'
      ? (targetNode.path || '')
      : normalizeDirPath(targetNode?.path || '');

    try {
      if (clipboardItem.mode === 'cut') {
        await apiClient.post(`/repositories/${id}/workspace/move`, {
          sourcePath: clipboardItem.path,
          destinationDir
        });
        setClipboardItem(null);
      } else {
        await apiClient.post(`/repositories/${id}/workspace/copy`, {
          sourcePath: clipboardItem.path,
          destinationDir
        });
      }

      setContextMenu((prev) => ({ ...prev, visible: false }));
      await refreshTree();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError.response?.data?.message || actionError.message || 'Failed to paste item');
    }
  };

  const handleNodeContextMenu = (event, node) => {
    if (!canWrite) return;

    event.preventDefault();
    setActiveNode(node);
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      node
    });
  };

  const handleQuickOpenSelect = async (filePath) => {
    setQuickOpenVisible(false);
    setQuickOpenQuery('');
    await openFile(filePath);
  };

  const handleShortcutDelete = async (permanent) => {
    const target = contextMenu.visible && contextMenu.node
      ? contextMenu.node
      : activeNode;

    if (!target) {
      setError('Select a file or folder first.');
      return;
    }

    if (isTrashPath(target.path || '')) {
      await deleteItem(target, true);
      return;
    }

    await deleteItem(target, permanent);
  };

  useEffect(() => {
    const isTypingElement = (element) => {
      if (!element) return false;
      const tagName = String(element.tagName || '').toLowerCase();
      return element.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    };

    const onKeyDown = async (event) => {
      const lowerKey = String(event.key || '').toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

      if (ctrlOrMeta && lowerKey === 's') {
        if (!canWrite) return;
        event.preventDefault();
        if (event.shiftKey) {
          await handleSaveAs();
        } else {
          await handleSave();
        }
        return;
      }

      if (ctrlOrMeta && lowerKey === 'o') {
        event.preventDefault();
        if (event.shiftKey) {
          filesInputRef.current?.click();
        } else {
          setQuickOpenVisible(true);
        }
        return;
      }

      if (lowerKey === 'delete' && !ctrlOrMeta && !event.altKey) {
        if (!canWrite) return;
        if (isTypingElement(document.activeElement)) {
          return;
        }
        event.preventDefault();
        await handleShortcutDelete(event.shiftKey);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextMenu.visible, contextMenu.node, activeNode, handleSave, handleSaveAs, canWrite]);

  const handleTreeDrop = async (event, targetNode) => {
    if (!canWrite) return;

    event.preventDefault();
    setDropTargetPath('');

    const transferPath = event.dataTransfer.getData('text/devdock-path');
    if (transferPath) {
      if (transferPath === (targetNode?.path || '')) {
        return;
      }
      try {
        await apiClient.post(`/repositories/${id}/workspace/move`, {
          sourcePath: transferPath,
          destinationDir: targetNode?.type === 'directory' ? (targetNode.path || '') : ''
        });
        await refreshTree();
      } catch (moveError) {
        console.error(moveError);
        setError(moveError.response?.data?.message || moveError.message || 'Failed to move dropped item');
      }
      return;
    }

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const destinationDir = targetNode?.type === 'directory' ? (targetNode.path || '') : '';
      await handleUploadItems(event.dataTransfer.files, destinationDir);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '70vh' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app" style={{ height: '100vh' }}>
      <aside className="sidebar" style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}>
        <div className="sidebar-logo" style={{ paddingBottom: '12px' }}>
          <div className="logo-icon">RE</div>
          <div className="logo-text">Repo<span>Explorer</span></div>
        </div>

        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)' }}>{repository?.name || 'Repository'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>{repository?.description || 'No description provided'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{flatTreeCount} files/folders indexed</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
            Last update: {repository?.updatedAt ? new Date(repository.updatedAt).toLocaleString() : 'N/A'}
          </div>
          {securityScan.loading && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text3)' }}>AI security scan in progress...</div>
          )}
          {!securityScan.loading && securityScan.findings.length > 0 && (
            <div style={{ marginTop: '8px', padding: '7px 8px', borderRadius: '8px', background: securityScan.riskLevel === 'high' ? 'rgba(255,77,106,0.18)' : 'rgba(255,209,102,0.16)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: securityScan.riskLevel === 'high' ? 'var(--red)' : 'var(--yellow)' }}>
                Warning: potential malicious code detected ({securityScan.findings.length})
              </div>
            </div>
          )}
        </div>

        <nav
          className="sidebar-nav"
          style={{ padding: '8px' }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleTreeDrop(event, { type: 'directory', path: '' })}
        >
          {!tree && <div style={{ color: 'var(--text2)', fontSize: '13px', padding: '8px' }}>No files found.</div>}

          {tree && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {renderNodes({
                node: tree,
                depth: 0,
                expanded,
                selectedFilePath,
                onToggleFolder: toggleFolder,
                onOpenFile: openFile,
                onSelectNode: setActiveNode,
                onContextMenu: handleNodeContextMenu,
                onDragStart: (event, nodePath) => {
                  setDraggingPath(nodePath || '');
                  event.dataTransfer.setData('text/devdock-path', nodePath || '');
                  event.dataTransfer.effectAllowed = 'move';
                },
                onDragEnd: () => {
                  setDraggingPath('');
                  setDropTargetPath('');
                },
                onDragOverNode: (event, nodePath) => {
                  event.preventDefault();
                  setDropTargetPath(nodePath || '');
                },
                onDropNode: handleTreeDrop,
                draggingPath,
                dropTargetPath
              })}
            </ul>
          )}
        </nav>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={() => setIsResizing(true)}
        onDoubleClick={() => setSidebarWidth(320)}
        style={{
          width: '8px',
          cursor: 'col-resize',
          background: isResizing ? 'rgba(0,212,255,0.25)' : 'transparent',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)'
        }}
        title="Drag to resize sidebar, double-click to reset"
      />

      <div className="main" style={{ overflow: 'hidden' }}>
        <header className="topbar" style={{ justifyContent: 'space-between', gap: '12px' }}>
          <div className="topbar-title">Repository Explorer</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{selectedFilePath || 'Select a file from the file tree'}</div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsEditMode((prev) => !prev)}
              disabled={!canWrite || !fileData || !fileData.editable || (fileData.encoding !== 'utf8' && !isDocxFileData(fileData, selectedFilePath))}
              title={isEditMode ? 'Switch to view mode' : 'Enable edit mode'}
            >
              {isEditMode ? '✎ Editing' : '✎ Edit'}
            </button>
            <button className="btn btn-ghost" onClick={handleDownload} disabled={!fileData}>
              Download File
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!canWrite || !isEditMode || !dirty || saving}>
              {saving ? 'Saving...' : 'Save File'}
            </button>
            <AssistantDock />
          </div>
        </header>

        {canWrite ? (
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)',
            height: `${controlsPanelHeight}px`,
            overflow: 'auto'
          }}
        >
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => filesInputRef.current?.click()}
                disabled={uploadingItems}
              >
                {uploadingItems ? 'Uploading...' : 'Upload Files'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => foldersInputRef.current?.click()}
                disabled={uploadingItems}
              >
                {uploadingItems ? 'Uploading...' : 'Upload Folder'}
              </button>

              <select value={newItemType} onChange={(event) => setNewItemType(event.target.value)} style={{ ...miniInputStyle, width: '120px' }}>
                <option value="file">File</option>
                <option value="folder">Folder</option>
              </select>
              <input
                type="text"
                value={newItemPath}
                onChange={(event) => setNewItemPath(event.target.value)}
                placeholder={newItemType === 'file' ? 'src/new-file.txt' : 'src/new-folder'}
                style={{ ...miniInputStyle, minWidth: '260px', flex: 1 }}
              />
              <button type="button" className="btn btn-primary" onClick={handleCreateItem} disabled={creatingItem}>
                {creatingItem ? 'Creating...' : `Create ${newItemType === 'file' ? 'File' : 'Folder'}`}
              </button>
            </div>

            {newItemType === 'file' && (
              <textarea
                value={newItemContent}
                onChange={(event) => setNewItemContent(event.target.value)}
                placeholder="Initial file content (optional)"
                rows={3}
                style={{ ...miniInputStyle, resize: 'vertical' }}
              />
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Commit message (optional)"
                style={{ ...miniInputStyle, minWidth: '260px', flex: 1 }}
              />
              <button type="button" className="btn btn-success" onClick={handleCommit} disabled={committing}>
                {committing ? 'Committing...' : 'Commit Changes'}
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                Visibility: {repository?.visibility || 'private'}
              </span>
            </div>

            <input
              ref={filesInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => handleUploadItems(event.target.files)}
            />
            <input
              ref={foldersInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => handleUploadItems(event.target.files)}
              {...{ webkitdirectory: '', directory: '' }}
            />
          </div>
        </div>
        ) : (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: '13px' }}>
            Read-only access: only owner or collaborators with write/admin permission can alter repository content.
          </div>
        )}

        {canWrite && (
          <div
            role="separator"
            aria-orientation="horizontal"
            onMouseDown={() => setIsResizingControls(true)}
            style={{
              height: '8px',
              cursor: 'row-resize',
              background: isResizingControls ? 'rgba(0,212,255,0.22)' : 'transparent',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)'
            }}
            title="Drag to resize controls panel"
          />
        )}

        <main className="content" style={{ overflow: 'auto', minHeight: 0 }}>
          {error && showErrorPanel && (
            <div style={{ marginBottom: '10px', padding: '10px', border: '1px solid rgba(255,77,106,0.35)', borderRadius: '8px', color: 'var(--red)', background: 'rgba(255,77,106,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div>{error}</div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowErrorPanel(false)}
                  aria-label="Close error panel"
                  title="Close"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {loadingFile && <div style={{ color: 'var(--text2)' }}>Loading file...</div>}

          {!loadingFile && !fileData && (
            <div style={{ color: 'var(--text2)' }}>Select a file from the left sidebar.</div>
          )}

          {!loadingFile && fileData && fileData.encoding === 'utf8' && (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{selectedFilePath || '(root file)'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: runStatus === 'running' ? 'var(--green)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {runStatus}
                  </div>
                  {runStatus === 'running' || runStatus === 'detecting' || runStatus === 'queued' ? (
                    <button className="btn btn-danger btn-sm" onClick={handleStopRun} disabled={runningAction}>
                      Stop
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-success btn-sm" onClick={handleRun} disabled={runningAction}>
                        {runningAction ? 'Starting...' : 'Run Repository'}
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={handleRunFile} disabled={runningAction || !selectedFilePath}>
                        {runningAction ? 'Starting...' : 'Run File'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {fileData.editable ? (
                <div style={{ display: 'grid', gridTemplateRows: 'minmax(280px, 1fr)', gap: '10px' }}>
                  {isCsvPath(selectedFilePath) && (!isEditMode || !canWrite) ? (
                    <CsvTablePreview text={draft} />
                  ) : (
                    <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', overflow: 'hidden', minHeight: '40vh' }}>
                      <Editor
                        height="100%"
                        path={selectedFilePath || 'untitled'}
                        defaultLanguage="plaintext"
                        language={detectEditorLanguage(selectedFilePath)}
                        beforeMount={ensureMonacoEnvironment}
                        onMount={handleEditorMount}
                        value={draft}
                        onChange={(value) => setDraft(value || '')}
                        options={{
                          readOnly: !isEditMode || !canWrite,
                          minimap: { enabled: false },
                          fontSize: 13,
                          wordWrap: 'on',
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          smoothScrolling: true,
                          renderWhitespace: 'selection',
                          quickSuggestions: {
                            other: true,
                            comments: false,
                            strings: true
                          },
                          suggestOnTriggerCharacters: true,
                          acceptSuggestionOnEnter: 'on',
                          snippetSuggestions: 'inline',
                          tabCompletion: 'on',
                          parameterHints: { enabled: true },
                          inlineSuggest: { enabled: true },
                          wordBasedSuggestions: 'currentDocument'
                        }}
                        theme="vs-dark"
                      />
                    </div>
                  )}
                </div>
              ) : (
                isCsvPath(selectedFilePath) ? (
                  <CsvTablePreview text={fileData.content || ''} />
                ) : (
                  <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', overflow: 'hidden', minHeight: '64vh' }}>
                    <Editor
                      height="64vh"
                      path={selectedFilePath || 'untitled-readonly'}
                      defaultLanguage="plaintext"
                      language={detectEditorLanguage(selectedFilePath)}
                      beforeMount={ensureMonacoEnvironment}
                      value={fileData.content || ''}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true
                      }}
                      theme="vs-dark"
                    />
                  </div>
                )
              )}
            </div>
          )}

          {!loadingFile && fileData && fileData.encoding === 'base64' && (
            isDocxFileData(fileData, selectedFilePath) && isEditMode && canWrite ? (
              <DocxRichEditor
                base64Content={fileData.content}
                selectedFilePath={selectedFilePath}
                value={docxDraft}
                onLoad={(html) => {
                  setDocxInitialHtml(html);
                  setDocxDraft(html);
                }}
                onChange={setDocxDraft}
              />
            ) : (
              <BinaryPreview fileData={fileData} selectedFilePath={selectedFilePath} />
            )
          )}
        </main>

      </div>

      {canWrite && contextMenu.visible && contextMenu.node && (
        <div
          style={{
            position: 'fixed',
            top: `${resolveContextMenuPosition(contextMenu).top}px`,
            left: `${resolveContextMenuPosition(contextMenu).left}px`,
            zIndex: 9999,
            minWidth: '190px',
            borderRadius: '10px',
            border: '1px solid var(--border2)',
            background: 'var(--bg2)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.38)',
            overflow: 'hidden'
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {isTrashPath(contextMenu.node.path || '') ? (
            <>
              <button type="button" style={menuItemStyle} onClick={() => restoreTrashItem(contextMenu.node)} disabled={(contextMenu.node.path || '') === ''}>Restore</button>
              <button type="button" style={menuItemStyle} onClick={() => deleteItem(contextMenu.node, true)} disabled={(contextMenu.node.path || '') === ''}>Delete Permanently</button>
            </>
          ) : (
            <>
              <button type="button" style={menuItemStyle} onClick={() => copyItem(contextMenu.node, true)} disabled={(contextMenu.node.path || '') === ''}>Cut</button>
              <button type="button" style={menuItemStyle} onClick={() => copyItem(contextMenu.node, false)} disabled={(contextMenu.node.path || '') === ''}>Copy</button>
              <button type="button" style={menuItemStyle} onClick={() => moveItemPrompt(contextMenu.node)} disabled={(contextMenu.node.path || '') === ''}>Move</button>
              <button type="button" style={menuItemStyle} onClick={() => renameItem(contextMenu.node)} disabled={(contextMenu.node.path || '') === ''}>Rename</button>
              <button type="button" style={menuItemStyle} onClick={() => deleteItem(contextMenu.node, false)} disabled={(contextMenu.node.path || '') === ''}>Move to Trash</button>
              <button type="button" style={menuItemStyle} onClick={() => deleteItem(contextMenu.node, true)} disabled={(contextMenu.node.path || '') === ''}>Delete Permanently</button>
              <button
                type="button"
                style={{ ...menuItemStyle, borderTop: '1px solid var(--border)' }}
                onClick={() => pasteInto(contextMenu.node)}
                disabled={!clipboardItem}
              >
                Paste
              </button>
            </>
          )}
        </div>
      )}

      {quickOpenVisible && (
        <div
          onClick={() => setQuickOpenVisible(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10010,
            background: 'rgba(3, 8, 16, 0.64)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '10vh'
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(780px, 92vw)',
              border: '1px solid var(--border2)',
              borderRadius: '12px',
              background: 'var(--bg2)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '10px', borderBottom: '1px solid var(--border)' }}>
              <input
                ref={quickOpenInputRef}
                value={quickOpenQuery}
                onChange={(event) => setQuickOpenQuery(event.target.value)}
                onKeyDown={async (event) => {
                  if (event.key === 'Escape') {
                    setQuickOpenVisible(false);
                  }
                  if (event.key === 'Enter' && filteredQuickOpenFiles[0]) {
                    event.preventDefault();
                    await handleQuickOpenSelect(filteredQuickOpenFiles[0]);
                  }
                }}
                placeholder="Quick Open: type file name or path"
                style={{ ...miniInputStyle, width: '100%' }}
              />
            </div>
            <div style={{ maxHeight: '55vh', overflow: 'auto', padding: '8px' }}>
              {filteredQuickOpenFiles.length === 0 ? (
                <div style={{ color: 'var(--text3)', padding: '8px' }}>No matching files</div>
              ) : (
                filteredQuickOpenFiles.map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    onClick={() => handleQuickOpenSelect(filePath)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text2)',
                      borderRadius: '7px',
                      padding: '8px 10px',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {filePath}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function renderNodes({
  node,
  depth,
  expanded,
  selectedFilePath,
  onToggleFolder,
  onOpenFile,
  onSelectNode,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOverNode,
  onDropNode,
  draggingPath,
  dropTargetPath
}) {
  if (!node) return null;

  if (node.type === 'file') {
    const isSelected = selectedFilePath === (node.path || '');
    return (
      <li key={`file-${node.path || '(root-file)'}`} style={{ paddingLeft: `${depth * 14}px` }}>
        <button
          type="button"
          onClick={() => {
            onSelectNode(node);
            onOpenFile(node.path || '');
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = isSelected ? 'rgba(0,212,255,0.16)' : 'rgba(255,255,255,0.06)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = isSelected ? 'rgba(0,212,255,0.12)' : 'transparent';
          }}
          onContextMenu={(event) => onContextMenu(event, node)}
          draggable
          onDragStart={(event) => onDragStart(event, node.path || '')}
          onDragEnd={onDragEnd}
          style={{
            width: '100%',
            textAlign: 'left',
            border: 'none',
            background: isSelected ? 'rgba(0,212,255,0.12)' : 'transparent',
            color: isSelected ? 'var(--accent)' : 'var(--text2)',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FileGlyph />
            <span>{node.name}</span>
          </span>
        </button>
      </li>
    );
  }

  const folderPath = node.path || '';
  const isOpen = depth === 0 || expanded.has(folderPath);
  const isDragSource = draggingPath === folderPath;
  const isDropTarget = dropTargetPath === folderPath;

  return (
    <li key={`dir-${folderPath || '(root)'}`} style={{ paddingLeft: `${depth * 14}px` }}>
      <button
        type="button"
        onClick={() => {
          onSelectNode(node);
          onToggleFolder(folderPath);
        }}
        onMouseEnter={(event) => {
          if (isDropTarget) return;
          event.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = isDropTarget ? 'rgba(0,212,255,0.14)' : 'transparent';
        }}
        onContextMenu={(event) => onContextMenu(event, node)}
        draggable={depth > 0}
        onDragStart={(event) => onDragStart(event, folderPath)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => onDragOverNode(event, folderPath)}
        onDrop={(event) => onDropNode(event, node)}
        style={{
          width: '100%',
          textAlign: 'left',
          border: 'none',
          background: isDropTarget ? 'rgba(0,212,255,0.14)' : 'transparent',
          color: 'var(--text)',
          borderRadius: '6px',
          padding: '6px 8px',
          cursor: 'pointer',
          fontSize: '13px',
          opacity: isDragSource ? 0.45 : 1
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {isOpen ? <OpenFolderGlyph /> : <FolderGlyph />}
          <span>{node.name}</span>
        </span>
      </button>

      {isOpen && Array.isArray(node.children) && node.children.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {node.children.map((child) => renderNodes({
            node: child,
            depth: depth + 1,
            expanded,
            selectedFilePath,
            onToggleFolder,
            onOpenFile,
            onSelectNode,
            onContextMenu,
            onDragStart,
            onDragEnd,
            onDragOverNode,
            onDropNode,
            draggingPath,
            dropTargetPath
          }))}
        </ul>
      )}
    </li>
  );
}

function collectFilePaths(node, acc = []) {
  if (!node) return acc;
  if (node.type === 'file') {
    acc.push(node.path || node.name || '');
    return acc;
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectFilePaths(child, acc);
    }
  }

  return acc;
}

function pathBaseName(targetPath) {
  const normalized = String(targetPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return '';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

function isTrashPath(targetPath) {
  const normalized = String(targetPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized === '.trash' || normalized.startsWith('.trash/');
}

function isCsvPath(targetPath) {
  return String(targetPath || '').toLowerCase().endsWith('.csv');
}

function findFirstFilePath(tree) {
  if (!tree) return null;
  if (tree.type === 'file') return tree.path || '';

  if (Array.isArray(tree.children)) {
    for (const child of tree.children) {
      const found = findFirstFilePath(child);
      if (found !== null) return found;
    }
  }

  return null;
}

function countNodes(node) {
  if (!node) return 0;
  if (node.type === 'file') return 1;

  const children = Array.isArray(node.children) ? node.children : [];
  return 1 + children.reduce((sum, child) => sum + countNodes(child), 0);
}

const miniInputStyle = {
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg3)',
  color: 'var(--text)',
  fontSize: '13px'
};

const menuItemStyle = {
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: '#d8e8ff',
  fontSize: '13px',
  padding: '9px 12px',
  cursor: 'pointer'
};

function resolveContextMenuPosition(contextMenu) {
  const menuWidth = 190;
  const menuHeight = 230;

  if (typeof window === 'undefined') {
    return { left: contextMenu.x, top: contextMenu.y };
  }

  const padding = 10;
  const maxLeft = Math.max(padding, window.innerWidth - menuWidth - padding);
  const maxTop = Math.max(padding, window.innerHeight - menuHeight - padding);

  return {
    left: Math.min(Math.max(contextMenu.x, padding), maxLeft),
    top: Math.min(Math.max(contextMenu.y, padding), maxTop)
  };
}

function normalizeDirPath(input) {
  return String(input || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function detectEditorLanguage(filePath) {
  const normalized = String(filePath || '').toLowerCase();
  if (normalized.endsWith('.js') || normalized.endsWith('.jsx') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) return 'javascript';
  if (normalized.endsWith('.ts') || normalized.endsWith('.tsx')) return 'typescript';
  if (normalized.endsWith('.py')) return 'python';
  if (normalized.endsWith('.java')) return 'java';
  if (normalized.endsWith('.go')) return 'go';
  if (normalized.endsWith('.rb')) return 'ruby';
  if (normalized.endsWith('.php')) return 'php';
  if (normalized.endsWith('.json')) return 'json';
  if (normalized.endsWith('.html') || normalized.endsWith('.htm')) return 'html';
  if (normalized.endsWith('.css') || normalized.endsWith('.scss') || normalized.endsWith('.sass') || normalized.endsWith('.less')) return 'css';
  if (normalized.endsWith('.xml')) return 'xml';
  if (normalized.endsWith('.md')) return 'markdown';
  if (normalized.endsWith('.sql')) return 'sql';
  if (normalized.endsWith('.yml') || normalized.endsWith('.yaml')) return 'yaml';
  if (normalized.endsWith('.sh')) return 'shell';
  if (normalized.endsWith('.ps1')) return 'powershell';
  if (normalized.endsWith('.env')) return 'shell';
  return 'plaintext';
}

function FileGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: '#7edbff' }}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: '#ffd166' }}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1H3z" />
      <path d="M3 10h18l-1.3 8.2A2 2 0 0 1 17.7 20H6.3a2 2 0 0 1-2-1.8z" />
    </svg>
  );
}

function OpenFolderGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: '#ffe08a' }}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h8a1 1 0 0 1 1 1v2" />
      <path d="M2 12h20l-2 7H4z" />
    </svg>
  );
}

function BinaryPreview({ fileData, selectedFilePath }) {
  const dataUrl = `data:${fileData.mimeType};base64,${fileData.content}`;
  const isImage = String(fileData.mimeType).startsWith('image/');
  const isPdf = fileData.mimeType === 'application/pdf';
  const isAudio = String(fileData.mimeType).startsWith('audio/');
  const isVideo = String(fileData.mimeType).startsWith('video/');
  const [lightbox, setLightbox] = useState({ open: false, kind: '', src: '' });
  const extension = pathExt(selectedFilePath);
  const isDocx = extension === '.docx' || fileData.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isOfficeDoc = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/rtf'
  ].includes(fileData.mimeType);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setLightbox({ open: false, kind: '', src: '' });
      }
    };

    if (lightbox.open) {
      window.addEventListener('keydown', onKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [lightbox.open]);

  if (isImage) {
    return (
      <>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{selectedFilePath}</div>
          <img
            src={dataUrl}
            alt={selectedFilePath || 'preview'}
            onClick={() => setLightbox({ open: true, kind: 'image', src: dataUrl })}
            style={{ width: '100%', maxHeight: '76vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'zoom-in', background: 'rgba(0,0,0,0.4)' }}
          />
        </div>
        <MediaLightbox
          open={lightbox.open}
          kind={lightbox.kind}
          src={lightbox.src}
          title={selectedFilePath}
          onClose={() => setLightbox({ open: false, kind: '', src: '' })}
        />
      </>
    );
  }

  if (isPdf) {
    return <PdfPreview base64Content={fileData.content} selectedFilePath={selectedFilePath} />;
  }

  if (isAudio) {
    return (
      <div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{selectedFilePath}</div>
        <audio controls src={dataUrl} style={{ width: '100%' }} />
      </div>
    );
  }

  if (isVideo) {
    return (
      <>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{selectedFilePath}</div>
          <video
            controls
            src={dataUrl}
            onClick={() => setLightbox({ open: true, kind: 'video', src: dataUrl })}
            style={{ width: '100%', maxHeight: '76vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'zoom-in', background: '#000' }}
          />
        </div>
        <MediaLightbox
          open={lightbox.open}
          kind={lightbox.kind}
          src={lightbox.src}
          title={selectedFilePath}
          onClose={() => setLightbox({ open: false, kind: '', src: '' })}
        />
      </>
    );
  }

  if (isOfficeDoc) {
    if (isDocx) {
      return <DocxPreview base64Content={fileData.content} selectedFilePath={selectedFilePath} />;
    }

    return (
      <div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{selectedFilePath}</div>
        <div style={{ marginBottom: '8px', color: 'var(--text2)' }}>Preview is limited for this Office format in browser sandbox.</div>
        <iframe title={selectedFilePath || 'doc-preview'} src={dataUrl} style={{ width: '100%', minHeight: '70vh', border: '1px solid var(--border)', borderRadius: '8px' }} />
      </div>
    );
  }

  if (fileData.mimeType === 'text/plain' || fileData.mimeType === 'text/csv') {
    const decoded = decodeBase64ToText(fileData.content);
    if (decoded !== null) {
      if (isCsvPath(selectedFilePath)) {
        return <CsvTablePreview text={decoded} />;
      }

      return (
        <pre style={{ margin: 0, minHeight: '64vh', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: '8px', padding: '12px', overflow: 'auto', fontSize: '13px', color: 'var(--text2)' }}>
          {decoded}
        </pre>
      );
    }
  }

  return (
    <div style={{ color: 'var(--text2)' }}>
      <div style={{ marginBottom: '8px' }}>Preview is limited for this file type in browser sandbox.</div>
      <iframe title={selectedFilePath || 'generic-preview'} src={dataUrl} style={{ width: '100%', minHeight: '70vh', border: '1px solid var(--border)', borderRadius: '8px' }} />
    </div>
  );
}

function PdfPreview({ base64Content, selectedFilePath }) {
  const [pdfComponents, setPdfComponents] = useState(null);
  const [pdfError, setPdfError] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [fitWidth, setFitWidth] = useState(true);
  const [showThumbs, setShowThumbs] = useState(true);
  const [mainWidth, setMainWidth] = useState(980);
  const mainPaneRef = useRef(null);
  const isPdfPaneHoveredRef = useRef(false);
  const zoomPercentRef = useRef(100);
  const pendingZoomRef = useRef(100);
  const zoomRafRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const loadPdfModule = async () => {
      try {
        const module = await import('react-pdf');
        module.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${module.pdfjs.version}/build/pdf.worker.min.mjs`;

        if (!cancelled) {
          setPdfComponents({ Document: module.Document, Page: module.Page });
          setPdfError('');
        }
      } catch (error) {
        if (!cancelled) {
          setPdfError(error.message || 'Failed to initialize PDF viewer');
        }
      }
    };

    loadPdfModule();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let objectUrl = '';

    try {
      const arrayBuffer = base64ToArrayBuffer(base64Content);
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      objectUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(objectUrl);
      setPdfError('');
    } catch (error) {
      setPdfBlobUrl('');
      setPdfError(error?.message || 'Unable to prepare PDF data.');
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [base64Content]);

  useEffect(() => {
    const updateWidth = () => {
      const width = mainPaneRef.current?.clientWidth || 980;
      setMainWidth(Math.max(320, Math.floor(width - 28)));
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && mainPaneRef.current) {
      observer = new ResizeObserver(updateWidth);
      observer.observe(mainPaneRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateWidth);
      if (observer) observer.disconnect();
    };
  }, [showThumbs]);

  useEffect(() => {
    const handleGlobalPinchZoom = (event) => {
      // Only zoom PDF when pointer is over the PDF pane.
      if (!isPdfPaneHoveredRef.current) return;

      // On Chromium-based browsers, trackpad pinch is exposed as Ctrl + wheel.
      if (!event.ctrlKey) return;

      event.preventDefault();
      setFitWidth(false);
      const step = Math.max(4, Math.min(20, Math.round(Math.abs(event.deltaY) / 10)));
      const next = event.deltaY < 0
        ? zoomPercentRef.current + step
        : zoomPercentRef.current - step;
      applyZoomPercent(next);
    };

    window.addEventListener('wheel', handleGlobalPinchZoom, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', handleGlobalPinchZoom, { capture: true });
    };
  }, []);

  useEffect(() => {
    zoomPercentRef.current = zoomPercent;
  }, [zoomPercent]);

  useEffect(() => {
    return () => {
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
    };
  }, []);

  const fallbackDataUrl = `data:application/pdf;base64,${base64Content}`;

  if (pdfError) {
    return (
      <div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{selectedFilePath}</div>
        <div style={{ marginBottom: '8px', color: 'var(--red)' }}>Unable to open PDF with react-pdf: {pdfError}</div>
        <iframe title={selectedFilePath || 'pdf-fallback'} src={fallbackDataUrl} style={{ width: '100%', minHeight: '76vh', border: '1px solid var(--border)', borderRadius: '8px' }} />
      </div>
    );
  }

  if (!pdfComponents) {
    return <div style={{ color: 'var(--text2)' }}>Initializing PDF viewer...</div>;
  }

  if (!pdfBlobUrl) {
    return <div style={{ color: 'var(--text2)' }}>Preparing PDF preview...</div>;
  }

  const { Document, Page } = pdfComponents;
  const pageWidth = fitWidth ? mainWidth : Math.max(280, Math.floor((mainWidth * zoomPercent) / 100));

  const applyZoomPercent = (target) => {
    const clamped = Math.max(40, Math.min(260, Math.round(target)));
    pendingZoomRef.current = clamped;

    if (zoomRafRef.current) return;
    zoomRafRef.current = requestAnimationFrame(() => {
      zoomRafRef.current = 0;
      const next = pendingZoomRef.current;
      zoomPercentRef.current = next;
      setZoomPercent(next);
    });
  };

  const scrollToPage = (pageNumber) => {
    const target = mainPaneRef.current?.querySelector(`[data-pdf-page="${pageNumber}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{selectedFilePath}</div>
      <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', background: 'var(--bg3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderBottom: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowThumbs((prev) => !prev)}>{showThumbs ? 'Hide Pages' : 'Show Pages'}</button>
          <div style={{ color: 'var(--text3)', fontSize: '12px' }}>{numPages ? `${numPages} pages` : 'Loading pages...'}</div>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 2px' }} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFitWidth(false);
              applyZoomPercent(zoomPercentRef.current - 10);
            }}
          >
            -
          </button>
          <div style={{ color: 'var(--text3)', fontSize: '12px', minWidth: '56px', textAlign: 'center' }}>{fitWidth ? 'Fit' : `${zoomPercent}%`}</div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFitWidth(false);
              applyZoomPercent(zoomPercentRef.current + 10);
            }}
          >
            +
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFitWidth(true)}>Fit Width</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <a href={pdfBlobUrl} download={pathBaseName(selectedFilePath) || 'document.pdf'} className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Download</a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.open(pdfBlobUrl, '_blank', 'noopener,noreferrer')}>Open</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: showThumbs ? '128px minmax(0,1fr)' : 'minmax(0,1fr)', minHeight: '74vh' }}>
          {showThumbs && (
            <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '8px', background: 'var(--bg2)' }}>
              <PdfErrorBoundary
                resetKey={`${pdfBlobUrl}-thumbs`}
                onError={(error) => setPdfError(error?.message || 'Unable to render PDF thumbnails.')}
                fallback={<div style={{ color: 'var(--red)', fontSize: '12px' }}>Thumbnail preview unavailable.</div>}
              >
                <Document file={pdfBlobUrl} loading={<div style={{ color: 'var(--text3)', fontSize: '12px' }}>Loading...</div>}>
                  {Array.from({ length: numPages || 0 }, (_, idx) => {
                    const pageNo = idx + 1;
                    return (
                      <button
                        key={`thumb-${pageNo}`}
                        type="button"
                        onClick={() => scrollToPage(pageNo)}
                        style={{
                          width: '100%',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          background: 'var(--bg3)',
                          marginBottom: '8px',
                          padding: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <Page pageNumber={pageNo} width={92} renderAnnotationLayer={false} renderTextLayer={false} />
                        </div>
                        <div style={{ color: 'var(--text3)', fontSize: '11px', marginTop: '4px' }}>{pageNo}</div>
                      </button>
                    );
                  })}
                </Document>
              </PdfErrorBoundary>
            </div>
          )}

          <div
            ref={mainPaneRef}
            onMouseEnter={() => {
              isPdfPaneHoveredRef.current = true;
            }}
            onMouseLeave={() => {
              isPdfPaneHoveredRef.current = false;
            }}
            style={{ overflow: 'auto', padding: '12px' }}
          >
            <PdfErrorBoundary
              resetKey={pdfBlobUrl}
              onError={(error) => setPdfError(error?.message || 'Unable to render PDF preview.')}
              fallback={<div style={{ color: 'var(--red)' }}>Unable to render PDF preview.</div>}
            >
              <Document
                key={pdfBlobUrl}
                file={pdfBlobUrl}
                onLoadSuccess={({ numPages: loadedPages }) => {
                  const safePages = loadedPages || 0;
                  setNumPages(safePages);
                }}
                onLoadError={(error) => {
                  setNumPages(0);
                  setPdfError(error?.message || 'Unable to render PDF preview.');
                }}
                loading={<div style={{ color: 'var(--text2)' }}>Loading PDF...</div>}
                error={<div style={{ color: 'var(--red)' }}>Unable to render PDF preview.</div>}
              >
                {Array.from({ length: numPages || 0 }, (_, idx) => {
                  const pageNo = idx + 1;
                  return (
                    <div key={`page-${pageNo}`} data-pdf-page={pageNo} style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', scrollMarginTop: '10px' }}>
                      <Page pageNumber={pageNo} width={pageWidth} renderAnnotationLayer={false} renderTextLayer={false} />
                    </div>
                  );
                })}
              </Document>
            </PdfErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}

class PdfErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error);
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }

    return this.props.children;
  }
}

function MediaLightbox({ open, kind, src, title, onClose }) {
  if (!open || !src) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(4, 9, 16, 0.55)',
        backdropFilter: 'blur(9px)',
        WebkitBackdropFilter: 'blur(9px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18px'
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="btn btn-ghost btn-sm"
        style={{ position: 'fixed', top: '14px', right: '16px', zIndex: 10051 }}
      >
        Close
      </button>
      <div style={{ position: 'fixed', left: '18px', bottom: '16px', color: '#d8e8ff', fontSize: '12px' }}>{title}</div>
      <div role="presentation" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '96vw', maxHeight: '94vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {kind === 'video' ? (
          <video controls autoPlay src={src} style={{ maxWidth: '96vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: '10px', background: '#000', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }} />
        ) : (
          <img src={src} alt={title || 'preview'} style={{ maxWidth: '96vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: '10px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }} />
        )}
      </div>
    </div>
  );
}

function CsvTablePreview({ text }) {
  const rows = useMemo(() => parseCsv(String(text || '')), [text]);

  if (!rows.length) {
    return <div style={{ color: 'var(--text2)' }}>CSV file is empty.</div>;
  }

  const header = rows[0] || [];
  const body = rows.slice(1);

  return (
    <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', overflow: 'auto', maxHeight: '70vh' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead style={{ background: 'var(--bg3)', position: 'sticky', top: 0 }}>
          <tr>
            {header.map((cell, idx) => (
              <th key={`h-${idx}`} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIdx) => (
            <tr key={`r-${rowIdx}`}>
              {header.map((_, colIdx) => (
                <td key={`c-${rowIdx}-${colIdx}`} style={{ padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', verticalAlign: 'top' }}>
                  {row[colIdx] || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocxPreview({ base64Content, selectedFilePath }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const renderDocx = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await extractDocxHtml(base64Content);
        if (!cancelled) {
          setHtml(result.html || '');
          setError(result.warning || '');
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError.message || 'Unable to render DOCX preview.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    renderDocx();
    return () => {
      cancelled = true;
    };
  }, [base64Content]);

  if (loading) {
    return <div style={{ color: 'var(--text2)' }}>Rendering DOCX preview...</div>;
  }

  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{selectedFilePath}</div>
      {error && <div style={{ marginBottom: '8px', color: 'var(--yellow)' }}>{error}</div>}
      <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', padding: '14px', background: '#fff', color: '#1f2937', minHeight: '64vh', overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function DocxRichEditor({ base64Content, selectedFilePath, value, onLoad, onChange }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const editorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await extractDocxHtml(base64Content);
        if (!cancelled) {
          onLoad(result.html || '');
          setError(result.warning || '');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Unable to load DOCX for editing.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, [base64Content, onLoad]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const applyCommand = (command, commandValue) => {
    document.execCommand(command, false, commandValue);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML || '');
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text2)' }}>Preparing Word editor...</div>;
  }

  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{selectedFilePath}</div>
      {error && <div style={{ marginBottom: '8px', color: 'var(--yellow)' }}>{error}</div>}
      <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'flex', gap: '8px', padding: '10px', borderBottom: '1px solid #d1d5db', background: '#f8fafc', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyCommand('bold')}>Bold</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyCommand('italic')}>Italic</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyCommand('underline')}>Underline</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyCommand('formatBlock', 'h1')}>H1</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyCommand('formatBlock', 'h2')}>H2</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyCommand('insertUnorderedList')}>Bullet List</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyCommand('removeFormat')}>Clear Format</button>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => onChange(event.currentTarget.innerHTML || '')}
          style={{ minHeight: '64vh', padding: '14px', color: '#1f2937', outline: 'none', overflow: 'auto' }}
        />
      </div>
    </div>
  );
}

async function extractDocxHtml(base64Content) {
  const arrayBuffer = base64ToArrayBuffer(base64Content);
  try {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return {
      html: result.value || '<p></p>',
      warning: ''
    };
  } catch {
    const decoded = decodeBase64ToText(base64Content);
    if (decoded !== null) {
      const trimmed = decoded.trim();
      if (/<\s*html[\s>]/i.test(trimmed)) {
        return {
          html: trimmed,
          warning: 'Opened as HTML-backed Word document. Some DOCX-only features may not be preserved.'
        };
      }

      return {
        html: `<pre>${escapeHtml(trimmed)}</pre>`,
        warning: 'Opened in text fallback mode because DOCX structure could not be parsed.'
      };
    }

    throw new Error('Unable to render DOCX preview.');
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pathExt(targetPath) {
  const normalized = String(targetPath || '').toLowerCase();
  const idx = normalized.lastIndexOf('.');
  if (idx < 0) return '';
  return normalized.slice(idx);
}

function isDocxFileData(fileData, selectedFilePath) {
  if (!fileData) return false;
  const extension = pathExt(selectedFilePath);
  return extension === '.docx' || fileData.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function decodeBase64ToText(base64Value) {
  try {
    const arrayBuffer = base64ToArrayBuffer(base64Value);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(arrayBuffer);
  } catch {
    return null;
  }
}

function base64ToArrayBuffer(base64Value) {
  const binary = atob(String(base64Value || ''));
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') {
        i += 1;
      }
      row.push(current);
      current = '';
      if (row.length > 1 || row[0] !== '') {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.map((r) => {
    if (r.length >= width) return r;
    return [...r, ...new Array(width - r.length).fill('')];
  });
}

export default RepoExplorer;
