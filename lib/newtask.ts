// Rules for creating a task the SOP way (Nifty Process SOP v2.0, §5–§9).
// Pure functions with no server imports, so the form can run them as you type.

export type TaskKind = 'Bug' | 'Enhancement' | 'Feature' | 'Tech debt';
export const KINDS: TaskKind[] = ['Bug', 'Enhancement', 'Feature', 'Tech debt'];

// Words and phrases that point at each task type. Phrases in the title count double.
const SIGNALS: Record<TaskKind, [RegExp, number][]> = {
  Bug: [
    [/\bbugs?\b/, 3],
    [/\b(not|isn'?t|doesn'?t|does not|is not|are not|aren'?t|won'?t|didn'?t|did not)\s+(work|working|show|showing|load|loading|sav|open|display|appear|updat|sync|calculat|generat|reflect|allow|go|come|get|captur|fetch|trigger)/, 3],
    [/^\s*fix\b|\bfix (the |for )?(issue|bug|error)/, 3],
    [/\bshowing \w+ in .* but\b|\bbut (it )?(shows|showing)\b/, 2],
    [/\b(crash|crashes|crashing|broken|breaks|glitch|freez|exception)/, 3],
    [/\b(error|errors)\b/, 2],
    [/\b(fail|fails|failed|failing|failure)\b/, 2],
    [/\b(unable to|can'?t|cannot|could not|couldn'?t)\b/, 2],
    [/\b(wrong|incorrect|mismatch|mismatched|inaccurate|miscalculat)/, 2],
    [/\b(blank|empty) (page|screen)|\b(500|404|502|503)\b|\bstuck\b|\bhangs?\b|\btimeout|\btimes out/, 2],
    [/\bshowing (the )?(wrong|old|another|other|variant|duplicate)|\binstead of\b/, 2],
    [/\b(issue|issues|problem|typo|duplicate entr)/, 1],
  ],
  Enhancement: [
    [/\b(enhance|enhancement|improve|improvement|improving|better|optimi[sz]e|faster|speed up)/, 3],
    [/^\s*(add|need|needs|allow|show|display|validate|prefill|pre-fill|redirect|standardi[sz]e|include|update|change|modify|rename|restrict|hide|remove|sort|filter|fix the ui)\b/, 2],
    [/\b(change|changes|modify|modification|rename|revamp|redesign|rework|tweak|format update)\b/, 2],
    [/\badd(ing)? (a |an |the |new )?(column|field|filter|option|sort|button|export|search|toggle|validation|tooltip|label|setting|section)s?\b/, 2],
    [/\b(parity with|existing|current|also allow|extend|additional|more options|ux|ui change|v4)\b/, 1],
  ],
  Feature: [
    [/\b(new (module|app|product)|from scratch)\b/, 3],
    [/\b(connected banking|integrat(e|ion)|api setup|stack api|create (a |an |the )?(common |new )?apis?|gtm|events? tracking)\b/, 3],
    [/\b(connector|register|schedule|dashboard|workflow|(excel|pdf) download|enable\b.*\breports?)\b/, 2],
    [/\b(introduce|build|develop|launch)\b/, 1],
  ],
  'Tech debt': [
    [/\b(tech(nical)? debt|refactor|refactoring|clean ?up|code quality|dead code|remove unused)\b/, 3],
    [/\b(migrate|migration|deprecat|library|dependency|dependencies|security patch|npm|node version|framework)\b/, 2],
  ],
};

export interface KindGuess {
  kind: TaskKind | null;
  /** The words that decided it, to show next to the suggestion. */
  because: string[];
  sure: boolean;
}

/** Suggests Bug / Enhancement / Feature / Tech debt from the title and description. */
export function suggestKind(title: string, description: string): KindGuess {
  const t = ` ${title.toLowerCase()} `;
  const d = ` ${stripTemplate(description).toLowerCase()} `;
  const score: Record<TaskKind, number> = { Bug: 0, Enhancement: 0, Feature: 0, 'Tech debt': 0 };
  const hits: Record<TaskKind, string[]> = { Bug: [], Enhancement: [], Feature: [], 'Tech debt': [] };
  for (const kind of KINDS)
    for (const [re, w] of SIGNALS[kind]) {
      const g = new RegExp(re.source, 'g');
      const inTitle = t.match(g);
      const inDesc = d.match(g);
      // The title says what the task is; descriptions mention errors and features in passing, so they count for less.
      if (inTitle) score[kind] += w * 2 * inTitle.length;
      if (inDesc) score[kind] += w * 0.5 * Math.min(inDesc.length, 2);
      for (const m of [...(inTitle || []), ...(inDesc || [])]) if (hits[kind].length < 3 && !hits[kind].includes(m.trim())) hits[kind].push(m.trim());
    }
  const ranked = KINDS.slice().sort((a, b) => score[b] - score[a]);
  const [first, second] = ranked;
  if (score[first] < 2) {
    // Nothing stands out: most LEDGERS work is an addition to an existing module, so start from Enhancement.
    return title.trim().split(/\s+/).length >= 3 ? { kind: 'Enhancement', because: [], sure: false } : { kind: null, because: [], sure: false };
  }
  return { kind: first, because: hits[first], sure: score[first] >= 4 && score[first] >= score[second] * 1.5 };
}

const HIGH = /\b(crash|crashes|blocker|blocking|urgent|asap|production|prod\b|live (site|server|issue)|all (users|customers|businesses)|data loss|security|payment|cannot login|can'?t login|unable to login|gst filing|vat filing)/;
const LOW = /\b(typo|cosmetic|minor|alignment|spacing|colou?r|font|nice to have|low priority)\b/;

/** SOP §9: High / Medium / Low. Priority is comparative, so this only proposes a starting point. */
export function suggestPriority(title: string, description: string, kind: string): 'High' | 'Medium' | 'Low' {
  const s = `${title} ${stripTemplate(description)}`.toLowerCase();
  if (HIGH.test(s)) return 'High';
  if (LOW.test(s)) return 'Low';
  return kind === 'Bug' ? 'High' : 'Medium';
}

// SOP §8.6 #2: "Bugs: screenshots/videos. Features: required specifications."
export const TEMPLATES: Record<TaskKind, string> = {
  Bug: `## Problem
What is going wrong?

## Steps to reproduce
1.
2.

## Expected result


## Actual result


## Where
Environment (Dev / UAT / Live), business name, browser or app version.

## Screenshots / videos
Attach in Nifty or paste links here.`,
  Feature: `## Why
The business need and who asked for it.

## What to build
Required specifications.

## Acceptance criteria
- [ ]
- [ ]

## Out of scope
`,
  Enhancement: `## Current behaviour


## Proposed change


## Why
Who benefits and how.

## Acceptance criteria
- [ ]
`,
  'Tech debt': `## What
Code, library or service to change.

## Why now
Risk or cost of leaving it.

## Plan


## How we will know it is safe
Tests or checks.`,
};

/** True when the text is still one of the untouched templates (so switching type can swap it). */
export function isTemplate(text: string): boolean {
  const s = text.trim();
  return !s || KINDS.some((k) => TEMPLATES[k].trim() === s);
}

/** Template headings and hints don't say anything about the task, so leave them out of the guess. */
function stripTemplate(text: string): string {
  const lines = new Set(KINDS.flatMap((k) => TEMPLATES[k].split('\n').map((l) => l.trim())).filter(Boolean));
  return text
    .split('\n')
    .filter((l) => !lines.has(l.trim()))
    .join('\n');
}

/** SOP §5.2: <Country> - <Team Lead> - <App Name> - <Module Name>. */
export function parseList(name: string): { country: string; lead: string; app: string; module: string } {
  const [country = '', lead = '', app = '', ...rest] = name.split('-').map((p) => p.trim());
  return { country, lead, app, module: rest.join(' - ') };
}

/** The dropdown option that matches a short value, e.g. "High" → "High Priority", "Bug" → "Bug". */
export function pickOption(options: string[], want: string): string {
  const w = want.toLowerCase();
  return options.find((o) => o.toLowerCase() === w) || options.find((o) => o.toLowerCase().startsWith(w)) || '';
}

/** Planned Month option for a YYYY-MM-DD day, e.g. "2026 11" or "2026 11 November". */
export function monthOption(options: string[], day: string): string {
  const key = `${day.slice(0, 4)} ${day.slice(5, 7)}`;
  return options.find((o) => o === key) || options.find((o) => o.startsWith(key)) || '';
}

const STOP = new Set('a an the to of in on for and or is are be with from at by as not it this that when while into via new add'.split(' '));
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** SOP §7: look for an existing task before creating a new one. Share of the new title's words found in the old one. */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size < 2 || !y.size) return 0;
  let hit = 0;
  for (const w of x) if (y.has(w)) hit++;
  return hit / Math.max(x.size, Math.min(y.size, x.size + 2));
}

export interface NewTaskInput {
  name: string;
  description: string;
  listId: string;
  stage: 'pipeline' | 'todo';
  kind: string;
  priority: string;
  plannedMonth: string;
  planned: string;
  lead: string[];
  developer: string[];
  tester: string[];
  subscribers: string[];
  start: string;
  due: string;
  estimateMin: number | null;
  country: string;
  designSpec?: string;
  testCases?: string;
  testExecution?: string;
  dependencyId?: string;
}

/** SOP §8.4: exactly 2 assignees, the Team Lead and whoever is working on it now (the Developer when a task starts). */
export function sopAssignees(i: Pick<NewTaskInput, 'lead' | 'developer'>): string[] {
  return [...new Set([i.lead[0], i.developer[0]].filter(Boolean))];
}

/** What the SOP still needs before this task can be created. Pipeline tasks only need the basics (§8.6 applies outside 01 Pipeline). */
export function missingForSop(i: NewTaskInput): string[] {
  const miss: string[] = [];
  if (!i.name.trim()) miss.push('Task name');
  if (!i.listId) miss.push('List');
  if (!i.kind) miss.push('Task type');
  if (i.stage === 'pipeline') return miss;
  if (isTemplate(i.description) || i.description.trim().length < 20) miss.push('Description');
  if (!i.start) miss.push('Start date');
  if (!i.due) miss.push('Due date');
  if (i.start && i.due && i.due < i.start) miss.push('Due date after start');
  if (!i.estimateMin) miss.push('Estimate');
  if (!i.lead.length) miss.push('Team lead');
  if (!i.developer.length) miss.push('Developer');
  if (!i.tester.length) miss.push('Tester');
  if (!i.priority) miss.push('Priority');
  if (!i.plannedMonth) miss.push('Planned month');
  if (!i.planned) miss.push('Planned / Unplanned');
  return miss;
}

/** The description that goes to Nifty: what was written, plus the reference document links (§8.5). */
export function fullDescription(i: NewTaskInput): string {
  const body = isTemplate(i.description) ? '' : i.description.trim();
  const refs = [
    ['Design Spec', i.designSpec],
    ['Test Cases', i.testCases],
    ['Test Execution Doc', i.testExecution],
  ].filter(([, u]) => u && u.trim()) as [string, string][];
  if (!refs.length) return body;
  return `${body}${body ? '\n\n' : ''}## Reference documents\n${refs.map(([n, u]) => `- ${n}: ${u.trim()}`).join('\n')}`;
}
