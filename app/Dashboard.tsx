'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardData, RuleId, TaskRow } from '@/lib/compute';
import { RULES } from '@/lib/compute';

const TABS = [
  { id: 'overview', label: 'Overview' },
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

export function Dashboard({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<TabId>('overview');

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === h)) setTab(h as TabId);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const go = (id: TabId) => {
    setTab(id);
    history.replaceState(null, '', `#${id}`);
  };

  const { summary } = data;
  return (
    <main className="page">
      <header className="head">
        <div className="head-row">
          <h1>LEDGERS.cloud Pulse</h1>
          <RefreshButton generatedAt={data.generatedAt} />
        </div>
        <p className="take">
          <b>{fmt.format(summary.open)}</b> tasks are open. <b className={summary.overdue ? 'bad' : ''}>{fmt.format(summary.overdue)}</b> are past
          their due date and <b className={summary.stuck ? 'bad' : ''}>{fmt.format(summary.stuck)}</b> haven&apos;t been touched in 30 days.{' '}
          <b>{fmt.format(summary.done7)}</b> were finished in the last 7 days.
        </p>
      </header>

      <section className="tiles" aria-label="Headline numbers">
        <Tile label="Open" value={summary.open} note="Not finished, cancelled left out" />
        <Tile label="Overdue" value={summary.overdue} note="Open and past due date" bad />
        <Tile label="Stuck" value={summary.stuck} note="No update in 30+ days" bad />
        <Tile label="Finished" value={summary.done7} note="Last 7 days" />
      </section>

      <nav className="tabs" role="tablist" aria-label="Views">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => go(t.id)}>
            {t.label}
            {t.id === 'attention' && data.attention.length > 0 && <span className="count">{data.attention.length}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview data={data} />}
      {tab === 'people' && <People data={data} />}
      {tab === 'attention' && <Attention data={data} />}
      {tab === 'sop' && <Sop data={data} />}

      <footer className="foot">
        Live from Nifty, project LEDGERS.cloud. Refreshed at most every 5 minutes. Rules in SOP health follow Nifty Process SOP v2.0.
      </footer>
    </main>
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

function Tile({ label, value, note, bad }: { label: string; value: number; note: string; bad?: boolean }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <b className={`big${bad && value > 0 ? ' bad' : ''}`}>{fmt.format(value)}</b>
      <span className="tile-note">{note}</span>
    </div>
  );
}

function Card({ title, note, children, id }: { title: React.ReactNode; note?: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="card" id={id}>
      <div className="card-head">
        <h2>{title}</h2>
        {note && <p className="note">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Bars({ rows }: { rows: { label: string; segs: { n: number; tone: 'main' | 'muted' | 'bad' }[]; value: React.ReactNode }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.segs.reduce((s, x) => s + x.n, 0)));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label" title={r.label}>
            {r.label}
          </span>
          <div className="track">
            {r.segs.map((s, i) =>
              s.n > 0 ? <div key={i} className={`seg seg-${s.tone}`} style={{ width: `${(s.n / max) * 100}%` }} /> : null,
            )}
          </div>
          <span className="bar-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Overview({ data }: { data: DashboardData }) {
  const maxWeek = Math.max(1, ...data.weekly.map((w) => w.n));
  return (
    <div className="pane">
      <div className="grid">
        <Card title="Where open work sits" note="Open tasks by stage. Nifty's statuses are grouped into a few plain stages.">
          <Bars
            rows={data.stages.map((s) => ({
              label: s.stage,
              segs: [{ n: s.n, tone: s.stage === 'On hold' || s.stage === 'No status' ? 'muted' : 'main' }],
              value: <b>{fmt.format(s.n)}</b>,
            }))}
          />
        </Card>
        <Card title="Open work by module owner" note='Owner is the lead named in the list, such as "IN - Vairavan - Bills - Sales".'>
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
            rows={data.owners.map((o) => ({
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
          {data.weekly.map((w) => (
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
    <a className="key" href={row.url} target="_blank" rel="noopener noreferrer">
      {row.key}
    </a>
  ) : (
    <span className="key">{row.key}</span>
  );
}

function People({ data }: { data: DashboardData }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const shown = data.people.filter((p) => p.person.toLowerCase().includes(q.trim().toLowerCase()));
  const person = picked ?? data.people[0]?.person ?? null;
  const theirs = useMemo(
    () =>
      data.tasks
        .filter((t) => person && t.who.includes(person))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.idle - b.idle),
    [data.tasks, person],
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
      <Card id="person-tasks" title={<>Open tasks for {person ?? '—'}</>} note="Active work first, then the rest by most recent update.">
        <TaskTable rows={theirs} columns={['stage', 'due', 'ago']} empty="No open tasks." />
      </Card>
    </div>
  );
}

function TaskTable({
  rows,
  columns,
  empty,
  extra,
}: {
  rows: (TaskRow & { reason?: string })[];
  columns: ('owner' | 'stage' | 'assignees' | 'due' | 'ago' | 'reason' | 'issues')[];
  empty: string;
  extra?: (r: TaskRow) => React.ReactNode;
}) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  const head: Record<string, string> = {
    owner: 'Owner',
    stage: 'Stage',
    assignees: 'Assigned to',
    due: 'Due',
    ago: 'Last update',
    reason: 'Why',
    issues: 'What to fix',
  };
  const hideSm = new Set(['stage', 'assignees', 'ago']);
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
              <td>{r.name}</td>
              {columns.map((c) => {
                if (c === 'owner') return <td key={c}>{r.owner}</td>;
                if (c === 'stage') return <td key={c} className="hide-sm">{r.stage}</td>;
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
              {extra?.(r)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Attention({ data }: { data: DashboardData }) {
  return (
    <div className="pane">
      <Card title="Needs attention" note="Open tasks that are overdue or haven't been updated in 30+ days. Most overdue first. Click a task to open it in Nifty.">
        <TaskTable rows={data.attention} columns={['owner', 'stage', 'assignees', 'reason']} empty="Nothing overdue or stuck." />
      </Card>
    </div>
  );
}

function Sop({ data }: { data: DashboardData }) {
  const [rule, setRule] = useState<RuleId | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const { sop } = data;
  const rows = data.tasks
    .filter((t) => t.issues.length && (!rule || t.issues.includes(rule)) && (!owner || t.owner === owner))
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
