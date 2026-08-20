// review_briefing() reports every rule as a Postgres exception, which PostgREST
// returns as a bare English 400. The reviewer needs to read what went wrong, so
// the known rules are translated and an out-of-date database is named directly.

const RULE_MESSAGES = [
  [/only the department head or an admin may review/i, 'เฉพาะหัวหน้าแผนกของผู้บรีฟหรือแอดมินเท่านั้นที่ตรวจงานนี้ได้'],
  [/only the department head or an admin may change review deductions/i, 'เฉพาะหัวหน้าแผนกหรือแอดมินเท่านั้นที่แก้ค่าการหักคะแนนได้'],
  [/not (assigned to|a participant in) this briefing/i, 'มีผู้ที่เลือกไว้ไม่ได้เกี่ยวข้องกับงานนี้ กรุณาเลือกเฉพาะผู้บรีฟงานหรือผู้รับงาน'],
  [/select at least one responsible (recipient|participant)/i, 'กรุณาเลือกผู้เกี่ยวข้องที่ต้องหักคะแนนอย่างน้อย 1 คน'],
  [/a comment is required/i, 'กรุณาระบุหมายเหตุหรือเหตุผลก่อนส่งคำสั่งนี้'],
  [/a reason is required when extending a deadline/i, 'กรุณาระบุเหตุผลก่อนขยายกำหนดส่ง'],
  [/additional work details are required/i, 'กรุณาระบุรายละเอียดงานที่สั่งเพิ่ม'],
  [/additional work points must be at least 1/i, 'คะแนนงานที่เพิ่มต้องมีอย่างน้อย 1 คะแนน'],
  [/extension days must be at least 1/i, 'จำนวนวันที่ขยายต้องมีอย่างน้อย 1 วัน'],
  [/a due date is required before it can be extended/i, 'งานนี้ยังไม่มีวันกำหนดส่ง จึงขยายเวลาไม่ได้'],
  [/the current due date is invalid/i, 'วันกำหนดส่งเดิมของงานนี้ไม่ถูกต้อง กรุณาแก้วันกำหนดส่งก่อน'],
  [/score adjustments are available only after review approval/i, 'ปรับคะแนนได้หลังจากอนุมัติงานแล้วเท่านั้น'],
  [/target points must be zero or greater/i, 'คะแนนรวมใหม่ต้องไม่ติดลบ'],
  [/completed legacy briefings cannot be changed/i, 'งานนี้ปิดด้วยระบบเดิม จึงใช้ workflow ตรวจงานใหม่ไม่ได้'],
  [/completed or cancelled work cannot be submitted again/i, 'งานที่เสร็จสิ้นหรือยกเลิกแล้ว ส่งงานซ้ำไม่ได้'],
  [/only an assigned recipient may submit this work/i, 'เฉพาะผู้รับงานเท่านั้นที่ส่งงานนี้ได้'],
  [/unsupported review action/i, 'คำสั่งตรวจงานนี้ไม่รองรับ'],
  [/unsupported bonus level/i, 'ระดับคะแนนพิเศษนี้ไม่รองรับ'],
  [/briefing not found/i, 'ไม่พบงานบรีฟนี้ อาจถูกลบไปแล้ว'],
  [/reviewer not found/i, 'ไม่พบบัญชีผู้ตรวจงาน กรุณาเข้าสู่ระบบใหม่'],
  [/deductions cannot be negative/i, 'ค่าการหักคะแนนต้องไม่ติดลบ'],
];

const OUTDATED_DATABASE = 'ฐานข้อมูลยังไม่ได้อัปเดตเป็นเวอร์ชันล่าสุด กรุณาให้ผู้ดูแลระบบรัน migration 20260820_briefing_monthly_penalties.sql ก่อนใช้งานหน้าตรวจงาน';

/**
 * True when PostgREST cannot find review_briefing() with the parameters this
 * build sends — the frontend is deployed but the migration has not been run.
 */
export function isOutdatedReviewFunction(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  return ['PGRST202', 'PGRST203', '42883'].includes(code)
    || /could not find the function|does not exist|no function matches/i.test(text);
}

export function describeReviewError(error) {
  if (!error) return 'ตรวจงานไม่สำเร็จ';
  if (isOutdatedReviewFunction(error)) return OUTDATED_DATABASE;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  const matched = RULE_MESSAGES.find(([pattern]) => pattern.test(text));
  return matched ? matched[1] : (error.message || 'ตรวจงานไม่สำเร็จ');
}
