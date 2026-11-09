'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EditOptions, EditValues, TaskRow } from '@/lib/compute';
import { Choice, EditPatch, KeyBox, KeyProblem, PeoplePicker, getKey, send, toMinutes } from './edit-client';
import { Field } from './TaskPanel';

type PeopleKey = 'assignees' | 'lead' | 'developer' | 'tester';
type PeopleOp = { mode: 'leave' | 'add' | 'remove' | 'set'; ids: string[] };
type ValueOp = { mode: 'leave' | 'set' | 'clear'; value: string };
type ChoiceKey = 'priority' | 'taskType' | 'plannedMonth' | 'planned';

const PEOPLE: { k: PeopleKey; label: string }[] = [
  { k: 'assignees', label: 'Assigned to' },
  { k: 'lead', label: 'Team lead' },
  { k: 'developer', label: 'Developer' },
  { k: 'tester', label: 'Tester' },
];
const CHOICES: { k: ChoiceKey; label: string }[] = [
  { k: 'priority', label: 'Priority' },
  { k: 'taskType', label: 'Task type' },
  { k: 'plannedMonth', label: 'Planned month' },
  { k: 'planned', label: 'Planned / Unplanned' },
];
const leaveP = (): PeopleOp => ({ mode: 'leave', ids: [] });
const leaveV = (): ValueOp => ({ mode: 'leave', value: '' });

/** Builds the change for one task from the bulk choices. Returns null when nothing would change for that task. */
function patchFor(e: EditValues, people: Record<PeopleKey, PeopleOp>, vals: Record<string, ValueOp>): EditPatch | null {
  const p: EditPatch = {};
  for (const { k } of PEOPLE) {
    const op = people[k];
    if (op.mode === 'leave') continue;
    const cur = e[k];
    const next =
      op.mode === 'set' ? op.ids : op.mode === 'add' ? [...new Set([...cur, ...op.ids])] : cur.filter((id) => !op.ids.includes(id));
    if (next.length !== cur.length || next.some((id) => !cur.includes(id))) p[k] = next;
  }
  for (const k of ['start', 'due', ...CHOICES.map((c) => c.k)] as const) {
    const op = vals[k];
    if (op.mode === 'leave') continue;
    const next = op.mode === 'clear' ? '' : op.value;
    if (next !== e[k]) p[k] = next;
  }
  const est = vals.estimate;
  if (est.mode !== 'leave') {
    const next = est.mode === 'clear' ? null : toMinutes(est.value);
    if (next !== e.estimateMin) p.estimateMin = next;
  }
  return Object.keys(p).length ? p : null;
}

