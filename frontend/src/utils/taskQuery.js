// Filters for the TasksSummary view, run by the database instead of in the
// browser. Pages used to download every task (6,600 rows, ~8 MB of JSON) and
// then keep 10 of them; now each page asks only for the rows it shows.
// Each step is a plain array so the rules can be tested without Supabase:
//   ['eq', column, value] | ['ilike', column, value] | ['or', expression]

export const TASK_SUMMARY_COLUMNS =
  'ID, Detail, Status, Priority, StartDate, DueDate, UserID, StaffName, Department, CustomFields, CreatedAt, CompletedAt, HasImages';

// Enough for the dashboard counters, charts and year list. Detail and
// CustomFields are most of the weight; the status list loads them per page.
export const TASK_DASHBOARD_COLUMNS = 'ID, Status, StartDate, DueDate, StaffName, Department';

// Values inside or=(...) are quoted so commas and brackets in a search are
// plain text. A '*' would act as a wildcard, so it is dropped.
export function quoteFilterValue(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function keywordStep(keyword) {
  const term = String(keyword || '').toLowerCase().trim().replace(/\*/g, '');
  if (!term) return null;
  const pattern = quoteFilterValue(`*${term}*`);
  return ['or', `Detail.ilike.${pattern},CustomFields->>Project.ilike.${pattern}`];
}

// A task's date is its StartDate, or its DueDate when it has no StartDate
// (3 tasks today), the same rule the page used in the browser.
function dateRangeStep(startDate, endDate) {
  if (!startDate && !endDate) return null;
  const within = (column) => [
    startDate ? `${column}.gte.${startDate}` : null,
    endDate ? `${column}.lte.${endDate}` : null,
  ].filter(Boolean).join(',');
  return ['or', `and(${within('StartDate')}),and(StartDate.is.null,${within('DueDate')})`];
}

// Task page (จัดการงาน). Admins see everyone; every other role only its own
// tasks, matched on UserID exactly like before.
export function taskListSteps(filters = {}) {
  const steps = [];
  const role = String(filters.userRole || 'Staff').trim();
  if (role === 'Admin') {
    if (filters.department && filters.department !== 'All') steps.push(['ilike', 'Department', filters.department]);
    if (filters.user && filters.user !== 'All') steps.push(['eq', 'UserID', String(filters.user)]);
  } else {
    steps.push(['eq', 'UserID', String(filters.userId || '')]);
  }
  if (filters.status && filters.status !== 'All') steps.push(['eq', 'Status', filters.status]);
  const keyword = keywordStep(filters.keyword);
  if (keyword) steps.push(keyword);
  const dates = dateRangeStep(filters.startDate, filters.endDate);
  if (dates) steps.push(dates);
  return steps;
}

// Dashboard scope, the same people the page used to filter down to:
// Admin and the HR head see everyone, a head sees the department, staff see
// tasks under their own name. Any other role was never narrowed.
export function dashboardScopeSteps({ role, department, name, canSeeAll } = {}) {
  if (canSeeAll) return [];
  if (role === 'Staff') return [['eq', 'StaffName', name || '']];
  if (role === 'Head') return [['eq', 'Department', department || '']];
  return [];
}

export function applyTaskSteps(query, steps) {
  return steps.reduce((q, [op, a, b]) => {
    if (op === 'or') return q.or(a);
    return q[op](a, b);
  }, query);
}

// Rows for page N of a list, plus the page that actually exists when a
// filter leaves fewer pages than the one asked for.
export function pageWindow(page, pageSize) {
  const size = Math.max(1, parseInt(pageSize, 10) || 10);
  const current = Math.max(1, parseInt(page, 10) || 1);
  const from = (current - 1) * size;
  return { from, to: from + size - 1, page: current, size };
}

export function lastPageFor(totalCount, pageSize) {
  return Math.max(1, Math.ceil((totalCount || 0) / pageSize));
}
