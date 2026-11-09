import { buildDashboard, localDate, sinceDate } from '@/lib/compute';
import { NiftyError, fixturePath, loadNifty } from '@/lib/nifty';
import { Dashboard } from './Dashboard';

// Nifty is read again at most every 5 minutes; everyone in between shares the result.
export const revalidate = 300;

export default async function Page() {
  if (!process.env.NIFTY_TOKEN && !fixturePath()) {
    return (
      <main className="notice">
        <h1>Connect Nifty</h1>
        <p>
          This dashboard needs a Nifty API token. In Nifty, go to <b>Settings → API Tokens → New token</b> with the
          read scopes for tasks, statuses and lists. Then add it as <code>NIFTY_TOKEN</code> in Vercel (Project →
          Settings → Environment Variables), or in <code>.env.local</code> when running on your computer.
        </p>
      </main>
    );
  }

  try {
    const now = new Date();
    const raw = await loadNifty(sinceDate(localDate(now)));
    return <Dashboard data={buildDashboard(raw, now)} />;
  } catch (err) {
    const status = err instanceof NiftyError ? err.status : 0;
    const hint =
      status === 401
        ? 'Nifty rejected the token. It may be mistyped, revoked or for another workspace. Create a new one and update NIFTY_TOKEN.'
        : status === 403
          ? 'The token is missing a scope. It needs read access to tasks, statuses and lists.'
          : status === 429
            ? 'Nifty is rate-limiting requests. Try again in a few minutes.'
            : 'Nifty could not be reached. Try again in a minute.';
    console.error(err);
    return (
      <main className="notice">
        <h1>Couldn&apos;t load Nifty</h1>
        <p>{hint}</p>
      </main>
    );
  }
}
