const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Model configurations with limits
const models = [
  {
    name: 'healer',
    apiKey: process.env.OPENROUTER_HEALER_KEY,
    model: 'meta-llama/llama-3-70b-instruct',
    limit: 200,
    category: 'all',
    requestsToday: 0,
    lastReset: Date.now()
  },
  {
    name: 'hunter',
    apiKey: process.env.OPENROUTER_HUNTER_KEY,
    model: 'openai/gpt-3.5-turbo',
    limit: 200,
    category: 'all',
    requestsToday: 0,
    lastReset: Date.now()
  },
  {
    name: 'nvidia',
    apiKey: process.env.OPENROUTER_NVIDIA_KEY,
    model: 'meta-llama/llama-3-8b-instruct',
    limit: 50,
    category: 'tech',
    requestsToday: 0,
    lastReset: Date.now()
  },
  {
    name: 'arcee',
    apiKey: process.env.OPENROUTER_ARCEE_KEY,
    model: 'meta-llama/llama-3-8b-instruct',
    limit: 200,
    category: 'all',
    requestsToday: 0,
    lastReset: Date.now()
  },
  {
    name: 'stepfun',
    apiKey: process.env.OPENROUTER_STEPFUN_KEY,
    model: 'meta-llama/llama-3-70b-instruct',
    limit: 200,
    category: 'all',
    requestsPerWeek: 20000,
    requestsThisWeek: 0,
    lastReset: Date.now()
  },
  {
    name: 'meta',
    apiKey: process.env.OPENROUTER_META_KEY,
    model: 'meta-llama/llama-3-70b-instruct',
    limit: 30,
    category: 'all',
    requestsToday: 0,
    lastReset: Date.now()
  },
  {
    name: 'google',
    apiKey: process.env.OPENROUTER_GOOGLE_KEY,
    model: 'openai/gpt-3.5-turbo',
    limit: 30,
    category: 'all',
    requestsToday: 0,
    lastReset: Date.now()
  },
  {
    name: 'openai',
    apiKey: process.env.OPENROUTER_OPENAI_KEY,
    model: 'openai/gpt-3.5-turbo',
    limit: 30,
    category: 'all',
    requestsToday: 0,
    lastReset: Date.now()
  }
];

