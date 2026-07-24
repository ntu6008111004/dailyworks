import { apiService } from './api';

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

function setCookie(name, value, days = 365) {
  try {
    if (typeof document === 'undefined') return;
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax" + secureFlag;
  } catch {}
}

function getCookie(name) {
  try {
    if (typeof document === 'undefined') return null;
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  } catch { return null; }
}

function eraseCookie(name) {
  try {
    if (typeof document === 'undefined') return;
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax' + secureFlag;
  } catch {}
}

function getSessionToken() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) ||
           localStorage.getItem(SESSION_STORAGE_KEY) ||
           getCookie(SESSION_STORAGE_KEY) || '';
  } catch { return ''; }
}

function getSessionStatus() {
  const token = getSessionToken();
  if (!token) return { valid: false, reason: 'missing', expiresAt: 0 };
  try {
    const body = token.split('.')[0];
    const base64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(base64))));
    const expiresAt = Number(payload.exp) * 1000;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { valid: false, reason: 'expired', expiresAt: expiresAt || 0 };
    }
    return { valid: true, reason: 'active', expiresAt };
  } catch {
    return { valid: false, reason: 'invalid', expiresAt: 0 };
  }
}

function notifySessionExpired(reason = 'expired') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('catlog-ai-session-expired', { detail: { reason } }));
}

async function syncAiTokenToDb(userId, token) {
  if (!userId || !token || !supabase) return;
  try {
    const idStr = String(userId);
    const { data } = await supabase.from('Users').select('Permissions').eq('ID', idStr).maybeSingle();
    const currentPerms = data?.Permissions || {};
    if (currentPerms.aiToken !== token) {
      await supabase.from('Users').update({
        Permissions: { ...currentPerms, aiToken: token, aiTokenUpdated: new Date().toISOString() }
      }).eq('ID', idStr);
    }
  } catch (e) {
    console.warn('Could not sync AI token to Supabase DB:', e);
  }
}

function setSessionToken(token, userId = null) {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, token);
      localStorage.setItem(SESSION_STORAGE_KEY, token);
      setCookie(SESSION_STORAGE_KEY, token, 365);
      
      const activeUser = getLoggedInUserFromStorage();
      const targetId = userId || apiService.userId || activeUser?.ID || activeUser?.id;
      if (targetId) {
        syncAiTokenToDb(targetId, token);
      }
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
      eraseCookie(SESSION_STORAGE_KEY);
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
  setSessionToken(token, apiService.userId);
  return token;
}

