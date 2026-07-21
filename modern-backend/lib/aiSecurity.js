const crypto = require('crypto');

const SESSION_VERSION = 1;
// The latest user message may contain a pasted brief, meeting note, or long
// article for summarisation. The total cap still protects the model context.
const MAX_MESSAGE_LENGTH = 12000;
const MAX_TOTAL_MESSAGE_LENGTH = 30000;
const MAX_MESSAGES = 12;

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function signSession(payload, secret, ttlSeconds = 8 * 60 * 60) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('AI_SESSION_SECRET must contain at least 32 characters');
  }

  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(JSON.stringify({
    v: SESSION_VERSION,
    sub: String(payload.sub),
    iat: now,
    exp: now + ttlSeconds,
  }));
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySession(token, secret) {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length < 32) {
    return null;
  }

  const [body, suppliedSignature, extra] = token.split('.');
  if (!body || !suppliedSignature || extra) return null;

  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    return null;
  }
  if (
    actualSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.v !== SESSION_VERSION ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= now
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function validateCredentialInput(username, password) {
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.length < 1 ||
    username.length > 100 ||
    password.length < 1 ||
    password.length > 512
  ) {
    return null;
  }
  const normalizedUsername = username.trim();
  if (!normalizedUsername) return null;
  return { username: normalizedUsername, password };
}

function isValidIsoDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateChatMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return null;
  }

  let totalLength = 0;
  const normalized = [];
  for (const message of messages) {
    if (
      !message ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string'
    ) {
      return null;
    }
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return null;
    totalLength += content.length;
    if (totalLength > MAX_TOTAL_MESSAGE_LENGTH) return null;
    normalized.push({ role: message.role, content });
  }

  if (normalized[normalized.length - 1].role !== 'user') return null;
  return normalized;
}

function bangkokDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function bangkokYear() {
  return Number(bangkokDate().slice(0, 4));
}

const STATUS_ALIASES = [
  { terms: ['ยังไม่เริ่ม', 'ยังไม่เริ่มทำ', 'not started'], value: 'ยังไม่เริ่ม' },
  { terms: ['รอดำเนินการ', 'งานค้าง', 'pending'], value: 'รอดำเนินการ' },
  { terms: ['กำลังทำ', 'in progress'], value: 'กำลังทำ' },
  { terms: ['รอตรวจ', 'waiting review'], value: 'รอตรวจ' },
  { terms: ['รอแก้ไข', 'waiting fix'], value: 'รอแก้ไข' },
  { terms: ['เสร็จสิ้น', 'เสร็จแล้ว', 'completed'], value: 'เสร็จสิ้น' },
  { terms: ['ยกเลิกงาน', 'cancelled'], value: 'ยกเลิกงาน' },
];

const STAFF_ALIASES = [
  { aliases: ['เหมี่ยว', 'เหมียว', 'หมี่ยว'], name: 'วิศรุตา จันตาโลก' },
  { aliases: ['กีต้า', 'กีตา', 'กีต้าร์'], name: 'สหัสวรรษ ปันเวียง' },
  { aliases: ['พอร์มเตอร์', 'พอร์ม', 'พอมเตอร์'], name: 'เศรษฐกิจ มั่งมี' },
  { aliases: ['โม'], name: 'สิรินาถ พิมพิสาร' },
  { aliases: ['ฟลุ๊ค', 'ฟลุค'], name: 'วชิรศักดิ์ สายสูงธนาศักดิ์' },
  { aliases: ['บัส', 'บาส'], name: 'ยุทธนา ฟักแฟง' },
  { aliases: ['บอส', 'บอด'], name: 'พรชัย นันทะปารียอง' },
  { aliases: ['เติ้ล', 'เติล'], name: 'เขตโสภณ นิลคำ' },
  { aliases: ['แพท', 'แพด'], name: 'ณัฐนันท์ ปาแก้ว' },
  { aliases: ['มาย', 'มายด์'], name: 'ธัญญา แสงเมือง' },
];

const WORK_TERMS = [
  'งาน', 'task', 'worklog', 'บรีฟ', 'briefing', 'สถานะ', 'status', 'สรุปงาน',
  'แดชบอร์ด', 'dashboard', 'ในระบบ', 'ที่บันทึก', 'รายการงาน', 'จำนวนงาน',
  'งานทั้งหมด', 'งานของฉัน', 'งานของผม', 'งานของทีม', 'งานของเรา', 'งานค้าง',
  'กำลังทำ', 'เสร็จ', 'รอตรวจ', 'รอแก้ไข', 'deadline', 'กำหนดส่ง', 'มอบหมาย',
  'โปรเจค', 'โปรเจกต์', 'โปรเจ็กต์', 'project', 'แผนก', 'department', 'คะแนน', 'point', 'ผู้รับผิดชอบ',
];

const SUMMARY_TERMS = [
  'ทั้งหมด', 'ภาพรวม', 'สรุป', 'dashboard', 'แดชบอร์ด', 'กี่งาน', 'จำนวน',
  'สถิติ', 'นับ', 'คงเหลือ', 'ค้าง', 'เสร็จกี่', 'สถานะ', 'เท่าไหร่', 'เท่าไร',
  'กี่รายการ', 'กี่บรีฟ',
];

