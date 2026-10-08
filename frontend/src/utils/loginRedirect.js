// Where to go after signing in. Only same-app paths are honoured, so a crafted
// link cannot bounce a fresh login to another site ("//evil.example").
export function getSafeRedirectPath(from) {
  const path = typeof from === 'string'
    ? from
    : `${from?.pathname || ''}${from?.search || ''}${from?.hash || ''}`;
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return '/';
  if (path === '/login' || path.startsWith('/login?')) return '/';
  return path;
}