class AIService {
  constructor() {
    this.currentModelIndex = 0;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.skillPrompt = this.loadHumanizerSkillPrompt();
    this.assistantSkillPrompt = this.buildAssistantSkillPrompt(this.skillPrompt);
    this.requestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 10000);
  }

  buildAssistantSkillPrompt(fullPrompt) {
    const compact = String(fullPrompt || '').trim();
    if (!compact) {
      return 'You are an expert QA automation assistant.';
    }

    // Keep assistant interactions fast by sending a compact skill context.
    return compact.length > 2500 ? compact.slice(0, 2500) : compact;
  }

  loadHumanizerSkillPrompt() {
    try {
      const skillPath = path.resolve(__dirname, '../../humanizer-main/SKILL.md');
      const raw = fs.readFileSync(skillPath, 'utf8');
      const sanitized = String(raw || '').trim();
      if (!sanitized) {
        return 'You are an expert QA automation assistant.';
      }

      // Keep prompt size bounded for provider limits while preserving skill intent.
      return sanitized.length > 12000 ? sanitized.slice(0, 12000) : sanitized;
    } catch {
      return 'You are an expert QA automation assistant.';
    }
  }

  // Check if model has reached its limit
  hasReachedLimit(model) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;

    // Reset daily limits
    if (now - model.lastReset > oneDay) {
      model.requestsToday = 0;
      model.requestsThisWeek = 0;
      model.lastReset = now;
    }

    // Reset weekly limits
    if (now - model.lastReset > oneWeek) {
      model.requestsThisWeek = 0;
      model.lastReset = now;
    }

    // Check daily limit
    if (model.limit && model.requestsToday >= model.limit) {
      return true;
    }

    // Check weekly limit
    if (model.requestsPerWeek && model.requestsThisWeek >= model.requestsPerWeek) {
      return true;
    }

    return false;
  }

  // Get next available model
  getNextAvailableModel() {
    let attempts = 0;
    const startIndex = this.currentModelIndex;

    while (attempts < models.length) {
      const model = models[this.currentModelIndex];
      
      if (!this.hasReachedLimit(model)) {
        return model;
      }

      this.currentModelIndex = (this.currentModelIndex + 1) % models.length;
      attempts++;
    }

    // If all models are at limit, return the one with most remaining capacity
    return models.reduce((best, current) => {
      const bestRemaining = best.limit - best.requestsToday;
      const currentRemaining = current.limit - current.requestsToday;
      return currentRemaining > bestRemaining ? current : best;
    });
  }

  // Main method to generate AI response
  async generateResponse(prompt, options = {}) {
    const retryCount = Number(options._retryCount || 0);
    const maxRetries = Number(options.maxRetries || models.length + 2);
    if (retryCount > maxRetries) {
      return {
        success: false,
        error: 'All configured AI models are temporarily unavailable or rate-limited.',
        model: options.modelName || 'auto'
      };
    }

    let preferredModel = options.modelName
      ? models.find((m) => m.name === options.modelName)
      : null;

    // If the selected model is already exhausted, gracefully fall back.
    if (preferredModel && this.hasReachedLimit(preferredModel)) {
      preferredModel = null;
    }

    const model = preferredModel || this.getNextAvailableModel();

    if (!model || !model.apiKey) {
      return {
        success: false,
        error: 'No valid AI model/API key is configured.',
        model: options.modelName || 'auto'
      };
    }
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: model.model,
          messages: [
            {
              role: 'system',
              content: [
                options.useCompactSkillPrompt ? this.assistantSkillPrompt : this.skillPrompt,
                'Additional platform context: You are an expert DevDock repository assistant. Help with repository management, collaboration workflows, commit history, code understanding, and safe development guidance.'
              ].join('\n\n')
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 2048,
          top_p: options.topP || 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${model.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.FRONTEND_URL,
            'X-Title': 'DevDock'
          },
          timeout: Number(options.timeoutMs || this.requestTimeoutMs)
        }
      );

      // Increment request count
      model.requestsToday++;
      if (model.requestsPerWeek) {
        model.requestsThisWeek++;
      }

      // Rotate after each successful request so all configured models are used when no explicit model is requested.
      if (!preferredModel) {
        this.currentModelIndex = (this.currentModelIndex + 1) % models.length;
      }

      return {
        success: true,
        data: response.data.choices[0].message.content,
        model: model.name,
        usage: response.data.usage
      };

    } catch (error) {
      console.error(`Error with model ${model.name}:`, error.response?.data || error.message);
      
      // If rate limited or error, switch to next model and retry
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      if (isTimeout || error.response?.status === 429 || error.response?.status >= 500) {
        model.requestsToday = model.limit; // Mark as exhausted

        const nextOptions = {
          ...options,
          _retryCount: retryCount + 1
        };

        // If a specific model fails, retry in auto mode.
        if (preferredModel) {
          delete nextOptions.modelName;
        }

        return this.generateResponse(prompt, nextOptions);
      }

      // Move cursor forward on non-retriable model failures when auto-modeling.
      if (!preferredModel) {
        this.currentModelIndex = (this.currentModelIndex + 1) % models.length;
      }

      return {
        success: false,
        error: error.message,
        model: model.name
      };
    }
  }

  // Generate test plan
  async generateTestPlan(repoData, testType) {
    const prompt = `Analyze this repository and create a comprehensive test plan:

Repository: ${repoData.name}
Description: ${repoData.description}
Languages: ${repoData.languages.join(', ')}
Test Type: ${testType}

Please provide:
1. Test objectives
2. Scope (in-scope and out-of-scope)
3. Test strategy (${testType} approach)
4. Resource requirements
5. Risk analysis
6. Test deliverables`;

    return await this.generateResponse(prompt, { maxTokens: 3000 });
  }

  // Generate test cases
  async generateTestCases(requirements, testType) {
    const prompt = `Generate detailed test cases based on these requirements:

${requirements}

Test Type: ${testType}

For each test case, provide:
- Test Case ID
- Title
- Module
- Priority (critical/high/medium/low)
- Test Method (${testType})
- Steps to execute
- Expected result`;

    return await this.generateResponse(prompt, { maxTokens: 4000 });
  }

  // Analyze code completeness
  async analyzeCompleteness(codebase) {
    const prompt = `Analyze this codebase for completeness and identify gaps:

${codebase}

Please identify:
1. Missing functionality
2. Incomplete implementations
3. Potential security issues
4. Error handling gaps
5. Edge cases not covered

Format your response with clear sections for each gap found.`;

    return await this.generateResponse(prompt, { maxTokens: 3000 });
  }

  // Generate defect report
  async generateDefectReport(failedTests, completenessAnalysis) {
    const prompt = `Generate a comprehensive defect report based on:

Failed Tests:
${failedTests}

Completeness Analysis:
${completenessAnalysis}

For each defect, provide:
- Defect ID
- Title
- Module
- Severity (critical/high/medium/low)
- Description
- Steps to reproduce
- Expected behavior
- Actual behavior
- Recommendation`;

    return await this.generateResponse(prompt, { maxTokens: 4000 });
  }

  // Get model statistics
  getModelStats() {
    return models.map(m => ({
      name: m.name,
      requestsToday: m.requestsToday,
      limit: m.limit,
      remaining: m.limit - m.requestsToday,
      percentageUsed: ((m.requestsToday / m.limit) * 100).toFixed(1)
    }));
  }

  getModelCatalog() {
    return models.map((m) => ({
      name: m.name,
      providerModel: m.model,
      category: m.category,
      limit: m.limit,
      requestsToday: m.requestsToday
    }));
  }

  async generateAssistantResponse(question, options = {}) {
    const prompt = `User question:\n${question}\n\nRespond with practical, safe, and concise guidance for developers using DevDock.`;

    return this.generateResponse(prompt, {
      temperature: 0.4,
      maxTokens: options.maxTokens || 700,
      modelName: options.modelName,
      useCompactSkillPrompt: true,
      maxRetries: options.maxRetries || 2,
      timeoutMs: options.timeoutMs || this.requestTimeoutMs
    });
  }

  async analyzeRepositorySecurity(scanSummary, options = {}) {
    const prompt = `You are a secure code analyst. Analyze this repository scan summary and identify potential malicious or risky code patterns.\n\nScan summary:\n${scanSummary}\n\nReturn JSON with keys: riskLevel (low|medium|high), findings (array of {filePath, reason, severity}), summary.`;

    return this.generateResponse(prompt, {
      temperature: 0.1,
      maxTokens: options.maxTokens || 1200,
      modelName: options.modelName
    });
  }

  async generateCodeCompletion(context, options = {}) {
    const prefix = String(context?.prefix || '');
    const suffix = String(context?.suffix || '');
    const language = String(context?.language || 'plaintext');
    const filePath = String(context?.filePath || '');

    const prompt = [
      'You are an inline code completion engine.',
      'Return only the code continuation text.',
      'Do not include markdown, backticks, comments about what you did, or explanations.',
      'Do not repeat the existing prefix unless required for syntax closure.',
      'If a punctuation-only completion is best (for example ; ) return only that punctuation.',
      'Prefer minimal valid completion over long completions.',
      `Language: ${language}`,
      filePath ? `File: ${filePath}` : 'File: unknown',
      'Code before cursor:',
      prefix,
      'Code after cursor:',
      suffix,
      'Return only the best short completion.'
    ].join('\n\n');

    const response = await this.generateResponse(prompt, {
      temperature: options.temperature || 0.2,
      maxTokens: options.maxTokens || 60,
      modelName: options.modelName,
      timeoutMs: options.timeoutMs || 7000,
      maxRetries: options.maxRetries || 1,
      useCompactSkillPrompt: true
    });

    if (!response.success) {
      return response;
    }

    const cleaned = String(response.data || '')
      .replace(/^```[a-zA-Z]*\s*/g, '')
      .replace(/```$/g, '')
      .trim();

    return {
      ...response,
      data: cleaned
    };
  }
}

module.exports = new AIService();
