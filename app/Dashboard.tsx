'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardData, RuleId, Summary, TaskRow } from '@/lib/compute';
import { RULES, isStuck, shortDate, summarize } from '@/lib/compute';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'All tasks' },
  { id: 'people', label: 'People' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'sop', label: 'SOP health' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const fmt = new Intl.NumberFormat('en-IN');
const timeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const RULE_SHORT = Object.fromEntries(RULES.map((r) => [r.id, r.short])) as Record<RuleId, string>;

// ---------- Filters ----------

type Show = 'open' | 'done' | 'all';
type View = '' | 'overdue' | 'stuck' | 'done7';
interface Filters {
  q: string;
  person: string;
  lead: string;
  stage: string;
  status: string;
  type: string;
  priority: string;
  country: string;
  month: string;
  show: Show;
  view: View;
}
const EMPTY: Filters = { q: '', person: '', lead: '', stage: '', status: '', type: '', priority: '', country: '', month: '', show: 'open', view: '' };
const PICKERS: { id: keyof Filters; label: string; all: string; get: (r: TaskRow) => string | string[] }[] = [
  { id: 'person', label: 'Person', all: 'Everyone', get: (r) => r.people },
  { id: 'lead', label: 'Module owner', all: 'All owners', get: (r) => r.owner },
  { id: 'stage', label: 'Stage', all: 'All stages', get: (r) => r.stage },
  { id: 'status', label: 'Status', all: 'All statuses', get: (r) => r.status },
  { id: 'type', label: 'Task type', all: 'All types', get: (r) => r.taskType || 'Not set' },
  { id: 'priority', label: 'Priority', all: 'All priorities', get: (r) => r.priority || 'Not set' },
  { id: 'country', label: 'Country', all: 'All countries', get: (r) => r.country || 'Not set' },
  { id: 'month', label: 'Planned month', all: 'All months', get: (r) => r.plannedMonth || 'Not set' },
];

function readFilters(): Filters {
  const p = new URLSearchParams(window.location.search);
  const f = { ...EMPTY };
  for (const k of Object.keys(EMPTY) as (keyof Filters)[]) {
    const v = p.get(k);
    if (v !== null) (f as Record<string, string>)[k] = v;
  }
  if (!['open', 'done', 'all'].includes(f.show)) f.show = 'open';
  if (!['', 'overdue', 'stuck', 'done7'].includes(f.view)) f.view = '';
  return f;
}
function writeFilters(f: Filters) {
  const p = new URLSearchParams();
  for (const k of Object.keys(EMPTY) as (keyof Filters)[]) if (f[k] !== EMPTY[k]) p.set(k, f[k]);
  const qs = p.toString();
  history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
}

/** Filters that narrow every view (everything except the task-list-only show/view switches). */
function matches(r: TaskRow, f: Filters): boolean {
  for (const pk of PICKERS) {
    const want = f[pk.id];
    if (!want) continue;
    const v = pk.get(r);
    if (Array.isArray(v) ? !v.includes(want) : v !== want) return false;
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    const hay = `${r.key} ${r.name} ${r.list} ${r.status} ${r.assignees} ${r.lead} ${r.tester} ${r.labels.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function listView(rows: TaskRow[], f: Filters, today: string): TaskRow[] {
  const weekAgo = new Date(Date.parse(today + 'T00:00:00Z') - 7 * 864e5).toISOString().slice(0, 10);
  return rows.filter((r) => {
    if (f.view === 'overdue') return r.late > 0;
    if (f.view === 'stuck') return isStuck(r);
    if (f.view === 'done7') return r.done && !!r.doneDay && r.doneDay >= weekAgo;
    return f.show === 'all' || (f.show === 'done' ? r.done : !r.done);
  });
}

// ---------- Page ----------

export function Dashboard({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<TabId>('overview');
  const [f, setF] = useState<Filters>(EMPTY);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === h)) setTab(h as TabId);
    };
    read();
    setF(readFilters());
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const go = (id: TabId) => {
    setTab(id);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
  };
  const update = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    writeFilters(next);
  };

  const options = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const pk of PICKERS) {
      const set = new Set<string>();
      for (const r of data.rows) for (const v of ([] as string[]).concat(pk.get(r))) if (v) set.add(v);
      const vals = [...set];
      out[pk.id] =
        pk.id === 'stage'
          ? ['Pipeline', 'To do', 'In development', 'Review & QA', 'Release', 'On hold', 'No status'].filter((s) => set.has(s))
          : vals.sort((a, b) => Number(a === 'Not set' || a === 'Unassigned' || a === 'No list') - Number(b === 'Not set' || b === 'Unassigned' || b === 'No list') || a.localeCompare(b, undefined, { numeric: true }));
    }
    return out;
  }, [data.rows]);

  const filtered = useMemo(() => data.rows.filter((r) => matches(r, f)), [data.rows, f]);
  const s = useMemo(() => summarize(filtered, data.today), [filtered, data.today]);
  const active = PICKERS.filter((pk) => f[pk.id]).length + (f.q ? 1 : 0);

  const tile = (show: Show, view: View) => {
    update({ show, view });
    go('tasks');
  };
  const tileOn = (show: Show, view: View) => tab === 'tasks' && f.view === view && (view !== '' || f.show === show);
  const { summary } = s;

  return (
    <main className="page">
      <header className="head">
        <div className="head-row">
          <h1>LEDGERS.cloud Pulse</h1>
          <RefreshButton generatedAt={data.generatedAt} />
        </div>
        <p className="take">
          {active > 0 && <>With these filters: </>}
          <b>{fmt.format(summary.open)}</b> tasks are open. <b className={summary.overdue ? 'bad' : ''}>{fmt.format(summary.overdue)}</b> are past
          their due date and <b className={summary.stuck ? 'bad' : ''}>{fmt.format(summary.stuck)}</b> haven&apos;t been touched in 30 days.{' '}
          <b>{fmt.format(summary.done7)}</b> were finished in the last 7 days.
        </p>
      </header>

      <FilterBar f={f} options={options} update={update} active={active} />

      <section className="tiles" aria-label="Headline numbers. Click one to list its tasks.">
        <Tile label="Open" value={summary.open} note="Not finished, cancelled left out" on={tileOn('open', '')} onClick={() => tile('open', '')} />
        <Tile label="Overdue" value={summary.overdue} note="Open and past due date" bad on={tileOn('open', 'overdue')} onClick={() => tile('open', 'overdue')} />
        <Tile label="Stuck" value={summary.stuck} note="No update in 30+ days" bad on={tileOn('open', 'stuck')} onClick={() => tile('open', 'stuck')} />
        <Tile label="Finished" value={summary.done7} note="Last 7 days" on={tileOn('done', 'done7')} onClick={() => tile('done', 'done7')} />
      </section>

      <nav className="tabs" role="tablist" aria-label="Views">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => go(t.id)}>
            {t.label}
            {t.id === 'attention' && s.attention.length > 0 && <span className="count">{s.attention.length}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview s={s} pick={(patch) => { update({ ...patch, show: 'open', view: '' }); go('tasks'); }} />}
      {tab === 'tasks' && <AllTasks rows={listView(filtered, f, data.today)} f={f} update={update} historyDays={data.historyDays} />}
      {tab === 'people' && <People s={s} rows={filtered} />}
      {tab === 'attention' && <Attention s={s} />}
      {tab === 'sop' && <Sop s={s} rows={filtered} />}

      <footer className="foot">
        Live from Nifty, project LEDGERS.cloud. Refreshed at most every 5 minutes. Finished tasks go back {data.historyDays} days. Rules in SOP
        health follow Nifty Process SOP v2.0.
      </footer>
    </main>
  );
}

function FilterBar({
  f,
  options,
  update,
  active,
}: {
  f: Filters;
  options: Record<string, string[]>;
  update: (p: Partial<Filters>) => void;
  active: number;
}) {
  return (
    <section className="filters" aria-label="Filters">
      <input
        className="search"
        type="search"
        placeholder="Search task, title, list, person"
        aria-label="Search tasks"
        value={f.q}
        onChange={(e) => update({ q: e.target.value })}
      />
      {PICKERS.map((pk) => (
        <label key={pk.id} className={`pick${f[pk.id] ? ' on' : ''}`}>
          <span className="sr">{pk.label}</span>
          <select value={f[pk.id]} onChange={(e) => update({ [pk.id]: e.target.value })} title={pk.label}>
            <option value="">{pk.all}</option>
            {options[pk.id].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      ))}
      {active > 0 && (
        <button className="clear" onClick={() => update({ ...EMPTY, show: f.show, view: f.view })}>
          Clear {active} filter{active === 1 ? '' : 's'} ×
        </button>
      )}
    </section>
  );
}

function RefreshButton({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [generatedAt]);
  return (
    <div className="refresh">
      <span>Updated {timeFmt.format(new Date(generatedAt))}</span>
      <button
        className="btn"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          router.refresh();
          setTimeout(() => setBusy(false), 8000);
        }}
      >
        {busy ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

function Tile({ label, value, note, bad, on, onClick }: { label: string; value: number; note: string; bad?: boolean; on: boolean; onClick: () => void }) {
  return (
    <button className={`tile${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="tile-label">{label}</span>
      <b className={`big${bad && value > 0 ? ' bad' : ''}`}>{fmt.format(value)}</b>
      <span className="tile-note">
        {note} <span className="tile-go">· See tasks →</span>
      </span>
    </button>
  );
}

function Card({ title, note, children, id, actions }: { title: React.ReactNode; note?: string; children: React.ReactNode; id?: string; actions?: React.ReactNode }) {
  return (
    <section className="card" id={id}>
      <div className="card-head">
        <div className="card-title-row">
          <h2>{title}</h2>
          {actions}
        </div>
        {note && <p className="note">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Bars({
  rows,
  onPick,
}: {
  rows: { label: string; segs: { n: number; tone: 'main' | 'muted' | 'bad' }[]; value: React.ReactNode }[];
  onPick?: (label: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.segs.reduce((s, x) => s + x.n, 0)));
  return (
    <div className="bars">
      {rows.map((r) => (
        <button className="bar-row" key={r.label} onClick={() => onPick?.(r.label)} disabled={!onPick} title={`See ${r.label} tasks`}>
          <span className="bar-label">{r.label}</span>
          <span className="track">
            {r.segs.map((s, i) => (s.n > 0 ? <span key={i} className={`seg seg-${s.tone}`} style={{ width: `${(s.n / max) * 100}%` }} /> : null))}
          </span>
          <span className="bar-val">{r.value}</span>
        </button>
      ))}
    </div>
  );
}

function Overview({ s, pick }: { s: Summary; pick: (p: Partial<Filters>) => void }) {
  const maxWeek = Math.max(1, ...s.weekly.map((w) => w.n));
  return (
    <div className="pane">
      <div className="grid">
        <Card title="Where open work sits" note="Open tasks by stage. Click a stage to list its tasks.">
          <Bars
            onPick={(stage) => pick({ stage })}
            rows={s.stages.map((x) => ({
              label: x.stage,
              segs: [{ n: x.n, tone: x.stage === 'On hold' || x.stage === 'No status' ? 'muted' : 'main' }],
              value: <b>{fmt.format(x.n)}</b>,
            }))}
          />
        </Card>
        <Card title="Open work by module owner" note='Owner is the lead named in the list, such as "IN - Vairavan - Bills - Sales". Click to list their tasks.'>
          <div className="legend">
            <span>
              <i className="key key-muted" />
              On time or no due date
            </span>
            <span>
              <i className="key key-bad" />
              Overdue
            </span>
          </div>
          <Bars
            onPick={(lead) => pick({ lead })}
            rows={s.owners.map((o) => ({
              label: o.owner,
              segs: [
                { n: o.open - o.overdue, tone: 'muted' },
                { n: o.overdue, tone: 'bad' },
              ],
              value: (
                <>
                  <b>{fmt.format(o.open)}</b>
                  {o.overdue > 0 && ` · ${fmt.format(o.overdue)} late`}
                </>
              ),
            }))}
          />
        </Card>
      </div>
      <Card title="Tasks finished per week" note="Last 8 weeks, weeks start Monday. The current week is still running.">
        <div className="weeks" role="img" aria-label="Tasks finished per week">
          {s.weekly.map((w) => (
            <div className="week" key={w.week} title={`Week of ${w.label}: ${w.n} finished${w.current ? ' so far' : ''}`}>
              <span className="week-n">{fmt.format(w.n)}</span>
              <div className="week-bar-box">
                <div className={`week-bar${w.current ? ' current' : ''}`} style={{ height: `${(w.n / maxWeek) * 100}%` }} />
              </div>
              <span className="week-label">{w.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TaskLink({ row }: { row: Pick<TaskRow, 'key' | 'url'> }) {
  return /^https:\/\/nifty\.pm\//.test(row.url) ? (
    <a className="key" href={row.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      {row.key}
    </a>
  ) : (
    <span className="key">{row.key}</span>
  );
}

// ---------- All tasks ----------

const SORTS = {
  due: { label: 'Due date', fn: (a: TaskRow, b: TaskRow) => (a.due || '9999').localeCompare(b.due || '9999') },
  late: { label: 'Most overdue', fn: (a: TaskRow, b: TaskRow) => b.late - a.late || a.idle - b.idle },
  updated: { label: 'Last update', fn: (a: TaskRow, b: TaskRow) => a.idle - b.idle },
  created: { label: 'Newest', fn: (a: TaskRow, b: TaskRow) => b.created.localeCompare(a.created) },
  finished: { label: 'Recently finished', fn: (a: TaskRow, b: TaskRow) => (b.doneDay || '').localeCompare(a.doneDay || '') },
} as const;
type SortId = keyof typeof SORTS;

const VIEW_NAME: Record<View, string> = { '': '', overdue: 'Overdue', stuck: 'Stuck 30+ days', done7: 'Finished in the last 7 days' };

function AllTasks({ rows, f, update, historyDays }: { rows: TaskRow[]; f: Filters; update: (p: Partial<Filters>) => void; historyDays: number }) {
  const [sort, setSort] = useState<SortId>('due');
  const [open, setOpen] = useState<string | null>(null);
  const effective: SortId = f.view === 'done7' || f.show === 'done' ? (sort === 'due' ? 'finished' : sort) : sort;
  const sorted = useMemo(() => [...rows].sort(SORTS[effective].fn), [rows, effective]);

  return (
    <div className="pane">
      <Card
        title={
          <>
            {fmt.format(rows.length)} task{rows.length === 1 ? '' : 's'}
            {f.view && (
              <button className="clear" onClick={() => update({ view: '' })}>
                {VIEW_NAME[f.view]} ×
              </button>
            )}
          </>
        }
        note={`Every task matching the filters. Click a row for full details; click the task id to open it in Nifty. Finished tasks go back ${historyDays} days.`}
        actions={
          <div className="toolbar">
            <div className="seg-ctl" role="group" aria-label="Which tasks">
              {(['open', 'done', 'all'] as Show[]).map((v) => (
                <button key={v} aria-pressed={!f.view && f.show === v} onClick={() => update({ show: v, view: '' })}>
                  {v === 'open' ? 'Open' : v === 'done' ? 'Finished' : 'Both'}
                </button>
              ))}
            </div>
            <label className="pick">
              <span className="sr">Sort by</span>
              <select value={effective} onChange={(e) => setSort(e.target.value as SortId)} title="Sort by">
                {Object.entries(SORTS).map(([id, x]) => (
                  <option key={id} value={id}>
                    Sort: {x.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" onClick={() => downloadCsv(sorted)} disabled={!sorted.length}>
              Download CSV
            </button>
          </div>
        }
      >
        {!sorted.length ? (
          <p className="empty">No tasks match these filters.</p>
        ) : (
          <div className="table-box tall">
            <table className="table tasks">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Title</th>
                  <th className="hide-sm">Status</th>
                  <th className="hide-sm">Owner</th>
                  <th className="hide-sm">Assigned to</th>
                  <th>Due</th>
                  <th className="hide-sm">Last update</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <Fragment key={r.key}>
                    <tr
                      className={open === r.key ? 'picked' : ''}
                      onClick={() => setOpen(open === r.key ? null : r.key)}
                      tabIndex={0}
                      aria-expanded={open === r.key}
                      onKeyDown={(e) => e.key === 'Enter' && setOpen(open === r.key ? null : r.key)}
                    >
                      <td className="nowrap">
                        <TaskLink row={r} />
                      </td>
                      <td>
                        {r.name}
                        {r.done && <span className="chip done">Finished {shortDate(r.doneDay)}</span>}
                        {r.priority === 'High' && <span className="chip hi">High</span>}
                      </td>
                      <td className="hide-sm">{r.status}</td>
                      <td className="hide-sm">{r.owner}</td>
                      <td className="hide-sm">{r.assignees}</td>
                      <td className={`nowrap${r.late ? ' bad' : ''}`}>{r.dueLabel}</td>
                      <td className="hide-sm nowrap">{r.agoLabel}</td>
                    </tr>
                    {open === r.key && (
                      <tr className="detail-row">
                        <td colSpan={7}>
                          <Detail r={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Detail({ r }: { r: TaskRow }) {
  const items: [string, React.ReactNode][] = [
    ['Status', `${r.status} (${r.stage})`],
    ['List', r.list],
    ['Assigned to', r.assignees],
    ['Team lead', r.lead || '—'],
    ['Developer', r.developer || '—'],
    ['Tester', r.tester || '—'],
    ['Task type', r.taskType || '—'],
    ['Priority', r.priority || '—'],
    ['Country', r.country || '—'],
    ['Planned month', r.plannedMonth || '—'],
    ['Planned / Unplanned', r.planned || '—'],
    ['Start', shortDate(r.start)],
    ['Due', r.due ? `${shortDate(r.due)}${r.late ? ` (${r.dueLabel})` : ''}` : '—'],
    ['Estimate', r.estimate || '—'],
    ['Created', shortDate(r.created)],
    [r.done ? 'Finished' : 'Last update', r.done ? shortDate(r.doneDay) : r.agoLabel],
    ['Labels', r.labels.length ? r.labels.join(', ') : '—'],
    ['Subtask', r.subtask ? 'Yes' : 'No'],
  ];
  return (
    <div className="detail">
      <dl>
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {!r.done && (
        <div className="detail-sop">
          <span className="dt">SOP</span>
          {r.issues.length ? (
            <div className="chips">
              {r.issues.map((i) => (
                <span key={i} className="chip">
                  {RULE_SHORT[i]}
                </span>
              ))}
            </div>
          ) : (
            <span className="ok">Follows the SOP</span>
          )}
        </div>
      )}
    </div>
  );
}

function downloadCsv(rows: TaskRow[]) {
  const cols: [string, (r: TaskRow) => string][] = [
    ['Task', (r) => r.key],
    ['Title', (r) => r.name],
    ['Finished', (r) => r.doneDay || ''],
    ['Status', (r) => r.status],
    ['Stage', (r) => r.stage],
    ['List', (r) => r.list],
    ['Module owner', (r) => r.owner],
    ['Assigned to', (r) => r.assignees],
    ['Team lead', (r) => r.lead],
    ['Developer', (r) => r.developer],
    ['Tester', (r) => r.tester],
    ['Task type', (r) => r.taskType],
    ['Priority', (r) => r.priority],
    ['Country', (r) => r.country],
    ['Planned month', (r) => r.plannedMonth],
    ['Planned / Unplanned', (r) => r.planned],
    ['Start', (r) => r.start || ''],
    ['Due', (r) => r.due || ''],
    ['Days overdue', (r) => (r.late ? String(r.late) : '')],
    ['Estimate', (r) => r.estimate],
    ['Created', (r) => r.created],
    ['Days since update', (r) => String(r.idle)],
    ['Labels', (r) => r.labels.join('; ')],
    ['SOP issues', (r) => r.issues.map((i) => RULE_SHORT[i]).join('; ')],
    ['Link', (r) => r.url],
  ];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [cols.map((c) => c[0]).join(','), ...rows.map((r) => cols.map((c) => esc(c[1](r))).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ledgers-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- People / attention / SOP ----------

function People({ s, rows }: { s: Summary; rows: TaskRow[] }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const shown = s.people.filter((p) => p.person.toLowerCase().includes(q.trim().toLowerCase()));
  const person = (picked && s.people.some((p) => p.person === picked) ? picked : null) ?? s.people[0]?.person ?? null;
  const theirs = useMemo(
    () =>
      rows
        .filter((t) => person && t.who.includes(person))
        .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.active) - Number(a.active) || a.idle - b.idle),
    [rows, person],
  );

  return (
    <div className="pane">
      <Card
        title="Who is working on what"
        note='"Active" means in development, review, QA or release. "Last activity" is the latest update to any of their open tasks or a task they finished. Click a person to see their tasks.'
      >
        <input className="search" type="search" placeholder="Find a person" aria-label="Find a person" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="table-box">
          <table className="table people">
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">Open</th>
                <th className="num hide-sm">Active</th>
                <th className="num">Overdue</th>
                <th className="num hide-sm">Done, 7 days</th>
                <th>Last activity</th>
                <th className="hide-sm">Latest task touched</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.person}
                  className={p.person === person ? 'picked' : ''}
                  onClick={() => {
                    setPicked(p.person);
                    if (window.innerWidth < 900) document.getElementById('person-tasks')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setPicked(p.person)}
                >
                  <td>{p.person}</td>
                  <td className="num">{fmt.format(p.open)}</td>
                  <td className="num hide-sm">{fmt.format(p.active)}</td>
                  <td className={`num${p.overdue ? ' bad' : ''}`}>{fmt.format(p.overdue)}</td>
                  <td className="num hide-sm">{fmt.format(p.done7)}</td>
                  <td>{p.lastLabel}</td>
                  <td className={`hide-sm now${p.nowKey ? '' : ' muted'}`}>
                    {p.nowKey ? (
                      <>
                        <span className="key">{p.nowKey}</span> {p.nowName}
                      </>
                    ) : (
                      p.nowName
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card id="person-tasks" title={<>Tasks for {person ?? '—'}</>} note="Open work first (active, then by latest update), then what they finished recently.">
        <TaskTable rows={theirs} columns={['status', 'due', 'ago']} empty="No tasks." />
      </Card>
    </div>
  );
}

function TaskTable({
  rows,
  columns,
  empty,
}: {
  rows: (TaskRow & { reason?: string })[];
  columns: ('owner' | 'stage' | 'status' | 'assignees' | 'due' | 'ago' | 'reason' | 'issues')[];
  empty: string;
}) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  const head: Record<string, string> = {
    owner: 'Owner',
    stage: 'Stage',
    status: 'Status',
    assignees: 'Assigned to',
    due: 'Due',
    ago: 'Last update',
    reason: 'Why',
    issues: 'What to fix',
  };
  const hideSm = new Set(['stage', 'status', 'assignees', 'ago']);
  return (
    <div className="table-box">
      <table className="table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Title</th>
            {columns.map((c) => (
              <th key={c} className={hideSm.has(c) ? 'hide-sm' : ''}>
                {head[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="nowrap">
                <TaskLink row={r} />
              </td>
              <td>
                {r.name}
                {r.done && <span className="chip done">Finished {shortDate(r.doneDay)}</span>}
              </td>
              {columns.map((c) => {
                if (c === 'owner') return <td key={c}>{r.owner}</td>;
                if (c === 'stage') return <td key={c} className="hide-sm">{r.stage}</td>;
                if (c === 'status') return <td key={c} className="hide-sm">{r.status}</td>;
                if (c === 'assignees') return <td key={c} className="hide-sm">{r.assignees}</td>;
                if (c === 'due') return <td key={c} className={`nowrap${r.late ? ' bad' : ''}`}>{r.dueLabel}</td>;
                if (c === 'ago') return <td key={c} className="hide-sm nowrap">{r.agoLabel}</td>;
                if (c === 'reason') return <td key={c} className={`nowrap${r.late ? ' bad' : ''}`}>{r.reason}</td>;
                return (
                  <td key={c}>
                    <div className="chips">
                      {r.issues.map((i) => (
                        <span key={i} className="chip">
                          {RULE_SHORT[i]}
                        </span>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Attention({ s }: { s: Summary }) {
  return (
    <div className="pane">
      <Card title="Needs attention" note="Open tasks that are overdue or haven't been updated in 30+ days. Most overdue first. Click a task to open it in Nifty.">
        <TaskTable rows={s.attention} columns={['owner', 'stage', 'assignees', 'reason']} empty="Nothing overdue or stuck." />
      </Card>
    </div>
  );
}

function Sop({ s, rows: all }: { s: Summary; rows: TaskRow[] }) {
  const [rule, setRule] = useState<RuleId | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const { sop } = s;
  const rows = all
    .filter((t) => !t.done && t.issues.length && (!rule || t.issues.includes(rule)) && (!owner || t.owner === owner))
    .sort((a, b) => b.issues.length - a.issues.length);
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  return (
    <div className="pane">
      <p className="take">
        <b>{fmt.format(sop.clean)}</b> of {fmt.format(sop.total)} open tasks follow the SOP fully. Mandatory fields are checked on the{' '}
        {fmt.format(sop.checked)} tasks that have left Pipeline, as SOP §8.6 says.
      </p>
      <div className="grid">
        <Card title="Rules being broken" note="Click a rule to list its tasks below. Status and list-name rules apply to every open task.">
          <div className="table-box">
            <table className="table rules">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th className="num">Tasks</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {sop.rules.map((r) => (
                  <tr key={r.id} className={rule === r.id ? 'picked' : ''} onClick={() => setRule(rule === r.id ? null : r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setRule(rule === r.id ? null : r.id)}>
                    <td>{r.label}</td>
                    <td className={`num${r.n ? ' bad' : ' ok'}`}>{fmt.format(r.n)}</td>
                    <td className="num">
                      <span className="pct">
                        <span className="pct-bar" style={{ width: `${pct(r.n, r.of)}%` }} />
                      </span>
                      {pct(r.n, r.of)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="By team lead" note="Open tasks in each lead's lists that break at least one rule. Click a lead to filter.">
          <div className="table-box">
            <table className="table rules">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th className="num">Open</th>
                  <th className="num">Need fixing</th>
                  <th className="num">Fixes</th>
                </tr>
              </thead>
              <tbody>
                {sop.leads.map((l) => (
                  <tr key={l.owner} className={owner === l.owner ? 'picked' : ''} onClick={() => setOwner(owner === l.owner ? null : l.owner)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOwner(owner === l.owner ? null : l.owner)}>
                    <td>{l.owner}</td>
                    <td className="num">{fmt.format(l.tasks)}</td>
                    <td className={`num${l.withIssues ? ' bad' : ' ok'}`}>{fmt.format(l.withIssues)}</td>
                    <td className="num">{fmt.format(l.issues)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card
        title={
          <>
            Tasks to fix
            {(rule || owner) && (
              <button className="clear" onClick={() => { setRule(null); setOwner(null); }}>
                {[rule && RULE_SHORT[rule], owner].filter(Boolean).join(' · ')} ×
              </button>
            )}
          </>
        }
        note="Most problems first. Click a task to fix it in Nifty."
      >
        <TaskTable rows={rows} columns={['owner', 'stage', 'issues']} empty="Every task here follows the SOP." />
      </Card>
    </div>
  );
}
