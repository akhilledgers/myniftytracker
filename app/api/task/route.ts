import { BadInput, checkEditKey, errorResponse, refreshDashboard, toCreateBody } from '@/lib/edit';
import { createTask, fixturePath, getList, loadNifty, projectId } from '@/lib/nifty';
import type { NewTaskInput } from '@/lib/newtask';

export const dynamic = 'force-dynamic';

/** Creates a task in LEDGERS.cloud, checked against the SOP. Requires the edit key. */
export async function POST(req: Request) {
  const denied = checkEditKey(req);
  if (denied) return denied;
  try {
    const input = (await req.json().catch(() => {
      throw new BadInput('Body must be JSON');
    })) as NewTaskInput & { requestId?: string };
    const project = projectId();
    const { statuses } = await loadNifty(new Date().toISOString().slice(0, 10));
    const statusIds = {
      pipeline: statuses.find((s) => s.name === '01 Pipeline')?.id || '',
      todo: statuses.find((s) => s.name === '02 To Do')?.id || '',
    };
    const body = toCreateBody(input, project, statusIds);
    if (fixturePath()) return Response.json({ ok: true, preview: true, sent: body });

    // The list must belong to LEDGERS.cloud, even though the token can see the whole workspace.
    const list = await getList(String(body.listId));
    if (list.projectId && list.projectId !== project) throw new BadInput('That list is not in LEDGERS.cloud');

    const key = typeof input.requestId === 'string' && /^[A-Za-z0-9-]{8,100}$/.test(input.requestId) ? input.requestId : undefined;
    const task = await createTask(body, key);
    refreshDashboard();
    return Response.json({ ok: true, id: task.id, key: task.identifier, url: task.url });
  } catch (err) {
    return errorResponse(err);
  }
}
