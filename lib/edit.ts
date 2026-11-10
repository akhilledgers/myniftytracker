// Server-only helpers for editing tasks from the dashboard.
import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { CUSTOM_FIELDS } from './config';
import { CACHE_TAG, NiftyError } from './nifty';
import { fullDescription, missingForSop, sopAssignees, type NewTaskInput } from './newtask';

/** What the dashboard may change on a task. Every field is optional; only sent fields change. */
export interface EditPatch {
  start?: string; // YYYY-MM-DD, '' clears
  due?: string;
  estimateMin?: number | null;
  assignees?: string[];
  lead?: string[];
  developer?: string[];
  tester?: string[];
  priority?: string; // '' clears
  taskType?: string;
  plannedMonth?: string;
  planned?: string;
}

/** Writes need the EDIT_KEY that the dashboard owner set in Vercel, sent as the x-edit-key header. */
export function checkEditKey(req: Request): Response | null {
  const want = process.env.EDIT_KEY;
  if (!want) return Response.json({ error: 'Editing is switched off. Add EDIT_KEY in Vercel to switch it on.' }, { status: 503 });
  const got = req.headers.get('x-edit-key') || '';
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: 'Wrong edit key.' }, { status: 401 });
  return null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_!\-]{1,64}$/;

export const validTaskId = (id: string) => ID.test(id);

function ids(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.length > 50 || !v.every((x) => typeof x === 'string' && ID.test(x))) throw new BadInput(`${field} must be a list of member ids`);
  return [...new Set(v as string[])];
}
function text(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length > 200) throw new BadInput(`${field} must be text`);
  return v.trim();
}
/** Dates are India calendar days. Nifty's own app stores starts at 10:00 and due dates at 19:00 IST, so we do the same. */
function day(v: unknown, field: string, time: string): string | null {
  if (v === '' || v === null) return null;
  if (typeof v !== 'string' || !YMD.test(v)) throw new BadInput(`${field} must be a date`);
  return new Date(`${v}T${time}+05:30`).toISOString();
}

export class BadInput extends Error {}

/** Turns a dashboard patch into a Nifty PATCH /tasks/{id} body. */
export function toNiftyBody(p: EditPatch): Record<string, unknown> {
  if (!p || typeof p !== 'object') throw new BadInput('Nothing to change');
  const body: Record<string, unknown> = {};
  const cf: { customFieldId: string; value: string }[] = [];
  if ('start' in p) body.startAt = day(p.start, 'Start', '10:00:00');
  if ('due' in p) body.dueAt = day(p.due, 'Due', '19:00:00');
  if ('estimateMin' in p) {
    const e = p.estimateMin;
    if (e !== null && (typeof e !== 'number' || !Number.isInteger(e) || e < 0 || e > 100000)) throw new BadInput('Estimate must be whole minutes');
    body.estimate = e;
  }
  if ('assignees' in p) body.assignees = ids(p.assignees, 'Assignees');
  if ('lead' in p) cf.push({ customFieldId: CUSTOM_FIELDS.teamLead, value: ids(p.lead, 'Team lead').join(',') });
  if ('developer' in p) cf.push({ customFieldId: CUSTOM_FIELDS.developer, value: ids(p.developer, 'Developer').join(',') });
  if ('tester' in p) cf.push({ customFieldId: CUSTOM_FIELDS.tester, value: ids(p.tester, 'Tester').join(',') });
  if ('priority' in p) cf.push({ customFieldId: CUSTOM_FIELDS.priority, value: text(p.priority, 'Priority') });
  if ('taskType' in p) cf.push({ customFieldId: CUSTOM_FIELDS.taskType, value: text(p.taskType, 'Task type') });
  if ('plannedMonth' in p) cf.push({ customFieldId: CUSTOM_FIELDS.plannedMonth, value: text(p.plannedMonth, 'Planned month') });
  if ('planned' in p) cf.push({ customFieldId: CUSTOM_FIELDS.plannedUnplanned, value: text(p.planned, 'Planned / Unplanned') });
  if (cf.length) body.customFields = cf;
  if (!Object.keys(body).length) throw new BadInput('Nothing to change');
  return body;
}

function url(v: unknown, field: string): string {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || v.length > 1000 || !/^https?:\/\/\S+$/.test(v.trim())) throw new BadInput(`${field} must be a link starting with https://`);
  return v.trim();
}

