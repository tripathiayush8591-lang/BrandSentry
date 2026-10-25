import type { To } from 'react-router-dom';

export function demoDestination(to: To, demo: boolean): To {
  if (!demo) return to;
  if (typeof to === 'string') return to.startsWith('/') && !to.startsWith('/preview') && !to.startsWith('/login') ? `/preview${to === '/' ? '' : to}` : to;
  return { ...to, pathname: to.pathname ? demoDestination(to.pathname, true) as string : to.pathname };
}
