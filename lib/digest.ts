// The weekday morning email: what changed since the last working day, built from the same rows as the dashboard.
import type { DashboardData, TaskRow } from './compute';
import { isStuck, shortDate } from './compute';

const DAY = 864e5;
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Monday looks back to Friday; other days to yesterday. */
export function lastWorkingDay(today: string): string {
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  return addDays(today, dow === 1 ? -3 : dow === 0 ? -2 : -1);
}

export interface Digest {
  subject: string;
  html: string;
  text: string;
}

export function buildDigest(data: DashboardData, dashboardUrl: string): Digest {
  const { today, rows } = data;
  const since = lastWorkingDay(today);
  const open = rows.filter((r) => !r.done);
  const finished = rows.filter((r) => r.done && r.doneDay && r.doneDay >= since && r.doneDay < today);
  const newlyLate = open.filter((r) => r.due && r.due >= since && r.due < today);
  const dueToday = open.filter((r) => r.due === today);
  const week = addDays(today, 7);
  const dueWeek = open.filter((r) => r.due && r.due > today && r.due <= week);
  const overdue = open.filter((r) => r.late > 0).sort((a, b) => b.late - a.late);
  const stuck = open.filter(isStuck);
  const sopClean = open.filter((r) => !r.issues.length).length;

  const leads = new Map<string, { owner: string; open: number; overdue: number; fix: number }>();
  for (const r of open) {
    const l = leads.get(r.owner) || { owner: r.owner, open: 0, overdue: 0, fix: 0 };
    l.open++;
    if (r.late) l.overdue++;
    if (r.issues.length) l.fix++;
    leads.set(r.owner, l);
  }
  const leadRows = [...leads.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  const byPerson = new Map<string, number>();
  for (const r of finished) for (const p of r.who) if (p !== 'Unassigned') byPerson.set(p, (byPerson.get(p) || 0) + 1);
  const finishers = [...byPerson].sort((a, b) => b[1] - a[1]);

  const sinceLabel = since === addDays(today, -1) ? 'yesterday' : `since ${shortDate(since)}`;
  const dayLabel = new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const subject = `LEDGERS Pulse · ${dayLabel}: ${overdue.length} overdue, ${newlyLate.length} newly late, ${finished.length} finished`;

  // ---------- HTML (inline styles: email clients ignore stylesheets) ----------
  const link = (r: TaskRow) => `${dashboardUrl}/?task=${encodeURIComponent(r.id)}#tasks`;
  const C = { fg: '#171a21', muted: '#5f6673', line: '#e2e4e9', bad: '#c2362b', ok: '#2d7a4c', accent: '#2c5bd6', bg: '#f4f5f7' };
  const td = `padding:6px 8px;border-bottom:1px solid ${C.line};font-size:13px;vertical-align:top;`;
  const th = `padding:6px 8px;border-bottom:1px solid ${C.line};font-size:12px;color:${C.muted};text-align:left;font-weight:500;`;
  const taskTable = (list: TaskRow[], extra: (r: TaskRow) => string, extraHead: string, max = 10) =>
    list.length
      ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <tr><th style="${th}">Task</th><th style="${th}">Title</th><th style="${th}">People</th><th style="${th}">${extraHead}</th></tr>
          ${list
            .slice(0, max)
            .map(
              (r) => `<tr>
                <td style="${td}white-space:nowrap;"><a href="${esc(link(r))}" style="color:${C.accent};font-family:monospace;">${esc(r.key)}</a></td>
                <td style="${td}">${esc(r.name)}</td>
                <td style="${td}color:${C.muted};">${esc(r.assignees)}</td>
                <td style="${td}white-space:nowrap;">${extra(r)}</td>
              </tr>`,
            )
            .join('')}
        </table>${list.length > max ? `<p style="font-size:12px;color:${C.muted};margin:6px 0 0;">…and ${list.length - max} more on the dashboard.</p>` : ''}`
      : `<p style="font-size:13px;color:${C.muted};margin:0;">None.</p>`;
  const section = (title: string, body: string) =>
    `<h2 style="font-size:15px;margin:24px 0 8px;color:${C.fg};">${title}</h2>${body}`;
  const stat = (label: string, n: number, bad = false) =>
    `<td style="padding:10px 12px;border:1px solid ${C.line};border-radius:6px;background:#fff;">
       <div style="font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:.05em;">${label}</div>
       <div style="font-size:24px;font-family:monospace;color:${bad && n ? C.bad : C.fg};">${n}</div></td>`;

  const html = `<!doctype html><html><body style="margin:0;background:${C.bg};font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${C.fg};">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px;">
    <h1 style="font-size:20px;margin:0 0 4px;">LEDGERS.cloud Pulse</h1>
    <p style="margin:0 0 16px;color:${C.muted};font-size:13px;">${esc(dayLabel)} · changes ${esc(sinceLabel)}</p>
    <table cellpadding="0" cellspacing="6" style="width:100%;border-collapse:separate;"><tr>
      ${stat('Open', open.length)}${stat('Overdue', overdue.length, true)}${stat('Newly late', newlyLate.length, true)}${stat(`Finished ${since === addDays(today, -1) ? 'yesterday' : 'since ' + shortDate(since)}`, finished.length)}
    </tr></table>
    <p style="font-size:13px;color:${C.muted};margin:10px 0 0;">${plural(dueToday.length, 'task')} due today, ${dueWeek.length} more in the next 7 days. ${stuck.length} stuck for 30+ days. ${sopClean} of ${open.length} open tasks follow the SOP.</p>
    ${section(`Became overdue ${esc(sinceLabel)}`, taskTable(newlyLate, (r) => `<span style="color:${C.bad};">${esc(r.dueLabel)}</span>`, 'Due'))}
    ${section('Due today', taskTable(dueToday, (r) => esc(r.owner), 'Owner'))}
    ${section(
      `Finished ${esc(sinceLabel)}`,
      finishers.length
        ? `<p style="font-size:13px;margin:0 0 8px;">${finishers.map(([p, n]) => `<b>${esc(p)}</b> ${n}`).join(' · ')}</p>` +
            taskTable(finished, (r) => `<span style="color:${C.ok};">${esc(shortDate(r.doneDay))}</span>`, 'Finished', 8)
        : `<p style="font-size:13px;color:${C.muted};margin:0;">Nothing finished.</p>`,
    )}
    ${section(
      'By module owner',
      `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        <tr><th style="${th}">Owner</th><th style="${th}text-align:right;">Open</th><th style="${th}text-align:right;">Overdue</th><th style="${th}text-align:right;">Need SOP fixes</th></tr>
        ${leadRows
          .map(
            (l) => `<tr><td style="${td}">${esc(l.owner)}</td><td style="${td}text-align:right;">${l.open}</td>
              <td style="${td}text-align:right;color:${l.overdue ? C.bad : C.fg};">${l.overdue}</td><td style="${td}text-align:right;">${l.fix}</td></tr>`,
          )
          .join('')}
      </table>`,
    )}
    ${section('Most overdue', taskTable(overdue, (r) => `<span style="color:${C.bad};">${esc(r.dueLabel)}</span>`, 'Due', 10))}
    <p style="margin:28px 0 0;"><a href="${esc(dashboardUrl)}" style="display:inline-block;background:${C.accent};color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:14px;">Open the dashboard</a></p>
    <p style="font-size:11px;color:${C.muted};margin:16px 0 0;">Sent every weekday morning from Nifty data. Overdue = open and past due date.</p>
  </div></body></html>`;

  const text = [
    `LEDGERS.cloud Pulse — ${dayLabel}`,
    `${open.length} open · ${overdue.length} overdue · ${newlyLate.length} newly late · ${finished.length} finished ${sinceLabel}`,
    '',
    `Became overdue ${sinceLabel}:`,
    ...(newlyLate.length ? newlyLate.slice(0, 10).map((r) => `- ${r.key} ${r.name} (${r.assignees})`) : ['- none']),
    '',
    'Due today:',
    ...(dueToday.length ? dueToday.slice(0, 10).map((r) => `- ${r.key} ${r.name} (${r.assignees})`) : ['- none']),
    '',
    `Dashboard: ${dashboardUrl}`,
  ].join('\n');

  return { subject, html, text };
}

/** Sends through Resend (https://resend.com). */
export async function sendEmail(d: Digest, to: string[]): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const from = process.env.DIGEST_FROM || 'LEDGERS Pulse <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: d.subject, html: d.html, text: d.text }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${body.message || 'unknown error'}`);
  return body.id || '';
}