/** Checks a new task against the SOP and turns it into a Nifty POST /tasks body. */
export function toCreateBody(raw: NewTaskInput, project: string, statusIds: { pipeline: string; todo: string }): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') throw new BadInput('Nothing to create');
  const i: NewTaskInput = {
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 1024) : '',
    description: typeof raw.description === 'string' ? raw.description.slice(0, 20000) : '',
    listId: typeof raw.listId === 'string' && ID.test(raw.listId) ? raw.listId : '',
    stage: raw.stage === 'todo' ? 'todo' : 'pipeline',
    kind: text(raw.kind ?? '', 'Task type'),
    priority: text(raw.priority ?? '', 'Priority'),
    plannedMonth: text(raw.plannedMonth ?? '', 'Planned month'),
    planned: text(raw.planned ?? '', 'Planned / Unplanned'),
    lead: ids(raw.lead ?? [], 'Team lead').slice(0, 1),
    developer: ids(raw.developer ?? [], 'Developer'),
    tester: ids(raw.tester ?? [], 'Tester'),
    subscribers: ids(raw.subscribers ?? [], 'Subscribers'),
    start: raw.start || '',
    due: raw.due || '',
    estimateMin: raw.estimateMin ?? null,
    country: /^(IN|AE|US|GL)$/.test(String(raw.country)) ? String(raw.country) : '',
    designSpec: url(raw.designSpec, 'Design Spec'),
    testCases: url(raw.testCases, 'Test Cases'),
    testExecution: url(raw.testExecution, 'Test Execution Doc'),
    dependencyId: typeof raw.dependencyId === 'string' && ID.test(raw.dependencyId) ? raw.dependencyId : '',
  };
  if (i.estimateMin !== null && (typeof i.estimateMin !== 'number' || !Number.isInteger(i.estimateMin) || i.estimateMin < 0 || i.estimateMin > 100000))
    throw new BadInput('Estimate must be whole minutes');
  const missing = missingForSop(i);
  if (missing.length) throw new BadInput(`The SOP needs: ${missing.join(', ')}`);

  const statusId = i.stage === 'todo' ? statusIds.todo : statusIds.pipeline;
  const assignees = sopAssignees(i);
  const body: Record<string, unknown> = {
    name: i.name,
    description: fullDescription(i) || null,
    projectId: project,
    listId: i.listId,
    ...(statusId ? { statusId } : {}),
    startAt: day(i.start, 'Start', '10:00:00'),
    dueAt: day(i.due, 'Due', '19:00:00'),
    // Optional: the developer usually adds the estimate later.
    ...(i.estimateMin ? { estimate: i.estimateMin } : {}),
    ...(assignees.length ? { assignees } : {}),
    // §8.4: everyone else who needs to follow it is a subscriber, never a third assignee.
    ...(i.subscribers.length ? { subscribers: i.subscribers.filter((s) => !assignees.includes(s)) } : {}),
    ...(i.dependencyId ? { dependencyId: i.dependencyId } : {}),
  };
  const cf: { customFieldId: string; value: string }[] = [];
  const put = (id: string, v: string) => v && cf.push({ customFieldId: id, value: v });
  put(CUSTOM_FIELDS.taskType, i.kind);
  put(CUSTOM_FIELDS.priority, i.priority);
  put(CUSTOM_FIELDS.plannedMonth, i.plannedMonth);
  put(CUSTOM_FIELDS.plannedUnplanned, i.planned);
  put(CUSTOM_FIELDS.teamLead, i.lead.join(','));
  put(CUSTOM_FIELDS.developer, i.developer.join(','));
  put(CUSTOM_FIELDS.tester, i.tester.join(','));
  if (i.country === 'IN' || i.country === 'AE') put(CUSTOM_FIELDS.country, i.country);
  if (cf.length) body.customFields = cf;
  return body;
}

/** Makes the next page load read Nifty again instead of the 5-minute cache. */
export function refreshDashboard() {
  revalidateTag(CACHE_TAG, { expire: 0 });
  revalidatePath('/');
}

export function errorResponse(err: unknown): Response {
  if (err instanceof BadInput) return Response.json({ error: err.message }, { status: 400 });
  if (err instanceof NiftyError) {
    const msg =
      err.status === 403
        ? 'The Nifty token is missing a scope for this. See the README for the scopes editing needs.'
        : err.status === 404
          ? 'Nifty could not find this task.'
          : err.status === 409
            ? 'Someone changed this task at the same time. Reload and try again.'
            : err.status === 400 || err.status === 422
              ? `Nifty refused it: ${err.message.replace(/^.*?answered \d+: /, '').slice(0, 200)}`
              : err.status === 429
              ? 'Nifty is rate-limiting. Wait a minute and try again.'
              : `Nifty refused the change (${err.status}).`;
    console.error(err);
    return Response.json({ error: msg, detail: err.message.slice(0, 300) }, { status: err.status === 0 ? 500 : 502 });
  }
  console.error(err);
  return Response.json({ error: 'Something went wrong.' }, { status: 500 });
}
