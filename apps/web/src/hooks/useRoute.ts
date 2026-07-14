import { useEffect, useState } from 'react';

export type Route = 'landing' | 'workbench' | 'dashboard';

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '');
  // #/app* is the workbench, #/dashboard* the dashboard; everything else (incl. bare "#/" and "") is the landing.
  if (path.startsWith('/app')) return 'workbench';
  if (path.startsWith('/dashboard')) return 'dashboard';
  return 'landing';
}

/** Minimal hash-based router — no dependency, no history library. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: Route): void {
  window.location.hash = route === 'workbench' ? '/app' : route === 'dashboard' ? '/dashboard' : '/';
}
