import {
  ACTIVE_STAGES,
  CUSTOM_FIELDS,
  HISTORY_DAYS,
  LIST_NAME_PATTERN,
  SOP_STATUSES,
  STAGES,
  STUCK_DAYS,
  Stage,
  TIME_ZONE,
  WEEKS,
  stageOf,
} from './config';
import type { FieldOptions, NiftyNamed, NiftyTask } from './nifty';

const DAY = 864e5;
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const shortFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** Calendar date (YYYY-MM-DD) in India time. */
export const localDate = (d: Date | string) => dateFmt.format(typeof d === 'string' ? new Date(d) : d);
const dayNum = (ymd: string) => Date.parse(ymd + 'T00:00:00Z') / DAY;
const ymdOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const shortDate = (ymd: string | null) => (ymd ? shortFmt.format(new Date(ymd + 'T00:00:00Z')) : '—');
const ago = (days: number) => (days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Monday (YYYY-MM-DD) of the week holding `ymd`. */
export function mondayOf(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** First day the "finished" query needs: the oldest of the weekly chart and the finished-task history. */
export function sinceDate(today: string): string {
  const chart = dayNum(mondayOf(today)) - 7 * (WEEKS - 1);
  return ymdOf(Math.min(chart, dayNum(today) - HISTORY_DAYS));
}

/** Removes HTML tags pasted into titles (e.g. Grammarly's <gwmw>) and decodes common entities. Leaves text like "<class 'int'>" alone. */
export function cleanText(s: string): string {
  return s
    .replace(/<\/?[a-z][a-z0-9-]*(\s+[a-z-]+(\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export const RULES = [
  { id: 'status', label: 'Status is outside the SOP 01–12 list', short: 'Off-SOP status', scope: 'all' },
  { id: 'list', label: "List name doesn't follow Country - Lead - App - Module", short: 'List name', scope: 'all' },
  { id: 'assignees', label: "Doesn't have exactly 2 assignees", short: 'Not 2 assignees', scope: 'active' },
  { id: 'leadAssigned', label: "Team Lead field isn't one of the assignees", short: 'Lead not assigned', scope: 'active' },
  { id: 'teamLead', label: 'No Team Lead field', short: 'No team lead', scope: 'active' },
  { id: 'start', label: 'No start date', short: 'No start date', scope: 'active' },
  { id: 'due', label: 'No due date', short: 'No due date', scope: 'active' },
  { id: 'estimate', label: 'No estimate', short: 'No estimate', scope: 'active' },
  { id: 'plannedMonth', label: 'No Planned Month', short: 'No planned month', scope: 'active' },
  { id: 'plannedUnplanned', label: 'No Planned / Unplanned', short: 'No planned/unplanned', scope: 'active' },
  { id: 'taskType', label: 'No Task Type', short: 'No task type', scope: 'active' },
  { id: 'developer', label: 'No Developer', short: 'No developer', scope: 'active' },
  { id: 'tester', label: 'No Tester', short: 'No tester', scope: 'active' },
  { id: 'priority', label: 'No priority (tag or field)', short: 'No priority', scope: 'active' },
] as const;
export type RuleId = (typeof RULES)[number]['id'];

/** Raw Nifty values the edit forms start from. */
export interface EditValues {
  assignees: string[];
  lead: string[];
  developer: string[];
  tester: string[];
  start: string;
  due: string;
  estimateMin: number | null;
  priority: string;
  taskType: string;
  plannedMonth: string;
  planned: string;
}

export interface TaskRow {
  id: string;
  key: string;
  name: string;
  url: string;
  done: boolean;
  doneDay: string | null;
  stage: Stage;
  status: string;
  list: string;
  owner: string;
  who: string[];
  assignees: string;
  lead: string;
  tester: string;
  developer: string;
  /** Everyone tied to the task: assignees, team lead, tester, developer. */
  people: string[];
  taskType: string;
  priority: string;
  country: string;
  plannedMonth: string;
  planned: string;
  labels: string[];
  start: string | null;
  due: string | null;
  dueLabel: string;
  created: string;
  estimate: string;
  subtask: boolean;
  late: number;
  idle: number;
  agoLabel: string;
  active: boolean;
  issues: RuleId[];
  edit: EditValues;
}

export interface EditOptions {
  members: { id: string; name: string }[];
  priority: string[];
  taskType: string[];
  plannedMonth: string[];
  planned: string[];
}

export interface DashboardData {
  generatedAt: string;
  today: string;
  historyDays: number;
  rows: TaskRow[];
  options: EditOptions;
}

const present = (v: unknown) =>
  v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && v.length === 0);

const str = (v: unknown) => (present(v) ? String(v).trim() : '');

function hours(minutes: number | null): string {
  if (!minutes) return '';
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

/** "2026 11 November" / "2026 11" → "Nov 2026". */
function monthLabel(v: string): string {
  const m = /^(\d{4})\s*[-/ ]\s*(\d{1,2})/.exec(v);
  if (!m) return v;
  return new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function buildDashboard(
  input: {
    open: NiftyTask[];
    done: NiftyTask[];
    statuses: NiftyNamed[];
    lists: NiftyNamed[];
    members?: NiftyNamed[];
    fieldOptions?: FieldOptions;
  },
  now = new Date(),
): DashboardData {
  const today = localDate(now);
  const t0 = dayNum(today);
  const statusName = new Map(input.statuses.map((s) => [s.id, s.name]));
  const listName = new Map(input.lists.map((l) => [l.id, l.name]));
  const sopStatuses = new Set(SOP_STATUSES.map((s) => s.toLowerCase()));

  // Member ids → names: from the members list if the token can read it, else from everyone seen as an assignee.
  const memberName = new Map((input.members || []).filter((m) => m && m.id && m.name).map((m) => [m.id, m.name]));
  for (const t of [...input.open, ...input.done]) for (const p of t.assignees || []) if (!memberName.has(p.id)) memberName.set(p.id, p.name);
  const ids = (v: unknown) =>
    str(v)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  const names = (v: unknown) => ids(v).map((id) => memberName.get(id) || 'Unknown person');
  const seen = { priority: new Set<string>(), taskType: new Set<string>(), plannedMonth: new Set<string>(), planned: new Set<string>() };

  const rows: TaskRow[] = [];
  const add = (t: NiftyTask, done: boolean) => {
    const status = (t.statusId && statusName.get(t.statusId)) || t.status?.name || '';
    const stage = stageOf(status);
    if (stage === 'Cancelled') return;

    const list = (t.listId && listName.get(t.listId)) || t.list?.name || '';
    const owner = list.split('-').map((p) => p.trim())[1] || 'No list';
    const assigned = t.assignees || [];
    const who = assigned.length ? assigned.map((p) => p.name) : ['Unassigned'];
    const cf = new Map((t.customFields || []).map((c) => [c.customFieldId, c.value]));
    const labels = (t.labels || []).map((l) => l.name);
    const priorityTag = labels.find((l) => /priority/i.test(l)) || '';
    const lead = names(cf.get(CUSTOM_FIELDS.teamLead));
    const tester = names(cf.get(CUSTOM_FIELDS.tester));
    const developer = names(cf.get(CUSTOM_FIELDS.developer));
    const doneDay = done && t.completedAt ? localDate(t.completedAt) : null;
    const due = t.dueAt ? localDate(t.dueAt) : null;
    const late = !done && due && due < today ? t0 - dayNum(due) : 0;
    const idle = Math.max(0, t0 - dayNum(doneDay || localDate(t.updatedAt)));

    const edit: EditValues = {
      assignees: assigned.map((p) => p.id),
      lead: ids(cf.get(CUSTOM_FIELDS.teamLead)),
      developer: ids(cf.get(CUSTOM_FIELDS.developer)),
      tester: ids(cf.get(CUSTOM_FIELDS.tester)),
      start: t.startAt ? localDate(t.startAt) : '',
      due: t.dueAt ? localDate(t.dueAt) : '',
      estimateMin: t.estimate ?? null,
      priority: str(cf.get(CUSTOM_FIELDS.priority)),
      taskType: str(cf.get(CUSTOM_FIELDS.taskType)),
      plannedMonth: str(cf.get(CUSTOM_FIELDS.plannedMonth)),
      planned: str(cf.get(CUSTOM_FIELDS.plannedUnplanned)),
    };
    for (const k of ['priority', 'taskType', 'plannedMonth', 'planned'] as const) if (edit[k]) seen[k].add(edit[k]);

    const issues: RuleId[] = [];
    if (!done) {
      if (!sopStatuses.has(status.toLowerCase())) issues.push('status');
      if (!LIST_NAME_PATTERN.test(list)) issues.push('list');
      if (stage !== 'Pipeline') {
        const leadId = cf.get(CUSTOM_FIELDS.teamLead);
        if (assigned.length !== 2) issues.push('assignees');
        if (present(leadId) && !assigned.some((p) => p.id === leadId)) issues.push('leadAssigned');
        if (!present(leadId)) issues.push('teamLead');
        if (!t.startAt) issues.push('start');
        if (!t.dueAt) issues.push('due');
        if (!t.estimate) issues.push('estimate');
        if (!present(cf.get(CUSTOM_FIELDS.plannedMonth))) issues.push('plannedMonth');
        if (!present(cf.get(CUSTOM_FIELDS.plannedUnplanned))) issues.push('plannedUnplanned');
        if (!present(cf.get(CUSTOM_FIELDS.taskType))) issues.push('taskType');
        if (!developer.length) issues.push('developer');
        if (!tester.length) issues.push('tester');
        if (!priorityTag && !present(cf.get(CUSTOM_FIELDS.priority))) issues.push('priority');
      }
    }

    rows.push({
      id: t.id,
      key: t.identifier,
      name: cleanText(t.name) || t.identifier,
      url: t.url,
      done,
      doneDay,
      stage,
      status: status || 'No status',
      list: list || 'No list',
      owner,
      who,
      assignees: assigned.length ? assigned.map((p) => p.name).join(', ') : 'Unassigned',
      lead: lead.join(', '),
      tester: tester.join(', '),
      developer: developer.join(', '),
      people: [...new Set([...who, ...lead, ...tester, ...developer])],
      taskType: str(cf.get(CUSTOM_FIELDS.taskType)),
      priority: (str(cf.get(CUSTOM_FIELDS.priority)) || priorityTag).replace(/\s*priority$/i, ''),
      country: str(cf.get(CUSTOM_FIELDS.country)) || (/^(IN|AE|US|GL)\b/.exec(list)?.[1] ?? ''),
      plannedMonth: monthLabel(str(cf.get(CUSTOM_FIELDS.plannedMonth))),
      planned: str(cf.get(CUSTOM_FIELDS.plannedUnplanned)),
      labels,
      start: t.startAt ? localDate(t.startAt) : null,
      due,
      dueLabel: done ? shortDate(due) : late ? `${plural(late, 'day')} overdue` : shortDate(due),
      created: localDate(t.createdAt),
      estimate: hours(t.estimate),
      subtask: !!t.parentTaskId,
      late,
      idle,
      agoLabel: ago(idle),
      active: !done && ACTIVE_STAGES.includes(stage),
      issues,
      edit,
    });
  };
  for (const t of input.open) add(t, false);
  for (const t of input.done) if (t.completedAt) add(t, true);

  // Choices for the edit forms: Nifty's own dropdown options when the token can read them, else values already in use.
  const fo = input.fieldOptions || {};
  const choose = (id: string, used: Set<string>) =>
    (fo[id]?.length ? fo[id]! : [...used]).slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const options: EditOptions = {
    members: [...memberName].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    priority: choose(CUSTOM_FIELDS.priority, seen.priority),
    taskType: choose(CUSTOM_FIELDS.taskType, seen.taskType),
    plannedMonth: choose(CUSTOM_FIELDS.plannedMonth, seen.plannedMonth),
    planned: choose(CUSTOM_FIELDS.plannedUnplanned, seen.planned),
  };

  return { generatedAt: now.toISOString(), today, historyDays: HISTORY_DAYS, rows, options };
}

// ---------- Summaries. Pure, so the browser can re-run them on whatever the filters leave. ----------

export interface Summary {
  summary: { open: number; overdue: number; stuck: number; done7: number };
  stages: { stage: string; n: number }[];
  owners: { owner: string; open: number; overdue: number }[];
  weekly: { week: string; label: string; n: number; current: boolean }[];
  attention: (TaskRow & { reason: string })[];
  people: {
    person: string;
    open: number;
    active: number;
    overdue: number;
    done7: number;
    lastLabel: string;
    nowKey: string | null;
    nowName: string;
  }[];
  sop: {
    total: number;
    checked: number;
    clean: number;
    rules: { id: RuleId; label: string; n: number; of: number }[];
    leads: { owner: string; tasks: number; withIssues: number; issues: number }[];
  };
}

export const isStuck = (r: TaskRow) => !r.done && r.idle >= STUCK_DAYS;

export function summarize(rows: TaskRow[], today: string): Summary {
  const t0 = dayNum(today);
  const weekAgo = ymdOf(t0 - 7);
  const open = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done && r.doneDay) as (TaskRow & { doneDay: string })[];

  const thisMonday = mondayOf(today);
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const start = ymdOf(dayNum(thisMonday) - 7 * (WEEKS - 1 - i));
    const end = ymdOf(dayNum(start) + 7);
    return { week: start, label: shortDate(start), n: done.filter((d) => d.doneDay >= start && d.doneDay < end).length, current: start === thisMonday };
  });

  const stages = STAGES.map((stage) => ({ stage, n: open.filter((r) => r.stage === stage).length })).filter(
    (d) => d.n > 0 || d.stage !== 'No status',
  );

  const ownerMap = new Map<string, { owner: string; open: number; overdue: number }>();
  for (const r of open) {
    const o = ownerMap.get(r.owner) || { owner: r.owner, open: 0, overdue: 0 };
    o.open++;
    if (r.late) o.overdue++;
    ownerMap.set(r.owner, o);
  }

  const attention = open
    .filter((r) => r.late > 0 || isStuck(r))
    .sort((a, b) => b.late - a.late || b.idle - a.idle)
    .map((r) => ({ ...r, reason: r.late ? `${plural(r.late, 'day')} overdue` : `No update for ${r.idle} days` }));

  type P = Summary['people'][number] & { last: number; nowIdle: number };
  const pm = new Map<string, P>();
  const getP = (name: string) => {
    let p = pm.get(name);
    if (!p) {
      p = { person: name, open: 0, active: 0, overdue: 0, done7: 0, lastLabel: '—', nowKey: null, nowName: 'No open tasks', last: -Infinity, nowIdle: Infinity };
      pm.set(name, p);
    }
    return p;
  };
  for (const r of open) {
    for (const name of r.who) {
      const p = getP(name);
      p.open++;
      if (r.active) p.active++;
      if (r.late) p.overdue++;
      p.last = Math.max(p.last, t0 - r.idle);
      if (r.idle < p.nowIdle || (r.idle === p.nowIdle && r.active)) {
        p.nowIdle = r.idle;
        p.nowKey = r.key;
        p.nowName = r.name;
      }
    }
  }
  for (const d of done) {
    for (const name of d.who) {
      if (name === 'Unassigned') continue;
      const p = getP(name);
      if (d.doneDay >= weekAgo) p.done7++;
      p.last = Math.max(p.last, dayNum(d.doneDay));
    }
  }
  const people = [...pm.values()]
    .map(({ last, nowIdle, ...p }) => ({ ...p, lastLabel: Number.isFinite(last) ? ago(t0 - last) : '—' }))
    .sort(
      (a, b) =>
        Number(a.person === 'Unassigned') - Number(b.person === 'Unassigned') ||
        b.open - a.open ||
        b.done7 - a.done7 ||
        a.person.localeCompare(b.person),
    );

  const checkedRows = open.filter((r) => r.stage !== 'Pipeline');
  const rules = RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    n: open.filter((r) => r.issues.includes(rule.id)).length,
    of: rule.scope === 'all' ? open.length : checkedRows.length,
  }));
  const leadMap = new Map<string, { owner: string; tasks: number; withIssues: number; issues: number }>();
  for (const r of open) {
    const l = leadMap.get(r.owner) || { owner: r.owner, tasks: 0, withIssues: 0, issues: 0 };
    l.tasks++;
    if (r.issues.length) l.withIssues++;
    l.issues += r.issues.length;
    leadMap.set(r.owner, l);
  }

  return {
    summary: {
      open: open.length,
      overdue: open.filter((r) => r.late > 0).length,
      stuck: open.filter(isStuck).length,
      done7: done.filter((d) => d.doneDay >= weekAgo).length,
    },
    stages,
    owners: [...ownerMap.values()].sort((a, b) => b.open - a.open),
    weekly,
    attention,
    people,
    sop: {
      total: open.length,
      checked: checkedRows.length,
      clean: open.filter((r) => r.issues.length === 0).length,
      rules,
      leads: [...leadMap.values()].sort((a, b) => b.withIssues - a.withIssues || b.tasks - a.tasks),
    },
  };
}
