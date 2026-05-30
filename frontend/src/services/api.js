import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// Helper to parse JSON values safely
function parseJson(val, defaultVal = {}) {
  if (!val) return defaultVal;
  if (typeof val === 'object') return val;
  try {
    const cleaned = val.trim();
    if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
      return JSON.parse(cleaned);
    }
  } catch (e) {}
  return defaultVal;
}

// Helper: Fetch ALL rows from a Supabase query, bypassing the default 1000-row limit
// Accepts a factory function that returns a fresh query builder for each page
async function fetchAllRows(queryFactory) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }
  return allRows;
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

  // Helper to log user actions in Supabase
  async logActivity(userId, action, details) {
    try {
      await supabase
        .from('ActivityLogs')
        .insert([{
          UserID: userId || 'System',
          Action: action,
          Details: details,
          Timestamp: new Date().toISOString()
        }]);
    } catch (e) {
      console.warn('Failed to log activity:', e);
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

  // Internal: performs the actual fetch from Supabase and updates cache
  async _fetchAndCache(action, data, cacheKey, ttl) {
    const fetchPromise = (async () => {
      try {
        let resultData;
        switch (action) {
          case 'login': {
            const { data: user, error } = await supabase
              .from('Users')
              .select('*')
              .eq('Username', data.username)
              .eq('Password', data.password)
              .maybeSingle();
            if (error) throw error;
            if (!user) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            resultData = user;
            break;
          }

          case 'getTasks': {
            const tasks = await fetchAllRows(
              () => supabase
                .from('Tasks')
                .select('*')
                .order('CreatedAt', { ascending: false })
            );
            resultData = tasks || [];
            break;
          }

          case 'getTasksSummary': {
            let tasks;
            try {
              tasks = await fetchAllRows(
                () => supabase
                  .from('TasksSummary')
                  .select('ID, Detail, Status, Priority, StartDate, DueDate, UserID, StaffName, Department, CustomFields, CreatedAt, CompletedAt, HasImages')
                  .order('CreatedAt', { ascending: false })
              );
            } catch (viewError) {
              // View not created yet, fall back to table query (without pulling base64 images to memory)
              console.warn('TasksSummary view not found, falling back to Tasks table query...', viewError);
              const rawTasks = await fetchAllRows(
                () => supabase
                  .from('Tasks')
                  .select('ID, Detail, Status, Priority, StartDate, DueDate, UserID, StaffName, Department, CustomFields, CreatedAt, CompletedAt, Image1, Image2, Image3, Image4')
                  .order('CreatedAt', { ascending: false })
              );
              
              tasks = (rawTasks || []).map(t => ({
                ...t,
                HasImages: !!(t.Image1 || t.Image2 || t.Image3 || t.Image4),
                Image1: undefined,
                Image2: undefined,
                Image3: undefined,
                Image4: undefined
              }));
            }
            
            resultData = tasks || [];
            break;
          }

          case 'getTasksPaged': {
            // Get all tasks (using cached summary or fetching summary)
            const allTasks = await this.getTasksSummary();
            
            // Build CustomFields lookup from full cache if available
            const cfMap = {};
            const fullCacheKey = JSON.stringify({ action: 'getTasks', data: {} });
            if (cache.has(fullCacheKey)) {
              const cachedFull = cache.get(fullCacheKey).data;
              if (Array.isArray(cachedFull)) {
                cachedFull.forEach(t => {
                  cfMap[t.ID] = t.CustomFields;
                });
              }
            }

            const mergedTasks = allTasks.map(t => ({
              ...t,
              CustomFields: cfMap[t.ID] !== undefined ? cfMap[t.ID] : t.CustomFields
            }));

            // Apply filters
            const keyword = (data.keyword || '').toLowerCase().trim();
            const status = data.status || 'All';
            const department = data.department || 'All';
            const filterUser = data.user || 'All';
            const startDate = data.startDate || '';
            const endDate = data.endDate || '';

            const userRole = (data.userRole || 'Staff').toString().trim();
            const userDept = (data.userDept || '').toString().trim();
            const canSeeAll = userRole === 'Admin' || (userRole === 'Head' && userDept === 'HR');
            const currentUserId = String(data.userId || '');

            let filtered = mergedTasks.filter(t => {
              // RBAC
              const tUserId = String(t.UserID || '');
              const tDept = (t.Department || '').toString().trim().toLowerCase();

              if (!canSeeAll) {
                if (userRole === 'Staff' && tUserId !== currentUserId) return false;
                if (userRole === 'Head') {
                  if (tDept !== userDept.toLowerCase()) return false;
                  if (filterUser !== 'All' && tUserId !== String(filterUser)) return false;
                }
              } else {
                if (department !== 'All' && tDept !== department.toLowerCase()) return false;
                if (filterUser !== 'All' && tUserId !== String(filterUser)) return false;
              }

              // Status
              if (status !== 'All' && t.Status !== status) return false;

              // Keyword
              if (keyword) {
                const detailMatch = (t.Detail || '').toLowerCase().includes(keyword);
                let projectVal = '';
                if (t.CustomFields && typeof t.CustomFields === 'object') {
                  projectVal = (t.CustomFields.Project || '').toLowerCase();
                }
                const projectMatch = projectVal.includes(keyword);
                if (!detailMatch && !projectMatch) return false;
              }

              // Date range — compare against task's StartDate (วันเริ่มต้นงาน)
              // so the filter finds tasks that *started* within the given range
              if (startDate || endDate) {
                const taskStartDate = (t.StartDate || t.DueDate || '').slice(0, 10);
                if (!taskStartDate) return false;
                if (startDate && taskStartDate < startDate) return false;
                if (endDate && taskStartDate > endDate) return false;
              }

              return true;
            });

            // Sort newest first
            filtered.sort((a, b) => {
              const da = a.CreatedAt ? new Date(a.CreatedAt) : new Date(0);
              const db = b.CreatedAt ? new Date(b.CreatedAt) : new Date(0);
              return db - da;
            });

            const page = parseInt(data.page || 1, 10);
            const pageSize = parseInt(data.pageSize || 10, 10);
            const totalCount = filtered.length;
            const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
            const safePage = Math.min(Math.max(page, 1), totalPages);
            const start = (safePage - 1) * pageSize;
            const pageTasks = filtered.slice(start, start + pageSize);

            resultData = {
              tasks: pageTasks,
              totalCount,
              totalPages,
              currentPage: safePage
            };
            break;
          }

          case 'getTaskById': {
            const { data: task, error } = await supabase
              .from('Tasks')
              .select('*')
              .eq('ID', data.id)
              .maybeSingle();
            if (error) throw error;
            if (!task) throw new Error('Task not found');
            resultData = task;
            break;
          }

          case 'addTask': {
            const newId = crypto.randomUUID();
            const { error } = await supabase
              .from('Tasks')
              .insert([{
                ...data,
                ID: data.ID || newId
              }]);
            if (error) throw error;
            await this.logActivity(this.executorId, 'ADD_TASK', `Task created`);
            resultData = { message: 'Task added successfully' };
            break;
          }

          case 'updateTask': {
            const updateFields = { ...data };
            if (updateFields.Status === 'เสร็จสิ้น') {
              const { data: currentTask } = await supabase
                .from('Tasks')
                .select('CompletedAt')
                .eq('ID', data.ID)
                .maybeSingle();
              if (currentTask && !currentTask.CompletedAt) {
                updateFields.CompletedAt = new Date().toISOString();
              }
            } else if (updateFields.Status && updateFields.Status !== 'เสร็จสิ้น') {
              updateFields.CompletedAt = null;
            }
            updateFields.UpdatedAt = new Date().toISOString();

            const { error } = await supabase
              .from('Tasks')
              .update(updateFields)
              .eq('ID', data.ID);
            if (error) throw error;
            await this.logActivity(this.executorId, 'UPDATE_TASK', `Task ${data.ID} updated`);
            resultData = { message: 'Task updated successfully' };
            break;
          }

          case 'deleteTask': {
            const { error } = await supabase
              .from('Tasks')
              .delete()
              .eq('ID', data.id);
            if (error) throw error;
            await this.logActivity(this.executorId, 'DELETE_TASK', `Task ${data.id} deleted`);
            resultData = { message: 'Task deleted successfully' };
            break;
          }

          case 'getUsers': {
            const { data: users, error } = await supabase
              .from('Users')
              .select('*')
              .order('Username');
            if (error) throw error;
            
            resultData = (users || []).map(u => {
              if (data.includeImage === false) {
                return { ...u, ProfileImage: u.ProfileImage ? 'has_image' : '' };
              }
              return u;
            });
            break;
          }

          case 'addUser': {
            const newId = crypto.randomUUID();
            const { error } = await supabase
              .from('Users')
              .insert([{
                ...data,
                ID: data.ID || newId
              }]);
            if (error) throw error;
            await this.logActivity(this.executorId, 'ADD_USER', `User created: ${data.Username}`);
            resultData = { message: 'User added successfully' };
            break;
          }

          case 'updateUser': {
            const updateFields = { ...data };
            updateFields.UpdatedAt = new Date().toISOString();
            
            const { error } = await supabase
              .from('Users')
              .update(updateFields)
              .eq('ID', data.ID);
            if (error) throw error;
            await this.logActivity(this.executorId, 'UPDATE_USER', `User ${data.ID} updated`);
            resultData = { message: 'User updated successfully' };
            break;
          }

          case 'deleteUser': {
            const { error } = await supabase
              .from('Users')
              .delete()
              .eq('ID', data.id);
            if (error) throw error;
            await this.logActivity(this.executorId, 'DELETE_USER', `User ${data.id} deleted`);
            resultData = { message: 'User deleted successfully' };
            break;
          }

          case 'getPositions': {
            const { data: positions, error } = await supabase
              .from('Positions')
              .select('*')
              .order('Name');
            if (error) throw error;
            resultData = (positions || []).map(p => ({
              ...p,
              Color: p.Color || 'bg-blue-100 text-blue-600'
            }));
            break;
          }

          case 'addPosition': {
            const newId = crypto.randomUUID();
            const { error } = await supabase
              .from('Positions')
              .insert([{
                ID: newId,
                Name: data.Name || '',
                Color: data.Color || 'bg-blue-100 text-blue-600'
              }]);
            if (error) throw error;
            await this.logActivity(this.executorId, 'ADD_POSITION', `Position created: ${data.Name}`);
            resultData = { message: 'Position added', id: newId };
            break;
          }

          case 'updatePosition': {
            const { error } = await supabase
              .from('Positions')
              .update({
                Name: data.Name,
                Color: data.Color,
                UpdatedAt: new Date().toISOString()
              })
              .eq('ID', data.ID);
            if (error) throw error;
            await this.logActivity(this.executorId, 'UPDATE_POSITION', `Position ${data.ID} updated`);
            resultData = { message: 'Position updated' };
            break;
          }

          case 'deletePosition': {
            const { error } = await supabase
              .from('Positions')
              .delete()
              .eq('ID', data.id);
            if (error) throw error;
            await this.logActivity(this.executorId, 'DELETE_POSITION', `Position ${data.id} deleted`);
            resultData = { message: 'Position deleted' };
            break;
          }

          case 'getBriefings': {
            const { data: briefings, error } = await supabase
              .from('Briefings')
              .select('ID, RunningID, Title, CreatorID, Detail, CreatorNote, Assignees, Status, Priority, StartDate, DueDate, LastUpdatedBy, CreatedAt, UpdatedAt, CompletedAt, CardColor, PostStatus, PostUrl, PostDate')
              .order('CreatedAt', { ascending: false });
            if (error) throw error;
            resultData = (briefings || []).map(b => ({
              ...b,
              Assignees: Array.isArray(b.Assignees) ? b.Assignees : parseJson(b.Assignees, [])
            }));
            break;
          }

          case 'getBriefingById': {
            const { data: briefing, error } = await supabase
              .from('Briefings')
              .select('*')
              .eq('ID', data.id)
              .maybeSingle();
            if (error) throw error;
            if (!briefing) throw new Error('Briefing not found');
            resultData = {
              ...briefing,
              Assignees: Array.isArray(briefing.Assignees) ? briefing.Assignees : parseJson(briefing.Assignees, [])
            };
            break;
          }

          case 'addBriefing': {
            const newId = crypto.randomUUID();
            const now = new Date();
            const dateStr = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
            
            const { count, error: countErr } = await supabase
              .from('Briefings')
              .select('*', { count: 'exact', head: true });
            if (countErr) throw countErr;
            
            const runningId = `BR-${dateStr}-${String((count || 0) + 1).padStart(3, '0')}`;
            
            const { error } = await supabase
              .from('Briefings')
              .insert([{
                ID: newId,
                RunningID: runningId,
                Title: data.Title || '',
                CreatorID: this.userId || null,
                Detail: data.Detail || '',
                CreatorNote: data.CreatorNote || '',
                Assignees: data.Assignees || [],
                Status: data.Status || 'รอดำเนินการ',
                Priority: data.Priority || 'Medium',
                StartDate: data.StartDate || '',
                DueDate: data.DueDate || '',
                RefURL: data.RefURL || '',
                CardColor: data.CardColor || '',
                PostStatus: data.PostStatus || 'ยังไม่โพส',
                PostUrl: data.PostUrl || '',
                PostDate: data.PostDate || '',
                LastUpdatedBy: this.userId || null,
                ...Object.keys(data).reduce((acc, k) => {
                  if (k.startsWith('RefImage')) acc[k] = data[k];
                  return acc;
                }, {})
              }]);
            if (error) throw error;
            await this.logActivity(this.executorId, 'ADD_BRIEFING', `Briefing created: ${runningId}`);
            resultData = { message: 'Briefing created', runningId };
            break;
          }

          case 'updateBriefing': {
            const updateFields = { ...data };
            if (updateFields.Status === 'เสร็จสิ้น') {
              updateFields.CompletedAt = new Date().toISOString();
            } else if (updateFields.Status && updateFields.Status !== 'เสร็จสิ้น') {
              updateFields.CompletedAt = null;
            }
            updateFields.UpdatedAt = new Date().toISOString();
            updateFields.LastUpdatedBy = this.userId || null;

            const { error } = await supabase
              .from('Briefings')
              .update(updateFields)
              .eq('ID', data.ID);
            if (error) throw error;
            await this.logActivity(this.executorId, 'UPDATE_BRIEFING', `Briefing updated: ${data.ID}`);
            resultData = { message: 'Briefing updated' };
            break;
          }

          case 'deleteBriefing': {
            const { error } = await supabase
              .from('Briefings')
              .delete()
              .eq('ID', data.id);
            if (error) throw error;
            await this.logActivity(this.executorId, 'DELETE_BRIEFING', `Briefing deleted: ${data.id}`);
            resultData = { message: 'Briefing and related responses deleted' };
            break;
          }

          case 'getBriefingResponses': {
            const { data: responses, error } = await supabase
              .from('BriefingResponses')
              .select('*')
              .eq('BriefingID', data.briefingId);
            if (error) throw error;
            resultData = responses || [];
            break;
          }

          case 'saveBriefingResponse': {
            const responseData = {
              BriefingID: data.BriefingID,
              UserID: data.UserID || this.userId,
              URL1: data.URL1 || '',
              URL2: data.URL2 || '',
              Status: data.Status || 'รอดำเนินการ',
              Note: data.Note || '',
              UpdatedAt: new Date().toISOString(),
              ...Object.keys(data).reduce((acc, k) => {
                if (k.startsWith('ResultImage') || k.startsWith('ReviewImage')) {
                  acc[k] = data[k];
                }
                return acc;
              }, {})
            };

            const { data: existing, error: findErr } = await supabase
              .from('BriefingResponses')
              .select('ID')
              .eq('BriefingID', data.BriefingID)
              .eq('UserID', responseData.UserID)
              .maybeSingle();
            
            if (findErr) throw findErr;

            if (existing) {
              const { error: updateErr } = await supabase
                .from('BriefingResponses')
                .update(responseData)
                .eq('ID', existing.ID);
              if (updateErr) throw updateErr;
            } else {
              const newId = crypto.randomUUID();
              const { error: insertErr } = await supabase
                .from('BriefingResponses')
                .insert([{
                  ID: newId,
                  ...responseData
                }]);
              if (insertErr) throw insertErr;
            }

            const briefingUpdate = {
              UpdatedAt: new Date().toISOString(),
              LastUpdatedBy: this.userId || null
            };
            if (data.NewOverallStatus) {
              briefingUpdate.Status = data.NewOverallStatus;
            }
            await supabase
              .from('Briefings')
              .update(briefingUpdate)
              .eq('ID', data.BriefingID);

            resultData = { message: 'Response saved' };
            break;
          }

          case 'init': {
            const positions = await this.getPositions();
            const users = await this.getUsers({ includeImage: false });
            const departments = [...new Set(users.map(u => u.Department).filter(Boolean))].sort();
            
            let currentUser = null;
            if (data.userId) {
              const { data: fullUser, error } = await supabase
                .from('Users')
                .select('*')
                .eq('ID', data.userId)
                .maybeSingle();
              if (!error && fullUser) {
                currentUser = fullUser;
              }
            }
            resultData = { positions, departments, currentUser };
            break;
          }

          default:
            throw new Error(`Action ${action} not supported in Supabase API wrapper.`);
        }

        if (cacheKey) {
          cache.set(cacheKey, { data: resultData, timestamp: Date.now() });
        }
        return resultData;
      } catch (error) {
        console.error('Supabase API Error:', error);
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
    if (this.userId) {
      const u = cache.get(JSON.stringify({ action: 'init', data: { userId: this.userId } }))?.data?.currentUser;
      if (u) data.StaffName = u.Name;
    }
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

  updateTaskStatus(taskId, newStatus) {
    const data = { ID: taskId, Status: newStatus };
    if (this.userId) data.UserID = this.userId;
    // Optimistically patch all caches immediately
    this.mutatePagesCache({ ID: taskId, Status: newStatus });
    this.mutateSummaryCache('update', { ID: taskId, Status: newStatus });
    return this.request('updateTask', data).then(res => {
      // After successful API write, also invalidate caches so next fetchPage
      // gets truly fresh data from server instead of stale cache
      this.clearCacheFor('getTasksSummary', 'getTasksPaged', 'getTasks');
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
    return this.request('addUser', user).then(res => {
      this.clearCacheFor('getUsers', 'init');
      return res;
    });
  },

  updateUser(user) {
    if (user.Password && !user.Password.endsWith('==')) user.Password = btoa(user.Password);
    return this.request('updateUser', user).then(res => {
      this.clearCacheFor('getUsers', 'init');
      return res;
    });
  },

  deleteUser(id) {
    return this.request('deleteUser', { id }).then(res => {
      this.clearCacheFor('getUsers', 'init');
      return res;
    });
  },

  uploadImage(base64, filename, mimeType) {
    return Promise.resolve({
      id: crypto.randomUUID(),
      url: base64,
      downloadUrl: base64
    });
  },

  // Master Positions
  getPositions() {
    return this.request('getPositions', {}, { useCache: true });
  },
  addPosition(data) {
    return this.request('addPosition', data).then(res => {
      this.clearCacheFor('getPositions', 'init');
      return res;
    });
  },
  updatePosition(data) {
    return this.request('updatePosition', data).then(res => {
      this.clearCacheFor('getPositions', 'init');
      return res;
    });
  },
  deletePosition(id) {
    return this.request('deletePosition', { id }).then(res => {
      this.clearCacheFor('getPositions', 'init');
      return res;
    });
  },

  // Briefing Service
  getBriefings() {
    return this.request('getBriefings', {}, { useCache: true });
  },
  getBriefingsNoCache() {
    return this.request('getBriefings', {}, { useCache: false });
  },
  getBriefingById(id) {
    return this.request('getBriefingById', { id }, { useCache: false });
  },
  addBriefing(data) {
    return this.request('addBriefing', data).then(res => {
      this.clearCacheFor('getBriefings', 'getBriefingResponses');
      return res;
    });
  },
  updateBriefing(data) {
    return this.request('updateBriefing', data).then(res => {
      this.clearCacheFor('getBriefings', 'getBriefingResponses');
      return res;
    });
  },
  deleteBriefing(id) {
    return this.request('deleteBriefing', { id }).then(res => {
      this.clearCacheFor('getBriefings', 'getBriefingResponses');
      return res;
    });
  },
  getBriefingResponses(briefingId) {
    return this.request('getBriefingResponses', { briefingId }, { useCache: true });
  },
  saveBriefingResponse(data) {
    return this.request('saveBriefingResponse', data).then(res => {
      this.clearCacheFor('getBriefings', 'getBriefingResponses');
      return res;
    });
  },

  updateUserPermissions(userId, permissions) {
    return this.request('updateUser', { ID: userId, Permissions: permissions }).then(res => {
      this.clearCacheFor('getUsers', 'init');
      return res;
    });
  },

  migrateUsersSheet() { return Promise.resolve({ status: 'success', data: { message: 'Already migrated' } }); },
  migrateTasksSheet() { return Promise.resolve({ status: 'success', data: { message: 'Already migrated' } }); },
  migratePositionsSheet() { return Promise.resolve({ status: 'success', data: { message: 'Already migrated' } }); },
  migrateUsersAddPosition() { return Promise.resolve({ status: 'success', data: { message: 'Already migrated' } }); },
  migrateUsersAddPermissions() { return Promise.resolve({ status: 'success', data: { message: 'Already migrated' } }); },
  migrateUsersPositionToId() { return Promise.resolve({ status: 'success', data: { message: 'Already migrated' } }); },
  migrateUsersAddBriefingPermissions() { return Promise.resolve({ status: 'success', data: { message: 'Already migrated' } }); },
  migrateBriefingsAddFields() { return Promise.resolve({ status: 'success', data: { message: 'Already migrated' } }); },

  isOverdue() {
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
