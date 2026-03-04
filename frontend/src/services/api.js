const GAS_URL = import.meta.env.VITE_GAS_WEBAPP_URL;

export const apiService = {
  async request(action, data = {}) {
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain', // Avoid CORS preflight options
        },
        body: JSON.stringify({ action, data }),
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

  addTask(task) {
    return this.request('addTask', task);
  },

  updateTask(task) {
    return this.request('updateTask', task);
  },

  deleteTask(id) {
    return this.request('deleteTask', { id });
  },

  getUsers() {
    return this.request('getUsers');
  },

  uploadImage(base64, filename, mimeType) {
    return this.request('uploadImage', { base64, filename, mimeType });
  }
};
