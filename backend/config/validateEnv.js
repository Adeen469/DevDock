const REQUIRED_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
  'FRONTEND_URL'
];

const AI_KEY_VARS = [
  'OPENROUTER_HEALER_KEY',
  'OPENROUTER_HUNTER_KEY',
  'OPENROUTER_NVIDIA_KEY',
  'OPENROUTER_ARCEE_KEY',
  'OPENROUTER_STEPFUN_KEY',
  'OPENROUTER_META_KEY',
  'OPENROUTER_GOOGLE_KEY',
  'OPENROUTER_OPENAI_KEY',
  'GROQ_API_KEY'
];

function isSet(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateEnv(env = process.env) {
  const missing = REQUIRED_VARS.filter((key) => !isSet(env[key]));

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (!/^\d+$/.test(String(env.DB_PORT))) {
    throw new Error('DB_PORT must be a valid numeric value.');
  }

  if (String(env.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }

  if (String(env.JWT_SECRET).includes('change_in_production')) {
    if (env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is using a default placeholder. Replace it with a strong secret.');
    }

    // Keep local development moving while still warning loudly.
    console.warn('[security warning] JWT_SECRET appears to be a default placeholder. Replace it before deployment.');
  }

  const hasAnyAiKey = AI_KEY_VARS.some((key) => isSet(env[key]));
  if (!hasAnyAiKey) {
    throw new Error('At least one AI key must be configured (OpenRouter or GROQ).');
  }

  return true;
}

module.exports = { validateEnv };