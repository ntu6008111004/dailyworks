const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://dailyworks-nu.vercel.app',
];

function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    return new URL(value.trim()).origin;
  } catch {
    return '';
  }
}

function buildAllowedOrigins(value = '') {
  const configured = String(value)
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_CORS_ORIGINS);
}

function createCorsOptions(value = '') {
  const allowedOrigins = buildAllowedOrigins(value);
  return {
    origin(origin, callback) {
      const normalized = normalizeOrigin(origin);
      if (!origin || allowedOrigins.has(normalized)) return callback(null, true);
      const error = new Error('Origin is not allowed');
      error.code = 'CORS_ORIGIN_DENIED';
      return callback(error);
    },
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    methods: ['GET', 'POST', 'OPTIONS'],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  };
}

module.exports = {
  DEFAULT_CORS_ORIGINS,
  buildAllowedOrigins,
  createCorsOptions,
  normalizeOrigin,
};
