// Reads the LEDGERS.cloud project from Nifty's v3 REST API.
// Docs: https://developers.niftypm.com/docs/api/v3

import { CUSTOM_FIELDS } from './config';

const BASE = 'https://openapi.niftypm.com/api/v3';
const REVALIDATE_SECONDS = 300;
/** Cache tag on every list read, so a write can make the dashboard re-read Nifty straight away. */
export const CACHE_TAG = 'nifty';

export class NiftyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface NiftyPerson {
  id: string;
  name: string;
}

export interface NiftyTask {
  id: string;
  projectId?: string;
  identifier: string;
  name: string;
  url: string;
  statusId: string | null;
  listId: string | null;
  parentTaskId: string | null;
  startAt: string | null;
  dueAt: string | null;
  estimate: number | null;
  updatedAt: string;
  createdAt: string;
  completedAt: string | null;
  assignees?: NiftyPerson[];
  labels?: { id: string; name: string }[];
  customFields?: { customFieldId: string; value: unknown }[];
  status?: { name: string } | null;
  list?: { name: string } | null;
}

export interface NiftyNamed {
  id: string;
  name: string;
}

function token(): string {
  const t = process.env.NIFTY_TOKEN;
  if (!t) throw new NiftyError(0, 'NIFTY_TOKEN is not set');
  return t;
}

export function projectId(): string {
  return process.env.NIFTY_PROJECT_ID || 'yb6vQ7M!g0';
}

async function getAll<T>(path: string, params: Record<string, string>, maxPages = 15): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ ...params, limit: '200' });
    if (cursor) qs.set('cursor', cursor);
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new NiftyError(res.status, `Nifty ${path} answered ${res.status}: ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as { data: T[]; hasMore?: boolean; nextCursor?: string | null };
    out.push(...body.data);
    cursor = body.hasMore && body.nextCursor ? body.nextCursor : undefined;
    pages++;
  } while (cursor && pages < maxPages);
  return out;
}

/** Local preview only: NIFTY_FIXTURE points at a saved JSON of {open, done, statuses, lists}. Ignored in production. */
export function fixturePath(): string | null {
  return process.env.NODE_ENV !== 'production' && process.env.NIFTY_FIXTURE ? process.env.NIFTY_FIXTURE : null;
}

export async function loadNifty(sinceDate: string) {
  const fixture = fixturePath();
  if (fixture) {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(fixture, 'utf8')) as {
      open: NiftyTask[];
      done: NiftyTask[];
      statuses: NiftyNamed[];
      lists: NiftyNamed[];
      members?: NiftyNamed[];
      fieldOptions?: FieldOptions;
    };
  }
  const project = projectId();
  const [open, done, statuses, lists] = await Promise.all([
    getAll<NiftyTask>('/tasks', {
      projectId: project,
      'completed[eq]': 'false',
      'archived[eq]': 'false',
      sort: 'dueAt',
      expand: 'assignees,labels,customFields',
    }),
    getAll<NiftyTask>('/tasks', {
      projectId: project,
      'completed[eq]': 'true',
      'archived[eq]': 'false',
      'completedAt[gte]': sinceDate,
      sort: '-completedAt',
      expand: 'assignees,labels,customFields',
    }),
    getAll<NiftyNamed>('/statuses', { projectId: project }),
    getAll<NiftyNamed>('/lists', { projectId: project }),
  ]);
  // Optional extras: need the members:read and custom-fields:read scopes. The dashboard works without them.
  const [members, fieldOptions] = await Promise.all([
    getAll<NiftyNamed>('/members', {}, 5).catch(() => [] as NiftyNamed[]),
    loadFieldOptions().catch(() => ({}) as FieldOptions),
  ]);
  return { open, done, statuses, lists, members, fieldOptions };
}

// ---------- Single task, comments and writes ----------

export type FieldOptions = Partial<Record<string, string[]>>;

/** Dropdown choices for the custom fields the dashboard can edit, keyed by custom field id. */
async function loadFieldOptions(): Promise<FieldOptions> {
  const ids = [CUSTOM_FIELDS.priority, CUSTOM_FIELDS.taskType, CUSTOM_FIELDS.plannedMonth, CUSTOM_FIELDS.plannedUnplanned];
  const out: FieldOptions = {};
  await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${BASE}/custom-fields/${encodeURIComponent(id)}?expand=options`, {
        headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
        next: { revalidate: 3600, tags: [CACHE_TAG] },
      });
      if (!res.ok) return;
      const body = (await res.json()) as { options?: unknown };
      const opts = Array.isArray(body.options) ? body.options : [];
      const vals = opts
        .map((o) => (typeof o === 'string' ? o : (o as Record<string, unknown>)?.value ?? (o as Record<string, unknown>)?.name ?? (o as Record<string, unknown>)?.label))
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
      if (vals.length) out[id] = vals;
    }),
  );
  return out;
}

async function call<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new NiftyError(res.status, `Nifty ${method} ${path.split('?')[0]} answered ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface NiftyTaskFull extends NiftyTask {
  description: string | null;
  completed: boolean;
  subtasks?: { id: string; identifier?: string; name: string; completed: boolean }[];
  checklists?: { id: string; name: string; items?: { id: string; name: string; completed: boolean }[] }[];
}

export interface NiftyMessage {
  id: string;
  createdAt: string;
  text: string;
  authorId: string | null;
  author?: { id: string; name: string } | null;
  subtype?: string | null;
}

export const getTask = (id: string) =>
  call<NiftyTaskFull>('GET', `/tasks/${encodeURIComponent(id)}?expand=assignees,labels,customFields,subtasks,checklists`);

export async function getComments(taskId: string): Promise<NiftyMessage[]> {
  const qs = new URLSearchParams({ 'taskId[eq]': taskId, sort: 'createdAt', expand: 'author', limit: '200' });
  const body = await call<{ data: NiftyMessage[] }>('GET', `/messages?${qs}`);
  return body.data;
}

export const addComment = (taskId: string, text: string) => call<NiftyMessage>('POST', '/messages', { taskId, text });

export const patchTask = (id: string, body: Record<string, unknown>) =>
  call<NiftyTaskFull>('PATCH', `/tasks/${encodeURIComponent(id)}`, body);
