const paths: Record<string, string> = {
  evaporator: `
    <rect x="8" y="22" width="48" height="20" rx="10" fill="currentColor" opacity=".2"/>
    <rect x="10" y="24" width="44" height="16" rx="8" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M18 32h28M22 28v8M32 28v8M42 28v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,
  condenser: `
    <rect x="8" y="20" width="48" height="24" rx="6" fill="currentColor" opacity=".2"/>
    <rect x="10" y="22" width="44" height="20" rx="5" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M18 28c4 6 8 6 12 0s8-6 12 0 8 6 12 0" stroke="currentColor" stroke-width="2" fill="none"/>
  `,
  compressor: `
    <circle cx="32" cy="32" r="16" fill="currentColor" opacity=".18"/>
    <circle cx="32" cy="32" r="14" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M32 18v28M18 32h28" stroke="currentColor" stroke-width="2" opacity=".5"/>
    <circle cx="32" cy="32" r="5" fill="currentColor"/>
    <path d="M40 22c6 4 8 10 6 16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  `,
  vsd: `
    <rect x="14" y="12" width="36" height="40" rx="4" fill="currentColor" opacity=".18"/>
    <rect x="16" y="14" width="32" height="36" rx="3" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <rect x="22" y="20" width="20" height="10" rx="2" fill="currentColor" opacity=".55"/>
    <path d="M24 38h16M24 44h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,
  optiview: `
    <rect x="10" y="14" width="44" height="36" rx="5" fill="currentColor" opacity=".18"/>
    <rect x="12" y="16" width="40" height="32" rx="4" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <rect x="18" y="22" width="28" height="16" rx="2" fill="currentColor" opacity=".45"/>
    <circle cx="22" cy="44" r="2" fill="currentColor"/><circle cx="32" cy="44" r="2" fill="currentColor"/><circle cx="42" cy="44" r="2" fill="currentColor"/>
  `,
  mbc: `
    <rect x="12" y="16" width="40" height="32" rx="4" fill="currentColor" opacity=".18"/>
    <rect x="14" y="18" width="36" height="28" rx="3" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <circle cx="32" cy="32" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
    <path d="M32 24v16M24 32h16" stroke="currentColor" stroke-width="2"/>
    <circle cx="32" cy="32" r="2.5" fill="currentColor"/>
  `,
  power: `
    <rect x="18" y="10" width="28" height="44" rx="4" fill="currentColor" opacity=".18"/>
    <rect x="20" y="12" width="24" height="40" rx="3" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M32 20v10l6 2-8 14v-10l-6-2z" fill="currentColor"/>
  `,
  water: `
    <path d="M18 20h28v10c0 10-6 18-14 22-8-4-14-12-14-22z" fill="currentColor" opacity=".2"/>
    <path d="M20 22h24v8c0 9-5.5 16-12 20-6.5-4-12-11-12-20z" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M26 30c2 4 4 4 6 0s4-4 6 0" stroke="currentColor" stroke-width="2" fill="none"/>
  `,
  home: `<path d="M12 28L32 12l20 16v24H38V40H26v12H12z" fill="currentColor"/>`,
  explore: `<circle cx="28" cy="28" r="12" stroke="currentColor" stroke-width="3" fill="none"/><path d="M37 37l12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  cycle: `<path d="M20 32a12 12 0 1 1 4 9" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M18 26v8h8" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  operate: `<path d="M16 40V24l16-10 16 10v16l-16 10z" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity=".2"/><circle cx="32" cy="32" r="4" fill="currentColor"/>`,
  quiz: `<rect x="14" y="12" width="36" height="40" rx="4" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/><path d="M24 26h16M24 34h12M24 42h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
  match: `<rect x="10" y="18" width="18" height="28" rx="3" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/><rect x="36" y="18" width="18" height="28" rx="3" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/><path d="M28 32h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
  trouble: `<path d="M32 10l20 40H12z" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity=".18"/><path d="M32 26v12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="44" r="2.2" fill="currentColor"/>`,
  wrench: `<path d="M42 14a10 10 0 0 0-14 14L14 42l8 8 14-14a10 10 0 0 0 6-22z" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity=".18"/><circle cx="40" cy="20" r="3" fill="currentColor"/>`,
  panel: `<rect x="12" y="14" width="40" height="36" rx="4" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity=".12"/><rect x="18" y="20" width="28" height="14" rx="2" fill="currentColor" opacity=".4"/>`,
}

export function iconSvg(name: string, size = 24): string {
  const body = paths[name] ?? paths.explore
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`
}
