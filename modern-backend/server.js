const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { createAiRouter } = require('./aiRouter');
const { createCorsOptions } = require('./lib/corsConfig');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.API_KEY;
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;
app.set('trust proxy', process.env.TRUST_PROXY === 'true');
// ---------------------------------------------------------------------------
// Public ThaiLLM proxy for AETHRA ORACLE (fortune-telling site on GitHub Pages)
//
// Why this exists: ThaiLLM returns access-control-allow-origin:* but the
// Cloudflare edge in front of it intermittently blocks browser requests from
// public origins, so the browser talks to this server instead.
//
// Why it is mounted BEFORE the global cors() middleware and uses its own
// permissive CORS: this endpoint is public and must not depend on the
// CORS_ORIGINS allowlist that governs the private CatLog app. Changing
// CORS_ORIGINS for CatLog must never break the fortune-telling site.
//
// Safety: no cookies or credentials are involved, the upstream API key never
// reaches the browser, the payload is size-capped, and calls are rate limited.
// ---------------------------------------------------------------------------
const aethraCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  maxAge: 86400,
});

const AETHRA_LIMIT = { windowMs: 60_000, max: 20, hits: new Map() };
function aethraRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const entry = AETHRA_LIMIT.hits.get(key) || { count: 0, start: now };
  if (now - entry.start > AETHRA_LIMIT.windowMs) { entry.count = 0; entry.start = now; }
  entry.count += 1;
  AETHRA_LIMIT.hits.set(key, entry);
  if (AETHRA_LIMIT.hits.size > 5000) AETHRA_LIMIT.hits.clear();
  if (entry.count > AETHRA_LIMIT.max) {
    return res.status(429).json({ error: { message: 'Too many requests, please slow down' } });
  }
  return next();
}

app.options('/api/thaillm/*', aethraCors);

app.get('/api/thaillm/health', aethraCors, (req, res) => {
  res.json({
    success: true,
    configured: Boolean(process.env.THAILLM_API_KEY),
    provider: 'CatLog ThaiLLM proxy',
  });
});

app.post(
  '/api/thaillm/chat/completions',
  aethraCors,
  express.json({ limit: '256kb' }),
  aethraRateLimit,
  async (req, res) => {
    const apiKey = process.env.THAILLM_API_KEY;
    if (!apiKey) return res.status(503).json({ error: { message: 'ThaiLLM is not configured' } });

    const body = req.body || {};
    const messages = Array.isArray(body.messages)
      ? body.messages
        .slice(-16)
        .map((m) => ({
          role: m && m.role === 'system' ? 'system' : (m && m.role === 'assistant' ? 'assistant' : 'user'),
          content: String((m && m.content) || '').slice(0, 12000),
        }))
        .filter((m) => m.content)
      : [];
    if (!messages.length) return res.status(400).json({ error: { message: 'messages is required' } });

    try {
      const upstream = await fetch(
        process.env.THAILLM_API_URL || 'https://thaillm.or.th/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: process.env.THAILLM_MODEL || 'pathumma-thaillm-qwen3-8b-think-3.0.0',
            max_tokens: Math.min(Number(body.max_tokens) || 4096, 6144),
            temperature: Math.min(Math.max(Number(body.temperature) || 0.55, 0), 1),
            messages,
          }),
          signal: AbortSignal.timeout(90_000),
        },
      );
      const payload = await upstream.json().catch(() => ({}));
      return res.status(upstream.ok ? 200 : upstream.status).json(payload);
    } catch (error) {
      const timedOut = error && error.name === 'TimeoutError';
      return res
        .status(timedOut ? 504 : 502)
        .json({ error: { message: timedOut ? 'Upstream timeout' : 'Upstream unreachable' } });
    }
  },
);

app.use(cors(createCorsOptions(process.env.CORS_ORIGINS)));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(morgan('dev'));

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function requireLegacyApiKey(req, res, next) {
  if (!API_KEY) return res.status(503).json({ status: 'error', message: 'Legacy API is not configured' });
  if (!safeEqual(req.get('x-api-key') || '', API_KEY)) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  return next();
}

// AI routes use short-lived, user-bound sessions; they must not use a browser-shared API key.
app.use('/api/ai', createAiRouter({ supabase: supabaseAdmin, env: process.env }));

app.post('/api', requireLegacyApiKey, async (req, res) => {
  const { action, data = {} } = req.body || {};
  try {
    let result = {};
    if (action === 'login') {
      if (typeof data.username !== 'string' || typeof data.password !== 'string') {
        return res.status(400).json({ status: 'error', message: 'Invalid credentials' });
      }
      const User = require('./models/User');
      const user = await User.findOne({ Username: data.username, Password: data.password })
        .select('-Password').lean();
      if (!user) return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      result = user;
    } else if (action === 'getTasksSummary') {
      const Task = require('./models/Task');
      const tasks = await Task.find(
        {},
        'ID Detail Status Priority StartDate DueDate UserID StaffName Department CustomFields CreatedAt CompletedAt Image1 Image2 Image3 Image4'
      ).lean();
      result = tasks.map(task => Object.assign({}, task, {
        HasImages: Boolean(task.Image1 || task.Image2 || task.Image3 || task.Image4),
      }));
    } else if (action === 'addTask') {
      const Task = require('./models/Task');
      const newTask = new Task(Object.assign({}, data, { ID: data.ID || require('uuid').v4() }));
      await newTask.save();
      result = { message: 'Task added successfully' };
    } else {
      throw new Error('Action ' + action + ' not implemented yet');
    }
    return res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Legacy API error:', error.message);
    return res.status(400).json({ status: 'error', message: 'Request failed' });
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { fallthrough: false }));

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(error => console.error('MongoDB connection error:', error.message));
}

if (require.main === module) {
  app.listen(PORT, () => console.log('Server running on port ' + PORT));
}

module.exports = { app, requireLegacyApiKey };
