import type { DestinationId } from './config';

export type Route =
  | { view: 'world' }
  | { view: 'portfolio'; slug?: string }
  | { view: 'blog'; slug?: string }
  | { view: 'tutorials'; slug?: string }
  | { view: 'youtube' }
  | { view: 'patreon' };

export function parsePath(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);

  if (parts.length === 0) return { view: 'world' };

  const [head, slug] = parts;
  if (head === 'portfolio') return { view: 'portfolio', slug };
  if (head === 'blog') return { view: 'blog', slug };
  if (head === 'tutorials') return { view: 'tutorials', slug };
  if (head === 'youtube') return { view: 'youtube' };
  if (head === 'patreon') return { view: 'patreon' };

  return { view: 'world' };
}

export function pathFor(route: Route): string {
  switch (route.view) {
    case 'world':
      return '/';
    case 'portfolio':
      return route.slug ? `/portfolio/${route.slug}` : '/portfolio';
    case 'blog':
      return route.slug ? `/blog/${route.slug}` : '/blog';
    case 'tutorials':
      return route.slug ? `/tutorials/${route.slug}` : '/tutorials';
    case 'youtube':
      return '/youtube';
    case 'patreon':
      return '/patreon';
  }
}

export function routeFromDestination(id: DestinationId): Route {
  return { view: id };
}

export function destinationFromRoute(route: Route): DestinationId | null {
  if (route.view === 'world') return null;
  return route.view;
}
