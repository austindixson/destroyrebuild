export type LogEntry = {
  slug: string;
  title: string;
  date: string;
  session: string;
  commits: string;
  tools: string;
  mood: string;
  body: string;
};

export type TutorialEntry = {
  slug: string;
  title: string;
  date: string;
  video: string;
  duration: string;
  level: string;
  body: string;
};

export type WorkEntry = {
  slug: string;
  title: string;
  year: string;
  status: string;
  role: string;
  stack: string;
  summary: string;
  body: string;
};
