const GAS_URL = import.meta.env.VITE_GAS_WEBAPP_URL;

// Simple in-memory cache and request deduplication
const cache = new Map();
const pendingRequests = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const apiService = {
  executorId: 'System',
  userId: '',

  setExecutor(id) {
    this.executorId = id || 'System';
  },

  setUserSession(userId, displayName) {
    this.userId = String(userId || '');
    this.executorId = String(userId || displayName || 'System');
  },

  clearCache() {
    cache.clear();
  },

  async request(action, data = {}, options = { useCache: false }) {
    const cacheKey = options.useCache ? JSON.stringify({ action, data }) : null;

    if (cacheKey) {
      if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          return cached.data;
        }
        cache.delete(cacheKey); // Expired
      }

      if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
      }
    }

    const fetchPromise = (async () => {
      try {
        const response = await fetch(GAS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain', // Avoid CORS preflight options
          },
          body: JSON.stringify({ 
            action, 
            data, 
            executorId: this.executorId 
          }),
        });
        
        const result = await response.json();
        if (result.status === 'error') throw new Error(result.message);
        
        if (cacheKey) {
          cache.set(cacheKey, { data: result.data, timestamp: Date.now() });
        }
        return result.data;
      } catch (error) {
        console.error('API Error:', error);
        throw error;
      } finally {
        if (cacheKey) pendingRequests.delete(cacheKey);
      }
    })();

    if (cacheKey) {
      pendingRequests.set(cacheKey, fetchPromise);
    }

    return fetchPromise;
  },

  login(username, password) {
    return this.request('login', { username, password });
  },

  getTasks() {
    return this.request('getTasks');
  },

  getTasksSummary() {
    return this.request('getTasksSummary', {}, { useCache: true });
  },

  getTasksPaged(page, pageSize, filters = {}) {
    // Enabled caching so that prefetching on hover works efficiently.
    // Mutations (add/edit/delete) will clear the cache anyway.
    return this.request('getTasksPaged', { page, pageSize, ...filters }, { useCache: true });
  },

  getInitData(userId) {
    return this.request('init', { userId }, { useCache: true });
  },

  getTaskById(id) {
    return this.request('getTaskById', { id });
  },

  addTask(task) {
    const data = { ...task };
    if (!data.UserID && this.userId) data.UserID = this.userId;
    this.clearCache();
    return this.request('addTask', data);
  },

  updateTask(task) {
    const data = { ...task };
    if (!data.UserID && this.userId) data.UserID = this.userId;
    this.clearCache();
    return this.request('updateTask', data);
  },

  deleteTask(id) {
    this.clearCache();
    return this.request('deleteTask', { id });
  },

  getUsers(options = {}) {
    return this.request('getUsers', options, { useCache: true });
  },

  addUser(user) {
    if (user.Password) user.Password = btoa(user.Password);
    this.clearCache();
    return this.request('addUser', user);
  },

  updateUser(user) {
    if (user.Password && !user.Password.endsWith('==')) user.Password = btoa(user.Password);
    this.clearCache();
    return this.request('updateUser', user);
  },

  deleteUser(id) {
    this.clearCache();
    return this.request('deleteUser', { id });
  },

  uploadImage(base64, filename, mimeType) {
    return this.request('uploadImage', { base64, filename, mimeType });
  },

  migrateUsersSheet() {
    return this.request('MIGRATE_USERS_SHEET');
  },
  
  migrateTasksSheet() {
    return this.request('MIGRATE_TASKS_SHEET');
  },

  // Positions Master Data
  getPositions() {
    return this.request('getPositions', {}, { useCache: true });
  },
  addPosition(data) {
    this.clearCache();
    return this.request('addPosition', data);
  },
  updatePosition(data) {
    this.clearCache();
    return this.request('updatePosition', data);
  },
  deletePosition(id) {
    this.clearCache();
    return this.request('deletePosition', { id });
  },
  migratePositionsSheet() {
    return this.request('MIGRATE_POSITIONS_SHEET');
  },
  migrateUsersAddPosition() {
    return this.request('MIGRATE_USERS_ADD_POSITION');
  },
  migrateUsersAddPermissions() {
    return this.request('MIGRATE_USERS_ADD_PERMISSIONS');
  },
  migrateUsersPositionToId() {
    return this.request('MIGRATE_USERS_POSITION_TO_ID');
  },

  // Role/Permissions update (re-uses updateUser)
  updateUserPermissions(userId, permissions) {
    this.clearCache();
    return this.request('updateUser', { ID: userId, Permissions: permissions });
  },

  // Helper moved from components for consistency
  isOverdue(task) {
    if (!task || !task.DueDate) return false;
    
    // Normalize today to start of day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Parse DueDate (GAS returns yyyy-MM-dd)
    const dueDate = new Date(task.DueDate);
    dueDate.setHours(0, 0, 0, 0);

    if (task.Status === 'เสร็จสิ้น') {
      if (!task.CompletedAt) return false;
      // GAS returns ISO string for CompletedAt now
      const completedDate = new Date(task.CompletedAt);
      completedDate.setHours(0, 0, 0, 0);
      return completedDate > dueDate;
    }

    return today > dueDate;
  }
};
