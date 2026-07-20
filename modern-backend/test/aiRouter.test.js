const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  asksForFreshInformation,
  briefingMetrics,
  createAiRouter,
  formatBriefingSummary,
  formatDashboardSummary,
  formatNewsSummary,
  formatTeamSummary,
  isNewsQuestion,
  isTextSummaryRequest,
  mergeDashboardFilters,
  newsQueryVariants,
  rankRelevantSearchResults,
  selectEmployeeByName,
  shouldSearchExternal,
  taskMetrics,
} = require('../aiRouter');
const { detectWorkDataset, detectWorkIntent, verifySession } = require('../lib/aiSecurity');

const SECRET = 'router-test-session-secret-with-32-characters';

function fakeSupabase() {
  return {
    from(table) {
      assert.equal(table, 'Users');
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() {
          return { data: { ID: 'user-1' }, error: null };
        },
      };
      return query;
    },
  };
}

async function withServer(run) {
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use('/api/ai', createAiRouter({
    supabase: fakeSupabase(),
    env: {
      AI_SESSION_SECRET: SECRET,
      THAILLM_API_KEY: 'test-key',
      THAILLM_API_URL: 'https://thaillm.or.th/api/v1/chat/completions',
    },
  }));
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('AI session endpoint rejects selector-shaped credentials', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: { selector: 'not-a-string' },
        password: { selector: 'not-a-string' },
      }),
    });
    assert.equal(response.status, 400);
  });
});

test('AI session endpoint issues a signed subject-only token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'staff', password: 'encoded-password' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const session = verifySession(payload.data.token, SECRET);
    assert.equal(session.sub, 'user-1');
    assert.deepEqual(Object.keys(session).sort(), ['exp', 'iat', 'sub', 'v']);
  });
});

test('AI chat endpoint rejects requests without a signed session', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.equal(response.status, 401);
  });
});

test('AI status endpoint identifies the deployed freshness-guard build', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.build, '2026-07-20-freshness-guard-v1');
    assert.equal(payload.capabilities.includes('freshness-guard'), true);
  });
});

test('server metrics use all queried rows rather than a displayed sample', () => {
  const metrics = taskMetrics([
    { Status: 'เสร็จสิ้น', DueDate: '2026-01-01' },
    { Status: 'กำลังทำ', DueDate: '2026-12-31' },
    { Status: 'กำลังทำ', DueDate: '2020-01-01' },
  ], 3);
  assert.equal(metrics.total, 3);
  assert.equal(metrics.byStatus['เสร็จสิ้น'], 1);
  assert.equal(metrics.byStatus['กำลังทำ'], 2);
  assert.equal(metrics.overdue, 1);
  assert.equal(metrics.isComplete, true);
});

test('dashboard filters only narrow a chatbot query and can be explicitly bypassed', () => {
  const base = { status: 'กำลังทำ' };
  const dashboard = { department: 'HR', staffName: 'Test User', year: '2569' };
  assert.deepEqual(mergeDashboardFilters(base, dashboard, 'สรุปงานทั้งหมด'), {
    status: 'กำลังทำ', department: 'HR', staffName: 'Test User', fromDate: '2026-01-01', toDate: '2026-12-31',
  });
  assert.deepEqual(mergeDashboardFilters(base, dashboard, 'สรุปทุกแผนก ไม่ใช้ตัวกรอง'), base);
});

test('team score summary uses the MyTeam values rather than an LLM estimate', () => {
  const summary = formatTeamSummary({
    teamFilters: {},
    teamMetrics: {
      members: [{
        name: 'แพท (ณัฐนันท์ ปาแก้ว)',
        totalPoints: 183,
        received: { completed: 1, inProgress: 0, notStarted: 0 },
        assigned: { completed: 43, inProgress: 2, notStarted: 7 },
      }],
    },
  });
  assert.match(summary, /คะแนนสะสม 183 คะแนน/);
  assert.match(summary, /รับมอบ 1 \| มอบหมาย 43/);
  assert.match(summary, /บรีฟดำเนินการ: รับมอบ 0 \| มอบหมาย 2/);
  assert.match(summary, /บรีฟยังไม่เริ่ม: รับมอบ 0 \| มอบหมาย 7/);
});

