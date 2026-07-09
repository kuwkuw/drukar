import { useEffect, useState } from 'react';

export type Route = 'landing' | 'workbench';

function parse(hash: string): Route {
  // Anything under #/app is the workbench; everything else (incl. bare "#/" and "") is the landing.
  return hash.replace(/^#/, '').startsWith('/app') ? 'workbench' : 'landing';
}

/** Minimal hash-based router — no dependency, no history library. `#/` = landing, `#/app` = workbench. */
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
  window.location.hash = route === 'workbench' ? '/app' : '/';
}
