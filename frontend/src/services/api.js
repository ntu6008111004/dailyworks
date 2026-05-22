const GAS_URL = import.meta.env.VITE_GAS_WEBAPP_URL;

// ───────────────────────────────────────────────────────────────────────────
// Tiered in-memory cache — different TTLs for different data types
// ───────────────────────────────────────────────────────────────────────────
const cache = new Map();
const pendingRequests = new Map();
let lastMutationAt = 0;  // Tracks when the last data mutation happened

// Tiered TTL config (milliseconds)
const CACHE_TTL = {
  getTasksSummary: 30 * 1000,   // 30s — tasks change often
  getTasksPaged:   30 * 1000,   // 30s
  getTasks:        30 * 1000,   // 30s
  getUsers:        120 * 1000,  // 2min — users rarely change
  init:            120 * 1000,  // 2min — init data is stable
  getPositions:    300 * 1000,  // 5min — positions almost never change
  getBriefings:    30 * 1000,   // 30s
  getBriefingResponses: 30 * 1000,
  _default:        30 * 1000,
};

function getTTL(action) {
  return CACHE_TTL[action] || CACHE_TTL._default;
}

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
    window.dispatchEvent(new CustomEvent('cache-cleared'));
  },

  // Selective cache invalidation — only clear keys matching specific actions
  clearCacheFor(...actions) {
    lastMutationAt = Date.now();  // Mark mutation time
    for (const [key] of cache) {
      try {
        const parsed = JSON.parse(key);
        if (actions.includes(parsed.action)) {
          cache.delete(key);
        }
      } catch { /* skip non-JSON keys */ }
    }
    window.dispatchEvent(new CustomEvent('cache-cleared'));
  },

  mutateSummaryCache(actionType, taskOrId) {
    const summaryKey = JSON.stringify({ action: 'getTasksSummary', data: {} });
    if (cache.has(summaryKey)) {
      let tasks = cache.get(summaryKey).data;
      if (actionType === 'add') {
         tasks = [taskOrId, ...tasks];
      } else if (actionType === 'update') {
         tasks = tasks.map(t => String(t.ID) === String(taskOrId.ID) ? { ...t, ...taskOrId } : t);
      } else if (actionType === 'delete') {
         tasks = tasks.filter(t => String(t.ID) !== String(taskOrId));
      }
      cache.set(summaryKey, { data: tasks, timestamp: Date.now() });
      window.dispatchEvent(new CustomEvent('tasks-optimistic-update'));
    }
  },

  // Patch a single task field in all page caches without clearing them
  mutatePagesCache(taskPatch) {
    for (const [key, entry] of cache.entries()) {
      try {
        const parsed = JSON.parse(key);
        if (parsed.action === 'getTasksPaged' && Array.isArray(entry.data?.tasks)) {
          const updated = entry.data.tasks.map(t =>
            String(t.ID) === String(taskPatch.ID) ? { ...t, ...taskPatch } : t
          );
          cache.set(key, { data: { ...entry.data, tasks: updated }, timestamp: entry.timestamp });
        }
      } catch { /* skip non-JSON keys */ }
    }
  },

  async request(action, data = {}, options = { useCache: false }) {
    const cacheKey = options.useCache ? JSON.stringify({ action, data }) : null;
    const ttl = getTTL(action);

    if (cacheKey) {
      if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        const age = Date.now() - cached.timestamp;

        // If cache was created BEFORE the last mutation, skip it entirely
        // This ensures users always see fresh data after editing
        const createdBeforeMutation = cached.timestamp < lastMutationAt;

        if (age < ttl && !createdBeforeMutation) {
          return cached.data;  // Fresh & no mutation since — return immediately
        }

        // Stale-while-revalidate: return stale data immediately,
        // then refresh in background for next request
        // BUT: skip this if there was a recent mutation (force fresh fetch)
        if (age < ttl * 3 && !createdBeforeMutation) {
          if (!pendingRequests.has(cacheKey)) {
            this._fetchAndCache(action, data, cacheKey, ttl);
          }
          return cached.data;  // Return stale immediately
        }

        cache.delete(cacheKey);  // Too old — discard
      }

      if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
      }
    }

    return this._fetchAndCache(action, data, cacheKey, ttl);
  },

  // Internal: performs the actual fetch and updates cache
  async _fetchAndCache(action, data, cacheKey, ttl) {
    const fetchPromise = (async () => {
      try {
        const urlWithBuster = new URL(GAS_URL);
        urlWithBuster.searchParams.set('t', Date.now());

        const headers = {
          'Content-Type': 'text/plain', // Avoid CORS preflight options
        };

        const apiKey = import.meta.env.VITE_API_KEY;
        if (apiKey) {
          headers['x-api-key'] = apiKey;
        }

        const response = await fetch(urlWithBuster.toString(), {
          method: 'POST',
          headers: headers,
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
    return this.request('init', { userId }, { useCache: false });
  },

  getTaskById(id) {
    return this.request('getTaskById', { id });
  },

  addTask(task) {
    const data = { ...task };
    if (!data.UserID && this.userId) data.UserID = this.userId;
    return this.request('addTask', data).then(res => {
      this.clearCacheFor('getTasksSummary', 'getTasksPaged', 'getTasks');
      return res;
    });
  },

  updateTask(task) {
    const data = { ...task };
    if (!data.UserID && this.userId) data.UserID = this.userId;
    return this.request('updateTask', data).then(res => {
      this.clearCacheFor('getTasksSummary', 'getTasksPaged', 'getTasks');
      return res;
    });
  },

  // Status-only update: patches cache in-place so the UI never snaps back
  updateTaskStatus(taskId, newStatus) {
    const data = { ID: taskId, Status: newStatus };
    if (this.userId) data.UserID = this.userId;
    // Patch page caches immediately so any concurrent fetchPage returns correct data
    this.mutatePagesCache({ ID: taskId, Status: newStatus });
    this.mutateSummaryCache('update', { ID: taskId, Status: newStatus });
    return this.request('updateTask', data).then(res => {
      // Patch again with server-confirmed data (same values, keeps cache fresh)
      this.mutatePagesCache({ ID: taskId, Status: newStatus });
      return res;
    });
  },

  deleteTask(id) {
    return this.request('deleteTask', { id }).then(res => {
      this.clearCacheFor('getTasksSummary', 'getTasksPaged', 'getTasks');
      return res;
    });
  },

  getUsers(options = {}) {
    return this.request('getUsers', options, { useCache: true });
  },

  addUser(user) {
    if (user.Password) user.Password = btoa(user.Password);
    this.clearCacheFor('getUsers', 'init');
    return this.request('addUser', user);
  },

  updateUser(user) {
    if (user.Password && !user.Password.endsWith('==')) user.Password = btoa(user.Password);
    this.clearCacheFor('getUsers', 'init');
    return this.request('updateUser', user);
  },

  deleteUser(id) {
    this.clearCacheFor('getUsers', 'init');
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
    this.clearCacheFor('getPositions', 'init');
    return this.request('addPosition', data);
  },
  updatePosition(data) {
    this.clearCacheFor('getPositions', 'init');
    return this.request('updatePosition', data);
  },
  deletePosition(id) {
    this.clearCacheFor('getPositions', 'init');
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

  // Briefing Service
  getBriefings() {
    return this.request('getBriefings', {}, { useCache: true });
  },
  getBriefingsNoCache() {
    return this.request('getBriefings', {}, { useCache: false });
  },
  addBriefing(data) {
    this.clearCacheFor('getBriefings', 'getBriefingResponses');
    return this.request('addBriefing', data);
  },
  updateBriefing(data) {
    this.clearCacheFor('getBriefings', 'getBriefingResponses');
    return this.request('updateBriefing', data);
  },
  deleteBriefing(id) {
    this.clearCacheFor('getBriefings', 'getBriefingResponses');
    return this.request('deleteBriefing', { id });
  },
  getBriefingResponses(briefingId) {
    return this.request('getBriefingResponses', { briefingId }, { useCache: true });
  },
  saveBriefingResponse(data) {
    this.clearCacheFor('getBriefings', 'getBriefingResponses');
    return this.request('saveBriefingResponse', data);
  },
  migrateUsersAddBriefingPermissions() {
    return this.request('MIGRATE_USERS_ADD_BRIEFING_PERMISSIONS');
  },
  migrateBriefingsAddFields() {
    return this.request('MIGRATE_BRIEFINGS_ADD_FIELDS');
  },

  // Role/Permissions update (re-uses updateUser)
  updateUserPermissions(userId, permissions) {
    this.clearCacheFor('getUsers', 'init');
    return this.request('updateUser', { ID: userId, Permissions: permissions });
  },

  isOverdue() {
    // Disabled as per previous requirement for Tasks
    return false;
  },

  isBriefingOverdue(briefing) {
    if (!briefing || briefing.Status === 'เสร็จสิ้น' || !briefing.DueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(briefing.DueDate);
    due.setHours(0, 0, 0, 0);
    return today > due;
  }
};
