import { createClient } from '@supabase/supabase-js';
import {
  briefingSelectAt,
  isMissingSchemaField,
  nextBriefingSelectIndex,
  readBriefingSelectIndex,
  rememberBriefingSelectIndex,
} from '../utils/briefingSchema';
import { describeReviewError } from '../utils/briefingReviewErrors';
import { sanitizeReviewCommentImages } from '../utils/briefingReviewNotes';
import { imageExtensionFor } from '../utils/compressImage';

// PostgREST reports an undeployed RPC as PGRST202; older gateways use 42883.
const MISSING_FUNCTION_CODES = ['PGRST202', '42883'];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const IMAGE_STORAGE_BUCKET = 'worklog-images';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// Read the stored level fresh on every list request: it carries its own expiry,
// so a level narrowed before a migration landed recovers by itself.
function currentBriefingSelectIndex() {
  return readBriefingSelectIndex(typeof sessionStorage === 'undefined' ? null : sessionStorage);
}

function noteBriefingSelectIndex(index) {
  rememberBriefingSelectIndex(index, typeof sessionStorage === 'undefined' ? null : sessionStorage);
}

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

// Keep client updates aligned with the deployed Users schema.  Older browser
// sessions can still contain retired fields (for example Phone), which must
// not be sent to PostgREST because it rejects the entire update.
const USER_WRITE_FIELDS = new Set([
  'Username', 'Password', 'Role', 'Department', 'Name',
  'ProfileImage', 'Position', 'Permissions'
]);

