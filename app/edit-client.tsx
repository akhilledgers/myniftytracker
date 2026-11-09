'use client';

// Shared bits for editing tasks from the browser: the edit key, the request helper and the form fields.
import { useState } from 'react';
import type { EditOptions } from '@/lib/compute';
import type { EditPatch } from '@/lib/edit';

export type { EditPatch };

const STORE = 'editKey';
export function getKey(): string {
  try {
    return localStorage.getItem(STORE) || '';
  } catch {
    return '';
  }
}
export function setKey(k: string) {
  try {
    if (k) localStorage.setItem(STORE, k);
    else localStorage.removeItem(STORE);
  } catch {}
}

export class KeyProblem extends Error {}

export async function send<T = { ok: boolean; preview?: boolean }>(url: string, method: 'PATCH' | 'POST', body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-edit-key': getKey() },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 || res.status === 503) throw new KeyProblem(j.error || 'Edit key needed.');
  if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
  return j as T;
}

/** Asks for the edit key once per browser. */
export function KeyBox({ error, onSet }: { error?: string; onSet: () => void }) {
  const [v, setV] = useState('');
  return (
    <form
      className="keybox"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        setKey(v.trim());
        onSet();
      }}
    >
      <label>
        <span>{error || 'Enter the edit key to make changes. It is remembered in this browser.'}</span>
        <input type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder="Edit key" aria-label="Edit key" />
      </label>
      <button className="btn primary" type="submit">
        Use key
      </button>
    </form>
  );
}

export function PeoplePicker({
  value,
  onChange,
  members,
  label,
  single,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  members: EditOptions['members'];
  label: string;
  single?: boolean;
}) {
  const name = (id: string) => members.find((m) => m.id === id)?.name || 'Unknown person';
  const rest = members.filter((m) => !value.includes(m.id));
  return (
    <div className="people-pick">
      {value.map((id) => (
        <span key={id} className="chip person">
          {name(id)}
          <button type="button" aria-label={`Remove ${name(id)}`} onClick={() => onChange(value.filter((x) => x !== id))}>
            ×
          </button>
        </span>
      ))}
      {(!single || value.length === 0) && (
        <select
          aria-label={`Add to ${label}`}
          value=""
          onChange={(e) => e.target.value && onChange(single ? [e.target.value] : [...value, e.target.value])}
        >
          <option value="">{value.length ? '+ Add' : 'Pick a person'}</option>
          {rest.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function Choice({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not set</option>
      {all.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export const toHours = (min: number | null) => (min ? String(Math.round((min / 60) * 100) / 100) : '');
export function toMinutes(h: string): number | null {
  if (!h.trim()) return null;
  const n = Number(h);
  if (!Number.isFinite(n) || n < 0) throw new Error('Estimate must be a number of hours');
  return Math.round(n * 60);
}
