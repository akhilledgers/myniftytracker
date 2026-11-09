import { timingSafeEqual } from 'node:crypto';
import { buildDashboard, localDate, sinceDate } from '@/lib/compute';
import { buildDigest, sendEmail } from '@/lib/digest';
import { loadNifty } from '@/lib/nifty';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>". The owner can also call it with the edit key. */
function allowed(req: Request): boolean {
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET;
  if (cron && same(auth, `Bearer ${cron}`)) return true;
  const edit = process.env.EDIT_KEY;
  const key = req.headers.get('x-edit-key') || '';
  return !!edit && !!key && same(key, edit);
}

function dashboardUrl(req: Request): string {
  if (process.env.DASHBOARD_URL) return process.env.DASHBOARD_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(req.url).origin;
}

async function run(req: Request, preview: boolean) {
  if (!allowed(req)) return Response.json({ error: 'Not allowed' }, { status: 401 });
  const now = new Date();
  const data = buildDashboard(await loadNifty(sinceDate(localDate(now))), now);
  const digest = buildDigest(data, dashboardUrl(req));
  if (preview) return new Response(digest.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  const to = (process.env.DIGEST_TO || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!to.length) return Response.json({ error: 'DIGEST_TO is not set' }, { status: 500 });
  try {
    const id = await sendEmail(digest, to);
    return Response.json({ ok: true, id, to: to.length, subject: digest.subject });
  } catch (err) {
    console.error(err);
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

/** Cron entry point: sends the digest. */
export async function GET(req: Request) {
  return run(req, false);
}

/** From the dashboard: { preview: true } returns the email as HTML, otherwise sends it now. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { preview?: boolean };
  return run(req, !!body.preview);
}
