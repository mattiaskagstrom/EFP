export type AppRole = 'admin' | 'user';

export type AppRoute =
  | { kind: 'role-picker' }
  | { kind: 'investigation-list'; role: AppRole }
  | { kind: 'investigation'; role: AppRole; id: string }
  | { kind: 'not-found' };

const cleanPath = (pathname: string) => {
  const path = pathname.replace(/\/+$/, '');
  return path || '/';
};

export function parseRoute(pathname: string): AppRoute {
  const path = cleanPath(pathname);
  if (path === '/') return { kind: 'role-picker' };
  if (path === '/admin') return { kind: 'investigation-list', role: 'admin' };
  if (path === '/user') return { kind: 'investigation-list', role: 'user' };

  const match = path.match(/^\/(admin|user)\/investigations\/([^/]+)$/);
  if (match) return { kind: 'investigation', role: match[1] as AppRole, id: decodeURIComponent(match[2]) };
  return { kind: 'not-found' };
}

export function investigationPath(role: AppRole, id: string) {
  return `/${role}/investigations/${encodeURIComponent(id)}`;
}

export function navigateTo(path: string, replace = false) {
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
