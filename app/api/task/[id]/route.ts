import { BadInput, checkEditKey, errorResponse, refreshDashboard, toNiftyBody, validTaskId, type EditPatch } from '@/lib/edit';
import { fixturePath, getComments, getTask, patchTask, projectId } from '@/lib/nifty';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export interface TaskDetail {
  description: string;
  subtasks: { name: string; done: boolean; key?: string }[];
  checklists: { name: string; items: { name: string; done: boolean }[] }[];
  comments: { id: string; author: string; at: string; text: string; system: boolean }[];
  commentsError?: string;
  preview?: boolean;
}

/** Task description, subtasks, checklists and comments for the detail panel. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!validTaskId(id)) return Response.json({ error: 'Bad task id' }, { status: 400 });

  const fixture = fixturePath();
  if (fixture) {
    const { readFile } = await import('node:fs/promises');
    const f = JSON.parse(await readFile(fixture, 'utf8')) as { open: { id: string; description?: string }[]; done: { id: string; description?: string }[] };
    const t = [...f.open, ...f.done].find((x) => x.id === id);
    const out: TaskDetail = {
      description: t?.description || '',
      subtasks: [],
      checklists: [],
      comments: [{ id: 'x', author: 'Local preview', at: new Date().toISOString(), text: 'Comments load from Nifty on the live site.', system: true }],
      preview: true,
    };
    return Response.json(out);
  }

  try {
    const [task, comments] = await Promise.all([
      getTask(id),
      getComments(id).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
    ]);
    // Only tasks from the LEDGERS.cloud project, even though the token can see the whole workspace.
    if (task.projectId && task.projectId !== projectId()) return Response.json({ error: 'Not a LEDGERS.cloud task' }, { status: 404 });
    const out: TaskDetail = {
      description: task.description || '',
      subtasks: (task.subtasks || []).map((s) => ({ name: s.name, done: !!s.completed, key: s.identifier })),
      checklists: (task.checklists || []).map((c) => ({
        name: c.name,
        items: (c.items || []).map((i) => ({ name: i.name, done: !!i.completed })),
      })),
      comments: Array.isArray(comments)
        ? comments
            .filter((m) => m.text)
            .map((m) => ({ id: m.id, author: m.author?.name || 'Someone', at: m.createdAt, text: m.text, system: !!m.subtype }))
        : [],
      commentsError: Array.isArray(comments) ? undefined : 'Comments could not be loaded. The Nifty token may need the messages:read scope.',
    };
    return Response.json(out);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Updates one task. Requires the edit key. */
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = checkEditKey(req);
  if (denied) return denied;
  const { id } = await params;
  if (!validTaskId(id)) return Response.json({ error: 'Bad task id' }, { status: 400 });
  try {
    const patch = (await req.json().catch(() => {
      throw new BadInput('Body must be JSON');
    })) as EditPatch;
    const body = toNiftyBody(patch);
    if (fixturePath()) return Response.json({ ok: true, preview: true, sent: body });
    const current = await getTask(id);
    if (current.projectId && current.projectId !== projectId()) return Response.json({ error: 'Not a LEDGERS.cloud task' }, { status: 404 });
    await patchTask(id, body);
    refreshDashboard();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
