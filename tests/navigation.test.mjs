import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppPage } from '../js/modules/navigation.js';

test('keeps the selected app page during state and sync rerenders', () => {
  for (const currentPage of ['home', 'focus', 'ai', 'tasks', 'learn', 'notes', 'profile']) {
    assert.equal(resolveAppPage({
      authenticated: true,
      profileComplete: true,
      currentPage
    }), currentPage);
  }
});

test('routes signed-out and incomplete profiles to their setup screens', () => {
  assert.equal(resolveAppPage({ authenticated: false, profileComplete: true, currentPage: 'tasks' }), 'auth-landing');
  assert.equal(resolveAppPage({ authenticated: true, profileComplete: false, currentPage: 'ai' }), 'profile-setup');
});

test('preserves profile editing but defaults new signed-in sessions to the dashboard', () => {
  assert.equal(resolveAppPage({ authenticated: true, profileComplete: true, currentPage: 'profile-setup' }), 'profile-setup');
  assert.equal(resolveAppPage({ authenticated: true, profileComplete: true, currentPage: 'auth-landing' }), 'home');
  assert.equal(resolveAppPage({ authenticated: true, profileComplete: true, currentPage: null }), 'home');
});
