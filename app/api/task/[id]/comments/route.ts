import { checkEditKey, errorResponse, validTaskId } from '@/lib/edit';
import { addComment, fixturePath, getTask, projectId } from '@/lib/nifty';

export const dynamic = 'force-dynamic';

/** Adds a comment to a task in Nifty. Requires the edit key. Comments are posted as the owner of the Nifty token. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkEditKey(req);
  if (denied) return denied;
  const { id } = await params;
  if (!validTaskId(id)) return Response.json({ error: 'Bad task id' }, { status: 400 });
  try {
    const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof text !== 'string' || !text.trim() || text.length > 10000) return Response.json({ error: 'Write a comment first.' }, { status: 400 });
    if (fixturePath()) return Response.json({ ok: true, preview: true });
    const task = await getTask(id);
    if (task.projectId && task.projectId !== projectId()) return Response.json({ error: 'Not a LEDGERS.cloud task' }, { status: 404 });
    const m = await addComment(id, text.trim());
    return Response.json({ ok: true, id: m.id });
  } catch (err) {
    return errorResponse(err);
  }
}
