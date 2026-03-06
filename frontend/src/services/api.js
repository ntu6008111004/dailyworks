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

  getUsers() {
    return this.request('getUsers');
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
  }
};
