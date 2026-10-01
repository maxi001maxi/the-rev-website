export function adminReturnTo(value, origin) {
  if (typeof value !== 'string' || !value.startsWith('/admin/') || value.startsWith('//') || value.includes('\\')) {
    return '/admin/';
  }
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin || !target.pathname.startsWith('/admin/') || target.pathname === '/admin/login' || target.pathname.startsWith('/admin/login/')) {
      return '/admin/';
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/admin/';
  }
}

export function loginUrlFor(location) {
  const destination = adminReturnTo(`${location.pathname}${location.search}${location.hash}`, location.origin);
  return `/admin/login/?next=${encodeURIComponent(destination)}`;
}
