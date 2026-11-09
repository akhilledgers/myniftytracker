'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EditOptions, RuleId, TaskRow } from '@/lib/compute';
import { RULES, shortDate } from '@/lib/compute';
import type { TaskDetail } from './api/task/[id]/route';
import { Choice, EditPatch, KeyBox, KeyProblem, PeoplePicker, getKey, send, toHours, toMinutes } from './edit-client';

const RULE_SHORT = Object.fromEntries(RULES.map((r) => [r.id, r.short])) as Record<RuleId, string>;
const when = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function TaskPanel({ row, options, onClose }: { row: TaskRow; options: EditOptions; onClose: () => void }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    setLoadError('');
    fetch(`/api/task/${encodeURIComponent(row.id)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Could not load the task');
        if (live) setDetail(j as TaskDetail);
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [row.id, reload]);

  useEffect(() => {
    setDetail(null);
    setEditing(false);
    panel.current?.focus();
  }, [row.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nameOf = (id: string) => options.members.find((m) => m.id === id)?.name;
  const mentions = (s: string) => s.replace(/<@([^>\s]+)>/g, (_, id: string) => `@${nameOf(id) || 'someone'}`);

  const facts: [string, string][] = [
    ['Status', `${row.status} (${row.stage})`],
    ['List', row.list],
    ['Assigned to', row.assignees],
    ['Team lead', row.lead || '—'],
    ['Developer', row.developer || '—'],
    ['Tester', row.tester || '—'],
    ['Start', shortDate(row.start)],
    ['Due', row.due ? `${shortDate(row.due)}${row.late ? ` (${row.dueLabel})` : ''}` : '—'],
    ['Estimate', row.estimate || '—'],
    ['Priority', row.priority || '—'],
    ['Task type', row.taskType || '—'],
    ['Planned month', row.plannedMonth || '—'],
    ['Planned / Unplanned', row.planned || '—'],
    ['Country', row.country || '—'],
    ['Created', shortDate(row.created)],
    [row.done ? 'Finished' : 'Last update', row.done ? shortDate(row.doneDay) : row.agoLabel],
    ['Labels', row.labels.length ? row.labels.join(', ') : '—'],
  ];

  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${row.key} ${row.name}`} tabIndex={-1} ref={panel}>
        <header className="drawer-head">
          <div>
            <span className="key">{row.key}</span>
            {row.done && <span className="chip done">Finished {shortDate(row.doneDay)}</span>}
            <h2>{row.name}</h2>
          </div>
          <div className="drawer-actions">
            {/^https:\/\/nifty\.pm\//.test(row.url) && (
              <a className="btn" href={row.url} target="_blank" rel="noopener noreferrer">
                Open in Nifty ↗
              </a>
            )}
            <button className="btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="drawer-body">
          <section className="drawer-sec">
            <div className="sec-head">
              <h3>Details</h3>
              {!editing && (
                <button className="btn" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <EditForm row={row} options={options} onDone={() => setEditing(false)} />
            ) : (
              <dl className="facts">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!row.done && (
              <div className="detail-sop">
                <span className="dt">SOP</span>
                {row.issues.length ? (
                  <div className="chips">
                    {row.issues.map((i) => (
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
          </section>

          {loadError && <p className="error">{loadError}</p>}
          {!detail && !loadError && <p className="muted">Loading description and comments…</p>}

          {detail && (
            <>
              <section className="drawer-sec">
                <h3>Description</h3>
                {detail.description ? <div className="prose">{mentions(detail.description)}</div> : <p className="muted">No description.</p>}
              </section>

              {detail.subtasks.length > 0 && (
                <section className="drawer-sec">
                  <h3>
                    Subtasks · {detail.subtasks.filter((s) => s.done).length}/{detail.subtasks.length} done
                  </h3>
                  <ul className="checks">
                    {detail.subtasks.map((s, i) => (
                      <li key={i} className={s.done ? 'is-done' : ''}>
                        <span aria-hidden>{s.done ? '☑' : '☐'}</span> {s.key && <span className="key">{s.key}</span>} {s.name}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detail.checklists.map((c, i) => (
                <section className="drawer-sec" key={i}>
                  <h3>
                    {c.name || 'Checklist'} · {c.items.filter((x) => x.done).length}/{c.items.length}
                  </h3>
                  <ul className="checks">
                    {c.items.map((x, j) => (
                      <li key={j} className={x.done ? 'is-done' : ''}>
                        <span aria-hidden>{x.done ? '☑' : '☐'}</span> {x.name}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <section className="drawer-sec">
                <h3>Comments · {detail.comments.filter((c) => !c.system).length}</h3>
                {detail.commentsError && <p className="error">{detail.commentsError}</p>}
                {detail.comments.length === 0 && !detail.commentsError && <p className="muted">No comments yet.</p>}
                <ol className="comments">
                  {detail.comments.map((c) => (
                    <li key={c.id} className={c.system ? 'system' : ''}>
                      <div className="c-meta">
                        <b>{c.author}</b> · {when.format(new Date(c.at))}
                      </div>
                      <div className="prose">{mentions(c.text)}</div>
                    </li>
                  ))}
                </ol>
                <CommentBox taskId={row.id} onPosted={() => setReload((n) => n + 1)} />
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function CommentBox({ taskId, onPosted }: { taskId: string; onPosted: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [needKey, setNeedKey] = useState<string | null>(null);

  const post = async () => {
    if (!getKey()) return setNeedKey('');
    setBusy(true);
    setMsg('');
    try {
      const r = await send(`/api/task/${encodeURIComponent(taskId)}/comments`, 'POST', { text });
      setText('');
      setMsg(r.preview ? 'Local preview: not posted to Nifty.' : 'Comment posted.');
      onPosted();
    } catch (e) {
      if (e instanceof KeyProblem) setNeedKey(e.message);
      else setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="comment-box">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment. It is posted to Nifty under your account." rows={3} aria-label="New comment" />
      {needKey !== null && (
        <KeyBox
          error={needKey || undefined}
          onSet={() => {
            setNeedKey(null);
            void post();
          }}
        />
      )}
      <div className="row-end">
        {msg && <span className="muted">{msg}</span>}
        <button className="btn primary" disabled={busy || !text.trim()} onClick={post}>
          {busy ? 'Posting…' : 'Post comment'}
        </button>
      </div>
    </div>
  );
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function EditForm({ row, options, onDone }: { row: TaskRow; options: EditOptions; onDone: () => void }) {
  const router = useRouter();
  const e0 = row.edit;
  const [v, setV] = useState({ ...e0, estimate: toHours(e0.estimateMin) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [needKey, setNeedKey] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const patch = (): EditPatch => {
    const p: EditPatch = {};
    for (const k of ['assignees', 'lead', 'developer', 'tester'] as const) if (!sameSet(v[k], e0[k])) p[k] = v[k];
    for (const k of ['start', 'due', 'priority', 'taskType', 'plannedMonth', 'planned'] as const) if (v[k] !== e0[k]) p[k] = v[k];
    const est = toMinutes(v.estimate);
    if (est !== e0.estimateMin) p.estimateMin = est;
    return p;
  };

  const save = async () => {
    if (!getKey()) return setNeedKey('');
    setMsg('');
    let p: EditPatch;
    try {
      p = patch();
    } catch (e) {
      return setMsg((e as Error).message);
    }
    if (!Object.keys(p).length) return onDone();
    setBusy(true);
    try {
      const r = await send(`/api/task/${encodeURIComponent(row.id)}`, 'PATCH', p);
      if (r.preview) setMsg('Local preview: the change was checked but not sent to Nifty.');
      else {
        router.refresh();
        onDone();
      }
    } catch (e) {
      if (e instanceof KeyProblem) setNeedKey(e.message);
      else setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const m = options.members;
  return (
    <div className="edit-form">
      <Field label="Assigned to" note="SOP: the team lead plus whoever is working on it.">
        <PeoplePicker label="Assigned to" value={v.assignees} onChange={(x) => set('assignees', x)} members={m} />
      </Field>
      <Field label="Team lead">
        <PeoplePicker label="Team lead" value={v.lead} onChange={(x) => set('lead', x)} members={m} single />
      </Field>
      <Field label="Developer">
        <PeoplePicker label="Developer" value={v.developer} onChange={(x) => set('developer', x)} members={m} />
      </Field>
      <Field label="Tester">
        <PeoplePicker label="Tester" value={v.tester} onChange={(x) => set('tester', x)} members={m} />
      </Field>
      <div className="field-row">
        <Field label="Start">
          <input type="date" aria-label="Start date" value={v.start} onChange={(e) => set('start', e.target.value)} />
        </Field>
        <Field label="Due">
          <input type="date" aria-label="Due date" value={v.due} onChange={(e) => set('due', e.target.value)} />
        </Field>
        <Field label="Estimate (hours)">
          <input type="number" aria-label="Estimate in hours" min="0" step="0.5" inputMode="decimal" value={v.estimate} onChange={(e) => set('estimate', e.target.value)} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Priority">
          <Choice label="Priority" value={v.priority} onChange={(x) => set('priority', x)} options={options.priority} />
        </Field>
        <Field label="Task type">
          <Choice label="Task type" value={v.taskType} onChange={(x) => set('taskType', x)} options={options.taskType} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Planned month">
          <Choice label="Planned month" value={v.plannedMonth} onChange={(x) => set('plannedMonth', x)} options={options.plannedMonth} />
        </Field>
        <Field label="Planned / Unplanned">
          <Choice label="Planned / Unplanned" value={v.planned} onChange={(x) => set('planned', x)} options={options.planned} />
        </Field>
      </div>
      {needKey !== null && (
        <KeyBox
          error={needKey || undefined}
          onSet={() => {
            setNeedKey(null);
            void save();
          }}
        />
      )}
      <div className="row-end">
        {msg && <span className="error">{msg}</span>}
        <button className="btn" onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save to Nifty'}
        </button>
      </div>
    </div>
  );
}

export function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      {children}
      {note && <span className="field-note">{note}</span>}
    </div>
  );
}
