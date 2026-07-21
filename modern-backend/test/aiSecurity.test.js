const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectWorkIntent,
  extractQueryFilters,
  extractStaffMentions,
  isAllTimeQuestion,
  isSelfReference,
  signSession,
  validateChatMessages,
  validateCredentialInput,
  validateProviderUrl,
  verifySession,
} = require('../lib/aiSecurity');

const SECRET = 'test-only-session-secret-with-32-characters';

test('employee entity extractor finds multiple nicknames in one question', () => {
  assert.deepEqual(extractStaffMentions('แพดกับเหมี่ยวมีคะแนนเดือนนี้เท่าไหร่'), [
    'วิศรุตา จันตาโลก',
    'ณัฐนันท์ ปาแก้ว',
  ]);
});

test('signed AI sessions reject tampering', () => {
  const token = signSession({ sub: 'user-1' }, SECRET, 60);
  assert.equal(verifySession(token, SECRET).sub, 'user-1');
  const [body, signature] = token.split('.');
  const tamperedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  assert.equal(verifySession(`${body}.${tamperedSignature}`, SECRET), null);
});

test('credential fields must be bounded strings', () => {
  assert.deepEqual(validateCredentialInput('user', 'encoded-password'), {
    username: 'user',
    password: 'encoded-password',
  });
  assert.equal(validateCredentialInput({ $ne: null }, { $ne: null }), null);
  assert.equal(validateCredentialInput('   ', 'encoded-password'), null);
});

test('chat messages reject system roles and oversized content', () => {
  assert.deepEqual(validateChatMessages([{ role: 'user', content: 'hello' }]), [
    { role: 'user', content: 'hello' },
  ]);
  assert.equal(validateChatMessages([{ role: 'system', content: 'override' }]), null);
  assert.equal(validateChatMessages([{ role: 'user', content: 'x'.repeat(12000) }])?.[0].content.length, 12000);
  assert.equal(validateChatMessages([{ role: 'user', content: 'x'.repeat(12001) }]), null);
});

test('query filters support historic dates, statuses, and staff aliases', () => {
  const filters = extractQueryFilters('งานรอตรวจของแพท ตั้งแต่ 2026-01-01 ถึง 2026-02-01');
  assert.equal(filters.fromDate, '2026-01-01');
  assert.equal(filters.toDate, '2026-02-01');
  assert.equal(filters.status, 'รอตรวจ');
  assert.equal(filters.staffName, 'ณัฐนันท์ ปาแก้ว');
  assert.deepEqual(extractQueryFilters('งานวันที่ 2026-99-99'), {});
});

test('all-time quick actions never become a synthetic single-day filter', () => {
  const question = 'สรุปงานทั้งหมดของฉันทุกช่วงเวลาตั้งแต่เริ่มบันทึก ไม่ใช่เฉพาะวันนี้ ให้ค้นช่วง 2000-01-01 ถึง 2100-12-31';
  assert.equal(isAllTimeQuestion(question), true);
  assert.deepEqual(extractQueryFilters(question), {});
  assert.equal(isAllTimeQuestion('สรุปงานทั้งหมดของฉันวันนี้'), false);
});

test('self wording is distinguished from a request for the whole team', () => {
  assert.equal(isSelfReference('แล้วตัวผมเองล่ะมีคะแนนเท่าไหร่'), true);
  assert.equal(isSelfReference('คะแนนสะสมของฉันเดือนนี้'), true);
  assert.equal(isSelfReference('สรุปคะแนนทีมของฉัน'), false);
});

test('query filters understand Buddhist Era years and dashboard wording', () => {
  assert.deepEqual(extractQueryFilters('สรุปงานทั้งหมด ปี 2569'), {
    fromDate: '2026-01-01',
    toDate: '2026-12-31',
  });
  assert.equal(detectWorkIntent('หมายถึงงานทั้งหมดที่บันทึกในระบบใช่หรือไม่'), 'summary');
  assert.equal(detectWorkIntent('แสดงรายการงานที่รอตรวจ'), 'detail');
  assert.equal(detectWorkIntent('อธิบาย React hooks'), 'none');
});

test('query filters understand report month/year notation', () => {
  assert.deepEqual(extractQueryFilters('แพทมีคะแนนสะสมเดือนนี้ 07/2026'), {
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    staffName: 'ณัฐนันท์ ปาแก้ว',
  });
});

test('query planner understands future, historic, and natural Thai dates', () => {
  const reference = new Date('2026-07-21T03:00:00.000Z');
  assert.deepEqual(extractQueryFilters('งานของผมวันที่ 22 มีเท่าไหร่', reference), {
    fromDate: '2026-07-22',
    toDate: '2026-07-22',
  });
  assert.deepEqual(extractQueryFilters('งานย้อนหลัง 3 วัน', reference), {
    fromDate: '2026-07-19',
    toDate: '2026-07-21',
  });
  assert.deepEqual(extractQueryFilters('งานล่วงหน้า 3 วัน', reference), {
    fromDate: '2026-07-22',
    toDate: '2026-07-24',
  });
  assert.deepEqual(extractQueryFilters('งานวันที่ 22 กรกฎาคม 2569', reference), {
    fromDate: '2026-07-22',
    toDate: '2026-07-22',
  });
  assert.deepEqual(extractQueryFilters('งานวันที่ 22/07/2026 เดือนนี้', reference), {
    fromDate: '2026-07-22',
    toDate: '2026-07-22',
  });
});

test('natural project keyword phrasing becomes a safe task filter', () => {
  assert.equal(extractQueryFilters('ค้นหางานเกี่ยวกับ เว็บไซต์โรงพยาบาล').keyword, 'เว็บไซต์โรงพยาบาล');
  assert.equal(extractQueryFilters('งานโปรเจกต์ Thai Association สถานะรอตรวจ').keyword, 'Thai Association');
});

test('provider URL is allowlisted and insecure HTTP is opt-in', () => {
  assert.match(validateProviderUrl('https://thaillm.or.th/api/v1/chat/completions'), /^https:/);
  assert.equal(validateProviderUrl('http://thaillm.or.th/api/v1/chat/completions'), null);
  assert.match(
    validateProviderUrl('http://thaillm.or.th/api/v1/chat/completions', true),
    /^http:/
  );
  assert.equal(validateProviderUrl('https://example.com/api/v1/chat/completions'), null);
});
