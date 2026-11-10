# LEDGERS.cloud Pulse

A one-page dashboard over the **LEDGERS.cloud** project in Nifty, so nobody has to scroll the full task list.

- **Filters** — person, module owner, stage, status, task type, priority, country, planned month and search. They narrow every view and are kept in the link.
- **Overview** — open work by stage, by module owner (from the list name), and tasks finished per week.
- **All tasks** — open and finished tasks. Click one to open its panel: details, description, subtasks, checklists and comments. Edit it there, or tick several and use **Bulk edit**. CSV download.
- **People** — everyone with work: open, active, overdue, finished this week, last activity, and the task they last touched.
- **Needs attention** — open tasks that are overdue or untouched for 30+ days.
- **SOP health** — open tasks checked against *Nifty Process SOP v2.0*: SOP statuses only, list naming template, exactly 2 assignees with the Team Lead among them, and the §8.6 mandatory fields (start/due date, Planned Month, Planned/Unplanned, Task Type, Developer, Tester, Team Lead, priority) for every task past Pipeline. Estimate is not checked: the developer adds it.
- **New task** — create a task in the SOP format. The task type (Bug, Enhancement, Feature, Tech debt) and priority are suggested from what you type, the description template follows the type, the list is suggested from the title and picked as Country → App → Module, the Team Lead comes from the list, the Tester from the Team Lead, the two assignees are set per §8.4, and similar open tasks are shown first (§7). A task starting in 02 To Do needs every §8.6 field.
- **Morning email** — every weekday around 9:30 IST: what became overdue, what is due today, who finished what, and each owner's numbers.

Data is read from Nifty's v3 API on the server and cached for 5 minutes (a save refreshes it at once). The page reloads itself every 30 minutes. The token never reaches the browser.

## Setup

1. In Nifty: **Settings → API Tokens → New token** with these scopes:
   - to view: `tasks:read`, `statuses:read`, `lists:read`, `members:read`, `custom-fields:read`, `messages:read`
   - to edit and comment: `tasks:write`, `messages:write`
2. Copy `.env.example` to `.env.local` and fill it in.
3. Run it:

   ```bash
   npm install
   npm run dev
   ```

   Then open http://localhost:3000.

## Deploy on Vercel

1. Import the GitHub repository in Vercel (framework: Next.js).
2. Under **Settings → Environment Variables**, add the values from `.env.example`.
3. Deploy. `vercel.json` schedules the morning email (`0 4 * * 1-5` UTC = 9:30 IST, weekdays). On the Hobby plan Vercel may run it any time within that hour.

## Editing

Edits and comments go to Nifty through the server with `NIFTY_TOKEN`, so Nifty shows them as made by the token's owner. They need the `EDIT_KEY`: the first time you save, the dashboard asks for it and remembers it in that browser. Without `EDIT_KEY` set, the dashboard is read-only. Nifty has no bulk endpoint, so bulk edit updates tasks one by one, three at a time.

New tasks need the same edit key and the `tasks:write` scope. The type suggestion is a set of word rules in `lib/newtask.ts` (no AI service, nothing leaves the server); on the team's own labelled tasks it agrees about 4 times in 5, so check it before creating.

What can be edited: assignees, Team Lead, Developer, Tester, start and due dates, estimate, priority, task type, planned month, planned/unplanned. Status and completing tasks are left to Nifty.

## Morning email

Sent through [Resend](https://resend.com). Set `RESEND_API_KEY`, `DIGEST_TO` and `CRON_SECRET`. Until you verify your own domain in Resend, leave `DIGEST_FROM` empty: Resend's test sender then delivers only to the address you signed up with. The dashboard footer has **Preview** and **Send now** (they use the edit key).

## Who can see it

There is no login: anyone with the link can see task titles, descriptions, comments, people and due dates. Search engines are told not to index it. Changes need the edit key.

## Changing the rules

- Status names, the list-name pattern, stages and the "stuck" threshold: `lib/config.ts`.
- Custom field ids (Team Lead, Developer, Tester, …): `CUSTOM_FIELDS` in `lib/config.ts`.
- The checks themselves: `buildDashboard` in `lib/compute.ts`.
- The email: `lib/digest.ts`.
- Each Team Lead's fixed tester: `TESTER_BY_LEAD` in `lib/config.ts`. SOP apps and countries: `SOP_APPS`, `COUNTRIES`.
- Type, priority and list suggestions: `lib/newtask.ts`. The list suggestion learns from tasks already filed in each list and puts the right list in its top 3 about two times in three.
