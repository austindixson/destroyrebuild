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

const VIEW_PATH: Record<Route['view'], string> = {
  world: '/',
  portfolio: '/portfolio',
  blog: '/blog',
  tutorials: '/tutorials',
  youtube: '/youtube',
  patreon: '/patreon',
};

function routeSlug(route: Route): string | undefined {
  if (route.view === 'portfolio') return route.slug;
  if (route.view === 'blog') return route.slug;
  if (route.view === 'tutorials') return route.slug;
  return undefined;
}

export function pathFor(route: Route): string {
  const root = VIEW_PATH[route.view];
  const slug = routeSlug(route);
  if (!slug) return root;
  return `${root}/${slug}`;
}

export function routeFromDestination(id: DestinationId): Route {
  return { view: id };
}

export function destinationFromRoute(route: Route): DestinationId | null {
  if (route.view === 'world') return null;
  return route.view;
}
