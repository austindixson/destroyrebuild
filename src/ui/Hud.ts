import { marked } from 'marked';
import {
  DESTINATIONS,
  PLACEHOLDER_PATREON_URL,
  PLACEHOLDER_YOUTUBE_URL,
  type DestinationId,
} from '../config';
import { findLog, findTutorial, findWork, logs, tutorials, work } from '../content/catalog';
import type { Route } from '../router';
import { pathFor } from '../router';

marked.setOptions({ gfm: true });

export class Hud {
  private readonly root: HTMLElement;
  private readonly viewEl: HTMLElement;
  private readonly cycleEl: HTMLElement;
  private readonly surface: HTMLElement;
  private readonly body: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly title: HTMLElement;
  private readonly meta: HTMLElement;
  onNavigate: ((path: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="chrome">
        <button class="brand" type="button" data-path="/">
          <span class="mark">DR</span>
          <span class="brand-copy">
            <strong>DESTROY / REBUILD</strong>
            <small>#solofounder · portfolio + logs</small>
          </span>
        </button>
        <div class="status">
          <span class="pill" data-cycle>HOLD</span>
          <span class="pill" data-view>WORLD</span>
        </div>
      </div>
      <p class="hint">Click a slab in the world · keys 1 2 3 · Esc returns</p>
      <nav class="radar" aria-label="Destinations">
        ${DESTINATIONS.map(
          (d) =>
            `<button type="button" data-path="${pathFor({ view: d.id })}" data-id="${d.id}">
              <span>${d.index}</span>${d.label}
            </button>`,
        ).join('')}
      </nav>
      <section class="surface" hidden>
        <header class="surface-head">
          <button type="button" class="back" data-path="/">← WORLD</button>
          <p class="kicker" data-kicker></p>
          <h1 data-title></h1>
          <p class="meta" data-meta></p>
        </header>
        <div class="surface-body" data-body></div>
      </section>
    `;

    this.viewEl = root.querySelector('[data-view]') as HTMLElement;
    this.cycleEl = root.querySelector('[data-cycle]') as HTMLElement;
    this.surface = root.querySelector('.surface') as HTMLElement;
    this.body = root.querySelector('[data-body]') as HTMLElement;
    this.kicker = root.querySelector('[data-kicker]') as HTMLElement;
    this.title = root.querySelector('[data-title]') as HTMLElement;
    this.meta = root.querySelector('[data-meta]') as HTMLElement;

    root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-path]') as HTMLElement | null;
      if (!target) return;
      event.preventDefault();
      this.onNavigate?.(target.dataset.path ?? '/');
    });
  }

  setCycle(label: string): void {
    if (this.cycleEl.textContent !== label) {
      this.cycleEl.textContent = label;
    }
  }

  render(route: Route): void {
    document.body.classList.toggle('is-reading', route.view !== 'world');
    this.viewEl.textContent = route.view.toUpperCase();
    this.root.querySelectorAll('.radar button').forEach((btn) => {
      const id = (btn as HTMLElement).dataset.id as DestinationId;
      btn.classList.toggle('is-on', id === route.view);
    });

    if (route.view === 'world') {
      this.surface.hidden = true;
      this.body.replaceChildren();
      return;
    }

    this.surface.hidden = false;

    if (route.view === 'portfolio') {
      this.renderPortfolio(route.slug);
      return;
    }
    if (route.view === 'blog') {
      this.renderBlog(route.slug);
      return;
    }
    if (route.view === 'tutorials') {
      this.renderTutorials(route.slug);
      return;
    }
    if (route.view === 'youtube') {
      this.renderPlaceholder(
        'EXTERNAL',
        'YouTube channel',
        'Channel URL is not set yet.',
        PLACEHOLDER_YOUTUBE_URL,
        'Replace PLACEHOLDER_YOUTUBE_URL when the channel is public. Do not invent a handle.',
      );
      return;
    }
    this.renderPlaceholder(
      'EXTERNAL',
      'Patreon',
      'Patron URL is not set yet.',
      PLACEHOLDER_PATREON_URL,
      'Replace PLACEHOLDER_PATREON_URL when the page is live. Do not invent a handle.',
    );
  }

  private renderPortfolio(slug?: string): void {
    if (slug) {
      const entry = findWork(slug);
      if (!entry) {
        this.frame('PORTFOLIO', 'Missing bay', 'No project with that slug.', this.listWork());
        return;
      }
      this.frame(
        'PORTFOLIO / WORK',
        entry.title,
        `${entry.year} · ${entry.status} · ${entry.role} · ${entry.stack}`,
        this.article(entry.body),
      );
      return;
    }
    this.frame('PORTFOLIO', 'Work bays', 'Projects on the floor. This is not Super Notch.', this.listWork());
  }

  private renderBlog(slug?: string): void {
    if (slug) {
      const entry = findLog(slug);
      if (!entry) {
        this.frame('BLOG / SHIP LOG', 'Missing log', 'No entry with that slug.', this.listLogs());
        return;
      }
      this.frame(
        'BLOG / SHIP LOG',
        entry.title,
        `${entry.date} · session ${entry.session} · ${entry.commits} commits · ${entry.tools}`,
        this.article(entry.body),
      );
      return;
    }
    this.frame('BLOG', 'Ship logs', 'Daily grind notes. Sessions, tools, trials, rebuilds.', this.listLogs());
  }

  private renderTutorials(slug?: string): void {
    if (slug) {
      const entry = findTutorial(slug);
      if (!entry) {
        this.frame('TUTORIALS', 'Missing plate', 'No tutorial with that slug.', this.listTutorials());
        return;
      }
      const wrap = document.createElement('div');
      wrap.append(this.videoSlot(entry.video, entry.duration), this.article(entry.body));
      this.frame('TUTORIALS', entry.title, `${entry.date} · ${entry.level} · ${entry.duration}`, wrap);
      return;
    }
    this.frame(
      'TUTORIALS',
      'Paired lessons',
      'Each write-up ships with an accompanying YouTube video.',
      this.listTutorials(),
    );
  }

  private renderPlaceholder(
    kicker: string,
    title: string,
    meta: string,
    token: string,
    note: string,
  ): void {
    const box = document.createElement('div');
    box.className = 'placeholder-url';
    box.innerHTML = `
      <p class="todo-label">TODO · URL PENDING</p>
      <code>${token}</code>
      <p>${note}</p>
    `;
    this.frame(kicker, title, meta, box);
  }

  private frame(kicker: string, title: string, meta: string, content: Node): void {
    this.kicker.textContent = kicker;
    this.title.textContent = title;
    this.meta.textContent = meta;
    this.body.replaceChildren(content);
    this.surface.scrollTop = 0;
  }

  private listWork(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'index';
    for (const entry of work) {
      list.append(
        this.row(`/portfolio/${entry.slug}`, entry.title, `${entry.year} · ${entry.status}`, entry.summary),
      );
    }
    return list;
  }

  private listLogs(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'index';
    for (const entry of logs) {
      list.append(
        this.row(
          `/blog/${entry.slug}`,
          entry.title,
          `${entry.date} · session ${entry.session} · ${entry.commits} commits`,
          entry.mood || entry.tools,
        ),
      );
    }
    return list;
  }

  private listTutorials(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'index';
    for (const entry of tutorials) {
      list.append(
        this.row(
          `/tutorials/${entry.slug}`,
          entry.title,
          `${entry.date} · ${entry.level} · video ${entry.video}`,
          'Paired with an accompanying YouTube video (URL pending).',
        ),
      );
    }
    return list;
  }

  private row(path: string, title: string, meta: string, blurb: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'row';
    btn.dataset.path = path;
    btn.innerHTML = `<strong>${title}</strong><span>${meta}</span><em>${blurb}</em>`;
    return btn;
  }

  private article(markdown: string): HTMLElement {
    const article = document.createElement('article');
    article.className = 'prose';
    article.innerHTML = marked.parse(markdown) as string;
    return article;
  }

  private videoSlot(token: string, duration: string): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'video-slot';
    slot.innerHTML = `
      <p class="todo-label">ACCOMPANYING VIDEO · TODO</p>
      <p class="video-ghost">PLAY ${duration}</p>
      <code>${token}</code>
      <p>YouTube embed waits on a real URL. Token only — no invented handle.</p>
    `;
    return slot;
  }
}