test('employee aliases can be resolved to an exact user ID despite a Thai title', () => {
  const employee = selectEmployeeByName([
    { ID: 'employee-pat', Name: 'นางสาว ณัฐนันท์ ปาแก้ว' },
    { ID: 'employee-other', Name: 'ธัญญา แสงเมือง' },
  ], 'ณัฐนันท์ ปาแก้ว');
  assert.deepEqual(employee, { ID: 'employee-pat', Name: 'นางสาว ณัฐนันท์ ปาแก้ว' });
  assert.equal(selectEmployeeByName([{ ID: 'one', Name: 'สมชาย ใจดี' }], 'คนที่ไม่มี'), null);
});

test('RBAC denial explains that Staff can query only their own account data', () => {
  const summary = formatDashboardSummary({
    appliedFilters: { staffAccessDenied: true, staffUnavailable: true, staffName: 'พนักงานคนอื่น' },
  }, { Role: 'Staff', Name: 'ผู้ทดสอบ', Department: 'Marketing' });
  assert.match(summary, /ไม่มีสิทธิ์เข้าถึงข้อมูลพนักงาน/);
  assert.match(summary, /Staff ดูได้เฉพาะข้อมูลของตนเอง/);
  assert.match(summary, /คะแนนของฉันเท่าไหร่/);
});

test('CatLog AI routes dashboard, briefing, and score questions to different trusted datasets', () => {
  assert.equal(detectWorkDataset('แพทมีงานทั้งหมดเท่าไหร่'), 'tasks');
  assert.equal(detectWorkDataset('งานในหน้าบรีฟทั้งหมดมีกี่งาน'), 'briefings');
  assert.equal(detectWorkDataset('แพทมีคะแนนสะสมเท่าไหร่'), 'team');
  assert.equal(detectWorkDataset('แพทรับมอบบรีฟเสร็จกี่งาน'), 'team');
  assert.equal(detectWorkIntent('หน้าบรีฟมีเท่าไหร่'), 'summary');
});

test('briefing summary uses exact visible rows and does not fall back to task totals', () => {
  const rows = [
    { Status: 'เสร็จสิ้น', PostStatus: 'โพสแล้ว', DueDate: '2026-07-01' },
    { Status: 'กำลังทำ', PostStatus: 'ยังไม่โพส', DueDate: '2020-01-01' },
    { Status: 'รอดำเนินการ', PostStatus: null, DueDate: '2099-01-01' },
  ];
  const metrics = briefingMetrics(rows, true);
  const summary = formatBriefingSummary({
    dataset: 'briefings', intent: 'summary', appliedFilters: {}, briefings: { metrics },
  }, { Role: 'Admin', Department: '' });
  assert.equal(metrics.total, 3);
  assert.equal(metrics.overdue, 1);
  assert.match(summary, /บรีฟทั้งหมด: 3 งาน/);
  assert.match(summary, /กำลังทำ: 1 งาน/);
  assert.match(summary, /ยังไม่โพส: 2 งาน/);
});

test('long pasted summaries do not trigger internal work queries or web search', () => {
  const request = `ช่วยสรุปข้อความต่อไปนี้:\n${'เนื้อหาการประชุมและรายการงาน '.repeat(40)}`;
  assert.equal(isTextSummaryRequest(request), true);
  assert.equal(shouldSearchExternal(request), false);
  assert.equal(shouldSearchExternal('ค้นหาข่าว AI ล่าสุดในไทย'), true);
});

test('current-year price questions are forced through fresh web search', () => {
  const question = 'ทำไมแรมถึงแพงขึ้นปีนี้';
  assert.equal(asksForFreshInformation(question), true);
  assert.equal(shouldSearchExternal(question), true);
});

