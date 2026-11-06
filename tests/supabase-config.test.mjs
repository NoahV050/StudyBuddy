import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const migration = await readFile(
  new URL('../supabase/migrations/20261106110000_create_profiles.sql', import.meta.url),
  'utf8'
);
const policy = vercel.headers
  .flatMap(entry => entry.headers)
  .find(header => header.key === 'Content-Security-Policy')?.value || '';

test('allows the configured Supabase project in the deployed CSP', () => {
  const projectUrl = /url:\s*'(https:\/\/[^']+)'/.exec(config)?.[1];
  assert.ok(projectUrl, 'Supabase URL is configured');
  const origin = new URL(projectUrl).origin;
  assert.ok(policy.includes(`connect-src 'self' ${origin} wss://${new URL(projectUrl).host}`));
  assert.ok(!policy.includes('bhrguizhcuyqcsltflko.supabase.co'));
});

test('creates the profile table and limits policies to the owning user', () => {
  assert.match(migration, /create table if not exists public\.profiles/i);
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
  assert.match(migration, /state jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration, /alter table public\.profiles enable row level security/i);
  assert.equal((migration.match(/\(select auth\.uid\(\)\) = user_id/g) || []).length, 4);
});
