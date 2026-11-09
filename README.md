# LEDGERS.cloud Pulse

A one-page dashboard over the **LEDGERS.cloud** project in Nifty, so nobody has to scroll the full task list.

- **Overview** — open work by stage, by module owner (from the list name), and tasks finished per week.
- **People** — everyone with work: open, active, overdue, finished this week, last activity, and the task they last touched. Click a person for their task list.
- **Needs attention** — open tasks that are overdue or untouched for 30+ days.
- **SOP health** — open tasks checked against *Nifty Process SOP v2.0*: SOP statuses only, list naming template, exactly 2 assignees with the Team Lead among them, and the §8.6 mandatory fields (start/due date, estimate, Planned Month, Planned/Unplanned, Task Type, Developer, Tester, Team Lead, priority) for every task past Pipeline.

Data is read live from Nifty's v3 API on the server and cached for 5 minutes. The token never reaches the browser.

## Setup

1. In Nifty: **Settings → API Tokens → New token**, with read scopes for tasks, statuses and lists. Copy it (it is shown once).
2. Copy `.env.example` to `.env.local` and paste the token as `NIFTY_TOKEN`.
3. Run it:

   ```bash
   npm install
   npm run dev
   ```

   Then open http://localhost:3000.

## Deploy on Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project**, import the repository (framework: Next.js, no other settings needed).
3. Under **Settings → Environment Variables**, add `NIFTY_TOKEN` (and `NIFTY_PROJECT_ID` only if it is not `yb6vQ7M!g0`).
4. Deploy.

The site has no login: anyone with the link can see task titles, people and due dates. Search engines are told not to index it.

## Changing the rules

- Status names, the list-name pattern, stages and the "stuck" threshold: `lib/config.ts`.
- Custom field ids (Team Lead, Developer, Tester, …): `CUSTOM_FIELDS` in `lib/config.ts`.
- The checks themselves: `buildDashboard` in `lib/compute.ts`.
