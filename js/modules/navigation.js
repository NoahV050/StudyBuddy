const APP_PAGES = new Set(['home', 'focus', 'ai', 'tasks', 'learn', 'notes', 'profile']);

export function resolveAppPage({ authenticated, profileComplete, currentPage }) {
  if (!authenticated) return 'auth-landing';
  if (!profileComplete) return 'profile-setup';
  if (APP_PAGES.has(currentPage) || currentPage === 'profile-setup') return currentPage;
  return 'home';
}
