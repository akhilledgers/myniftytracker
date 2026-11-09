import {
  ACTIVE_STAGES,
  CUSTOM_FIELDS,
  LIST_NAME_PATTERN,
  SOP_STATUSES,
  STAGES,
  STUCK_DAYS,
  Stage,
  TIME_ZONE,
  WEEKS,
  stageOf,
} from './config';
import type { NiftyNamed, NiftyTask } from './nifty';

const DAY = 864e5;
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const shortFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** Calendar date (YYYY-MM-DD) in India time. */
export const localDate = (d: Date | string) => dateFmt.format(typeof d === 'string' ? new Date(d) : d);
const dayNum = (ymd: string) => Date.parse(ymd + 'T00:00:00Z') / DAY;
const short = (ymd: string) => shortFmt.format(new Date(ymd + 'T00:00:00Z'));
const ago = (days: number) => (days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Monday (YYYY-MM-DD) of the week holding `ymd`. */
export function mondayOf(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** First day the "finished" query needs: Monday of the oldest week shown. */
export function sinceDate(today: string): string {
  const d = new Date(mondayOf(today) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7 * (WEEKS - 1));
  return d.toISOString().slice(0, 10);
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

export interface TaskRow {
  key: string;
  name: string;
  url: string;
  stage: Stage;
  status: string;
  owner: string;
  who: string[];
  assignees: string;
  due: string | null;
  dueLabel: string;
  late: number;
  idle: number;
  agoLabel: string;
  active: boolean;
  issues: RuleId[];
}

export interface DashboardData {
  generatedAt: string;
  today: string;
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
    nowUrl: string | null;
  }[];
  tasks: TaskRow[];
  sop: {
    total: number;
    checked: number;
    clean: number;
    rules: { id: RuleId; label: string; n: number; of: number }[];
    leads: { owner: string; tasks: number; withIssues: number; issues: number }[];
  };
}

const present = (v: unknown) =>
  v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && v.length === 0);

export function buildDashboard(
  input: { open: NiftyTask[]; done: NiftyTask[]; statuses: NiftyNamed[]; lists: NiftyNamed[] },
  now = new Date(),
): DashboardData {
  const today = localDate(now);
  const t0 = dayNum(today);
  const statusName = new Map(input.statuses.map((s) => [s.id, s.name]));
  const listName = new Map(input.lists.map((l) => [l.id, l.name]));
  const sopStatuses = new Set(SOP_STATUSES.map((s) => s.toLowerCase()));

  const tasks: TaskRow[] = [];
  for (const t of input.open) {
    const status = (t.statusId && statusName.get(t.statusId)) || '';
    const stage = stageOf(status);
    if (stage === 'Cancelled') continue;

    const list = (t.listId && listName.get(t.listId)) || '';
    const owner = list.split('-').map((p) => p.trim())[1] || 'No list';
    const people = t.assignees || [];
    const who = people.length ? people.map((p) => p.name) : ['Unassigned'];
    const due = t.dueAt ? localDate(t.dueAt) : null;
    const late = due && due < today ? t0 - dayNum(due) : 0;
    const idle = Math.max(0, t0 - dayNum(localDate(t.updatedAt)));
    const cf = new Map((t.customFields || []).map((c) => [c.customFieldId, c.value]));
    const hasPriorityTag = (t.labels || []).some((l) => /priority/i.test(l.name));

    const issues: RuleId[] = [];
    if (!sopStatuses.has(status.toLowerCase())) issues.push('status');
    if (!LIST_NAME_PATTERN.test(list)) issues.push('list');
    if (stage !== 'Pipeline') {
      const lead = cf.get(CUSTOM_FIELDS.teamLead);
      if (people.length !== 2) issues.push('assignees');
      if (present(lead) && !people.some((p) => p.id === lead)) issues.push('leadAssigned');
      if (!present(lead)) issues.push('teamLead');
      if (!t.startAt) issues.push('start');
      if (!t.dueAt) issues.push('due');
      if (!t.estimate) issues.push('estimate');
      if (!present(cf.get(CUSTOM_FIELDS.plannedMonth))) issues.push('plannedMonth');
      if (!present(cf.get(CUSTOM_FIELDS.plannedUnplanned))) issues.push('plannedUnplanned');
      if (!present(cf.get(CUSTOM_FIELDS.taskType))) issues.push('taskType');
      if (!present(cf.get(CUSTOM_FIELDS.developer))) issues.push('developer');
      if (!present(cf.get(CUSTOM_FIELDS.tester))) issues.push('tester');
      if (!hasPriorityTag && !present(cf.get(CUSTOM_FIELDS.priority))) issues.push('priority');
    }

    tasks.push({
      key: t.identifier,
      name: t.name,
      url: t.url,
      stage,
      status: status || 'No status',
      owner,
      who,
      assignees: people.length ? people.map((p) => p.name).join(', ') : 'Unassigned',
      due,
      dueLabel: late ? `${plural(late, 'day')} overdue` : due ? short(due) : '—',
      late,
      idle,
      agoLabel: ago(idle),
      active: ACTIVE_STAGES.includes(stage),
      issues,
    });
  }

  const done = input.done
    .filter((t) => t.completedAt)
    .map((t) => ({ day: localDate(t.completedAt as string), who: (t.assignees || []).map((p) => p.name) }));
  const weekAgo = new Date((t0 - 7) * DAY).toISOString().slice(0, 10);

  // Weekly finished counts, Monday-start weeks.
  const thisMonday = mondayOf(today);
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date((dayNum(thisMonday) - 7 * (WEEKS - 1 - i)) * DAY).toISOString().slice(0, 10);
    const end = new Date((dayNum(start) + 7) * DAY).toISOString().slice(0, 10);
    return { week: start, label: short(start), n: done.filter((d) => d.day >= start && d.day < end).length, current: start === thisMonday };
  });

  const stages = STAGES.map((stage) => ({ stage, n: tasks.filter((r) => r.stage === stage).length })).filter(
    (d) => d.n > 0 || d.stage !== 'No status',
  );

  const ownerMap = new Map<string, { owner: string; open: number; overdue: number }>();
  for (const r of tasks) {
    const o = ownerMap.get(r.owner) || { owner: r.owner, open: 0, overdue: 0 };
    o.open++;
    if (r.late) o.overdue++;
    ownerMap.set(r.owner, o);
  }
  const owners = [...ownerMap.values()].sort((a, b) => b.open - a.open);

  const attention = tasks
    .filter((r) => r.late > 0 || r.idle >= STUCK_DAYS)
    .sort((a, b) => b.late - a.late || b.idle - a.idle)
    .map((r) => ({ ...r, reason: r.late ? `${plural(r.late, 'day')} overdue` : `No update for ${r.idle} days` }));

  // People
  type P = DashboardData['people'][number] & { last: number; nowIdle: number };
  const pm = new Map<string, P>();
  const getP = (name: string) => {
    let p = pm.get(name);
    if (!p) {
      p = { person: name, open: 0, active: 0, overdue: 0, done7: 0, lastLabel: '—', nowKey: null, nowName: 'No open tasks', nowUrl: null, last: -Infinity, nowIdle: Infinity };
      pm.set(name, p);
    }
    return p;
  };
  for (const r of tasks) {
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
        p.nowUrl = r.url;
      }
    }
  }
  for (const d of done) {
    for (const name of d.who) {
      const p = getP(name);
      if (d.day >= weekAgo) p.done7++;
      p.last = Math.max(p.last, dayNum(d.day));
    }
  }
  const people = [...pm.values()]
    .map(({ last, nowIdle, ...p }) => ({ ...p, lastLabel: Number.isFinite(last) ? ago(t0 - last) : '—' }))
    .sort(
      (a, b) =>
        Number(a.person === 'Unassigned') - Number(b.person === 'Unassigned') ||
        b.open - a.open ||
        b.active - a.active ||
        a.person.localeCompare(b.person),
    );

  // SOP health
  const checkedRows = tasks.filter((r) => r.stage !== 'Pipeline');
  const rules = RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    n: tasks.filter((r) => r.issues.includes(rule.id)).length,
    of: rule.scope === 'all' ? tasks.length : checkedRows.length,
  }));
  const leadMap = new Map<string, { owner: string; tasks: number; withIssues: number; issues: number }>();
  for (const r of tasks) {
    const l = leadMap.get(r.owner) || { owner: r.owner, tasks: 0, withIssues: 0, issues: 0 };
    l.tasks++;
    if (r.issues.length) l.withIssues++;
    l.issues += r.issues.length;
    leadMap.set(r.owner, l);
  }

  return {
    generatedAt: now.toISOString(),
    today,
    summary: {
      open: tasks.length,
      overdue: tasks.filter((r) => r.late > 0).length,
      stuck: tasks.filter((r) => r.idle >= STUCK_DAYS).length,
      done7: done.filter((d) => d.day >= weekAgo).length,
    },
    stages,
    owners,
    weekly,
    attention,
    people,
    tasks,
    sop: {
      total: tasks.length,
      checked: checkedRows.length,
      clean: tasks.filter((r) => r.issues.length === 0).length,
      rules,
      leads: [...leadMap.values()].sort((a, b) => b.withIssues - a.withIssues || b.tasks - a.tasks),
    },
  };
}
