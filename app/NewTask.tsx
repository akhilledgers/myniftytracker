'use client';

// "New task" drawer: a task in the SOP format, with the task type, priority, team lead and
// assignees filled in from what you type and the list you pick. Everything stays editable.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EditOptions, TaskRow } from '@/lib/compute';
import {
  KINDS,
  TEMPLATES,
  isTemplate,
  missingForSop,
  monthOption,
  parseList,
  pickOption,
  similarity,
  sopAssignees,
  suggestKind,
  suggestPriority,
  type NewTaskInput,
  type TaskKind,
} from '@/lib/newtask';
import { Choice, KeyBox, KeyProblem, PeoplePicker, getKey, send, toMinutes } from './edit-client';
import { Field } from './TaskPanel';

type Created = { ok: boolean; preview?: boolean; id?: string; key?: string; sent?: unknown };

export function NewTask({
  options,
  rows,
  today,
  onClose,
  onCreated,
}: {
  options: EditOptions;
  rows: TaskRow[];
  today: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const router = useRouter();
  const panel = useRef<HTMLElement>(null);
  const requestId = useMemo(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), []);
  const m = options.members;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [listId, setListId] = useState('');
  const [stage, setStage] = useState<'todo' | 'pipeline'>('todo');
  // null = follow the suggestion; a value = you picked it yourself.
  const [kindPick, setKindPick] = useState<TaskKind | null>(null);
  const [priorityPick, setPriorityPick] = useState<string | null>(null);
  const [plannedPick, setPlannedPick] = useState<string | null>(null);
  const [leadPick, setLeadPick] = useState<string[] | null>(null);
  const [plannedMonth, setPlannedMonth] = useState(() => monthOption(options.plannedMonth, today));
  const [developer, setDeveloper] = useState<string[]>([]);
  const [tester, setTester] = useState<string[]>([]);
  const [subscribers, setSubscribers] = useState<string[]>([]);
  const [start, setStart] = useState(today);
  const [due, setDue] = useState('');
  const [estimate, setEstimate] = useState('');
  const [refs, setRefs] = useState({ designSpec: '', testCases: '', testExecution: '' });
  const [dependencyId, setDependencyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [needKey, setNeedKey] = useState<string | null>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const guess = useMemo(() => suggestKind(name, description), [name, description]);
  const kind: TaskKind | '' = kindPick ?? guess.kind ?? '';
  const kindValue = kind ? pickOption(options.taskType, kind) || kind : '';

  // Swap the description template when the type changes, but never over text you wrote.
  useEffect(() => {
    if (kind && isTemplate(description)) setDescription(TEMPLATES[kind]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const list = options.lists.find((l) => l.id === listId);
  const parts = list ? parseList(list.name) : null;
  const leadFromList = useMemo(() => {
    if (!list) return [];
    // Whoever is already Team Lead on most tasks in this list; else the member named in the list (SOP §5.2).
    const count = new Map<string, number>();
    for (const r of rows) if (r.list === list.name && r.edit.lead[0]) count.set(r.edit.lead[0], (count.get(r.edit.lead[0]) || 0) + 1);
    const top = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top && m.some((p) => p.id === top)) return [top];
    const want = parts?.lead.toLowerCase() || '';
    if (!want) return [];
    const hit =
      m.find((p) => p.name.toLowerCase() === want) ||
      m.find((p) => p.name.toLowerCase().split(/[\s/|]+/).includes(want)) ||
      m.find((p) => p.name.toLowerCase().startsWith(want));
    return hit ? [hit.id] : [];
  }, [list, parts?.lead, rows, m]);
  const lead = leadPick ?? leadFromList;

  const priorityGuess = suggestPriority(name, description, kind);
  const priority = priorityPick ?? pickOption(options.priority, priorityGuess);
  const planned = plannedPick ?? pickOption(options.planned, kind === 'Bug' ? 'Unplanned' : 'Planned');

  let estimateMin: number | null = null;
  let estimateError = '';
  try {
    estimateMin = toMinutes(estimate);
  } catch (e) {
    estimateError = (e as Error).message;
  }

  const input: NewTaskInput = {
    name,
    description,
    listId,
    stage,
    kind: kindValue,
    priority,
    plannedMonth,
    planned,
    lead,
    developer,
    tester,
    subscribers,
    start,
    due,
    estimateMin,
    country: parts?.country || '',
    ...refs,
    dependencyId,
  };
  const missing = missingForSop(input);
  const assignees = sopAssignees(input);
  const nameOf = (id: string) => m.find((p) => p.id === id)?.name || 'Unknown person';

  // SOP §7: check for an existing task before adding another.
  const similar = useMemo(() => {
    if (name.trim().length < 8) return [];
    return rows
      .filter((r) => !r.done)
      .map((r) => ({ r, s: similarity(name, r.name) }))
      .filter((x) => x.s >= 0.5)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.r);
  }, [name, rows]);

  const sameList = useMemo(() => rows.filter((r) => !r.done && list && r.list === list.name), [rows, list]);

  const create = async () => {
    if (!getKey()) return setNeedKey('');
    if (estimateError) return setMsg(estimateError);
    if (missing.length) return setMsg(`Still needed: ${missing.join(', ')}`);
    setBusy(true);
    setMsg('');
    try {
      const r = await send<Created>('/api/task', 'POST', { ...input, requestId });
      if (r.preview) {
        setMsg('Local preview: the task was checked against the SOP but not sent to Nifty.');
        console.info('New task body', r.sent);
      } else if (r.id) {
        router.refresh();
        onCreated(r.id);
      }
    } catch (e) {
      if (e instanceof KeyProblem) setNeedKey(e.message);
      else setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const countries = [...new Set(options.lists.map((l) => parseList(l.name).country))];

  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="New task" tabIndex={-1} ref={panel}>
        <header className="drawer-head">
          <div>
            <span className="key">LEDGERS.cloud</span>
            <h2>New task</h2>
          </div>
          <div className="drawer-actions">
            <button className="btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="drawer-body">
          <div className="edit-form">
            <Field label="Task name" note="SOP §8.6: a clear and specific title.">
              <input
                autoFocus
                aria-label="Task name"
                value={name}
                maxLength={300}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GST report not loading for AE businesses"
              />
            </Field>
            {similar.length > 0 && (
              <div className="dupes" role="status">
                <b>Already in Nifty?</b> SOP §7 asks to check before adding a task. These open tasks look similar:
                <ul>
                  {similar.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="linkish" onClick={() => onCreated(r.id)}>
                        {r.key} {r.name}
                      </button>{' '}
                      <span className="muted">· {r.list}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Field label="Task type">
              <div className="seg-ctl kind" role="group" aria-label="Task type">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => setKindPick(kindPick === k ? null : k)}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <span className="field-note suggest">
                {kindPick
                  ? guess.kind && guess.kind !== kindPick
                    ? <>You picked {kindPick}. The text reads more like <b>{guess.kind}</b>. <button type="button" className="linkish" onClick={() => setKindPick(null)}>Use suggestion</button></>
                    : <>You picked {kindPick}.</>
                  : guess.kind
                    ? <>✨ Suggested <b>{guess.kind}</b>{guess.because.length > 0 && <> because of “{guess.because.join('”, “')}”</>}{!guess.sure && ', not sure: check it'}. Click a type to change it.</>
                    : 'Type a title and the type is suggested here.'}
              </span>
            </Field>

            <div className="field-row">
              <Field label="List" note="SOP §5.2: Country - Team Lead - App - Module.">
                <select aria-label="List" value={listId} onChange={(e) => { setListId(e.target.value); setLeadPick(null); setDependencyId(''); }}>
                  <option value="">Pick a list</option>
                  {countries.map((c) => (
                    <optgroup key={c} label={c}>
                      {options.lists
                        .filter((l) => parseList(l.name).country === c)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Starts in" note={stage === 'todo' ? 'All SOP §8.6 fields are needed.' : 'Future work. Fields can wait.'}>
                <div className="seg-ctl" role="group" aria-label="Starting status">
                  <button type="button" aria-pressed={stage === 'pipeline'} onClick={() => setStage('pipeline')}>
                    01 Pipeline
                  </button>
                  <button type="button" aria-pressed={stage === 'todo'} onClick={() => setStage('todo')}>
                    02 To Do
                  </button>
                </div>
              </Field>
            </div>

            <Field label="Description" note={kind === 'Bug' ? 'SOP §8.6: bugs need screenshots or videos.' : kind === 'Feature' ? 'SOP §8.6: features need the required specifications.' : 'Context and why it is needed.'}>
              <textarea aria-label="Description" rows={12} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pick or wait for a task type to get the template." />
            </Field>

            <Field label="Team lead" note={leadPick ? undefined : parts?.lead ? (leadFromList.length ? `Filled in from the list (${parts.lead}).` : `No member named ${parts.lead} found. Pick one.`) : 'Filled in from the list.'}>
              <PeoplePicker label="Team lead" value={lead} onChange={(x) => setLeadPick(x)} members={m} single />
            </Field>
            <div className="field-row">
              <Field label="Developer">
                <PeoplePicker label="Developer" value={developer} onChange={setDeveloper} members={m} />
              </Field>
              <Field label="Tester">
                <PeoplePicker label="Tester" value={tester} onChange={setTester} members={m} />
              </Field>
            </div>
            <p className="field-note sop-line">
              <b>Assigned to</b> (SOP §8.4, set for you): {assignees.length ? assignees.map(nameOf).join(' + ') : 'team lead + developer'}
            </p>
            <Field label="Subscribers" note="Anyone else who should follow it. SOP §8.4: never a third assignee.">
              <PeoplePicker label="Subscribers" value={subscribers} onChange={setSubscribers} members={m.filter((p) => !assignees.includes(p.id))} />
            </Field>

            <div className="field-row">
              <Field label="Start">
                <input type="date" aria-label="Start date" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Due">
                <input type="date" aria-label="Due date" value={due} min={start || undefined} onChange={(e) => setDue(e.target.value)} />
              </Field>
              <Field label="Estimate (hours)">
                <input type="number" aria-label="Estimate in hours" min="0" step="0.5" inputMode="decimal" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
              </Field>
            </div>
            <div className="field-row">
              <Field label="Priority" note={priorityPick === null && name ? `Suggested from the text (${priorityGuess}).` : undefined}>
                <Choice label="Priority" value={priority} onChange={setPriorityPick} options={options.priority} />
              </Field>
              <Field label="Planned month">
                <Choice label="Planned month" value={plannedMonth} onChange={setPlannedMonth} options={options.plannedMonth} />
              </Field>
              <Field label="Planned / Unplanned" note={plannedPick === null && kind ? (kind === 'Bug' ? 'Bugs default to Unplanned.' : 'Defaults to Planned.') : undefined}>
                <Choice label="Planned / Unplanned" value={planned} onChange={setPlannedPick} options={options.planned} />
              </Field>
            </div>

            <details className="more">
              <summary>Reference documents and linked task (SOP §8.5, §8.7)</summary>
              <div className="edit-form">
                <Field label="Design Spec link">
                  <input type="url" aria-label="Design Spec link" value={refs.designSpec} onChange={(e) => setRefs({ ...refs, designSpec: e.target.value })} placeholder="https://" />
                </Field>
                <Field label="Test Cases link">
                  <input type="url" aria-label="Test Cases link" value={refs.testCases} onChange={(e) => setRefs({ ...refs, testCases: e.target.value })} placeholder="https://" />
                </Field>
                <Field label="Test Execution Doc link">
                  <input type="url" aria-label="Test Execution Doc link" value={refs.testExecution} onChange={(e) => setRefs({ ...refs, testExecution: e.target.value })} placeholder="https://" />
                </Field>
                <Field label="Depends on" note={list ? 'Open tasks in the same list.' : 'Pick a list first.'}>
                  <select aria-label="Depends on" value={dependencyId} onChange={(e) => setDependencyId(e.target.value)} disabled={!list}>
                    <option value="">Nothing</option>
                    {sameList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.key} {r.name.slice(0, 80)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </details>

            <div className={`sop-check${missing.length ? '' : ' pass'}`} role="status">
              {missing.length ? (
                <>
                  <b>SOP check:</b> still needed: {missing.join(', ')}.
                </>
              ) : (
                <>
                  <b>SOP check passed.</b> {stage === 'todo' ? 'Every §8.6 field is filled in.' : 'Ready for the pipeline.'}
                </>
              )}
            </div>

            {needKey !== null && (
              <KeyBox
                error={needKey || undefined}
                onSet={() => {
                  setNeedKey(null);
                  void create();
                }}
              />
            )}
            <div className="row-end">
              {msg && <span className="error">{msg}</span>}
              <button className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary" onClick={create} disabled={busy || missing.length > 0}>
                {busy ? 'Creating…' : 'Create in Nifty'}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
