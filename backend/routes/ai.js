const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const aiService = require('../services/aiService');

// Get model statistics
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const stats = aiService.getModelStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get available assistant models
router.get('/models', authMiddleware, (req, res) => {
  try {
    const catalog = aiService.getModelCatalog();
    res.json({ success: true, data: catalog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Assistant chat endpoint
router.post('/assistant-chat', authMiddleware, async (req, res) => {
  try {
    const { message, modelName } = req.body || {};
    const trimmed = String(message || '').trim();

    if (!trimmed) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    const enrichedPrompt = [
      'You are DevDock Assistant.',
      'Expertise areas: programming, DSA, cybersecurity fundamentals, science and technology, biology basics, AI/ML, and Indian legal awareness in general informational terms.',
      'When answering legal/safety-sensitive questions, advise users to consult qualified professionals for formal decisions.',
      `Question: ${trimmed}`
    ].join('\n\n');

    const timeoutMs = Number(process.env.ASSISTANT_TIMEOUT_MS || 12000);
    const result = await Promise.race([
      aiService.generateAssistantResponse(enrichedPrompt, {
        modelName: modelName ? String(modelName) : undefined,
        timeoutMs,
        maxRetries: 2
      }),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: false,
            error: 'Assistant took too long. Please try a shorter prompt.',
            model: modelName || 'auto'
          });
        }, timeoutMs + 300);
      })
    ]);

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: result.error || 'Assistant generation failed',
        model: result.model
      });
    }

    res.json({
      success: true,
      data: {
        reply: result.data,
        model: result.model,
        usage: result.usage
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Inline code completion endpoint
router.post('/code-complete', authMiddleware, async (req, res) => {
  try {
    const { prefix, suffix, language, filePath, modelName } = req.body || {};

    const safePrefix = String(prefix || '');
    if (!safePrefix.trim()) {
      return res.status(400).json({ success: false, message: 'prefix is required' });
    }

    const result = await aiService.generateCodeCompletion(
      {
        prefix: safePrefix.slice(-4000),
        suffix: String(suffix || '').slice(0, 1000),
        language: String(language || 'plaintext'),
        filePath: String(filePath || '')
      },
      {
        modelName: modelName ? String(modelName) : undefined,
        maxTokens: 60,
        timeoutMs: Number(process.env.AI_CODE_COMPLETE_TIMEOUT_MS || 7000),
        maxRetries: 1
      }
    );

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: result.error || 'Code completion failed',
        model: result.model
      });
    }

    res.json({
      success: true,
      data: {
        completion: result.data || '',
        model: result.model,
        usage: result.usage
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
