const GAS_URL = import.meta.env.VITE_GAS_WEBAPP_URL;

export const apiService = {
  executorId: 'System',
  userId: '',

  setExecutor(id) {
    this.executorId = id || 'System';
  },

  // New method: set both IDs separately
  setUserSession(userId, displayName) {
    this.userId = String(userId || '');
    this.executorId = String(userId || displayName || 'System');
  },

  async request(action, data = {}) {
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
      return result.data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  login(username, password) {
    return this.request('login', { username, password });
  },

  getTasks() {
    return this.request('getTasks');
  },

  getTasksSummary() {
    return this.request('getTasksSummary');
  },

  // Paginated tasks with server-side filter + RBAC
  // filters: { keyword, status, department, user, startDate, endDate, userRole, userName, userDept, userId }
  getTasksPaged(page, pageSize, filters = {}) {
    return this.request('getTasksPaged', { page, pageSize, ...filters });
  },

  getInitData(userId) {
    return this.request('init', { userId });
  },

  getTaskById(id) {
    return this.request('getTaskById', { id });
  },

  addTask(task) {
    // Always inject UserID from session if not provided in task
    const data = { ...task };
    if (!data.UserID && this.userId) data.UserID = this.userId;
    return this.request('addTask', data);
  },

  updateTask(task) {
    // Always inject UserID from session if not provided in task
    const data = { ...task };
    if (!data.UserID && this.userId) data.UserID = this.userId;
    return this.request('updateTask', data);
  },

  deleteTask(id) {
    return this.request('deleteTask', { id });
  },

  getUsers(options = {}) {
    return this.request('getUsers', options);
  },

  addUser(user) {
    if (user.Password) user.Password = btoa(user.Password);
    return this.request('addUser', user);
  },

  updateUser(user) {
    if (user.Password && !user.Password.endsWith('==')) user.Password = btoa(user.Password);
    return this.request('updateUser', user);
  },

  deleteUser(id) {
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
    return this.request('getPositions');
  },
  addPosition(data) {
    return this.request('addPosition', data);
  },
  updatePosition(data) {
    return this.request('updatePosition', data);
  },
  deletePosition(id) {
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