async function autoRenewSession(userData) {
  if (!userData) return null;
  const userId = userData.ID || userData.id;
  const username = userData.Username || userData.username;
  const name = userData.Name || userData.name;
  const password = userData.Password || userData._p || userData.password;
  
  const cleanUserId = userId != null ? String(userId).trim() : '';
  const cleanUsername = username != null ? String(username).trim() : (name != null ? String(name).trim() : '');
  const cleanPassword = password != null ? String(password) : '';

  // 1. Check if local token is already valid
  const existingStatus = getSessionStatus();
  if (existingStatus.valid) {
    return getSessionToken();
  }

  // 2. Read 1-year AI Token directly from Supabase Database for instant auto-renew
  if (cleanUserId && supabase) {
    try {
      const { data: dbUser } = await supabase
        .from('Users')
        .select('Permissions')
        .eq('ID', cleanUserId)
        .maybeSingle();
      const dbToken = dbUser?.Permissions?.aiToken;
      if (dbToken) {
        try {
          const base64 = dbToken.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(decodeURIComponent(escape(atob(base64))));
          const expMs = Number(payload.exp) * 1000;
          if (expMs > Date.now()) {
            setSessionToken(dbToken, cleanUserId);
            return dbToken;
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Could not read AI token from Supabase DB:', e);
    }
  }

  // 3. Fallback: Request fresh token from backend if needed
  if (!cleanUserId && !cleanUsername) return null;

  try {
    const payload = {};
    if (cleanUsername && cleanPassword) {
      payload.username = cleanUsername;
      payload.password = cleanPassword;
    } else if (cleanUserId) {
      payload.userId = cleanUserId;
    } else if (cleanUsername) {
      payload.username = cleanUsername;
    }

    const response = await fetch(apiEndpoint('session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const payloadResult = await response.json().catch(() => ({}));
    const token = payloadResult.data?.token;
    if (response.ok && token) {
      setSessionToken(token, cleanUserId);
      return token;
    }
  } catch (error) {
    console.warn('Auto AI session renewal failed:', error);
  }
  return null;
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
  const recent = messages.slice(-12);
  return recent.map((message, index) => {
    const isLatest = index === recent.length - 1;
    return {
      role: message.role,
      // Keep a pasted document intact in the latest turn; compact older
      // context to remain below the backend's total request limit.
      content: String(message.content || '').slice(0, isLatest ? 12000 : 1400),
    };
  });
}

function isCalculationRequest(question) {
  const text = String(question || '').trim();
  const lower = text.toLowerCase();
  const hasNumbers = (text.match(/\d+(?:[.,]\d+)?/g) || []).length >= 2;
  const calculation = ['คำนวณ', 'คิดเลข', 'อีกกี่วัน', 'กี่วันจะ', 'จะครบ', 'ต้องทำอีก', 'วันละ', 'เฉลี่ยวันละ', 'calculate', 'per day']
    .some(term => lower.includes(term));
  return calculation && (hasNumbers || /(?:ถ้า|หาก|สมมติ|สมมุติ)/u.test(text));
}

function clientRoutingText(messages) {
  const latest = String(messages[messages.length - 1]?.content || '').trim();
  if (!latest || latest.length > 140 || !/^(?:แล้ว|ถ้า|หาก|ไม่ใช่|หมายถึง|ทำไม|เพราะ|ยังไง|อย่างไร|จริงไหม|ใช่ไหม|อันไหน|เรื่องนี้|มัน|เขา|วันนี้|เมื่อวาน|พรุ่งนี้|สัปดาห์นี้|เดือนนี้|เดือนก่อน|ปีนี้|ทั้งหมด|ย้อนหลัง|ล่วงหน้า|AI\b)/iu.test(latest)) return latest;
  const previous = [...messages.slice(0, -1)].reverse().find(message => message.role === 'user' && String(message.content || '').trim());
  return previous ? `${previous.content}\n${latest}` : latest;
}

const QUICK_ACTIONS = [
  { id: 'my-all-work', label: '📊 งานทั้งหมดของฉัน', query: 'สรุปงานทั้งหมดของฉันทุกช่วงเวลาตั้งแต่เริ่มบันทึก แยกตามสถานะ' },
  { id: 'my-today-work', label: '📅 งานของฉันวันนี้', query: 'สรุปหัวข้องานของฉันที่ตรงกับวันนี้ แยกตามสถานะ' },
  { id: 'my-pending-work', label: '⏳ งานค้างของฉัน', query: 'สรุปเฉพาะหัวข้องานของฉันที่ยังไม่เสร็จทุกช่วงเวลา แยกตามสถานะ' },
  { id: 'my-score', label: '🏆 คะแนนของฉัน', query: 'สรุปคะแนนสะสมของฉันทุกช่วงเวลาตั้งแต่เริ่มบันทึก พร้อมจำนวนบรีฟแต่ละสถานะ' },
  { id: 'my-briefs', label: '📝 บรีฟของฉัน', query: 'สรุปบรีฟทั้งหมดของฉันทุกช่วงเวลาตั้งแต่เริ่มบันทึก แยกตามสถานะ' },
  { id: 'latest-news', label: '🌐 ข่าวล่าสุด', query: 'สรุปข่าวสำคัญล่าสุดวันนี้จากหลายแหล่ง ระบุวันที่เกิดเหตุและแหล่งข้อมูลท้ายคำตอบ' },
  { id: 'summarize-text', label: '✍️ สรุปข้อความ', query: 'สรุปข้อความต่อไปนี้เป็นหัวข้อสำคัญ สิ่งที่ต้องทำ ผู้รับผิดชอบ และกำหนดส่ง:\n\n[วางข้อความที่นี่]' },
  { id: 'calculate', label: '🧮 ช่วยคำนวณ', query: 'ช่วยคำนวณจากข้อมูลต่อไปนี้ พร้อมแสดงวิธีคิดแบบสั้น ๆ:\n\n[ระบุตัวเลขและเป้าหมาย]' },
];

const CLARIFICATION_CHOICES = {
  work: QUICK_ACTIONS.filter(action => ['my-all-work', 'my-today-work', 'my-pending-work'].includes(action.id)),
  score: [
    QUICK_ACTIONS.find(action => action.id === 'my-score'),
    { id: 'my-score-month', label: '🏆 คะแนนเดือนนี้', query: 'สรุปคะแนนสะสมของฉันเฉพาะเดือนปัจจุบัน พร้อมจำนวนบรีฟแต่ละสถานะ' },
  ],
  briefing: [
    QUICK_ACTIONS.find(action => action.id === 'my-briefs'),
    { id: 'my-briefs-week', label: '📝 บรีฟสัปดาห์นี้', query: 'สรุปบรีฟของฉันสัปดาห์นี้ แยกตามสถานะ' },
  ],
  summary: [
    QUICK_ACTIONS.find(action => action.id === 'my-today-work'),
    QUICK_ACTIONS.find(action => action.id === 'summarize-text'),
    QUICK_ACTIONS.find(action => action.id === 'latest-news'),
  ],
};

function compactThaiInput(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[?？]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clarificationFor(question) {
  const text = compactThaiInput(question).toLowerCase();
  const exactWork = /^(?:งาน|งานผม|งานฉัน|งานของผม|งานของฉัน|ของผม|ของฉัน|มีกี่งาน)$/u.test(text);
  const exactScore = /^(?:คะแนน|แต้ม|คะแนนผม|คะแนนฉัน|คะแนนของผม|คะแนนของฉัน)$/u.test(text);
  const exactBriefing = /^(?:บรีฟ|บรีฟผม|บรีฟฉัน|บรีฟของผม|บรีฟของฉัน)$/u.test(text);
  const exactSummary = /^(?:สรุป|ช่วยสรุป|สรุปให้หน่อย)$/u.test(text);
  const personOnly = text.match(/^(แพท|แพด|เหมี่ยว|กีต้า|พอร์มเตอร์|โม|ฟลุ๊ค|ฟลุค|บัส|บอส|เติ้ล|มาย)$/u);
  if (exactWork) return { answer: 'ต้องการดูงานแบบไหนครับ? เลือกได้เลย เพื่อให้ CatLog AI ใช้ช่วงเวลาและสถานะได้ถูกต้อง', suggestions: CLARIFICATION_CHOICES.work };
  if (exactScore) return { answer: 'ต้องการดูคะแนนช่วงไหนครับ? ถ้าไม่เลือกเดือน ระบบจะสรุปคะแนนสะสมทั้งหมดของบัญชีคุณ', suggestions: CLARIFICATION_CHOICES.score };
  if (exactBriefing) return { answer: 'ต้องการดูบรีฟทั้งหมดหรือเฉพาะสัปดาห์นี้ครับ?', suggestions: CLARIFICATION_CHOICES.briefing };
  if (exactSummary) return { answer: 'ต้องการให้สรุปอะไรครับ? เลือกรูปแบบด้านล่าง หรือพิมพ์รายละเอียดต่อได้เลย', suggestions: CLARIFICATION_CHOICES.summary };
  if (personOnly) {
    const name = personOnly[1];
    return {
      answer: `ต้องการดูข้อมูลอะไรของ “${name}” ครับ? ระบบจะตรวจสิทธิ์ก่อนค้นทุกครั้ง`,
      suggestions: [
        { id: `${name}-work`, label: '📊 งานทั้งหมด', query: `สรุปงานทั้งหมดทุกช่วงเวลาของ ${name} แยกตามสถานะ` },
        { id: `${name}-score`, label: '🏆 คะแนน', query: `สรุปคะแนนสะสมทั้งหมดของ ${name} พร้อมจำนวนบรีฟแต่ละสถานะ` },
        { id: `${name}-brief`, label: '📝 บรีฟ', query: `สรุปบรีฟทั้งหมดของ ${name} แยกตามสถานะ` },
      ],
    };
  }
  return null;
}

function inferUserIntent(messages) {
  const latest = compactThaiInput(messages[messages.length - 1]?.content);
  const contextual = clientRoutingText(messages);
  const text = compactThaiInput(contextual).toLowerCase();
  if (!latest || isCalculationRequest(latest)) return { messages };

  const clarification = clarificationFor(latest);
  if (clarification) return { messages, clarification };

  const hasDateScope = /(?:วันนี้|เมื่อวาน|พรุ่งนี้|สัปดาห์|เดือน|ปี|วันที่|ย้อนหลัง|ล่วงหน้า|ตั้งแต่|ถึง|ทุกช่วงเวลา|ไม่จำกัดวัน)/u.test(text);
  const hasStatusScope = /(?:ค้าง|ยังไม่|ไม่เสร็จ|เสร็จ|รอตรวจ|กำลังทำ|ยังไม่เริ่ม|ยกเลิก|เกินกำหนด)/u.test(text);
  const selfReference = /(?:ฉัน|ผม|ตัวเอง|ของเรา|บัญชีนี้|ของกู)/u.test(text);
  const workReference = /(?:งาน|worklog|เวิร์กล็อก)/u.test(text);
  const scoreReference = /(?:คะแนน|แต้ม|score)/u.test(text);
  const briefingReference = /(?:บรีฟ|brief)/u.test(text);
  const latestMessageIsFollowUp = latest.length <= 100 && /^(?:แล้ว|งั้น|ถ้า|ไม่ใช่|หมายถึง|ของผม|ของฉัน|ตัวเอง|เอา|ดู|ขอ)/u.test(latest);
  const hints = [];

  if (workReference && selfReference && !hasDateScope && !hasStatusScope) {
    hints.push('ค้นงานของบัญชีผู้ใช้ที่กำลังเข้าสู่ระบบทุกช่วงเวลาตั้งแต่เริ่มบันทึก ไม่ใช่เฉพาะวันนี้');
  }
  if (workReference && /(?:วันนี้|วันนี้มีอะไร|ทำอะไรวันนี้|งานวันนี|งานวันนี้)/u.test(text)) {
    hints.push('ค้นเฉพาะงานของวันที่ปัจจุบันตามเวลา Asia/Bangkok');
  }
  if (workReference && /(?:ค้าง|เหลือ|ยังไม่เสร็จ|ยังไม่ได้ทำ|ต้องทำ)/u.test(text)) {
    hints.push('ตีความเป็นงานที่ยังไม่เสร็จ และแยกสถานะให้เห็นชัด');
  }
  if (scoreReference && selfReference) {
    hints.push('ใช้รหัสพนักงานจาก session ของบัญชีที่เข้าสู่ระบบ ห้ามค้นด้วยการเดาชื่อ');
  }
  if (briefingReference && selfReference) {
    hints.push('ใช้รหัสพนักงานจาก session และค้นข้อมูลบรีฟตามสิทธิ์ของบัญชี');
  }
  if (latestMessageIsFollowUp) {
    hints.push('นี่เป็นคำถามต่อเนื่อง ให้อิงหัวข้อและตัวเลขจากข้อความผู้ใช้ก่อนหน้า');
  }
  if (!hints.length) return { messages };

  return {
    messages: messages.map((message, index) => index === messages.length - 1
      ? { ...message, content: `${contextual}\n\nคำใบ้การตีความจากหน้าจอ (ห้ามเปลี่ยนเจตนาผู้ใช้): ${hints.join('; ')}` }
      : message),
  };
}

async function fetchClientWorkSummaryContext() {
  try {
    const rawSession = localStorage.getItem('dw_session');
    let currentUser = null;
    if (rawSession) {
      try {
        const keyLen = 'DWS!@#2025'.length;
        const reversed = rawSession.split('').map((c, i) => {
          const code = c.charCodeAt(0) ^ ('DWS!@#2025'.charCodeAt(i % keyLen) & 0x1F);
          return String.fromCharCode(code);
        }).join('');
        const decoded = decodeURIComponent(escape(atob(reversed)));
        if (decoded) currentUser = JSON.parse(decoded);
      } catch {}
    }
    const userId = currentUser?.ID || currentUser?.id || apiService.userId;
    const userName = currentUser?.Name || currentUser?.name || currentUser?.Username || 'ผู้ใช้';

    if (!userId) return null;

    const [tasks, briefings] = await Promise.all([
      apiService.getTasksSummary().catch(() => []),
      apiService.getBriefings().catch(() => []),
    ]);

    const strUserId = String(userId);
    const myTasks = (tasks || []).filter(t => String(t.UserID || t.user_id || '') === strUserId);
    const bkkDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    
    const todayTasks = myTasks.filter(t => String(t.StartDate || t.DueDate || t.CreatedDate || '').startsWith(bkkDate));
    const pendingTasks = myTasks.filter(t => t.Status !== 'เสร็จสิ้น' && t.Status !== 'ยกเลิก' && t.Status !== 'ยกเลิกงาน');
    const completedTasks = myTasks.filter(t => t.Status === 'เสร็จสิ้น');

    const myBriefs = (briefings || []).filter(b => 
      String(b.CreatorID || b.creator_id || '') === strUserId || 
      (Array.isArray(b.Assignees) && b.Assignees.some(a => String(a.id || a.ID || a) === strUserId))
    );

    const completedBriefs = myBriefs.filter(b => b.Status === 'เสร็จสิ้น');
    const totalScore = completedBriefs.reduce((sum, b) => sum + (Number(b.Points) || 0), 0);

    return [
      `[ข้อมูลสรุปจากฐานข้อมูล WorkLogs สำหรับผู้ใช้: ${userName} (ID ${userId}) ณ วันที่ ${bkkDate}]`,
      `- จำนวนงานทั้งหมดของคุณ: ${myTasks.length} งาน (เสร็จสิ้น: ${completedTasks.length}, งานค้าง/กำลังทำ: ${pendingTasks.length})`,
      `- งานของคุณในวันนี้ (${bkkDate}): ${todayTasks.length} งาน`,
      `- คะแนนสะสมรวมทั้งหมดจากงานบรีฟ: ${totalScore} คะแนน (จากบรีฟที่เสร็จสิ้น ${completedBriefs.length}/${myBriefs.length} รายการ)`,
      todayTasks.length > 0 ? `- รายการงานวันนี้:\n${todayTasks.slice(0, 10).map(t => `  • [${t.Status || 'รอดำเนินการ'}] ${t.Detail || t.Title}`).join('\n')}` : '- วันนี้ไม่มีรายการงานใหม่',
      pendingTasks.length > 0 ? `- รายการงานค้างอยู่:\n${pendingTasks.slice(0, 10).map(t => `  • [${t.Status || 'ค้าง'}] ${t.Detail || t.Title}`).join('\n')}` : '- ไม่มีงานค้าง',
    ].join('\n');
  } catch (e) {
    console.warn('Could not fetch client work summary context:', e);
    return null;
  }
}

function hasAllTimeIntent(messages) {
  const question = clientRoutingText(messages).toLowerCase();
  const explicitAllTime = [
    'งานทั้งหมดของฉัน', 'งานทั้งหมดของผม', 'งานของฉันทั้งหมด', 'งานของผมทั้งหมด',
    'ตั้งแต่บันทึกทั้งหมด', 'ตั้งแต่เริ่มบันทึก', 'นับทั้งหมดเลย', 'ทุกช่วงเวลา',
    'ไม่จำกัดวันที่', 'ไม่ใช่วันนี้', 'ทั้งหมดที่เคยบันทึก',
  ].some(term => question.includes(term));
  const flexibleAllTime = /(?:งาน|worklog).*(?:ทั้งหมด|รวมหมด|ทั้งระบบ|ทุกงาน|ตั้งแต่แรก|ที่เคยบันทึก|ที่เคยทำ)/u.test(question)
    || /(?:ทั้งหมด|รวมหมด|ทุกงาน).*(?:งาน|worklog)/u.test(question);
  if (!explicitAllTime && !flexibleAllTime) return false;
  const asksSpecificDate = /(?:วันที่\s*\d|เดือน(?:นี้|ที่แล้ว|หน้า)|ปี(?:นี้|ที่แล้ว|หน้า|\s*\d)|สัปดาห์|ย้อนหลัง|ล่วงหน้า|พรุ่งนี้|เมื่อวาน)/u.test(question);
  return !asksSpecificDate || question.includes('ไม่ใช่วันนี้') || question.includes('ไม่จำกัดวันที่');
}

function applyAllTimeScope(messages) {
  if (!hasAllTimeIntent(messages)) return { messages, dashboardFilters: undefined };
  const contextualQuestion = clientRoutingText(messages);
  const lower = contextualQuestion.toLowerCase();
  const scopeLabel = /(?:คะแนน|แต้ม|บรีฟ|brief|score)/u.test(lower)
    ? 'ข้อมูลบรีฟและคะแนนทุกช่วงเวลาตั้งแต่เริ่มบันทึก'
    : 'งานทุกช่วงเวลาตั้งแต่เริ่มบันทึก';
  const scoped = messages.map((message, index) => index === messages.length - 1
    ? {
      ...message,
      content: `${contextualQuestion}\n\nขอบเขตที่ผู้ใช้ยืนยัน: ${scopeLabel} [ALL_TIME_SCOPE]`,
    }
    : message);
  return { messages: scoped, dashboardFilters: null };
}

function needsTrustedWorkData(messages) {
  const latest = String(messages[messages.length - 1]?.content || '');
  if (isCalculationRequest(latest)) return false;
  const question = clientRoutingText(messages).toLowerCase();
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
  const question = clientRoutingText(messages).toLowerCase();
  return [
    'ล่าสุด', 'ปัจจุบัน', 'วันนี้', 'ตอนนี้', 'ปีนี้', 'เมื่อวาน', 'ข่าว',
    'ราคา', 'แพง', 'ถูกลง', 'ขึ้นราคา', 'ขาดตลาด', 'แนวโน้ม',
    'latest', 'current', 'today', 'news', 'right now', 'this year', 'price',
  ].some(term => question.includes(term));
}

function getLoggedInUserFromStorage() {
  try {
    let rawSession = localStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem('dw_session') || getCookie('dw_session');
    if (rawSession && rawSession.length > 50 && !rawSession.startsWith('{')) {
      try {
        const keyLen = 'DWS!@#2025'.length;
        const reversed = rawSession.split('').map((c, i) => {
          const code = c.charCodeAt(0) ^ ('DWS!@#2025'.charCodeAt(i % keyLen) & 0x1F);
          return String.fromCharCode(code);
        }).join('');
        const decoded = decodeURIComponent(escape(atob(reversed)));
        if (decoded) {
          const parsed = JSON.parse(decoded);
          if (parsed && (parsed.ID || parsed.id || parsed.Username || parsed.username)) return parsed;
        }
      } catch {}
    }
    const legacyUser = localStorage.getItem('user');
    if (legacyUser) {
      try {
        const parsed = JSON.parse(legacyUser);
        if (parsed && (parsed.ID || parsed.id || parsed.Username || parsed.username)) return parsed;
      } catch {}
    }
    if (apiService.userId) {
      return { ID: apiService.userId, Username: apiService.executorId };
    }
  } catch {}
  return null;
}

async function sendChat(messages, { enableWebSearch = true, dashboardFilters = null } = {}) {
  const limit = rateLimiter.canProceed();
  if (!limit.allowed) return { success: false, error: 'rate_limit', message: limit.message, waitMs: limit.waitMs };
  if (!Array.isArray(messages) || messages.length < 1) return { success: false, error: 'invalid_request', message: 'ไม่พบข้อความคำถาม' };
  const normalized = normalizeConversation(messages);
  const inferred = inferUserIntent(normalized);
  if (inferred.clarification) {
    return {
      success: true,
      answer: inferred.clarification.answer,
      thinking: null,
      searchPerformed: false,
      clarification: true,
      suggestions: inferred.clarification.suggestions,
      sources: [],
    };
  }
  const allTimeScope = applyAllTimeScope(inferred.messages);
  const requestMessages = allTimeScope.messages;
  const requestDashboardFilters = allTimeScope.dashboardFilters === null ? null : dashboardFilters;

  let token = getSessionToken();
  if (!token) {
    // On-the-fly auto-renew using active user session from WorkLogs
    const activeUser = getLoggedInUserFromStorage();
    if (activeUser) {
      token = await autoRenewSession(activeUser);
    }
  }

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
    let response = await fetch(apiEndpoint('chat'), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ messages: requestMessages, enableWebSearch, dashboardFilters: requestDashboardFilters }),
    });

    // If session was rejected (401), attempt on-the-fly auto-renewal and retry
    if (response.status === 401) {
      const activeUser = getLoggedInUserFromStorage();
      if (activeUser) {
        const newToken = await autoRenewSession(activeUser);
        if (newToken) {
          response = await fetch(apiEndpoint('chat'), {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + newToken },
            body: JSON.stringify({ messages: requestMessages, enableWebSearch, dashboardFilters: requestDashboardFilters }),
          });
        }
      }
    }

    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearSession();
      notifySessionExpired('expired');
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
      suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
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
  sendChat, createSession, autoRenewSession, clearSession, sendClientProviderChat, webSearch, buildWorklogContext,
  getDashboardFilters, getSessionStatus, parseThinking, markdownToHtml, rateLimiter,
  quickActions: QUICK_ACTIONS, config: AI_CONFIG,
};
