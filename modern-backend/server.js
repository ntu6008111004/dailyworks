const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { createAiRouter } = require('./aiRouter');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.API_KEY;
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',').map(origin => origin.trim()).filter(Boolean)
);

app.set('trust proxy', process.env.TRUST_PROXY === 'true');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed'));
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  methods: ['GET', 'POST', 'OPTIONS'],
}));
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
