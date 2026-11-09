// Everything here comes from the Nifty Process SOP v2.0 (LEDGERS-FTA-SOP-001)
// and the LEDGERS.cloud project's own setup in Nifty.

export const TIME_ZONE = 'Asia/Kolkata';

// Task custom field ids in the LEDGERS workspace (Nifty → custom fields).
export const CUSTOM_FIELDS = {
  teamLead: 'NjFwqUhtRL',
  developer: 'AK5wOQw5md',
  tester: 'TjDyYZCcy_',
  taskType: 'zmHBDTx0Dx',
  plannedMonth: 'eV98iEvkAA',
  plannedUnplanned: 'ZQbzkyyt!F',
  priority: 'KFKFPyabrs',
  country: 'Hod2rvQyRO',
} as const;

// SOP §10: the only statuses tasks should use.
export const SOP_STATUSES = [
  '01 Pipeline',
  '02 To Do',
  '03 In Dev',
  '04 In UI',
  '05 Dev/UI Done',
  '06 Code Review',
  '07 In QA',
  '08 Code Merge',
  '09 UAT Testing',
  '10 Ready for Push',
  '11 Live Testing',
  '12 On Hold',
];

// SOP §5.2: <Country> - <Team Lead> - <App Name> - <Module Name>
export const LIST_NAME_PATTERN = /^(IN|AE|US|GL)\s*-\s*[^-]+?\s*-\s*[^-]+?\s*-\s*\S.*$/;

// Plain stages used across the dashboard, in pipeline order.
export const STAGES = ['Pipeline', 'To do', 'In development', 'Review & QA', 'Release', 'On hold', 'No status'] as const;
export type Stage = (typeof STAGES)[number] | 'Cancelled';
export const ACTIVE_STAGES: Stage[] = ['In development', 'Review & QA', 'Release'];

export function stageOf(statusName: string): Stage {
  const s = statusName.toLowerCase();
  if (!s) return 'No status';
  if (s.includes('cancel')) return 'Cancelled';
  if (s.includes('hold')) return 'On hold';
  if (s.includes('pipeline') || s.includes('backlog')) return 'Pipeline';
  if (s.includes('to do') || s.includes('to-do')) return 'To do';
  if (/uat|push|live|release/.test(s)) return 'Release';
  if (/done|review|qa|test|merge/.test(s)) return 'Review & QA';
  return 'In development';
}

// How many days without an update counts as "stuck".
export const STUCK_DAYS = 30;
// How many past weeks the "finished per week" chart shows (current week included).
export const WEEKS = 8;
// How far back finished tasks are brought in for the task list and people's activity.
export const HISTORY_DAYS = 90;
