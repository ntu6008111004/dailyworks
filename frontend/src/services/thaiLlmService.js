/**
 * WorkLogs AI client.
 * The browser talks only to our authenticated backend. The ThaiLLM
 * credential, RBAC filtering, query selection and upstream controls stay
 * server-side.
 */

const AI_CONFIG = {
  baseUrl: (import.meta.env.VITE_AI_API_BASE_URL || '/api/ai').replace(/\/+$/, ''),
  // Optional browser-visible fallback, enabled at the owner's request. It is
  // only used when the local AI backend/session is unavailable.
  clientProviderKey: import.meta.env.VITE_THAILLM_API_KEY || '',
  clientProviderUrl: import.meta.env.VITE_THAILLM_API_URL || '/api/thaillm/chat/completions',
  model: 'pathumma-thaillm-qwen3-8b-think-3.0.0',
  maxTokens: 3072,
  requestTimeoutMs: 35000,
};
const SESSION_STORAGE_KEY = 'worklogs_ai_session';
let lastSessionFailureCode = '';

class RateLimiter {
  constructor(maxPerSecond = 5, maxPerMinute = 60) {
    this.maxPerSecond = maxPerSecond;
    this.maxPerMinute = maxPerMinute;
    this.timestamps = [];
  }
  cleanup() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < 60000);
  }
  canProceed() {
    this.cleanup();
    const now = Date.now();
    const recent = this.timestamps.filter((timestamp) => now - timestamp < 1000);
    if (recent.length >= this.maxPerSecond) {
      return { allowed: false, message: 'ส่งคำถามเร็วเกินไป กรุณารอสักครู่', waitMs: Math.max(100, 1000 - (now - recent[0])) };
    }
    if (this.timestamps.length >= this.maxPerMinute) {
      return { allowed: false, message: 'ถึงขีดจำกัดคำถามชั่วคราว กรุณาลองใหม่ภายหลัง', waitMs: Math.max(1000, 60000 - (now - this.timestamps[0])) };
    }
    return { allowed: true };
  }
  record() {
    this.timestamps.push(Date.now());
  }
  getUsage() {
    this.cleanup();
    const now = Date.now();
    return {
      perSecond: this.timestamps.filter((timestamp) => now - timestamp < 1000).length,
      perMinute: this.timestamps.length,
      maxPerSecond: this.maxPerSecond,
      maxPerMinute: this.maxPerMinute,
    };
  }
}

const rateLimiter = new RateLimiter();

function getSessionToken() {
  try { return sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(SESSION_STORAGE_KEY) || ''; } catch { return ''; }
}

function setSessionToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, token);
      // Keep the short-lived server token across a normal browser reload so a
      // logged-in user is not asked to reconnect CatLog AI repeatedly.
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch { /* storage may be disabled */ }
}

function apiEndpoint(path) {
  return AI_CONFIG.baseUrl + '/' + path.replace(/^\/+/, '');
}

function getDashboardFilters(userId) {
  try {
    const key = `worklogs_dashboard_filters:${encodeURIComponent(String(userId || 'anonymous'))}`;
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      department: typeof value.department === 'string' ? value.department : 'All',
      staffName: typeof value.staffName === 'string' ? value.staffName : 'All',
      year: typeof value.year === 'string' || typeof value.year === 'number' ? String(value.year) : 'All',
      startDate: typeof value.startDate === 'string' ? value.startDate : '',
      endDate: typeof value.endDate === 'string' ? value.endDate : '',
    };
  } catch {
    return null;
  }
}

