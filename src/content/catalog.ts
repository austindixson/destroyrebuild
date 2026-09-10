import { parseMarkdown, slugFromPath } from './frontmatter';
import type { LogEntry, TutorialEntry, WorkEntry } from './types';

const logFiles = import.meta.glob('../../content/logs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const tutorialFiles = import.meta.glob('../../content/tutorials/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const workFiles = import.meta.glob('../../content/work/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function byDateDesc<T extends { date: string }>(a: T, b: T): number {
  return b.date.localeCompare(a.date);
}

export const logs: LogEntry[] = Object.entries(logFiles)
  .map(([path, raw]) => {
    const { data, body } = parseMarkdown(raw);
    return {
      slug: slugFromPath(path),
      title: data.title ?? slugFromPath(path),
      date: data.date ?? '',
      session: data.session ?? '—',
      commits: data.commits ?? '—',
      tools: data.tools ?? '—',
      mood: data.mood ?? '',
      body,
    };
  })
  .sort(byDateDesc);

export const tutorials: TutorialEntry[] = Object.entries(tutorialFiles)
  .map(([path, raw]) => {
    const { data, body } = parseMarkdown(raw);
    return {
      slug: slugFromPath(path),
      title: data.title ?? slugFromPath(path),
      date: data.date ?? '',
      video: data.video ?? 'PLACEHOLDER_YOUTUBE_URL',
      duration: data.duration ?? '—',
      level: data.level ?? '',
      body,
    };
  })
  .sort(byDateDesc);

export const work: WorkEntry[] = Object.entries(workFiles)
  .map(([path, raw]) => {
    const { data, body } = parseMarkdown(raw);
    return {
      slug: slugFromPath(path),
      title: data.title ?? slugFromPath(path),
      year: data.year ?? '',
      status: data.status ?? '',
      role: data.role ?? '',
      stack: data.stack ?? '',
      summary: data.summary ?? '',
      body,
    };
  })
  .sort((a, b) => b.year.localeCompare(a.year) || a.title.localeCompare(b.title));

export function findLog(slug: string): LogEntry | undefined {
  return logs.find((entry) => entry.slug === slug);
}

export function findTutorial(slug: string): TutorialEntry | undefined {
  return tutorials.find((entry) => entry.slug === slug);
}

export function findWork(slug: string): WorkEntry | undefined {
  return work.find((entry) => entry.slug === slug);
}