const DETAIL_TERMS = ['แสดงรายการ', 'รายการ', 'รายชื่อ', 'รายละเอียด', 'งานไหน', 'list', 'show tasks'];

function isHypotheticalOrCalculation(question) {
  const text = String(question || '').trim();
  const lower = text.toLowerCase();
  const hasNumbers = (text.match(/\d+(?:[.,]\d+)?/g) || []).length >= 2;
  const hypothetical = /(?:^|\s)(?:ถ้า|หาก|สมมติ|สมมุติ|กรณีที่)|(?:if|suppose|assuming)\b/iu.test(text);
  const calculation = [
    'คำนวณ', 'คิดเลข', 'อีกกี่วัน', 'กี่วันจะ', 'จะครบ', 'ต้องทำอีก', 'วันละ',
    'เฉลี่ยวันละ', 'บวก', 'ลบ', 'คูณ', 'หาร', 'เปอร์เซ็นต์', 'ร้อยละ',
    'calculate', 'per day', 'how many days',
  ].some(term => lower.includes(term));
  return calculation && (hypothetical || hasNumbers);
}

function hasInternalWorkEvidence(question) {
  const lower = String(question || '').toLowerCase();
  const strongTerms = [
    'worklog', 'แดชบอร์ด', 'dashboard', 'ในระบบ', 'ที่บันทึก', 'รายการงาน',
    'งานทั้งหมด', 'งานวันนี้', 'งานของฉัน', 'งานของผม', 'งานฉัน', 'งานผม',
    'งานของทีม', 'งานของเรา', 'งานค้าง', 'กี่งาน', 'จำนวนงาน', 'สรุปงาน',
    'บรีฟ', 'briefing', 'คะแนนสะสม', 'คะแนนของฉัน', 'คะแนนของผม',
    'สถานะงาน', 'กำลังทำ', 'รอตรวจ', 'รอแก้ไข', 'กำหนดส่ง', 'มอบหมาย',
    'แผนก', 'ผู้รับผิดชอบ',
  ];
  return strongTerms.some(term => lower.includes(term)) ||
    STAFF_ALIASES.some(item => item.aliases.some(alias => lower.includes(alias))) ||
    isSelfReference(question);
}

function extractQueryFilters(question) {
  const text = String(question || '').trim();
  const lower = text.toLowerCase();
  const filters = {};

  const explicitDates = [...lower.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)]
    .map(match => match[1])
    .filter(isValidIsoDate);
  if (explicitDates.length >= 2) {
    [filters.fromDate, filters.toDate] = explicitDates.slice(0, 2).sort();
  } else if (explicitDates.length === 1) {
    filters.fromDate = explicitDates[0];
    filters.toDate = explicitDates[0];
  } else if (lower.includes('วันนี้') || lower.includes('today')) {
    filters.fromDate = bangkokDate();
    filters.toDate = filters.fromDate;
  } else if (lower.includes('เมื่อวาน') || lower.includes('yesterday')) {
    filters.fromDate = bangkokDate(-1);
    filters.toDate = filters.fromDate;
  } else if (
    lower.includes('สัปดาห์นี้') ||
    lower.includes('7 วัน') ||
    lower.includes('this week')
  ) {
    filters.fromDate = bangkokDate(-6);
    filters.toDate = bangkokDate();
  } else if (lower.includes('เดือนนี้') || lower.includes('this month')) {
    filters.fromDate = `${bangkokDate().slice(0, 7)}-01`;
    filters.toDate = bangkokDate();
  }

  // Month/year input commonly used in reports, e.g. 07/2026 or 07/2569.
  // An explicit month/year is more precise than a relative phrase such as
  // "เดือนนี้". This also makes historical reports deterministic.
  if (!explicitDates.length) {
    const monthYearMatch = lower.match(/\b(0?[1-9]|1[0-2])\/(20\d{2}|25\d{2})\b/);
    if (monthYearMatch) {
      const month = Number(monthYearMatch[1]);
      const rawYear = Number(monthYearMatch[2]);
      const year = rawYear >= 2400 ? rawYear - 543 : rawYear;
      if (year >= 2000 && year <= 2100) {
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        filters.fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
        filters.toDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      }
    }
  }

  // Support both Gregorian and Thai Buddhist Era years (2569 means 2026).
  // Do not override an explicit ISO date or a shorter relative period.
  const hasIsoLikeDate = /\b20\d{2}-\d{2}-\d{2}\b/.test(lower);
  if (!filters.fromDate && !hasIsoLikeDate) {
    const yearMatch = lower.match(/(?:ปี(?:พ\.ศ\.)?\s*)?(25\d{2}|20\d{2})\b/);
    if (yearMatch) {
      const rawYear = Number(yearMatch[1]);
      const gregorianYear = rawYear >= 2400 ? rawYear - 543 : rawYear;
      if (gregorianYear >= 2000 && gregorianYear <= 2100) {
        filters.fromDate = `${gregorianYear}-01-01`;
        filters.toDate = `${gregorianYear}-12-31`;
      }
    } else if (lower.includes('ปีนี้') || lower.includes('ปีปัจจุบัน') || lower.includes('this year')) {
      const currentYear = bangkokYear();
      filters.fromDate = `${currentYear}-01-01`;
      filters.toDate = `${currentYear}-12-31`;
    }
  }

  const status = STATUS_ALIASES.find(item => item.terms.some(term => lower.includes(term)));
  if (status) filters.status = status.value;

  const staff = STAFF_ALIASES.find(item => item.aliases.some(alias => lower.includes(alias)));
  if (staff) filters.staffName = staff.name;

  const quoted = text.match(/[“"]([^”"]{2,100})[”"]/);
  if (quoted) filters.keyword = quoted[1].trim();

  // Let natural Thai questions filter an old project without requiring users
  // to know the exact quoted-search syntax.
  if (!filters.keyword) {
    const keywordMatch = text.match(/(?:ชื่อ(?:งาน)?|โปรเจ(?:กต์|ค)|project|ค้นหา|เกี่ยวกับ|คำว่า|ที่มีคำว่า)\s*[:：]?\s*([^,!?\n]{2,100})/iu);
    if (keywordMatch) {
      const candidate = keywordMatch[1]
        .replace(/^(?:งาน\s*)?(?:เกี่ยวกับ|คำว่า)\s*/iu, '')
        .replace(/(?:ตั้งแต่|ถึง|สถานะ|ของ|ปี(?:พ\.ศ\.)?).*$/iu, '')
        .trim();
      if (candidate.length >= 2) filters.keyword = candidate;
    }
  }

  return filters;
}

