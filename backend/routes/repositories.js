const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const { Repository, User } = require('../models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');
const AdmZip = require('adm-zip');
const aiService = require('../services/aiService');
const htmlDocx = require('html-docx-js');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

function normalizeCollaborators(collaborators) {
  if (!Array.isArray(collaborators)) {
    return [];
  }

  return collaborators
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const userId = String(entry.userId || '').trim();
      if (!userId) return null;
      const permission = String(entry.permission || 'read').toLowerCase();
      return {
        userId,
        permission: ['read', 'write', 'admin'].includes(permission) ? permission : 'read',
        addedAt: entry.addedAt || new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function getCollaboratorRecord(repo, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  const collaborators = normalizeCollaborators(repo?.collaborators);
  return collaborators.find((entry) => entry.userId === normalizedUserId) || null;
}

function hasReadAccess(repo, userId) {
  if (!repo || !userId) return false;
  if (repo.ownerId === userId) return true;
  if (repo.visibility === 'public') return true;
  return Boolean(getCollaboratorRecord(repo, userId));
}

function hasWriteAccess(repo, userId) {
  if (!repo || !userId) return false;
  if (repo.ownerId === userId) return true;
  const collaborator = getCollaboratorRecord(repo, userId);
  return Boolean(collaborator && ['write', 'admin'].includes(collaborator.permission));
}

function hasAdminAccess(repo, userId) {
  if (!repo || !userId) return false;
  if (repo.ownerId === userId) return true;
  const collaborator = getCollaboratorRecord(repo, userId);
  return Boolean(collaborator && collaborator.permission === 'admin');
}

async function findReadableRepository(id, userId, options = {}) {
  const repo = await Repository.findOne({
    ...options,
    where: {
      id,
      ...(options.where || {})
    }
  });

  if (!repo || !hasReadAccess(repo, userId)) {
    return null;
  }

  return repo;
}

async function findOwnedRepository(id, userId, options = {}) {
  const repo = await Repository.findOne({
    ...options,
    where: {
      id,
      ...(options.where || {})
    }
  });

  if (!repo || !hasWriteAccess(repo, userId)) {
    return null;
  }

  return repo;
}

async function findAdminRepository(id, userId, options = {}) {
  const repo = await Repository.findOne({
    ...options,
    where: {
      id,
      ...(options.where || {})
    }
  });

  if (!repo || !hasAdminAccess(repo, userId)) {
    return null;
  }

  return repo;
}

async function findOwnerRepository(id, userId, options = {}) {
  const repo = await Repository.findOne({
    ...options,
    where: {
      id,
      ...(options.where || {})
    }
  });

  if (!repo || repo.ownerId !== userId) {
    return null;
  }

  return repo;
}

async function enrichRepositoriesWithOwnerMeta(repositories) {
  const repos = Array.isArray(repositories) ? repositories : [];
  if (!repos.length) return [];

  const ownerIds = Array.from(new Set(repos.map((repo) => String(repo.ownerId || '')).filter(Boolean)));
  const owners = ownerIds.length
    ? await User.findAll({ where: { id: { [Op.in]: ownerIds } }, attributes: ['id', 'name', 'email'] })
    : [];

  const ownerMap = new Map(owners.map((owner) => [String(owner.id), owner]));

  return repos.map((repo) => {
    const owner = ownerMap.get(String(repo.ownerId || ''));
    return {
      ...repo.toJSON(),
      ownerName: owner?.name || null,
      ownerEmail: owner?.email || null
    };
  });
}

// Get all repositories (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const repos = await Repository.findAll({ order: [['updatedAt', 'DESC']] });
    const visibleRepos = repos.filter((repo) => hasReadAccess(repo, req.user.id));
    const enriched = await enrichRepositoriesWithOwnerMeta(visibleRepos);
    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get repositories where current user can write (owner or collaborator)
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const repos = await Repository.findAll({ order: [['updatedAt', 'DESC']] });
    const writableRepos = repos.filter((repo) => hasWriteAccess(repo, req.user.id));
    const enriched = await enrichRepositoriesWithOwnerMeta(writableRepos);
    const payload = await Promise.all(
      enriched.map(async (repo) => ({
        ...repo,
        analytics: await getRepositoryAnalytics(repo)
      }))
    );
    res.json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Discover public repositories (debounced search consumer)
router.get('/discover', authMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const mode = String(req.query.mode || 'keyword').toLowerCase();

    const publicRepos = await Repository.findAll({
      where: { visibility: 'public' },
      order: [['updatedAt', 'DESC']],
      limit: q ? 300 : 30
    });

    const filtered = q
      ? publicRepos.filter((repo) => {
        const haystack = [
          repo.name,
          repo.description || '',
          ...(Array.isArray(repo.languages) ? repo.languages : [])
        ]
          .join(' ')
          .toLowerCase();

        if (mode === 'vector') {
          const terms = q.split(/\s+/).filter(Boolean);
          return terms.every((term) => haystack.includes(term));
        }

        return haystack.includes(q);
      })
      : publicRepos;

    const limited = filtered.slice(0, 50);
    const enriched = await enrichRepositoriesWithOwnerMeta(limited);
    const payload = await Promise.all(
      enriched.map(async (repo) => ({
        ...repo,
        analytics: await getRepositoryAnalytics(repo)
      }))
    );

    res.json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get trash bin items across owned repositories (protected)
router.get('/trash-items', authMiddleware, async (req, res) => {
  try {
    const repos = await Repository.findAll({
      where: { ownerId: req.user.id },
      attributes: ['id', 'name', 'path'],
      order: [['updatedAt', 'DESC']]
    });

    const data = [];

    for (const repo of repos) {
      const repoRoot = resolveRepositoryPath(repo.path);
      if (!repoRoot || !fs.existsSync(repoRoot)) {
        continue;
      }

      const trashRoot = path.join(repoRoot, '.trash');
      if (!fs.existsSync(trashRoot)) {
        data.push({
          repositoryId: repo.id,
          repositoryName: repo.name,
          items: []
        });
        continue;
      }

      const items = await listTrashItems(trashRoot);
      data.push({
        repositoryId: repo.id,
        repositoryName: repo.name,
        items
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Empty trash across all owned repositories (protected)
router.delete('/trash-items/empty-all', authMiddleware, async (req, res) => {
  try {
    const repos = await Repository.findAll({
      where: { ownerId: req.user.id },
      attributes: ['id', 'path']
    });

    let removed = 0;

    for (const repo of repos) {
      const repoRoot = resolveRepositoryPath(repo.path);
      if (!repoRoot || !fs.existsSync(repoRoot)) continue;

      const trashRoot = path.join(repoRoot, '.trash');
      if (!fs.existsSync(trashRoot)) continue;

      const entries = await fs.promises.readdir(trashRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === TRASH_INDEX_FILE) continue;
        await fs.promises.rm(path.join(trashRoot, entry.name), { recursive: true, force: true });
        removed += 1;
      }

      await saveTrashIndex(trashRoot, {});
    }

    res.json({ success: true, data: { removed } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Restore one trashed item in repository (protected)
router.post('/:id/trash/restore', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const trashName = String(req.body?.trashName || '').trim();
    if (!trashName) {
      return res.status(400).json({ success: false, message: 'trashName is required' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const trashRoot = path.join(repoRoot, '.trash');
    const sourceAbsolute = resolveSafeRepoFilePath(repoRoot, `.trash/${trashName}`);
    if (!sourceAbsolute || !fs.existsSync(sourceAbsolute)) {
      return res.status(404).json({ success: false, message: 'Trash item not found' });
    }

    const trashIndex = await loadTrashIndex(trashRoot);
    const indexedOriginalPath = normalizeRepoRelativePath(trashIndex[trashName]?.originalPath || '');
    const parsed = parseTrashEntryName(trashName);
    const fallbackOriginal = normalizeRepoRelativePath(parsed.originalName || '');
    const restorePath = indexedOriginalPath || fallbackOriginal;

    if (!restorePath || restorePath.startsWith('.trash/')) {
      return res.status(400).json({ success: false, message: 'Unable to determine original restore path' });
    }

    const targetAbsolute = resolveSafeRepoFilePath(repoRoot, restorePath);
    if (!targetAbsolute) {
      return res.status(400).json({ success: false, message: 'Invalid restore path' });
    }

    if (fs.existsSync(targetAbsolute)) {
      return res.status(409).json({ success: false, message: 'Cannot restore because target path already exists' });
    }

    await fs.promises.mkdir(path.dirname(targetAbsolute), { recursive: true });
    await fs.promises.rename(sourceAbsolute, targetAbsolute);

    delete trashIndex[trashName];
    await saveTrashIndex(trashRoot, trashIndex);
    await repo.update({ lastPushed: new Date() });

    res.json({ success: true, data: { restoredPath: restorePath } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Permanently delete one trashed item in repository (protected)
router.delete('/:id/trash/item', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const trashName = String(req.query?.trashName || '').trim();
    if (!trashName) {
      return res.status(400).json({ success: false, message: 'trashName query parameter is required' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const trashRoot = path.join(repoRoot, '.trash');
    const targetAbsolute = resolveSafeRepoFilePath(repoRoot, `.trash/${trashName}`);
    if (!targetAbsolute || !fs.existsSync(targetAbsolute)) {
      return res.status(404).json({ success: false, message: 'Trash item not found' });
    }

    await fs.promises.rm(targetAbsolute, { recursive: true, force: true });
    const trashIndex = await loadTrashIndex(trashRoot);
    delete trashIndex[trashName];
    await saveTrashIndex(trashRoot, trashIndex);
    await repo.update({ lastPushed: new Date() });

    res.json({ success: true, message: 'Trash item deleted permanently' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Empty trash for repository (protected)
router.delete('/:id/trash/empty', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const trashRoot = path.join(repoRoot, '.trash');
    if (!fs.existsSync(trashRoot)) {
      return res.json({ success: true, data: { removed: 0 } });
    }

    const entries = await fs.promises.readdir(trashRoot, { withFileTypes: true });
    let removed = 0;

    for (const entry of entries) {
      if (entry.name === TRASH_INDEX_FILE) continue;
      await fs.promises.rm(path.join(trashRoot, entry.name), { recursive: true, force: true });
      removed += 1;
    }

    await saveTrashIndex(trashRoot, {});
    await repo.update({ lastPushed: new Date() });
    res.json({ success: true, data: { removed } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get repository file tree (protected)
router.get('/:id/file-tree', authMiddleware, async (req, res) => {
  try {
    const repo = await findReadableRepository(req.params.id, req.user.id);

    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const maxDepth = Math.min(Math.max(Number(req.query.maxDepth) || 4, 1), 8);
    const maxEntries = Math.min(Math.max(Number(req.query.maxEntries) || 600, 50), 3000);

    let resolvedPath = resolveRepositoryPath(repo.path);
    if (!resolvedPath) {
      return res.status(400).json({ success: false, message: 'Repository path is not set' });
    }

    // For legacy/just-uploaded zip-backed repositories, extract first and switch path.
    if (path.extname(resolvedPath).toLowerCase() === '.zip') {
      const zipExists = fs.existsSync(resolvedPath);

      if (zipExists) {
        const extractedRoot = await extractZipToRepositoryFolder(resolvedPath, repo.name || path.basename(resolvedPath, '.zip'));
        resolvedPath = extractedRoot;
        await repo.update({ path: extractedRoot });
      }
    }

    if (!fs.existsSync(resolvedPath)) {
      const recoveredPath = await recoverMissingRepositoryPath(repo, resolvedPath);
      if (recoveredPath) {
        resolvedPath = recoveredPath;
        await repo.update({ path: recoveredPath });
      } else {
        return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
      }
    }

    let stats = await fs.promises.stat(resolvedPath);

    if (stats.isFile() && path.extname(resolvedPath).toLowerCase() === '.zip') {
      const extractedRoot = await extractZipToRepositoryFolder(resolvedPath, repo.name || path.basename(resolvedPath, '.zip'));
      resolvedPath = extractedRoot;
      stats = await fs.promises.stat(resolvedPath);
      await repo.update({ path: resolvedPath });
    }

    if (stats.isFile()) {
      return res.json({
        success: true,
        data: {
          tree: {
            name: path.basename(resolvedPath),
            type: 'file',
            path: ''
          },
          path: resolvedPath,
          truncated: false,
          message: 'Repository source is a file. Upload extraction is required for nested tree view.'
        }
      });
    }

    const counter = { count: 0 };
    const children = await buildFileTree(resolvedPath, resolvedPath, 0, maxDepth, maxEntries, counter);

    res.json({
      success: true,
      data: {
        tree: {
          name: path.basename(resolvedPath),
          type: 'directory',
          children
        },
        path: resolvedPath,
        truncated: counter.count >= maxEntries
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Analyze repository for potentially malicious code (protected)
router.get('/:id/security-scan', authMiddleware, async (req, res) => {
  try {
    const repo = await findReadableRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const findings = await scanRepositoryForRisk(repoRoot);
    const summaryForAi = findings
      .slice(0, 50)
      .map((f) => `${f.filePath} | ${f.reason} | severity=${f.severity}`)
      .join('\n');

    let aiSummary = null;
    if (summaryForAi) {
      const aiResult = await aiService.analyzeRepositorySecurity(summaryForAi);
      if (aiResult.success) {
        aiSummary = aiResult.data;
      }
    }

    res.json({
      success: true,
      data: {
        riskLevel: findings.some((f) => f.severity === 'high')
          ? 'high'
          : findings.some((f) => f.severity === 'medium')
            ? 'medium'
            : 'low',
        findings,
        aiSummary
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create repository (protected)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, languages, githubUrl, path: repoPathInput, visibility } = req.body;
    const cleanedName = String(name || '').trim();

    if (!cleanedName) {
      return res.status(400).json({ success: false, message: 'Repository name is required' });
    }

    if (cleanedName.length < 2) {
      return res.status(400).json({ success: false, message: 'Repository name must be at least 2 characters long' });
    }

    if (cleanedName.length > 120) {
      return res.status(400).json({ success: false, message: 'Repository name must be 120 characters or less' });
    }

    const normalizedVisibility = String(visibility || 'private').toLowerCase();
    if (!['public', 'private'].includes(normalizedVisibility)) {
      return res.status(400).json({ success: false, message: 'visibility must be public or private' });
    }

    const existingRepo = await Repository.findOne({ where: { name: cleanedName } });
    if (existingRepo) {
      return res.status(409).json({ success: false, message: 'A repository with this name already exists' });
    }

    let repoPath = repoPathInput;
    if (!repoPath) {
      const repositoriesBase = path.join(__dirname, '../github-repos');
      if (!fs.existsSync(repositoriesBase)) {
        fs.mkdirSync(repositoriesBase, { recursive: true });
      }

      const safeName = toSafeSlug(name);
      repoPath = path.join(repositoriesBase, `${safeName}-${Date.now()}`);
      fs.mkdirSync(repoPath, { recursive: true });

      // Initialize git repository so changes can be explicitly committed by user.
      try {
        await ensureGitRepository(repoPath);
      } catch (gitError) {
        console.warn('Repository git initialization skipped:', gitError.message);
      }
    }

    const repo = await Repository.create({
      name: cleanedName,
      description: String(description || '').trim() || null,
      languages: Array.isArray(languages) ? languages : [],
      githubUrl: String(githubUrl || '').trim() || null,
      path: repoPath,
      visibility: normalizedVisibility,
      ownerId: req.user.id,
      collaborators: []
    });

    res.status(201).json({ success: true, data: repo });
  } catch (error) {
    console.error('Repository creation error:', error);

    let message = error.message || 'Failed to create repository';

    // Handle Sequelize validation errors
    if (error.errors && Array.isArray(error.errors)) {
      message = error.errors.map(e => e.message).join(', ');
    }

    // Handle duplicate key errors
    if (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'ER_DUP_ENTRY') {
      message = 'A repository with this name already exists';
      return res.status(409).json({ success: false, message });
    }
    
    res.status(500).json({ success: false, message });
  }
});

// Upload repository ZIP (protected)
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { name, branch, visibility, description } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    if (path.extname(req.file.originalname).toLowerCase() !== '.zip') {
      return res.status(400).json({ success: false, message: 'Only .zip files are supported for upload' });
    }

    const normalizedVisibility = String(visibility || 'private').toLowerCase();
    if (!['public', 'private'].includes(normalizedVisibility)) {
      return res.status(400).json({ success: false, message: 'visibility must be public or private' });
    }

    const extractedRoot = await extractZipToRepositoryFolder(req.file.path, name || req.file.originalname.replace('.zip', ''));
    const detectedLanguages = await detectLanguages(extractedRoot);
    const extractedFileCount = await countFiles(extractedRoot);

    await ensureGitRepository(extractedRoot);

    const repo = await Repository.create({
      name: name || req.file.originalname.replace('.zip', ''),
      description: String(description || '').trim() || `Uploaded repository (${extractedFileCount} files extracted)`,
      languages: detectedLanguages,
      path: extractedRoot,
      visibility: normalizedVisibility,
      ownerId: req.user.id,
      collaborators: []
    });

    // Cleanup the uploaded archive after extraction.
    try {
      await fs.promises.unlink(req.file.path);
    } catch (cleanupError) {
      console.warn('Unable to cleanup uploaded zip file:', cleanupError.message);
    }

    res.status(201).json({ 
      success: true, 
      data: repo,
      message: 'Repository uploaded and extracted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const workspaceUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 500 }
});

// Upload files/folders to repository workspace (protected)
router.post('/:id/workspace/upload', authMiddleware, workspaceUpload.array('files', 500), async (req, res) => {
  let repo = null;

  try {
    repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const relativePathsRaw = req.body?.relativePaths;
    const relativePaths = Array.isArray(relativePathsRaw)
      ? relativePathsRaw
      : JSON.parse(String(relativePathsRaw || '[]'));

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const blocked = [];
    const written = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const candidatePath = String(relativePaths[index] || file.originalname || '').trim();

      if (!candidatePath) {
        continue;
      }

      if (isBlockedFileType(candidatePath)) {
        blocked.push(candidatePath);
        continue;
      }

      const destination = resolveSafeRepoFilePath(repoRoot, candidatePath);
      if (!destination) {
        continue;
      }

      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.copyFile(file.path, destination);
      written.push(candidatePath);
    }

    await cleanupUploadedTemps(files);

    if (written.length === 0) {
      return res.status(400).json({
        success: false,
        message: blocked.length > 0
          ? `All uploaded files were blocked for security reasons (${blocked.slice(0, 5).join(', ')})`
          : 'No valid files were uploaded'
      });
    }

    await repo.update({ lastPushed: new Date() });

    res.json({
      success: true,
      data: {
        uploaded: written.length,
        blocked,
        files: written
      }
    });
  } catch (error) {
    if (Array.isArray(req.files)) {
      await cleanupUploadedTemps(req.files);
    }
    await handleRepositoryFailure(repo, 'workspace-upload', req.body || {});
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create file or folder in repository workspace (protected)
router.post('/:id/workspace/create-item', authMiddleware, async (req, res) => {
  let repo = null;

  try {
    repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const { itemType, targetPath, content } = req.body || {};
    if (!['file', 'folder'].includes(String(itemType))) {
      return res.status(400).json({ success: false, message: 'itemType must be file or folder' });
    }

    const cleanedTarget = String(targetPath || '').trim();
    if (!cleanedTarget) {
      return res.status(400).json({ success: false, message: 'targetPath is required' });
    }

    if (isBlockedFileType(cleanedTarget)) {
      return res.status(400).json({ success: false, message: 'Blocked file type for security reasons' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const destination = resolveSafeRepoFilePath(repoRoot, cleanedTarget);
    if (!destination) {
      return res.status(400).json({ success: false, message: 'Invalid targetPath' });
    }

    if (String(itemType) === 'folder') {
      await fs.promises.mkdir(destination, { recursive: true });
    } else {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.writeFile(destination, String(content || ''), 'utf8');
    }

    await repo.update({ lastPushed: new Date() });
    res.status(201).json({ success: true, message: `${itemType} created successfully` });
  } catch (error) {
    await handleRepositoryFailure(repo, 'workspace-create-item', req.body || {});
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rename file or folder in repository workspace (protected)
router.post('/:id/workspace/rename', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const sourcePath = String(req.body?.sourcePath || '').trim();
    const targetPath = String(req.body?.targetPath || '').trim();

    if (!sourcePath || !targetPath) {
      return res.status(400).json({ success: false, message: 'sourcePath and targetPath are required' });
    }

    if (isBlockedFileType(targetPath)) {
      return res.status(400).json({ success: false, message: 'Blocked file type for security reasons' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const fromAbsolute = resolveSafeRepoFilePath(repoRoot, sourcePath);
    const toAbsolute = resolveSafeRepoFilePath(repoRoot, targetPath);

    if (!fromAbsolute || !toAbsolute) {
      return res.status(400).json({ success: false, message: 'Invalid sourcePath or targetPath' });
    }

    if (!fs.existsSync(fromAbsolute)) {
      return res.status(404).json({ success: false, message: 'Source item not found' });
    }

    await fs.promises.mkdir(path.dirname(toAbsolute), { recursive: true });
    await fs.promises.rename(fromAbsolute, toAbsolute);
    await repo.update({ lastPushed: new Date() });

    res.json({ success: true, message: 'Item renamed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Move file or folder in repository workspace (protected)
router.post('/:id/workspace/move', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const sourcePath = String(req.body?.sourcePath || '').trim();
    const destinationDir = String(req.body?.destinationDir || '').trim();

    if (!sourcePath) {
      return res.status(400).json({ success: false, message: 'sourcePath is required' });
    }

    const itemName = path.basename(sourcePath);
    const targetPath = destinationDir
      ? `${destinationDir.replace(/\\/g, '/').replace(/\/+$/, '')}/${itemName}`
      : itemName;

    if (isBlockedFileType(targetPath)) {
      return res.status(400).json({ success: false, message: 'Blocked file type for security reasons' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const fromAbsolute = resolveSafeRepoFilePath(repoRoot, sourcePath);
    const toAbsolute = resolveSafeRepoFilePath(repoRoot, targetPath);

    if (!fromAbsolute || !toAbsolute) {
      return res.status(400).json({ success: false, message: 'Invalid sourcePath or destinationDir' });
    }

    if (!fs.existsSync(fromAbsolute)) {
      return res.status(404).json({ success: false, message: 'Source item not found' });
    }

    await fs.promises.mkdir(path.dirname(toAbsolute), { recursive: true });
    await fs.promises.rename(fromAbsolute, toAbsolute);
    await repo.update({ lastPushed: new Date() });

    res.json({ success: true, message: 'Item moved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Copy file or folder in repository workspace (protected)
router.post('/:id/workspace/copy', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const sourcePath = String(req.body?.sourcePath || '').trim();
    const destinationDir = String(req.body?.destinationDir || '').trim();

    if (!sourcePath) {
      return res.status(400).json({ success: false, message: 'sourcePath is required' });
    }

    const itemName = path.basename(sourcePath);
    const targetPath = destinationDir
      ? `${destinationDir.replace(/\\/g, '/').replace(/\/+$/, '')}/${itemName}`
      : itemName;

    if (isBlockedFileType(targetPath)) {
      return res.status(400).json({ success: false, message: 'Blocked file type for security reasons' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const fromAbsolute = resolveSafeRepoFilePath(repoRoot, sourcePath);
    const toAbsolute = resolveSafeRepoFilePath(repoRoot, targetPath);

    if (!fromAbsolute || !toAbsolute) {
      return res.status(400).json({ success: false, message: 'Invalid sourcePath or destinationDir' });
    }

    if (!fs.existsSync(fromAbsolute)) {
      return res.status(404).json({ success: false, message: 'Source item not found' });
    }

    const sourceStat = await fs.promises.stat(fromAbsolute);
    await fs.promises.mkdir(path.dirname(toAbsolute), { recursive: true });

    if (sourceStat.isDirectory()) {
      await copyDirectoryRecursive(fromAbsolute, toAbsolute);
    } else {
      await fs.promises.copyFile(fromAbsolute, toAbsolute);
    }

    await repo.update({ lastPushed: new Date() });
    res.json({ success: true, message: 'Item copied successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete file or folder in repository workspace (protected)
router.delete('/:id/workspace/item', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const targetPath = String(req.query?.targetPath || '').trim();
    const permanent = String(req.query?.permanent || 'false').toLowerCase() === 'true';
    if (!targetPath) {
      return res.status(400).json({ success: false, message: 'targetPath query parameter is required' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const targetAbsolute = resolveSafeRepoFilePath(repoRoot, targetPath);
    if (!targetAbsolute) {
      return res.status(400).json({ success: false, message: 'Invalid targetPath' });
    }

    if (!fs.existsSync(targetAbsolute)) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const normalizedTargetPath = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalizedTargetPath === '.trash' || normalizedTargetPath.startsWith('.trash/')) {
      return res.status(400).json({ success: false, message: 'Cannot delete trash system path directly' });
    }

    if (!permanent) {
      const trashRoot = path.join(repoRoot, '.trash');
      await fs.promises.mkdir(trashRoot, { recursive: true });

      const timestamp = Date.now();
      const baseName = path.basename(normalizedTargetPath);
      const safeName = `${baseName}__${timestamp}`;
      const trashAbsolute = path.join(trashRoot, safeName);

      await fs.promises.rename(targetAbsolute, trashAbsolute);
      const trashIndex = await loadTrashIndex(trashRoot);
      trashIndex[safeName] = {
        originalPath: normalizedTargetPath,
        deletedAt: new Date(timestamp).toISOString()
      };
      await saveTrashIndex(trashRoot, trashIndex);
      await repo.update({ lastPushed: new Date() });

      return res.json({
        success: true,
        message: 'Item moved to trash successfully',
        data: {
          mode: 'trash',
          trashPath: `.trash/${safeName}`
        }
      });
    }

    await fs.promises.rm(targetAbsolute, { recursive: true, force: true });
    await repo.update({ lastPushed: new Date() });

    res.json({ success: true, message: 'Item deleted permanently' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Commit repository workspace changes (protected)
router.post('/:id/workspace/commit', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const message = String(req.body?.message || '').trim() || `DevDock manual commit ${new Date().toISOString()}`;

    const result = await commitAllChanges(repoRoot, message);
    await repo.update({ lastPushed: new Date() });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Read repository file content (protected)
router.get('/:id/file', authMiddleware, async (req, res) => {
  try {
    const repo = await findReadableRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    if (typeof req.query.filePath === 'undefined') {
      return res.status(400).json({ success: false, message: 'filePath query parameter is required' });
    }
    const requestedPath = String(req.query.filePath || '').trim();

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const absolute = resolveSafeRepoFilePath(repoRoot, requestedPath);
    if (!absolute) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    const stat = await fs.promises.stat(absolute);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, message: 'Requested path is not a file' });
    }

    const ext = path.extname(absolute).toLowerCase();
    const buffer = await fs.promises.readFile(absolute);
    const mimeType = detectMimeType(absolute);
    const editable = isEditableTextFile(absolute) || ext === '.docx';
    const textLike = isTextViewableFile(absolute, mimeType);

    // Always stream DOCX as binary so frontend can render formatting faithfully.
    if (ext === '.docx') {
      return res.json({
        success: true,
        data: {
          filePath: requestedPath,
          encoding: 'base64',
          mimeType,
          editable,
          content: buffer.toString('base64')
        }
      });
    }

    if (textLike) {
      return res.json({
        success: true,
        data: {
          filePath: requestedPath,
          encoding: 'utf8',
          mimeType,
          editable,
          content: buffer.toString('utf8')
        }
      });
    }

    res.json({
      success: true,
      data: {
        filePath: requestedPath,
        encoding: 'base64',
        mimeType,
        editable: false,
        content: buffer.toString('base64')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save repository file content (protected)
router.put('/:id/file', authMiddleware, async (req, res) => {
  let repo = null;

  try {
    repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const { filePath, content, encoding, contentFormat } = req.body || {};
    if (typeof filePath !== 'string') {
      return res.status(400).json({ success: false, message: 'filePath is required' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, message: 'content must be a string' });
    }

    if (isBlockedFileType(filePath)) {
      return res.status(400).json({ success: false, message: 'Blocked file type for security reasons' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const absolute = resolveSafeRepoFilePath(repoRoot, filePath);
    if (!absolute) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    const stat = await fs.promises.stat(absolute);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, message: 'Requested path is not a file' });
    }

    if (!isEditableTextFile(absolute)) {
      const ext = path.extname(absolute).toLowerCase();
      if (ext !== '.docx') {
        return res.status(400).json({ success: false, message: 'This file type is not editable' });
      }

      if (contentFormat === 'docx-html') {
        const html = ensureHtmlDocument(content);
        const docxBlob = htmlDocx.asBlob(html);
        const docxBuffer = Buffer.isBuffer(docxBlob)
          ? docxBlob
          : Buffer.from(await docxBlob.arrayBuffer());
        await fs.promises.writeFile(absolute, docxBuffer);
        return res.json({ success: true, message: 'Word file saved successfully' });
      }

      if (encoding === 'base64') {
        const payload = String(content || '').trim();
        const docxBuffer = Buffer.from(payload, 'base64');
        await fs.promises.writeFile(absolute, docxBuffer);
        return res.json({ success: true, message: 'Word file saved successfully' });
      }

      return res.status(400).json({ success: false, message: 'DOCX save requires contentFormat="docx-html" or encoding="base64"' });
    }

    await fs.promises.writeFile(absolute, content, 'utf8');
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    await handleRepositoryFailure(repo, 'file-save', req.body || {});
    res.status(500).json({ success: false, message: error.message });
  }
});

// Download repository file (protected)
router.get('/:id/file/download', authMiddleware, async (req, res) => {
  try {
    const repo = await findReadableRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    if (typeof req.query.filePath === 'undefined') {
      return res.status(400).json({ success: false, message: 'filePath query parameter is required' });
    }
    const requestedPath = String(req.query.filePath || '').trim();

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const absolute = resolveSafeRepoFilePath(repoRoot, requestedPath);
    if (!absolute) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    const stat = await fs.promises.stat(absolute);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, message: 'Requested path is not a file' });
    }

    res.download(absolute, path.basename(absolute));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Import from GitHub (protected)
router.post('/import-github', authMiddleware, async (req, res) => {
  try {
    const { githubUrl } = req.body;

    if (!githubUrl || typeof githubUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'GitHub URL is required' });
    }

    const parsedRepo = parseGitHubRepo(githubUrl);
    if (!parsedRepo) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GitHub URL. Use format https://github.com/owner/repo'
      });
    }

    const { owner, repo } = parsedRepo;
    const normalizedGithubUrl = `https://github.com/${owner}/${repo}`;

    // Create directory for GitHub repos
    const reposDir = path.join(__dirname, '../github-repos');
    if (!fs.existsSync(reposDir)) {
      fs.mkdirSync(reposDir, { recursive: true });
    }

    const repoPath = path.join(reposDir, `${owner}-${repo}-${Date.now()}`);
    
    // Clone the repository
    const git = simpleGit();
    await git.clone(normalizedGithubUrl, repoPath, ['--depth', '1']);

    // Count files and analyze basic structure
    const fileCount = await countFiles(repoPath);
    const languages = await detectLanguages(repoPath);

    // Create repository entry
    const existingCount = await Repository.count({
      where: { name: repo }
    });

    const repositoryName = existingCount > 0 ? `${repo}-${owner}-${Date.now()}` : repo;

    const repository = await Repository.create({
      name: repositoryName,
      description: `Imported from GitHub: ${normalizedGithubUrl}`,
      languages: languages,
      githubUrl: normalizedGithubUrl,
      path: repoPath,
      ownerId: req.user.id,
      collaborators: []
    });

    res.status(201).json({ 
      success: true, 
      data: repository,
      message: `Successfully imported ${owner}/${repo} from GitHub (${fileCount} files)`
    });
  } catch (error) {
    console.error('GitHub import error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to import from GitHub. Make sure the repository is public or you have proper authentication.' 
    });
  }
});

// Helper function to count files in directory
async function countFiles(dirPath) {
  let count = 0;
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        count += await countFiles(path.join(dirPath, entry.name));
      } else if (entry.isFile() && !entry.name.startsWith('.')) {
        count++;
      }
    }
  } catch (error) {
    console.error('Error counting files:', error);
  }
  return count;
}

function ensureHtmlDocument(html) {
  const source = String(html || '').trim();
  if (!source) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body></body></html>';
  }

  if (/<\s*html[\s>]/i.test(source)) {
    return source;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${source}</body></html>`;
}

// Helper function to detect programming languages
async function detectLanguages(dirPath) {
  const languageExtensions = {
    'JavaScript': ['.js', '.jsx', '.mjs'],
    'TypeScript': ['.ts', '.tsx'],
    'Python': ['.py', '.pyw'],
    'Java': ['.java'],
    'Ruby': ['.rb'],
    'Go': ['.go'],
    'Rust': ['.rs'],
    'PHP': ['.php'],
    'C#': ['.cs'],
    'C++': ['.cpp', '.cc', '.cxx'],
    'C': ['.c', '.h'],
    'Swift': ['.swift'],
    'Kotlin': ['.kt'],
    'Scala': ['.scala'],
    'HTML': ['.html', '.htm'],
    'CSS': ['.css', '.scss', '.sass', '.less'],
    'Vue': ['.vue'],
    'Svelte': ['.svelte']
  };

  const detected = new Set();
  
  try {
    const checkDir = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await checkDir(path.join(dir, entry.name));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          for (const [lang, extensions] of Object.entries(languageExtensions)) {
            if (extensions.includes(ext)) {
              detected.add(lang);
            }
          }
        }
      }
    };
    
    await checkDir(dirPath);
  } catch (error) {
    console.error('Error detecting languages:', error);
  }
  
  return Array.from(detected);
}

// Get single repository (protected)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const repo = await findReadableRepository(req.params.id, req.user.id);

    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const analytics = await getRepositoryAnalytics(repo);
    const owner = repo.ownerId
      ? await User.findByPk(repo.ownerId, { attributes: ['id', 'name', 'email'] })
      : null;
    res.json({
      success: true,
      data: {
        ...repo.toJSON(),
        ownerName: owner?.name || null,
        ownerEmail: owner?.email || null,
        analytics
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add or update collaborator (owner only)
router.post('/:id/collaborators', authMiddleware, async (req, res) => {
  try {
    const repo = await Repository.findByPk(req.params.id);
    if (!repo || repo.ownerId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const userId = String(req.body?.userId || '').trim();
    const userQuery = String(req.body?.userQuery || '').trim();
    const permission = String(req.body?.permission || 'read').toLowerCase();
    if (!userId && !userQuery) {
      return res.status(400).json({ success: false, message: 'userId or userQuery is required' });
    }

    if (!['read', 'write', 'admin'].includes(permission)) {
      return res.status(400).json({ success: false, message: 'permission must be read, write, or admin' });
    }

    let resolvedUserId = userId;
    if (!resolvedUserId && userQuery) {
      const targetUser = await User.findOne({
        where: {
          [Op.or]: [
            { email: userQuery },
            { name: userQuery }
          ]
        },
        attributes: ['id', 'email', 'name']
      });

      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Collaborator not found in DevDock users' });
      }

      resolvedUserId = String(targetUser.id);
    }

    const collaborators = normalizeCollaborators(repo.collaborators);
    const index = collaborators.findIndex((entry) => entry.userId === resolvedUserId);
    const next = { userId: resolvedUserId, permission, addedAt: new Date().toISOString() };

    if (index >= 0) {
      collaborators[index] = { ...collaborators[index], ...next };
    } else {
      collaborators.push(next);
    }

    await repo.update({ collaborators });
    res.json({ success: true, data: collaborators });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get commit history
router.get('/:id/history', authMiddleware, async (req, res) => {
  try {
    const repo = await findReadableRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    await ensureGitRepository(repoRoot);
    const git = simpleGit(repoRoot);
    const log = await git.log({ maxCount: 100 });
    const commits = (log.all || []).map((entry) => ({
      hash: entry.hash,
      message: entry.message,
      author: entry.author_name,
      email: entry.author_email,
      timestamp: entry.date
    }));

    res.json({ success: true, data: commits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rollback to a commit and create rollback commit
router.post('/:id/rollback', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnedRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const commitHash = String(req.body?.commitHash || '').trim();
    if (!commitHash) {
      return res.status(400).json({ success: false, message: 'commitHash is required' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const git = simpleGit(repoRoot);
    await git.checkout(commitHash, ['--', '.']);
    await git.add('.');
    const rollbackCommit = await git.commit(`Rollback to ${commitHash.slice(0, 8)}`);
    await repo.update({ lastPushed: new Date() });

    res.json({
      success: true,
      data: {
        rolledBackTo: commitHash,
        rollbackCommit: rollbackCommit.commit
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// README markdown source
router.get('/:id/readme', authMiddleware, async (req, res) => {
  try {
    const repo = await findReadableRepository(req.params.id, req.user.id);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const repoRoot = resolveRepositoryPath(repo.path);
    if (!repoRoot || !fs.existsSync(repoRoot)) {
      return res.status(404).json({ success: false, message: 'Repository path does not exist on server' });
    }

    const readmeCandidates = ['README.md', 'readme.md', 'Readme.md'];
    const found = readmeCandidates
      .map((name) => path.join(repoRoot, name))
      .find((candidate) => fs.existsSync(candidate));

    if (!found) {
      return res.json({ success: true, data: { exists: false, content: '' } });
    }

    const content = await fs.promises.readFile(found, 'utf8');
    res.json({ success: true, data: { exists: true, content } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update repository (protected)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const repo = await findAdminRepository(req.params.id, req.user.id);
    
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const allowedUpdates = ['name', 'description', 'visibility', 'languages', 'githubUrl'];
    const payload = {};
    for (const key of allowedUpdates) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        payload[key] = req.body[key];
      }
    }

    await repo.update(payload);
    res.json({ success: true, data: repo });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete repository (protected)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const repo = await findOwnerRepository(req.params.id, req.user.id);
    
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    const confirmText = String(req.body?.confirmText || req.query?.confirmText || '').trim();
    const owner = await User.findByPk(repo.ownerId, { attributes: ['name', 'email'] });
    const ownerHandle = String(owner?.name || owner?.email || '').trim() || 'owner';
    const expectedFullName = `${ownerHandle}/${repo.name}`;
    const acknowledgement = req.body?.acknowledgeRisk === true || req.query?.acknowledgeRisk === 'true';

    if (!acknowledgement) {
      return res.status(400).json({
        success: false,
        message: 'Please acknowledge this action before deleting the repository.',
        data: {
          requiredConfirmText: expectedFullName,
          acceptedAlternative: repo.name
        }
      });
    }

    if (confirmText !== repo.name && confirmText !== expectedFullName) {
      return res.status(400).json({
        success: false,
        message: 'Repository confirmation text does not match.',
        data: {
          requiredConfirmText: expectedFullName,
          acceptedAlternative: repo.name
        }
      });
    }

    await repo.destroy();
    res.json({ success: true, message: 'Repository deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

async function getRepositoryAnalytics(repo) {
  const repoRoot = resolveRepositoryPath(repo?.path);
  const safeFallback = {
    totalCommits: 0,
    totalFiles: 0,
    lastUpdatedAt: repo?.updatedAt || null,
    visibility: repo?.visibility || 'private'
  };

  if (!repoRoot || !fs.existsSync(repoRoot)) {
    return safeFallback;
  }

  const totalFiles = await countFiles(repoRoot);

  let totalCommits = 0;
  let lastUpdatedAt = repo?.updatedAt || null;
  try {
    await ensureGitRepository(repoRoot);
    const git = simpleGit(repoRoot);
    const log = await git.log({ maxCount: 1 });
    const countRaw = await git.raw(['rev-list', '--count', 'HEAD']);
    totalCommits = Number.parseInt(String(countRaw || '0').trim(), 10) || 0;
    if (log.latest?.date) {
      lastUpdatedAt = log.latest.date;
    }
  } catch {
    // Keep fallback values when git history is unavailable.
  }

  return {
    totalCommits,
    totalFiles,
    lastUpdatedAt,
    visibility: repo.visibility
  };
}

function resolveRepositoryPath(repoPath) {
  if (!repoPath || typeof repoPath !== 'string') {
    return null;
  }

  const hasWindowsDrivePrefix = /^[a-zA-Z]:[\\/]/.test(repoPath);
  const isUncPath = repoPath.startsWith('\\\\');

  // Treat "/uploads/..." style values as workspace-relative, not filesystem root.
  if (path.isAbsolute(repoPath) && (hasWindowsDrivePrefix || isUncPath)) {
    return repoPath;
  }

  const normalizedRelative = repoPath.startsWith('/') || repoPath.startsWith('\\')
    ? repoPath.slice(1)
    : repoPath;

  return path.join(__dirname, '..', normalizedRelative);
}

async function buildFileTree(rootDir, repoRoot, depth, maxDepth, maxEntries, counter) {
  if (depth >= maxDepth || counter.count >= maxEntries) {
    return [];
  }

  const ignoredNames = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    '.next',
    'coverage',
    '.cache',
    'target',
    '.idea',
    '.vscode'
  ]);

  const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });

  const filtered = entries
    .filter((entry) => !ignoredNames.has(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const nodes = [];

  for (const entry of filtered) {
    if (counter.count >= maxEntries) {
      break;
    }

    const absolute = path.join(rootDir, entry.name);
    counter.count += 1;

    if (entry.isDirectory()) {
      const children = await buildFileTree(absolute, repoRoot, depth + 1, maxDepth, maxEntries, counter);
      nodes.push({
        name: entry.name,
        type: 'directory',
        path: path.relative(repoRoot, absolute).split(path.sep).join('/'),
        children
      });
    } else {
      nodes.push({
        name: entry.name,
        type: 'file',
        path: path.relative(repoRoot, absolute).split(path.sep).join('/')
      });
    }
  }

  return nodes;
}

function resolveSafeRepoFilePath(repoRoot, relativePath) {
  const rootStat = fs.existsSync(repoRoot) ? fs.statSync(repoRoot) : null;
  const normalized = relativePath.split('\\').join('/').replace(/^\/+/, '');

  if (!rootStat) {
    return null;
  }

  if (rootStat.isFile()) {
    const rootName = path.basename(repoRoot);
    if (normalized === '' || normalized === rootName) {
      return repoRoot;
    }
    return null;
  }

  const absolute = path.resolve(repoRoot, normalized);
  const normalizedRoot = path.resolve(repoRoot);
  if (absolute === normalizedRoot) {
    return null;
  }

  if (!absolute.startsWith(normalizedRoot + path.sep)) {
    return null;
  }

  return absolute;
}

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.js': 'text/javascript',
    '.jsx': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.html': 'text/html',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.py': 'text/x-python',
    '.java': 'text/x-java-source',
    '.xml': 'application/xml',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf'
    ,'.mp3': 'audio/mpeg'
    ,'.wav': 'audio/wav'
    ,'.ogg': 'audio/ogg'
    ,'.m4a': 'audio/mp4'
    ,'.mp4': 'video/mp4'
    ,'.webm': 'video/webm'
    ,'.mov': 'video/quicktime'
    ,'.avi': 'video/x-msvideo'
    ,'.doc': 'application/msword'
    ,'.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ,'.xls': 'application/vnd.ms-excel'
    ,'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ,'.ppt': 'application/vnd.ms-powerpoint'
    ,'.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ,'.rtf': 'application/rtf'
    ,'.csv': 'text/csv'
    ,'.env': 'text/plain'
    ,'.bat': 'text/plain'
    ,'.cmd': 'text/plain'
    ,'.ps1': 'text/plain'
    ,'.sh': 'text/plain'
    ,'.ini': 'text/plain'
    ,'.toml': 'text/plain'
    ,'.conf': 'text/plain'
    ,'.log': 'text/plain'
    ,'.properties': 'text/plain'
  };

  return map[ext] || 'application/octet-stream';
}

function isTextViewableFile(filePath, mimeType) {
  const normalizedMime = String(mimeType || '').toLowerCase();
  if (normalizedMime.startsWith('text/')) {
    return true;
  }

  if (new Set(['application/json', 'application/xml', 'application/javascript']).has(normalizedMime)) {
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const viewableText = new Set([
    '.env', '.bat', '.cmd', '.ps1', '.sh', '.csv', '.log', '.ini', '.toml', '.conf', '.properties', '.gitignore'
  ]);
  if (viewableText.has(ext)) return true;

  const name = path.basename(filePath).toLowerCase();
  return name === '.env' || name === '.gitignore';
}

function isEditableTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const editable = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.sass', '.less',
    '.html', '.md', '.txt', '.py', '.java', '.xml', '.yml', '.yaml', '.env',
    '.gitignore', '.sql', '.c', '.h', '.cpp', '.cs', '.go',
    '.rb', '.php', '.rs', '.kt', '.swift'
  ]);

  if (editable.has(ext)) return true;

  const name = path.basename(filePath).toLowerCase();
  return name === 'dockerfile' || name === 'makefile' || name === 'readme';
}

function isBlockedFileType(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  const blocked = new Set([
    '.bat', '.cmd', '.com', '.exe', '.dll', '.msi', '.scr', '.pif', '.cpl',
    '.ps1', '.psm1', '.vbs', '.vbe', '.jse', '.wsf', '.wsh', '.hta', '.reg',
    '.jar', '.apk', '.app', '.dmg', '.iso', '.bin', '.sh'
  ]);
  return blocked.has(ext);
}

function toSafeSlug(value) {
  return String(value || 'repo')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'repo';
}

async function ensureGitRepository(repoRoot) {
  const git = simpleGit(repoRoot);
  const hasGit = fs.existsSync(path.join(repoRoot, '.git'));

  if (!hasGit) {
    await git.init();
  }

  const config = await git.listConfig();
  if (!config.all['user.name']) {
    await git.addConfig('user.name', 'DevDock User');
  }
  if (!config.all['user.email']) {
    await git.addConfig('user.email', 'noreply@devdock.local');
  }
}

async function commitAllChanges(repoRoot, message) {
  await ensureGitRepository(repoRoot);

  const git = simpleGit(repoRoot);
  await git.add('.');

  const status = await git.status();
  if (!status.files.length) {
    return { committed: false, message: 'No changes to commit' };
  }

  const commitResult = await git.commit(message);
  return {
    committed: true,
    commit: commitResult.commit,
    summary: commitResult.summary
  };
}

async function handleRepositoryFailure(repo, scope, payload) {
  if (!repo?.path) return;

  const repoRoot = resolveRepositoryPath(repo.path);
  if (!repoRoot || !fs.existsSync(repoRoot)) return;

  const now = Date.now();
  const baseDir = path.join(repoRoot, '.devdock');
  const metadata = {
    repositoryId: repo.id,
    repositoryName: repo.name,
    scope,
    timestamp: new Date(now).toISOString(),
    payload: payload || {}
  };

  await fs.promises.mkdir(baseDir, { recursive: true });

  if (repo.visibility === 'private') {
    const backupsDir = path.join(baseDir, 'backups');
    await fs.promises.mkdir(backupsDir, { recursive: true });
    const backupFile = path.join(backupsDir, `${now}-${toSafeSlug(scope)}.json`);
    await fs.promises.writeFile(backupFile, JSON.stringify(metadata, null, 2), 'utf8');
    await commitAllChanges(repoRoot, `auto-commit backup on failure: ${scope}`);
    return;
  }

  const draftsDir = path.join(baseDir, 'drafts');
  await fs.promises.mkdir(draftsDir, { recursive: true });
  const draftFile = path.join(draftsDir, `${now}-${toSafeSlug(scope)}.json`);
  await fs.promises.writeFile(draftFile, JSON.stringify(metadata, null, 2), 'utf8');
}

async function cleanupUploadedTemps(files) {
  for (const file of files || []) {
    if (!file?.path) continue;
    try {
      await fs.promises.unlink(file.path);
    } catch (error) {
      // Ignore cleanup failures.
    }
  }
}

async function listTrashItems(trashRoot) {
  const trashIndex = await loadTrashIndex(trashRoot);
  const entries = await fs.promises.readdir(trashRoot, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (entry.name === TRASH_INDEX_FILE) continue;
    const absolute = path.join(trashRoot, entry.name);
    const stats = await fs.promises.stat(absolute);
    const parsed = parseTrashEntryName(entry.name);
    const indexed = trashIndex[entry.name] || {};

    const originalPath = normalizeRepoRelativePath(indexed.originalPath || '');
    const originalName = originalPath ? path.basename(originalPath) : parsed.originalName;

    items.push({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      deletedAt: indexed.deletedAt || parsed.deletedAt,
      originalName,
      originalPath,
      trashPath: `.trash/${entry.name}`
    });
  }

  return items.sort((a, b) => {
    const tsA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const tsB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return tsB - tsA;
  });
}

const TRASH_INDEX_FILE = '.index.json';

async function loadTrashIndex(trashRoot) {
  const indexPath = path.join(trashRoot, TRASH_INDEX_FILE);
  if (!fs.existsSync(indexPath)) {
    return {};
  }

  try {
    const raw = await fs.promises.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveTrashIndex(trashRoot, index) {
  await fs.promises.mkdir(trashRoot, { recursive: true });
  const indexPath = path.join(trashRoot, TRASH_INDEX_FILE);
  await fs.promises.writeFile(indexPath, JSON.stringify(index || {}, null, 2), 'utf8');
}

function normalizeRepoRelativePath(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
}

function parseTrashEntryName(name) {
  const value = String(name || '');
  const match = value.match(/^(.*)__([0-9]{10,})$/);
  if (!match) {
    return { originalName: value, deletedAt: null };
  }

  const originalName = match[1] || value;
  const timestamp = Number(match[2]);
  const deletedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;

  return { originalName, deletedAt };
}

async function copyDirectoryRecursive(sourceDir, targetDir) {
  await fs.promises.mkdir(targetDir, { recursive: true });
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await fs.promises.copyFile(sourcePath, targetPath);
    }
  }
}

async function scanRepositoryForRisk(repoRoot) {
  const textExtensions = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rb', '.php',
    '.sh', '.ps1', '.bat', '.cmd', '.sql', '.env', '.json', '.yaml', '.yml', '.toml', '.ini',
    '.html', '.css', '.md', '.txt'
  ]);

  const riskyPatterns = [
    { pattern: /rm\s+-rf\s+\//i, reason: 'Destructive delete command', severity: 'high' },
    { pattern: /Invoke-Expression|IEX\s+/i, reason: 'Dynamic PowerShell execution', severity: 'high' },
    { pattern: /child_process\.(exec|execSync|spawn)\(/i, reason: 'Process execution API usage', severity: 'medium' },
    { pattern: /eval\(/i, reason: 'Dynamic eval execution', severity: 'medium' },
    { pattern: /base64\s*,\s*[^\n]{120,}/i, reason: 'Large embedded payload', severity: 'medium' },
    { pattern: /curl\s+[^\n]*\|\s*(bash|sh)/i, reason: 'Remote script pipe execution', severity: 'high' },
    { pattern: /wget\s+[^\n]*\|\s*(bash|sh)/i, reason: 'Remote script pipe execution', severity: 'high' },
    { pattern: /powershell\.exe\s+-enc/i, reason: 'Encoded PowerShell execution', severity: 'high' },
    { pattern: /process\.env\.[A-Z0-9_]*KEY/i, reason: 'Potential secret handling', severity: 'low' }
  ];

  const findings = [];
  const files = walkForFiles(
    repoRoot,
    (name, fullPath) => {
      const ext = path.extname(name).toLowerCase();
      if (textExtensions.has(ext)) return true;
      return name.toLowerCase() === '.env';
    },
    7
  ).slice(0, 1200);

  for (const fullPath of files) {
    let content = '';
    try {
      content = await fs.promises.readFile(fullPath, 'utf8');
    } catch {
      continue;
    }

    for (const rule of riskyPatterns) {
      if (rule.pattern.test(content)) {
        findings.push({
          filePath: path.relative(repoRoot, fullPath).split(path.sep).join('/'),
          reason: rule.reason,
          severity: rule.severity
        });
      }
    }
  }

  return findings;
}

function walkForFiles(rootDir, matcher, maxDepth = 4, depth = 0, result = []) {
  if (depth > maxDepth) {
    return result;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (!entry) continue;

    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.devdock') {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      walkForFiles(fullPath, matcher, maxDepth, depth + 1, result);
      continue;
    }

    if (entry.isFile() && matcher(entry.name, fullPath)) {
      result.push(fullPath);
    }
  }

  return result;
}

async function recoverMissingRepositoryPath(repo, resolvedPath) {
  const ext = path.extname(resolvedPath || '').toLowerCase();

  // Legacy ZIP path: if archive still exists, extract and return extracted folder.
  if (ext === '.zip' && fs.existsSync(resolvedPath)) {
    return extractZipToRepositoryFolder(resolvedPath, repo?.name || path.basename(resolvedPath, '.zip'));
  }

  // Look for extracted repository folder by naming convention used by imports/uploads.
  const byFolder = findLatestExtractedFolderForRepository(repo?.name || 'repo');
  if (byFolder) {
    return byFolder;
  }

  // If repo path points to a missing ZIP, try locating matching ZIP in uploads and extract it.
  const uploadsDir = path.join(__dirname, '../uploads');
  if (fs.existsSync(uploadsDir)) {
    const zipCandidate = findMatchingZipInUploads(uploadsDir, repo?.name || 'repo');
    if (zipCandidate) {
      return extractZipToRepositoryFolder(zipCandidate, repo?.name || path.basename(zipCandidate, '.zip'));
    }
  }

  return null;
}

function findLatestExtractedFolderForRepository(repoName) {
  const baseDir = path.join(__dirname, '../github-repos');
  if (!fs.existsSync(baseDir)) return null;

  const safeName = String(repoName || 'repo')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(baseDir, entry.name);
      const stats = fs.statSync(fullPath);
      return { name: entry.name.toLowerCase(), fullPath, mtime: stats.mtimeMs };
    })
    .filter((entry) => entry.name.startsWith(`${safeName}-`) || entry.name.includes(`-${safeName}-`) || entry.name.endsWith(`-${safeName}`))
    .sort((a, b) => b.mtime - a.mtime);

  if (entries.length === 0) return null;
  return entries[0].fullPath;
}

function findMatchingZipInUploads(uploadsDir, repoName) {
  const safeName = String(repoName || 'repo').toLowerCase();
  const files = fs.readdirSync(uploadsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.zip'))
    .map((entry) => {
      const fullPath = path.join(uploadsDir, entry.name);
      const stats = fs.statSync(fullPath);
      return { name: entry.name.toLowerCase(), fullPath, mtime: stats.mtimeMs };
    })
    .filter((entry) => entry.name.includes(safeName))
    .sort((a, b) => b.mtime - a.mtime);

  return files[0]?.fullPath || null;
}

function parseGitHubRepo(url) {
  const cleaned = String(url).trim();
  const match = cleaned.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)(?:\/.*)?$/i);

  if (!match) {
    return null;
  }

  const owner = match[1];

  const repo = match[2].replace(/\.git$/i, '');

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

async function extractZipToRepositoryFolder(zipFilePath, repoName) {
  const repositoriesBase = path.join(__dirname, '../github-repos');
  if (!fs.existsSync(repositoriesBase)) {
    fs.mkdirSync(repositoriesBase, { recursive: true });
  }

  const safeName = String(repoName || 'repo')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'repo';

  const extractDir = path.join(repositoriesBase, `${safeName}-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });

  const zip = new AdmZip(zipFilePath);
  zip.extractAllTo(extractDir, true);

  return resolvePreferredRepoRoot(extractDir);
}

function resolvePreferredRepoRoot(extractedPath) {
  let current = extractedPath;

  while (true) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .filter((entry) => entry.name !== '__MACOSX' && entry.name !== '.DS_Store');

    const directories = entries.filter((entry) => entry.isDirectory());
    const files = entries.filter((entry) => entry.isFile());

    if (directories.length === 1 && files.length === 0) {
      current = path.join(current, directories[0].name);
      continue;
    }

    return current;
  }
}
