import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_DASHBOARD_COLUMNS, TASK_SUMMARY_COLUMNS,
  applyTaskSteps, dashboardScopeSteps, lastPageFor, pageWindow, quoteFilterValue, taskListSteps,
} from '../src/utils/taskQuery.js';

test('admins see everyone and can narrow by department and person', () => {
  assert.deepEqual(taskListSteps({ userRole: 'Admin' }), []);
  assert.deepEqual(taskListSteps({ userRole: 'Admin', department: 'All', user: 'All', status: 'All' }), []);
  assert.deepEqual(taskListSteps({ userRole: ' Admin ', department: 'Marketing', user: 42 }), [
    ['ilike', 'Department', 'Marketing'],
    ['eq', 'UserID', '42'],
  ]);
});

test('every other role only gets its own tasks, whatever filters are sent', () => {
  for (const userRole of ['Staff', 'Head', 'HR', undefined]) {
    assert.deepEqual(taskListSteps({ userRole, userId: 7, department: 'IT', user: '9' }), [['eq', 'UserID', '7']]);
  }
  assert.deepEqual(taskListSteps({}), [['eq', 'UserID', '']]);
});

test('status, keyword and dates are added after the access rule', () => {
  const steps = taskListSteps({
    userRole: 'Staff', userId: 'u1', status: 'กำลังทำ', keyword: '  ออกแบบ  ',
    startDate: '2026-09-01', endDate: '2026-09-30',
  });
  assert.deepEqual(steps, [
    ['eq', 'UserID', 'u1'],
    ['eq', 'Status', 'กำลังทำ'],
    ['or', 'Detail.ilike."*ออกแบบ*",CustomFields->>Project.ilike."*ออกแบบ*"'],
    ['or', 'and(StartDate.gte.2026-09-01,StartDate.lte.2026-09-30),and(StartDate.is.null,DueDate.gte.2026-09-01,DueDate.lte.2026-09-30)'],
  ]);
});

test('the keyword matches without regard to case, and blank ones are ignored', () => {
  assert.deepEqual(taskListSteps({ userRole: 'Admin', keyword: 'LOGO' })[0][1],
    'Detail.ilike."*logo*",CustomFields->>Project.ilike."*logo*"');
  assert.deepEqual(taskListSteps({ userRole: 'Admin', keyword: '   ' }), []);
  assert.deepEqual(taskListSteps({ userRole: 'Admin', keyword: '**' }), []);
});

test('commas, quotes and backslashes in a search stay plain text', () => {
  assert.equal(quoteFilterValue('a,b'), '"a,b"');
  assert.equal(quoteFilterValue('say "hi"'), '"say \\"hi\\""');
  assert.equal(quoteFilterValue('C:\\x'), '"C:\\\\x"');
  assert.match(taskListSteps({ userRole: 'Admin', keyword: 'a(b),c' })[0][1], /^Detail\.ilike\."\*a\(b\),c\*",/);
});

test('one-sided date ranges only bound that side', () => {
  assert.deepEqual(taskListSteps({ userRole: 'Admin', startDate: '2026-01-01' }), [
    ['or', 'and(StartDate.gte.2026-01-01),and(StartDate.is.null,DueDate.gte.2026-01-01)'],
  ]);
  assert.deepEqual(taskListSteps({ userRole: 'Admin', endDate: '2026-12-31' }), [
    ['or', 'and(StartDate.lte.2026-12-31),and(StartDate.is.null,DueDate.lte.2026-12-31)'],
  ]);
});

test('dashboard scope follows the old role rules', () => {
  assert.deepEqual(dashboardScopeSteps({ canSeeAll: true, role: 'Head', department: 'HR' }), []);
  assert.deepEqual(dashboardScopeSteps({ role: 'Staff', name: 'สมชาย' }), [['eq', 'StaffName', 'สมชาย']]);
  assert.deepEqual(dashboardScopeSteps({ role: 'Head', department: 'marketing' }), [['eq', 'Department', 'marketing']]);
  assert.deepEqual(dashboardScopeSteps({ role: 'Staff' }), [['eq', 'StaffName', '']]);
  assert.deepEqual(dashboardScopeSteps({ role: 'Head' }), [['eq', 'Department', '']]);
  assert.deepEqual(dashboardScopeSteps({ role: 'Viewer' }), []);
  assert.deepEqual(dashboardScopeSteps(), []);
});

test('steps are applied to the query builder in order', () => {
  const calls = [];
  const builder = {
    eq(a, b) { calls.push(['eq', a, b]); return this; },
    ilike(a, b) { calls.push(['ilike', a, b]); return this; },
    or(a) { calls.push(['or', a]); return this; },
  };
  const steps = [['ilike', 'Department', 'it'], ['eq', 'Status', 'x'], ['or', 'a.eq.1,b.eq.2']];
  assert.equal(applyTaskSteps(builder, steps), builder);
  assert.deepEqual(calls, steps);
});

test('page windows and the last page', () => {
  assert.deepEqual(pageWindow(1, 10), { from: 0, to: 9, page: 1, size: 10 });
  assert.deepEqual(pageWindow('3', '20'), { from: 40, to: 59, page: 3, size: 20 });
  assert.deepEqual(pageWindow(0, 0), { from: 0, to: 9, page: 1, size: 10 });
  assert.deepEqual(pageWindow(undefined, 1000), { from: 0, to: 999, page: 1, size: 1000 });
  assert.equal(lastPageFor(0, 10), 1);
  assert.equal(lastPageFor(25, 10), 3);
  assert.equal(lastPageFor(undefined, 10), 1);
});

test('dashboard columns are a lighter subset of the summary columns', () => {
  const summary = TASK_SUMMARY_COLUMNS.split(',').map((c) => c.trim());
  for (const column of TASK_DASHBOARD_COLUMNS.split(',').map((c) => c.trim())) {
    assert.ok(summary.includes(column), column);
  }
  assert.ok(!TASK_DASHBOARD_COLUMNS.includes('Detail'));
});
