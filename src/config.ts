export const CYCLE_SECONDS = 14;

export const COLORS = {
  void: 0x060708,
  steel: 0x2a3038,
  plate: 0x1c2229,
  bone: 0xe6e1d6,
  ash: 0x8a8680,
  ember: 0xff4d1a,
  weld: 0xffb347,
  cool: 0x7a8b96,
} as const;

/** External destinations — replace these tokens, do not invent handles. */
export const PLACEHOLDER_YOUTUBE_URL = 'PLACEHOLDER_YOUTUBE_URL';
export const PLACEHOLDER_PATREON_URL = 'PLACEHOLDER_PATREON_URL';

export type DestinationId =
  | 'portfolio'
  | 'blog'
  | 'tutorials'
  | 'youtube'
  | 'patreon';

export const DESTINATIONS: {
  id: DestinationId;
  index: string;
  label: string;
  kicker: string;
  kind: 'internal' | 'external';
}[] = [
  { id: 'portfolio', index: '01', label: 'PORTFOLIO', kicker: 'WORK', kind: 'internal' },
  { id: 'blog', index: '02', label: 'BLOG', kicker: 'SHIP LOGS', kind: 'internal' },
  { id: 'tutorials', index: '03', label: 'TUTORIALS', kicker: 'WITH VIDEO', kind: 'internal' },
  { id: 'youtube', index: 'YT', label: 'YOUTUBE', kicker: 'EXTERNAL', kind: 'external' },
  { id: 'patreon', index: 'PT', label: 'PATREON', kicker: 'EXTERNAL', kind: 'external' },
];