function detectWorkIntent(question) {
  const lower = String(question || '').toLowerCase();
  if (isHypotheticalOrCalculation(question)) return 'none';
  const related = hasInternalWorkEvidence(question) && (
    WORK_TERMS.some(term => lower.includes(term)) ||
    STAFF_ALIASES.some(item => item.aliases.some(alias => lower.includes(alias)))
  );
  if (!related) return 'none';
  if (DETAIL_TERMS.some(term => lower.includes(term))) return 'detail';
  return SUMMARY_TERMS.some(term => lower.includes(term)) ? 'summary' : 'detail';
}

// Route internal questions to the same data product the user is referring to.
// Keeping this deterministic prevents the model from confusing Tasks on the
// Dashboard with Briefings or the score calculation on My Team.
function detectWorkDataset(question) {
  const lower = String(question || '').toLowerCase();
  const teamTerms = [
    'คะแนน', 'คะแนนสะสม', 'point', 'score', 'ทีมของฉัน', 'my team',
    'รับมอบ', 'ผู้รับมอบ', 'ผู้มอบหมาย', 'มอบหมายกี่', 'ผลงานของทีม',
  ];
  if (teamTerms.some(term => lower.includes(term))) return 'team';

  const briefingTerms = ['บรีฟ', 'briefing', 'หน้าบรีฟ', 'ระบบบรีฟ'];
  if (briefingTerms.some(term => lower.includes(term))) return 'briefings';

  return detectWorkIntent(question) === 'none' ? 'none' : 'tasks';
}

function isSelfReference(question) {
  const lower = String(question || '').toLowerCase();
  const strongSelfTerms = ['ตัวฉัน', 'ตัวผม', 'ตัวเอง', 'ของตัวเอง', 'คะแนนฉัน', 'คะแนนผม', 'ฉันมี', 'ผมมี', 'แล้วฉันล่ะ', 'แล้วผมล่ะ'];
  const teamReference = ['ทีมของฉัน', 'ทีมของผม', 'ทีมผม', 'my team'].some(term => lower.includes(term));
  if (teamReference && !strongSelfTerms.some(term => lower.includes(term))) return false;
  return [
    'ของฉัน', 'ของผม', 'ตัวฉัน', 'ตัวผม', 'ตัวเอง', 'ของตัวเอง',
    'คะแนนฉัน', 'คะแนนผม', 'งานฉัน', 'งานผม', 'บรีฟฉัน', 'บรีฟผม',
    'ฉันมี', 'ผมมี', 'แล้วฉันล่ะ', 'แล้วผมล่ะ', 'my score', 'my task', 'my work',
  ].some(term => lower.includes(term));
}

function isWorkRelated(question) {
  return detectWorkIntent(question) !== 'none';
}

function validateProviderUrl(rawUrl, allowInsecureHttp = false) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.hostname !== 'thaillm.or.th') return null;
  if (url.protocol === 'http:' && !allowInsecureHttp) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.hash) return null;
  return url.toString();
}

module.exports = {
  detectWorkDataset,
  detectWorkIntent,
  extractQueryFilters,
  hasInternalWorkEvidence,
  isWorkRelated,
  isHypotheticalOrCalculation,
  isSelfReference,
  signSession,
  validateChatMessages,
  validateCredentialInput,
  validateProviderUrl,
  verifySession,
};

