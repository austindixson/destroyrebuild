import { parseMarkdown, slugFromPath, type Frontmatter } from './frontmatter';
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

function byYearThenTitle(a: WorkEntry, b: WorkEntry): number {
  const years = b.year.localeCompare(a.year);
  if (years !== 0) return years;
  return a.title.localeCompare(b.title);
}

function readField(data: Frontmatter, key: string, fallback: string): string {
  return data[key] ?? fallback;
}

function toLog([path, raw]: [string, string]): LogEntry {
  const { data, body } = parseMarkdown(raw);
  const slug = slugFromPath(path);
  return {
    slug,
    title: readField(data, 'title', slug),
    date: readField(data, 'date', ''),
    session: readField(data, 'session', '—'),
    commits: readField(data, 'commits', '—'),
    tools: readField(data, 'tools', '—'),
    mood: readField(data, 'mood', ''),
    body,
  };
}

function toTutorial([path, raw]: [string, string]): TutorialEntry {
  const { data, body } = parseMarkdown(raw);
  const slug = slugFromPath(path);
  return {
    slug,
    title: readField(data, 'title', slug),
    date: readField(data, 'date', ''),
    video: readField(data, 'video', 'PLACEHOLDER_YOUTUBE_URL'),
    duration: readField(data, 'duration', '—'),
    level: readField(data, 'level', ''),
    body,
  };
}

function toWork([path, raw]: [string, string]): WorkEntry {
  const { data, body } = parseMarkdown(raw);
  const slug = slugFromPath(path);
  return {
    slug,
    title: readField(data, 'title', slug),
    year: readField(data, 'year', ''),
    status: readField(data, 'status', ''),
    role: readField(data, 'role', ''),
    stack: readField(data, 'stack', ''),
    summary: readField(data, 'summary', ''),
    body,
  };
}

export const logs: LogEntry[] = Object.entries(logFiles).map(toLog).sort(byDateDesc);
export const tutorials: TutorialEntry[] = Object.entries(tutorialFiles).map(toTutorial).sort(byDateDesc);
export const work: WorkEntry[] = Object.entries(workFiles).map(toWork).sort(byYearThenTitle);

export function findLog(slug: string): LogEntry | undefined {
  return logs.find((entry) => entry.slug === slug);
}

export function findTutorial(slug: string): TutorialEntry | undefined {
  return tutorials.find((entry) => entry.slug === slug);
}

export function findWork(slug: string): WorkEntry | undefined {
  return work.find((entry) => entry.slug === slug);
}