function pickUserWriteFields(data = {}) {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => USER_WRITE_FIELDS.has(key))
  );
}

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
  } catch {
    // Invalid JSON falls back to the supplied default value.
  }
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
            this._fetchAndCache(action, data, cacheKey);
          }
          return cached.data;  // Return stale immediately
        }

        cache.delete(cacheKey);  // Too old — discard
      }

      if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
      }
    }

    return this._fetchAndCache(action, data, cacheKey);
  },

  // Internal: performs the actual fetch from Supabase and updates cache
  async _fetchAndCache(action, data, cacheKey) {
    const fetchPromise = (async () => {
      try {
        let resultData;
        switch (action) {
          case 'login': {
            const { data: user, error } = await supabase
              .from('Users')
              .select('ID, Username, Role, Department, Name, ProfileImage, Position, Permissions, CreatedAt, UpdatedAt')
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
            // Tasks are personal: every role except Admin reads only its own rows.
            const canSeeAll = userRole === 'Admin';
            const currentUserId = String(data.userId || '');

            let filtered = mergedTasks.filter(t => {
              // RBAC
              const tUserId = String(t.UserID || '');
              const tDept = (t.Department || '').toString().trim().toLowerCase();

              if (!canSeeAll) {
                if (tUserId !== currentUserId) return false;
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
              .select('ID, Username, Role, Department, Name, ProfileImage, Position, Permissions, CreatedAt, UpdatedAt')
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
            const userFields = pickUserWriteFields(data);
            const { error } = await supabase
              .from('Users')
              .insert([{
                ...userFields,
                ID: data.ID || newId
              }]);
            if (error) throw error;
            await this.logActivity(this.executorId, 'ADD_USER', `User created: ${data.Username}`);
            resultData = { message: 'User added successfully' };
            break;
          }

          case 'updateUser': {
            const updateFields = pickUserWriteFields(data);
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
            // Walk down the select ladder one migration at a time and keep the
            // level that worked, so a database behind the deployed bundle costs
            // one probe per session instead of a 400 on every list and poll.
            let selectIndex = currentBriefingSelectIndex();
            let briefings = null;
            let error = null;
            for (;;) {
              ({ data: briefings, error } = await supabase
                .from('Briefings')
                .select(briefingSelectAt(selectIndex))
                .order('CreatedAt', { ascending: false }));
              if (!error) break;
              if (!isMissingSchemaField(error)) break;
              const narrower = nextBriefingSelectIndex(selectIndex);
              if (narrower < 0) break;
              selectIndex = narrower;
              noteBriefingSelectIndex(selectIndex);
            }
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
                Status: data.Status === 'เสร็จสิ้น' ? 'ส่งตรวจ' : (data.Status || 'ดำเนินการ'),
                Priority: data.Priority || 'Medium',
                StartDate: data.StartDate || '',
                DueDate: data.DueDate || '',
                RefURL: data.RefURL || '',
                CardColor: data.CardColor || '',
                PostStatus: data.PostStatus || 'ยังไม่โพส',
                PostUrl: data.PostUrl || '',
                PostDate: data.PostDate || '',
                LastUpdatedBy: this.userId || null,
                Points: data.Points || 0,
                RefImages: Array.isArray(data.RefImages) ? data.RefImages : [],
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
            // The original brief belongs to its creator.  An assigned recipient
            // must use saveBriefingResponse() for their result images, links,
            // notes and personal progress instead of editing this record.
            const { data: currentBriefing, error: briefingError } = await supabase
              .from('Briefings')
              .select('CreatorID, Assignees, Status')
              .eq('ID', data.ID)
              .maybeSingle();
            if (briefingError) throw briefingError;
            if (!currentBriefing) throw new Error('ไม่พบข้อมูลงานบรีฟ');
            const currentAssignees = parseJson(currentBriefing.Assignees, []);
            const isRecipient = Array.isArray(currentAssignees)
              && currentAssignees.some((id) => String(id) === String(this.userId));
            if (isRecipient) {
              throw new Error('ผู้รับมอบหมายแก้ไขรายละเอียดบรีฟของผู้มอบหมายไม่ได้');
            }
            // A briefing may only become completed through review_briefing().
            // This keeps completion, point calculation, and response statuses in
            // one atomic server-side transition.
            if (updateFields.Status === 'เสร็จสิ้น') {
              throw new Error('งานบรีฟต้องผ่านการอนุมัติจากหัวหน้าแผนกก่อนจึงจะเสร็จสิ้นได้');
            }
            // Review-derived values are owned by the review transaction. Never
            // accept them from a normal briefing edit, including a stale tab.
            ['DeductedPoints', 'CorrectionCount', 'RejectedCount', 'BonusPoints', 'BonusLevel', 'FinalPoints', 'ScoreAdjustment', 'ReviewedAt', 'ReviewedBy'].forEach((field) => {
              delete updateFields[field];
            });
            if (updateFields.Status) {
              if (currentBriefing.Status === 'เสร็จสิ้น') {
                throw new Error('งานที่เสร็จสิ้นแล้วเป็นข้อมูลเดิม จึงไม่เปลี่ยนผ่าน workflow ใหม่');
              }
            }
            // คะแนนแก้ได้โดยผู้ที่มีสิทธิ์แก้บรีฟ (ผู้บรีฟ หัวหน้าแผนก แอดมิน —
            // หน้าจอกันผู้รับงานไว้แล้ว) และถูกล็อกถาวรหลังหัวหน้าแผนกอนุมัติ
            // เป็นเสร็จสิ้น
            if (Object.prototype.hasOwnProperty.call(updateFields, 'Points')) {
              if (currentBriefing.Status === 'เสร็จสิ้น') {
                delete updateFields.Points;
              }
            }
            if (updateFields.Status) {
              updateFields.CompletedAt = null;
              if (updateFields.Status === 'ส่งตรวจ') {
                updateFields.ReviewSubmittedAt = new Date().toISOString();
              }
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
            const { data: briefingForDelete, error: briefingForDeleteError } = await supabase
              .from('Briefings')
              .select('CreatorID, Assignees')
              .eq('ID', data.id)
              .maybeSingle();
            if (briefingForDeleteError) throw briefingForDeleteError;
            if (!briefingForDelete) throw new Error('ไม่พบข้อมูลงานบรีฟ');
            const deleteAssignees = parseJson(briefingForDelete.Assignees, []);
            const isDeleteRecipient = Array.isArray(deleteAssignees)
              && deleteAssignees.some((id) => String(id) === String(this.userId));
            if (isDeleteRecipient) {
              throw new Error('ผู้รับมอบหมายลบบรีฟงานของผู้มอบหมายไม่ได้');
            }
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
            const selectFields = data.select || '*';
            let query = supabase.from('BriefingResponses').select(selectFields);
            if (data && data.briefingId) {
              query = query.eq('BriefingID', data.briefingId);
            }
            const { data: responses, error } = await query;
            if (error) throw error;
            resultData = responses || [];
            break;
          }

          case 'saveBriefingResponse': {
            const responseUserId = this.userId || data.UserID;
            if (!responseUserId) {
              throw new Error('เฉพาะผู้รับมอบหมายเท่านั้นที่บันทึกการส่งงานของตนเองได้');
            }
            const { data: submittedBriefing, error: submitError } = await supabase.rpc('submit_briefing_response', {
              p_briefing_id: data.BriefingID,
              p_user_id: responseUserId,
              p_url1: data.URL1 || '',
              p_url2: data.URL2 || '',
              p_note: data.Note || '',
              p_result_images: Array.isArray(data.ResultImages) ? data.ResultImages : [],
              p_review_images: Array.isArray(data.ReviewImages) ? data.ReviewImages : [],
            });
            if (!submitError) {
              resultData = { message: 'Response saved', briefing: submittedBriefing };
              break;
            }

            // Keep submissions available while the frontend deployment and
            // database migration roll out at different times. Once the RPC is
            // present this branch is never used.
            if (!/submit_briefing_response|schema cache|PGRST202/i.test(submitError.message || '')) {
              throw submitError;
            }
            const { data: legacyBriefing, error: legacyBriefingError } = await supabase
              .from('Briefings')
              .select('Assignees, Status')
              .eq('ID', data.BriefingID)
              .maybeSingle();
            if (legacyBriefingError) throw legacyBriefingError;
            const legacyAssignees = parseJson(legacyBriefing?.Assignees, []);
            if (!legacyBriefing || !legacyAssignees.some((id) => String(id) === String(responseUserId))) {
              throw new Error('เฉพาะผู้รับมอบหมายเท่านั้นที่บันทึกการส่งงานของตนเองได้');
            }
            const legacyResponse = {
              BriefingID: data.BriefingID,
              UserID: responseUserId,
              URL1: data.URL1 || '',
              URL2: data.URL2 || '',
              Status: 'รอตรวจ',
              Note: data.Note || '',
              ResultImages: Array.isArray(data.ResultImages) ? data.ResultImages : [],
              ReviewImages: Array.isArray(data.ReviewImages) ? data.ReviewImages : [],
              UpdatedAt: new Date().toISOString(),
              ...Object.keys(data).reduce((columns, key) => {
                if (key.startsWith('ResultImage') || key.startsWith('ReviewImage')) columns[key] = data[key];
                return columns;
              }, {}),
            };
            const { data: existingResponse, error: existingResponseError } = await supabase
              .from('BriefingResponses')
              .select('ID')
              .eq('BriefingID', data.BriefingID)
              .eq('UserID', responseUserId)
              .maybeSingle();
            if (existingResponseError) throw existingResponseError;
            const responseWrite = existingResponse
              ? supabase.from('BriefingResponses').update(legacyResponse).eq('ID', existingResponse.ID)
              : supabase.from('BriefingResponses').insert([{ ID: crypto.randomUUID(), ...legacyResponse }]);
            const { error: responseWriteError } = await responseWrite;
            if (responseWriteError) throw responseWriteError;
            const { data: fallbackBriefing, error: fallbackBriefingError } = await supabase
              .from('Briefings')
              .update({ Status: 'รอตรวจ', LastUpdatedBy: responseUserId, UpdatedAt: new Date().toISOString() })
              .eq('ID', data.BriefingID)
              .select()
              .single();
            if (fallbackBriefingError) throw fallbackBriefingError;
            resultData = { message: 'Response saved', briefing: fallbackBriefing };
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
                .select('ID, Username, Role, Department, Name, ProfileImage, Position, Permissions, CreatedAt, UpdatedAt')
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

  async uploadImage(file, { folder = 'briefings' } = {}) {
    if (!(file instanceof Blob)) {
      throw new Error('อัปโหลดได้เฉพาะไฟล์รูปภาพ ไม่รองรับการบันทึก Base64 ใหม่');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('รูปภาพต้องมีขนาดไม่เกิน 2 MB หลังบีบอัด');
    }

    const safeFolder = String(folder || 'briefings').replace(/[^a-zA-Z0-9/_-]/g, '-');
    const owner = String(this.userId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '-');
    // A browser without a WebP encoder sends JPEG instead, so the stored object
    // has to carry the type the blob actually is or Storage serves a broken image.
    const contentType = String(file.type || '').startsWith('image/') ? file.type : 'image/webp';
    const objectPath = `${safeFolder}/${owner}/${Date.now()}-${crypto.randomUUID()}.${imageExtensionFor(contentType)}`;
    const { data, error } = await supabase.storage
      .from(IMAGE_STORAGE_BUCKET)
      .upload(objectPath, file, {
        cacheControl: '31536000',
        contentType,
        upsert: false,
      });
    if (error) throw error;

    const { data: publicUrl } = supabase.storage
      .from(IMAGE_STORAGE_BUCKET)
      .getPublicUrl(data.path);
    return {
      id: data.path,
      path: data.path,
      url: publicUrl.publicUrl,
      downloadUrl: publicUrl.publicUrl
    };
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
  getBriefingResponses(briefingId, select) {
    return this.request('getBriefingResponses', { briefingId, select }, { useCache: true });
  },
  saveBriefingResponse(data) {
    return this.request('saveBriefingResponse', data).then(res => {
      this.clearCacheFor('getBriefings', 'getBriefingResponses');
      return res;
    });
  },

  async getBriefingReviewSettings(department) {
    const { data, error } = await supabase
      .from('BriefingReviewSettings')
      .select('*')
      .eq('Department', department || '')
      .maybeSingle();
    if (error) throw error;
    return {
      Department: department || '',
      CorrectionDeduction: 1,
      RejectedDeduction: 5,
      SevereDeduction: 50,
      ...(data || {}),
    };
  },

  async saveBriefingReviewSettings(data) {
    const payload = {
      Department: data.Department || '',
      CorrectionDeduction: Math.max(0, Number(data.CorrectionDeduction) || 0),
      RejectedDeduction: Math.max(0, Number(data.RejectedDeduction) || 0),
      SevereDeduction: Math.max(0, Number(data.SevereDeduction) || 0),
      UpdatedBy: this.userId || null,
      UpdatedAt: new Date().toISOString(),
    };
    const { data: saved, error } = await supabase.rpc('save_briefing_review_settings', {
      p_department: payload.Department,
      p_updated_by: payload.UpdatedBy,
      p_correction_deduction: payload.CorrectionDeduction,
      p_rejected_deduction: payload.RejectedDeduction,
      p_severe_deduction: payload.SevereDeduction,
    });
    if (error) throw error;
    return saved;
  },

  // A recipient flips the briefing to "กำลังทำ" through the server function,
  // since the assigner's row itself stays read-only for recipients.
  async startBriefingWork(briefingId) {
    const { data, error } = await supabase.rpc('start_briefing_work', {
      p_briefing_id: briefingId,
      p_user_id: this.userId,
    });
    if (error) throw new Error(describeReviewError(error));
    this.clearCacheFor('getBriefings', 'getBriefingResponses');
    return data;
  },

  async getBriefingReviewHistory(briefingId) {
    const { data, error } = await supabase
      .from('BriefingReviewHistory')
      .select('*')
      .eq('BriefingID', briefingId)
      .order('CreatedAt', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async reviewBriefing({
    briefingId,
    action,
    comment = '',
    bonusLevel = null,
    targetPoints = null,
    targetUserIds = null,
    extraPoints = null,
    extensionDays = null,
    commentImages = [],
  }) {
    const payload = {
      p_briefing_id: briefingId,
      p_reviewer_id: this.userId,
      p_action: action,
      p_comment: comment,
      p_bonus_level: bonusLevel,
      p_target_points: targetPoints,
      p_target_user_ids: targetUserIds,
      p_extra_points: extraPoints,
      p_extension_days: extensionDays,
    };
    const images = sanitizeReviewCommentImages(commentImages);
    // The image-aware wrapper only exists after 20260829_review_comment_images.
    // Until that migration runs, reviewing must still work — just without the
    // attachments — so a missing function falls back instead of failing.
    let { data, error } = images.length
      ? await supabase.rpc('review_briefing_with_images', { ...payload, p_comment_images: images })
      : await supabase.rpc('review_briefing', payload);
    if (error && images.length && MISSING_FUNCTION_CODES.includes(error.code)) {
      console.warn('[review_briefing_with_images] not deployed, attachments skipped');
      ({ data, error } = await supabase.rpc('review_briefing', payload));
    }
    // PostgREST returns every review rule as a bare English 400. Translate it so
    // the reviewer reads the actual rule instead of "Bad Request" in the console.
    if (error) {
      console.warn('[review_briefing] rejected', { code: error.code, message: error.message, details: error.details });
      throw new Error(describeReviewError(error));
    }
    this.clearCacheFor('getBriefings', 'getBriefingResponses');
    return data;
  },

  async getBriefingPointLedger({ startDate = null, endDate = null, viewerId = null } = {}) {
    // On a hard refresh a view can fetch before the auth effect has stored the
    // session here, so callers pass their own user id explicitly.
    const viewer = String(viewerId || this.userId || '');
    if (!viewer) return [];
    const { data, error } = await supabase.rpc('get_briefing_point_ledger', {
      p_viewer_id: viewer,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    });
    if (error && /get_briefing_point_ledger|schema cache|PGRST202/i.test(error.message || '')) return [];
    if (error) throw error;
    return data || [];
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
