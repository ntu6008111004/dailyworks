const ALLOWED_DATASETS = new Set(['tasks', 'briefings', 'team']);
const ALLOWED_ACTIONS = new Set(['count', 'list', 'summarize', 'compare', 'score_gap']);
const ALLOWED_STATUSES = new Set([
  'ยังไม่เริ่ม', 'รอดำเนินการ', 'กำลังทำ', 'รอตรวจ', 'รอแก้ไข', 'เสร็จสิ้น', 'ยกเลิกงาน',
]);

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function extractJsonObject(value) {
  const text = String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanText(value, max = 100) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function validateDataPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const dataset = ALLOWED_DATASETS.has(raw.dataset) ? raw.dataset : null;
  const action = ALLOWED_ACTIONS.has(raw.action) ? raw.action : null;
  if (!dataset || !action) return null;

  const people = Array.isArray(raw.people)
    ? [...new Set(raw.people.map(value => cleanText(value, 80)).filter(Boolean))].slice(0, 10)
    : [];
  const fromDate = validIsoDate(raw.fromDate) ? raw.fromDate : null;
  const toDate = validIsoDate(raw.toDate) ? raw.toDate : null;
  const status = ALLOWED_STATUSES.has(raw.status) ? raw.status : null;
  const hasTargetPoints = raw.targetPoints !== null && raw.targetPoints !== undefined && raw.targetPoints !== '';
  const targetPoints = hasTargetPoints && Number.isFinite(Number(raw.targetPoints)) && Number(raw.targetPoints) >= 0
    ? Math.min(Number(raw.targetPoints), 1000000)
    : null;
  const clarification = cleanText(raw.clarification, 240) || null;

  if ((fromDate && !toDate) || (!fromDate && toDate) || (fromDate && fromDate > toDate)) return null;
  if (action === 'score_gap' && targetPoints === null && !clarification) {
    return { dataset, action, people, fromDate, toDate, status, keyword: null, targetPoints, clarification: 'ต้องการให้เทียบกับเป้าหมายกี่คะแนน?' };
  }
  return {
    dataset,
    action,
    people,
    fromDate,
    toDate,
    status,
    keyword: cleanText(raw.keyword, 100) || null,
    targetPoints,
    clarification,
  };
}

async function requestDataPlan({ providerUrl, apiKey, model, question, messages, currentDate, timeoutMs = 20000 }) {
  if (!providerUrl || !apiKey) return null;
  const recentConversation = (messages || []).slice(-8).map(message => ({
    role: message.role,
    content: cleanText(message.content, 500),
  }));
  const prompt = [
    'คุณคือ Query Planner แบบ read-only ของ CatLog AI ห้ามตอบคำถาม ให้คืน JSON object เท่านั้น',
    `วันที่ประเทศไทยปัจจุบัน: ${currentDate}`,
    'โครงสร้างที่อนุญาต:',
    '- tasks: Tasks(ID, Detail, Status, Priority, StartDate, DueDate, UserID, StaffName, Department, CompletedAt)',
    '- briefings: Briefings(ID, Title, Detail, CreatorID, Assignees, Status, StartDate, DueDate, CompletedAt, Points) และ BriefingResponses',
    '- team: คะแนนและจำนวนบรีฟ โดยใช้สูตรเดียวกับหน้า My Team',
    'คืนฟิลด์: dataset(tasks|briefings|team), action(count|list|summarize|compare|score_gap), people(string[]), fromDate, toDate, status, keyword, targetPoints, clarification',
    'กติกา: แปลงวันนี้/ย้อนหลัง/ล่วงหน้า/เดือนก่อน/ช่วงวันเป็น YYYY-MM-DD โดยอิงวันที่ปัจจุบัน',
    'คำว่า ฉัน/ผม/ตัวเอง ให้ people=["__SELF__"] ชื่อหลายคนให้ใส่ครบทุกคน รวมชื่อเล่นตามข้อความเดิม',
    'คะแนนใช้ dataset=team; งานทั่วไปใช้ tasks; คำว่าบรีฟใช้ briefings',
    'ถ้าถามขาดอีกกี่คะแนนแต่ไม่มีเป้าหมาย ให้ action=score_gap, targetPoints=null และ clarification ถามเป้าหมาย',
    'ห้ามสร้าง SQL ห้ามเลือกตารางหรือคอลัมน์อื่น ห้ามวางแผน INSERT/UPDATE/DELETE',
    `คำถามล่าสุด: ${cleanText(question, 1000)}`,
    `บทสนทนาล่าสุด: ${JSON.stringify(recentConversation)}`,
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'สร้างแผน JSON' }],
        max_tokens: 700,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return validateDataPlan(extractJsonObject(data.choices?.[0]?.message?.content));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { extractJsonObject, requestDataPlan, validateDataPlan };