export function BulkEdit({ rows, options, onClose, onDone }: { rows: TaskRow[]; options: EditOptions; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [people, setPeople] = useState<Record<PeopleKey, PeopleOp>>({ assignees: leaveP(), lead: leaveP(), developer: leaveP(), tester: leaveP() });
  const [vals, setVals] = useState<Record<string, ValueOp>>({
    start: leaveV(),
    due: leaveV(),
    estimate: leaveV(),
    priority: leaveV(),
    taskType: leaveV(),
    plannedMonth: leaveV(),
    planned: leaveV(),
  });
  const [run, setRun] = useState<{ done: number; total: number; failed: { key: string; error: string }[]; preview: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [needKey, setNeedKey] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const setP = (k: PeopleKey, op: Partial<PeopleOp>) => setPeople((s) => ({ ...s, [k]: { ...s[k], ...op } }));
  const setV = (k: string, op: Partial<ValueOp>) => setVals((s) => ({ ...s, [k]: { ...s[k], ...op } }));

  let plan: { row: TaskRow; patch: EditPatch }[] = [];
  let planError = '';
  try {
    plan = rows.map((row) => ({ row, patch: patchFor(row.edit, people, vals) })).filter((x): x is { row: TaskRow; patch: EditPatch } => !!x.patch);
  } catch (e) {
    planError = (e as Error).message;
  }

  const apply = async () => {
    if (!getKey()) return setNeedKey('');
    setMsg('');
    setBusy(true);
    const state = { done: 0, total: plan.length, failed: [] as { key: string; error: string }[], preview: false };
    setRun({ ...state });
    const queue = [...plan];
    let keyProblem: string | null = null;
    // Nifty allows 100 changes a minute, so three at a time stays well inside it.
    const worker = async () => {
      while (queue.length && keyProblem === null) {
        const { row, patch } = queue.shift()!;
        try {
          const r = await send(`/api/task/${encodeURIComponent(row.id)}`, 'PATCH', patch);
          if (r.preview) state.preview = true;
        } catch (e) {
          if (e instanceof KeyProblem) keyProblem = e.message;
          state.failed.push({ key: row.key, error: (e as Error).message });
        }
        state.done++;
        setRun({ ...state, failed: [...state.failed] });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
    if (keyProblem !== null) {
      setNeedKey(keyProblem);
      return;
    }
    if (!state.preview) router.refresh();
    if (!state.failed.length && !state.preview) onDone();
  };

  const modeSelect = (value: string, onChange: (v: string) => void, opts: [string, string][], label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Bulk edit">
        <header className="drawer-head">
          <div>
            <span className="key">Bulk edit</span>
            <h2>
              {rows.length} task{rows.length === 1 ? '' : 's'} selected
            </h2>
          </div>
          <div className="drawer-actions">
            <button className="btn" onClick={onClose} disabled={busy} aria-label="Close">
              ✕
            </button>
          </div>
        </header>
        <div className="drawer-body">
          <p className="note">Only the fields you change are touched. Everything left on “Leave as is” stays the same on every task.</p>

          <section className="drawer-sec edit-form">
            <h3>People</h3>
            {PEOPLE.map(({ k, label }) => (
              <Field key={k} label={label}>
                <div className="bulk-line">
                  {modeSelect(
                    people[k].mode,
                    (m) => setP(k, { mode: m as PeopleOp['mode'] }),
                    [
                      ['leave', 'Leave as is'],
                      ['add', 'Add'],
                      ['remove', 'Remove'],
                      ['set', 'Replace with'],
                    ],
                    `${label}: what to do`,
                  )}
                  {people[k].mode !== 'leave' && (
                    <PeoplePicker label={label} value={people[k].ids} onChange={(ids) => setP(k, { ids })} members={options.members} />
                  )}
                </div>
              </Field>
            ))}
          </section>

          <section className="drawer-sec edit-form">
            <h3>Dates and estimate</h3>
            {(
              [
                ['start', 'Start', 'date'],
                ['due', 'Due', 'date'],
                ['estimate', 'Estimate (hours)', 'number'],
              ] as const
            ).map(([k, label, type]) => (
              <Field key={k} label={label}>
                <div className="bulk-line">
                  {modeSelect(
                    vals[k].mode,
                    (m) => setV(k, { mode: m as ValueOp['mode'] }),
                    [
                      ['leave', 'Leave as is'],
                      ['set', 'Set to'],
                      ['clear', 'Clear'],
                    ],
                    `${label}: what to do`,
                  )}
                  {vals[k].mode === 'set' && (
                    <input
                      type={type}
                      aria-label={label}
                      min={type === 'number' ? '0' : undefined}
                      step={type === 'number' ? '0.5' : undefined}
                      value={vals[k].value}
                      onChange={(e) => setV(k, { value: e.target.value })}
                    />
                  )}
                </div>
              </Field>
            ))}
          </section>

          <section className="drawer-sec edit-form">
            <h3>SOP fields</h3>
            {CHOICES.map(({ k, label }) => (
              <Field key={k} label={label}>
                <div className="bulk-line">
                  {modeSelect(
                    vals[k].mode,
                    (m) => setV(k, { mode: m as ValueOp['mode'] }),
                    [
                      ['leave', 'Leave as is'],
                      ['set', 'Set to'],
                      ['clear', 'Clear'],
                    ],
                    `${label}: what to do`,
                  )}
                  {vals[k].mode === 'set' && <Choice label={label} value={vals[k].value} onChange={(v) => setV(k, { value: v })} options={options[k]} />}
                </div>
              </Field>
            ))}
          </section>

          {needKey !== null && (
            <KeyBox
              error={needKey || undefined}
              onSet={() => {
                setNeedKey(null);
                void apply();
              }}
            />
          )}

          {run && (
            <div className="progress" role="status">
              <div className="progress-bar">
                <span style={{ width: `${run.total ? (run.done / run.total) * 100 : 100}%` }} />
              </div>
              <p>
                {run.done < run.total
                  ? `Updating ${run.done} of ${run.total}…`
                  : run.preview
                    ? `Local preview: ${run.total} changes checked, nothing sent to Nifty.`
                    : `${run.total - run.failed.length} of ${run.total} updated in Nifty.`}
              </p>
              {run.failed.length > 0 && (
                <ul className="errors">
                  {run.failed.map((f) => (
                    <li key={f.key}>
                      <span className="key">{f.key}</span> {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="row-end sticky-actions">
            {(planError || msg) && <span className="error">{planError || msg}</span>}
            {!planError && <span className="muted">{plan.length ? `${plan.length} task${plan.length === 1 ? '' : 's'} will change` : 'Nothing to change yet'}</span>}
            <button className="btn" onClick={onClose} disabled={busy}>
              {run && run.done === run.total ? 'Close' : 'Cancel'}
            </button>
            <button className="btn primary" onClick={apply} disabled={busy || !plan.length || !!planError}>
              {busy ? 'Updating…' : `Update ${plan.length || ''} in Nifty`}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