async function createSession(username, password) {
  const response = await fetch(apiEndpoint('session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => ({}));
  const token = payload.data?.token;
  if (!response.ok || !token) {
    lastSessionFailureCode = payload.code || 'session_failed';
    const error = new Error(payload.message || 'ไม่สามารถยืนยันเซสชัน AI ได้');
    error.code = lastSessionFailureCode;
    throw error;
  }
  lastSessionFailureCode = '';
  setSessionToken(token);
  return token;
}

async function sendClientProviderChat(messages, { recordUsage = true } = {}) {
  if (!AI_CONFIG.clientProviderKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_CONFIG.requestTimeoutMs);
  if (recordUsage) rateLimiter.record();
  try {
    const response = await fetch(AI_CONFIG.clientProviderUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_CONFIG.clientProviderKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        max_tokens: AI_CONFIG.maxTokens,
        messages: [
          {
            role: 'system',
            content: 'คุณคือ CatLog AI ผู้ช่วยภาษาไทยสำหรับระบบ WorkLogs ตอบให้ชัดเจน กระชับ และซื่อสัตย์ ตอบแบบธรรมชาติของคนทั่วไป หากคำถามต้องใช้ข้อมูลภายในระบบแต่ไม่มีข้อมูลส่งให้ ห้ามเดาหรือแต่งตัวเลข ให้บอกว่าต้องเชื่อมต่อบริการ WorkLogs ก่อน',
          },
          ...messages,
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const content = payload.choices?.[0]?.message?.content;
    if (!response.ok || !content) {
      return {
        success: false,
        error: response.status === 429 ? 'rate_limit' : 'api_error',
        message: payload.message || payload.error?.message || 'ไม่สามารถเชื่อมต่อ CatLog AI ได้',
      };
    }
    const parsed = parseThinking(content);
    return {
      success: true,
      answer: parsed.answer,
      thinking: parsed.thinking,
      rawContent: content,
      searchPerformed: false,
      query: null,
      totalMatches: null,
      usage: payload.usage || null,
      clientProviderFallback: true,
      sources: [],
    };
  } catch (error) {
    return {
      success: false,
      error: error.name === 'AbortError' ? 'timeout' : 'api_error',
      message: error.name === 'AbortError' ? 'CatLog AI ใช้เวลานานเกินไป กรุณาลองใหม่' : 'ไม่สามารถเชื่อมต่อ CatLog AI ได้',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function clearSession() {
  setSessionToken('');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEscapedHtml(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function safeHref(value) {
  const decoded = decodeEscapedHtml(value).trim();
  if (!decoded || [...decoded].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) return null;
  try {
    const base = typeof window === 'undefined' ? 'https://worklogs.invalid/' : window.location.origin + '/';
    const url = new URL(decoded, base);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return null;
    if (url.protocol === 'mailto:' && !/^mailto:[^\s]+$/i.test(decoded)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function markdownToHtml(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html
    .replace(/\x60\x60\x60(\w*)\n([\s\S]*?)\x60\x60\x60/g, (_, language, code) =>
      '<pre class="chat-code-block"><code>' + code.trim() + '</code></pre>')
    .replace(/\x60([^\x60]+)\x60/g, '<code class="chat-inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 class="chat-h4">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="chat-h3">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="chat-h2">$1</h2>')
    .replace(/^[•-] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, encodedUrl) => {
    const href = safeHref(encodedUrl);
    if (!href) return label;
    return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" class="chat-link">' + label + '</a>';
  });
  return html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, '<ul class="chat-list">$&</ul>')
    .replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
}

function parseThinking(content) {
  if (!content) return { thinking: null, answer: '' };
  const match = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) return { thinking: null, answer: content };
  return { thinking: match[1].trim(), answer: content.replace(/<think>[\s\S]*?<\/think>/i, '').trim() };
}

function normalizeConversation(messages) {
  const recent = messages.slice(-8);
  return recent.map((message, index) => {
    const isLatest = index === recent.length - 1;
    return {
      role: message.role,
      // Keep a pasted document intact in the latest turn; compact older
      // context to remain below the backend's total request limit.
      content: String(message.content || '').slice(0, isLatest ? 12000 : 2500),
    };
  });
}

function needsTrustedWorkData(messages) {
  const question = String(messages[messages.length - 1]?.content || '').toLowerCase();
  const isPastedSummary = ['สรุปข้อความ', 'ช่วยสรุป', 'สรุปให้', 'สรุปเนื้อหา', 'จับใจความ', 'summary', 'summarize']
    .some(term => question.includes(term)) && question.length >= 350;
  if (isPastedSummary) return false;
  return [
    'งาน', 'worklog', 'dashboard', 'แดชบอร์ด', 'บรีฟ', 'briefing', 'คะแนน',
    'พนักงาน', 'ทีม', 'แพท', 'เหมี่ยว', 'กีต้า', 'พอร์มเตอร์', 'โม', 'ฟลุ๊ค',
    'บัส', 'บอส', 'เติ้ล', 'มาย',
  ].some(term => question.includes(term));
}

function needsFreshWebData(messages) {
  const question = String(messages[messages.length - 1]?.content || '').toLowerCase();
  return [
    'ล่าสุด', 'ปัจจุบัน', 'วันนี้', 'ตอนนี้', 'ปีนี้', 'เมื่อวาน', 'ข่าว',
    'ราคา', 'แพงขึ้น', 'ถูกลง', 'แนวโน้ม',
    'latest', 'current', 'today', 'news', 'right now', 'this year', 'price',
  ].some(term => question.includes(term));
}

async function sendChat(messages, { enableWebSearch = true, dashboardFilters = null } = {}) {
  const limit = rateLimiter.canProceed();
  if (!limit.allowed) return { success: false, error: 'rate_limit', message: limit.message, waitMs: limit.waitMs };
  if (!Array.isArray(messages) || messages.length < 1) return { success: false, error: 'invalid_request', message: 'ไม่พบข้อความคำถาม' };
  const normalized = normalizeConversation(messages);
  const token = getSessionToken();
  if (!token) {
    if (needsTrustedWorkData(normalized)) {
      return { success: false, error: 'work_data_session_required', message: 'CatLog AI ยังเชื่อมต่อข้อมูล WorkLogs ไม่สำเร็จ จึงจะไม่เดาตัวเลขงาน กรุณารีเฟรชหน้าแล้วลงชื่อเข้าใช้อีกครั้งเพื่อเชื่อมต่อข้อมูลจริง' };
    }
    if (needsFreshWebData(normalized)) {
      return { success: false, error: 'fresh_data_session_required', message: 'คำถามนี้ต้องค้นข้อมูลปัจจุบัน แต่ CatLog AI ยังไม่ได้เชื่อมต่อ Backend จึงจะไม่ตอบจากความจำเก่า กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ จากนั้นลองถามอีกครั้ง' };
    }
    const directResult = await sendClientProviderChat(normalized);
    if (directResult) return directResult;
    if (lastSessionFailureCode === 'ai_not_configured') {
      return { success: false, error: 'ai_not_configured', message: 'AI ยังไม่ได้ตั้งค่าที่เซิร์ฟเวอร์ กรุณาแจ้งผู้ดูแลระบบให้กำหนดค่า AI_SESSION_SECRET และ THAILLM_API_KEY' };
    }
    return { success: false, error: 'session_required', message: 'ยังเชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาตรวจสอบว่า Backend ทำงานอยู่ แล้วลงชื่อเข้าใช้อีกครั้ง' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_CONFIG.requestTimeoutMs);
  rateLimiter.record();
  try {
    const response = await fetch(apiEndpoint('chat'), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ messages: normalized, enableWebSearch, dashboardFilters }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearSession();
      if (needsTrustedWorkData(normalized)) {
        return { success: false, error: 'work_data_session_required', message: 'CatLog AI ต้องเชื่อมต่อข้อมูล WorkLogs ใหม่ จึงจะตอบตัวเลขจริงได้ กรุณาลงชื่อเข้าใช้อีกครั้ง' };
      }
      if (needsFreshWebData(normalized)) {
        return { success: false, error: 'fresh_data_session_required', message: 'เซสชันค้นข้อมูลสดของ CatLog AI หมดอายุ จึงจะไม่ตอบจากข้อมูลเก่า กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่' };
      }
      const directResult = await sendClientProviderChat(normalized, { recordUsage: false });
      if (directResult) return directResult;
      return { success: false, error: 'session_required', message: 'เซสชัน AI หมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    }
    if (!response.ok) {
      if (needsTrustedWorkData(normalized)) {
        return { success: false, error: 'work_data_unavailable', message: 'CatLog AI เชื่อมต่อฐานข้อมูล WorkLogs ไม่สำเร็จ จึงจะไม่ตอบตัวเลขจากการคาดเดา กรุณาลองใหม่อีกครั้ง' };
      }
      if (needsFreshWebData(normalized)) {
        return { success: false, error: 'fresh_data_unavailable', message: 'CatLog AI ค้นข้อมูลปัจจุบันไม่สำเร็จ จึงจะไม่ตอบจากความจำเก่า กรุณาลองใหม่อีกครั้ง' };
      }
      const directResult = await sendClientProviderChat(normalized, { recordUsage: false });
      if (directResult) return directResult;
      return { success: false, error: response.status === 429 ? 'rate_limit' : 'api_error', message: payload.message || 'AI service unavailable' };
    }
    const result = payload.data || {};
    const parsed = parseThinking(result.answer || '');
    const dashboardSummary = String(result.dashboardSummary || '').trim();
    return {
      success: true,
      // Server-produced totals are rendered before the LLM narrative so a
      // dashboard question cannot be made inaccurate by model arithmetic.
      answer: dashboardSummary ? `${dashboardSummary}\n\n${parsed.answer}`.trim() : parsed.answer,
      thinking: result.thinking || parsed.thinking,
      rawContent: result.answer || '', searchPerformed: !!result.searchPerformed,
      searchProvider: result.searchProvider || null, deterministic: !!result.deterministic,
      query: result.appliedFilters || null, totalMatches: result.totalMatches || null, usage: result.usage || null,
      sources: Array.isArray(result.sources) ? result.sources : [],
    };
  } catch (error) {
    return { success: false, error: error.name === 'AbortError' ? 'timeout' : 'api_error', message: error.name === 'AbortError' ? 'AI ใช้เวลานานเกินไป กรุณาลองใหม่' : 'ไม่สามารถเชื่อมต่อ AI ได้' };
  } finally {
    clearTimeout(timeout);
  }
}

async function webSearch() { return []; }
async function buildWorklogContext() { return ''; }

export const thaiLlmService = {
  sendChat, createSession, clearSession, sendClientProviderChat, webSearch, buildWorklogContext,
  getDashboardFilters, parseThinking, markdownToHtml, rateLimiter, config: AI_CONFIG,
};
