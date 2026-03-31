const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));

// Security Middleware: API Key check
const API_KEY = process.env.API_KEY || 'your-default-secure-key';
app.use((req, res, next) => {
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && apiKeyHeader === API_KEY) {
    next();
  } else {
    res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid API Key' });
  }
});

// Models (will be imported properly in production)
const User = require('./models/User');
const Task = require('./models/Task');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- API Implementation (Matching GAS Actions) ---

app.post('/api', async (req, res) => {
  const { action, data, executorId } = req.body;
  
  try {
    let result = {};
    
    switch (action) {
      case 'login':
        const user = await User.findOne({ Username: data.username, Password: data.password });
        if (!user) throw new Error('Invalid username or password');
        result = user;
        break;
        
      case 'getTasksSummary':
        const tasks = await Task.find({}, 'ID Detail Status Priority StartDate DueDate UserID StaffName Department CustomFields CreatedAt CompletedAt Image1 Image2 Image3 Image4');
        result = tasks.map(t => ({
          ...t.toObject(),
          HasImages: !!(t.Image1 || t.Image2 || t.Image3 || t.Image4)
        }));
        break;

      case 'addTask':
        const newTask = new Task({
          ...data,
          ID: data.ID || require('uuid').v4(),
        });
        await newTask.save();
        result = { message: 'Task added successfully' };
        break;

      // Add other cases matching Code.gs...
      
      default:
        throw new Error(`Action ${action} not implemented yet`);
    }
    
    res.json({ status: 'success', data: result });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
