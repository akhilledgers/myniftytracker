// Reads the LEDGERS.cloud project from Nifty's v3 REST API.
// Docs: https://developers.niftypm.com/docs/api/v3

const BASE = 'https://openapi.niftypm.com/api/v3';
const REVALIDATE_SECONDS = 300;

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
      next: { revalidate: REVALIDATE_SECONDS },
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
      expand: 'assignees',
    }),
    getAll<NiftyNamed>('/statuses', { projectId: project }),
    getAll<NiftyNamed>('/lists', { projectId: project }),
  ]);
  return { open, done, statuses, lists };
}