test('web results are ranked by question relevance before being sent to the model', () => {
  const ranked = rankRelevantSearchResults('ข่าวเศรษฐกิจไทยล่าสุด', [
    { title: 'ตารางฟุตบอล', snippet: 'ผลการแข่งขัน', url: 'https://example.com/football' },
    { title: 'เศรษฐกิจไทย', snippet: 'ข่าวเศรษฐกิจไทยประจำวันนี้', url: 'https://www.bot.or.th/news' },
    { title: 'ข่าวเศรษฐกิจโลก', snippet: 'วิเคราะห์เศรษฐกิจ', url: 'https://example.org/economy' },
  ]);
  assert.equal(ranked[0].url, 'https://www.bot.or.th/news');
  assert.equal(ranked.some(item => item.url.includes('football')), false);
});

test('news questions expand into event searches instead of generic category pages', () => {
  assert.equal(isNewsQuestion('ข่าวสะเทือนขวัญไทยล่าสุดคือข่าวอะไร'), true);
  const variants = newsQueryVariants('ข่าวสะเทือนขวัญไทยล่าสุดคือข่าวอะไร');
  assert.equal(variants.some(value => value.includes('ฆาตกรรม')), true);
  assert.equal(variants.some(value => value.includes('เพลิงไหม้')), true);
});

test('news summary includes publication date, source, location, and reported casualties', () => {
  const summary = formatNewsSummary([{
    title: 'ไฟไหม้ร้านเหล้า ย่านลาดพร้าว ยอดผู้เสียชีวิตพุ่ง 27 ศพ',
    snippet: 'เจ้าหน้าที่รายงานเหตุเพลิงไหม้ มีผู้เสียชีวิต 27 คน บาดเจ็บ 63 คน',
    source: 'สำนักข่าวทดสอบ',
    publishedAt: '2026-07-12T18:58:00.000Z',
    url: 'https://example.com/news/fire',
  }], { gregorianDate: '2026-07-20', gregorianYear: 2026, buddhistYear: 2569 });
  assert.match(summary, /13\/07\/2026 \(พ\.ศ\. 2569\)/);
  assert.match(summary, /สำนักข่าวทดสอบ/);
  assert.match(summary, /สถานที่ที่ระบุ: ลาดพร้าว/);
  assert.match(summary, /เสียชีวิต 27 คน/);
  assert.match(summary, /บาดเจ็บ 63 คน/);
});

test('news summary merges duplicate incident coverage and lists sources at the end', () => {
  const summary = formatNewsSummary([
    {
      title: 'ไฟไหม้โรงเบียร์ลาดพร้าว ยอดเสียชีวิต 34 ศพ',
      snippet: 'เหตุไฟไหม้โรงเบียร์ ณ ลาดพร้าว มีผู้เสียชีวิต 34 คน บาดเจ็บ 77 คน',
      source: 'สำนักข่าวหนึ่ง', publishedAt: '2026-07-19T10:00:00.000Z', url: 'https://example.com/fire-1', category: 'fire',
    },
    {
      title: 'อัปเดตเพลิงไหม้โรงเบียร์ ณ ลาดพร้าว ดับ 33',
      snippet: 'เจ้าหน้าที่ติดตามเหตุโรงเบียร์ลาดพร้าวและตรวจสอบสาเหตุ',
      source: 'สำนักข่าวสอง', publishedAt: '2026-07-18T10:00:00.000Z', url: 'https://example.com/fire-2', category: 'fire',
    },
    {
      title: 'จับผู้ต้องสงสัยคดีฆาตกรรมในจังหวัดเชียงใหม่',
      snippet: 'ตำรวจจับผู้ต้องสงสัยในคดีฆาตกรรมที่จังหวัดเชียงใหม่',
      source: 'สำนักข่าวสาม', publishedAt: '2026-07-17T10:00:00.000Z', url: 'https://example.com/crime-1', category: 'murder',
    },
  ], { gregorianDate: '2026-07-20', gregorianYear: 2026, buddhistYear: 2569 });
  assert.match(summary, /2 เหตุการณ์ จาก 3 แหล่งข่าว/);
  assert.match(summary, /สรุปรวมจาก 2 แหล่ง/);
  assert.match(summary, /ยืนยันโดย: สำนักข่าวหนึ่ง, สำนักข่าวสอง/);
  assert.ok(summary.indexOf('**แหล่งข้อมูล**') > summary.indexOf('ยอดสูงสุดที่รายงาน'));
});
