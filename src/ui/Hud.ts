import { marked } from 'marked';
import { PLACEHOLDER_PATREON_URL, PLACEHOLDER_YOUTUBE_URL } from '../config';
import { logs, tutorials, work } from '../content/catalog';
import type { Route } from '../router';

type Entry = { slug: string; title: string; body: string };
type Collection = 'portfolio' | 'blog' | 'tutorials';
const collections = { portfolio: work, blog: logs, tutorials };
const labels = { portfolio: 'Selected work', blog: 'Notes from the floor', tutorials: 'Learn by building' };
const descriptions = {
  portfolio: 'Small bets. Real artifacts. A growing collection of things built independently.',
  blog: 'The decisions, dead ends, and small wins behind the work. Build in public. Keep the receipts.',
  tutorials: 'Open the hood. Practical field guides from the intersection of code, design, and doing it yourself.',
};
const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const link = (path: string, text: string, cls = ''): string => `<a class="${cls}" href="${path}" data-path="${path}">${text}</a>`;

export class Hud {
  onNavigate: ((path: string) => void) | null = null;
  onFracture: (() => void) | null = null;
  onMotion: (() => void) | null = null;
  private readonly main: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <a class="skip" href="#main">Skip to content</a>
      <header class="site-header">
        ${link('/', '<span class="brand-symbol" aria-hidden="true">d/r<span>↗</span></span><span class="brand-name">DESTROY<br>REBUILD</span><span class="sr-only">Destroy / Rebuild home</span>', 'brand')}
        <nav aria-label="Main navigation">${link('/portfolio', 'Portfolio')}${link('/blog', 'Blog')}${link('/tutorials', 'Tutorials')}</nav>
        <span class="header-note"><i></i> INDEPENDENT BY DESIGN</span>
      </header>
      <main id="main" tabindex="-1"></main>
       <footer class="site-footer"><span>DESTROY / REBUILD<br>AUSTIN DIXSON <span class="muted">© ${new Date().getFullYear()}</span></span><span>ONE PERSON. MANY ITERATIONS.</span><div><a href="https://github.com/austindixson">GitHub ↗</a>${link('/youtube', 'YouTube ↗ <small>PLACEHOLDER</small>')}${link('/patreon', 'Patreon ↗ <small>PLACEHOLDER</small>')}</div></footer>`;
    this.main = root.querySelector('main')!;
    root.addEventListener('click', this.onClick);
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-path], [data-fracture], [data-motion]');
    if (!target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (target.hasAttribute('data-fracture')) { this.onFracture?.(); return; }
    if (target.hasAttribute('data-motion')) { this.onMotion?.(); return; }
    event.preventDefault();
    this.onNavigate?.(target.dataset.path!);
  };

  setCycle(label: string): void {
    const status = this.root.querySelector('[data-cycle]');
    if (status && status.textContent !== label) status.textContent = label;
  }

  setForm(label: string): void {
    const specimen = this.root.querySelector('[data-form]');
    if (specimen && specimen.textContent !== label) specimen.textContent = label;
  }

  setMotion(paused: boolean): void {
    const button = this.root.querySelector('[data-motion]');
    button?.setAttribute('aria-pressed', String(paused));
    if (button) button.textContent = paused ? '↻ Resume motion' : 'Ⅱ Pause motion';
  }

  render(route: Route, focus = false): void {
    document.body.classList.toggle('is-reading', route.view !== 'world');
    this.root.querySelectorAll('nav a').forEach((a) => {
      if (a.getAttribute('href') === `/${route.view}`) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (route.view === 'world') this.main.innerHTML = this.home();
    else if (route.view === 'youtube' || route.view === 'patreon') this.main.innerHTML = this.placeholder(route.view);
    else this.main.innerHTML = this.collection(route.view, route.slug);
    const title = this.main.querySelector('h1')?.textContent ?? 'Independent work';
    document.title = `${title} — Destroy / Rebuild`;
    if (focus) this.main.focus({ preventScroll: true });
  }

  private home(): string {
    return `<section class="hero" aria-labelledby="hero-title">
      <div class="hero-top"><span><i class="live-dot"></i> THE SOLOFOUNDER WORKSHOP</span><span>EST. 2026 &nbsp; / &nbsp; ALWAYS IN PROGRESS</span></div>
       <div class="hero-copy"><p class="eyebrow">AUSTIN DIXSON / FOUNDER & BUILDER</p><h1 id="hero-title">DESTROY<span class="title-slash">/</span><br><span class="outline">REBUILD</span><span class="title-dot">.</span></h1><p class="hero-description">I’m Austin Dixson, founder of Super Notch.<br>Products, experiments, and the messy process<br class="desktop-break"> of turning <em>what if</em> into <em>what’s next.</em></p><div class="hero-actions">${link('/portfolio', 'Explore the work <span>↗</span>', 'button-primary')}${link('/blog', 'Read the build log <span>↗</span>', 'text-link')}</div></div>
      <div class="specimen-label"><span>FIG. 001 — THE RECONSTRUCTION ENGINE</span><span>144 FRAGMENTS / <span data-form>MONUMENT</span></span></div>
      <div class="engine-controls"><span class="engine-state"><i class="live-dot"></i> <span data-cycle>ASSEMBLING</span></span><button type="button" data-fracture>↯ Break the structure</button><button type="button" data-motion aria-pressed="false">Ⅱ Pause motion</button></div>
      <div class="hero-bottom"><span>NOT A FINISHED PRODUCT. A CONTINUOUS PRACTICE.</span><a href="#floor">SCROLL TO THE FLOOR ↓</a></div>
    </section>
    <section class="floor" id="floor"><div class="section-label"><span>01 / ON THE FLOOR</span><span>IDEAS ARE CHEAP. BUILD SOMETHING.</span></div><div class="floor-heading"><h2>Less pitch.<br>More proof.</h2><p>A personal corner of the internet for the things I make, the lessons I learn, and everything that has to break along the way.</p></div><div class="destination-grid">${this.destination('/portfolio', '01', 'The work', 'Products & experiments', 'From first prototype to the next iteration.', 'block-art')}${this.destination('/blog', '02', 'The process', 'Build-in-public journal', 'Field notes from the good days and the grind.', 'line-art')}${this.destination('/tutorials', '03', 'The knowledge', 'Practical tutorials', 'Take it apart. Understand it. Make it yours.', 'step-art')}</div></section>
     <section class="featured-work" aria-label="Featured work">${this.featuredProject()}</section>
     <section class="latest"><div class="section-label"><span>02 / RECENT TRANSMISSIONS</span>${link('/blog', 'ALL ENTRIES ↗')}</div>${logs.slice(0, 2).map((entry, index) => this.row('blog', entry, index)).join('')}</section>
    <section class="manifesto"><span class="eyebrow">THE OPERATING PRINCIPLE</span><p>Nothing good comes<br>from <em>standing still.</em></p><span>BUILD IT. QUESTION IT. START AGAIN.</span></section>`;
  }

  private destination(path: string, number: string, title: string, subtitle: string, description: string, art: string): string {
    return link(path, `<div class="card-top"><span>${number} / ${subtitle}</span><span>↗</span></div><div class="card-art ${art}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><h3>${title}</h3><p>${description}</p>`, 'destination-card');
  }

  private featuredProject(): string {
    return `<aside class="featured-project" aria-label="Super Notch featured project"><div><span class="eyebrow">FEATURED PROJECT / MACOS APP</span><h2>Super Notch<span>↗</span></h2><p>Your agents. Your voice. Right in your notch. A Mac app by Austin Dixson for finding agent sessions, talking through ideas, and keeping a floating HUD beside your work.</p></div><div class="featured-actions"><a href="https://www.supernotch.ai" class="button-primary">Visit supernotch.ai <span>↗</span></a>${link('/portfolio/supernotch', 'Inside the project ↗', 'text-link')}</div></aside>`;
  }

  private collection(view: Collection, slug?: string): string {
    const entries: Entry[] = collections[view];
    const entry = entries.find((item) => item.slug === slug);
    if (slug && entry) return this.article(view, entry);
    const title = slug ? 'This piece is missing.' : labels[view];
    const description = slug ? 'That entry doesn’t exist. Pick up another thread below.' : descriptions[view];
     return `<section class="collection-page">${link('/', '← BACK TO THE WORKSHOP', 'eyebrow back-link')}<header class="page-heading"><span class="eyebrow">${view.toUpperCase()} / ${String(entries.length).padStart(2, '0')} ENTRIES</span><h1>${title}</h1><p>${description}</p></header>${view === 'portfolio' ? this.featuredProject() : ''}<div class="entry-list">${entries.map((item, index) => this.row(view, item, index)).join('')}</div></section>`;
  }

  private metadata(view: Collection, entry: Entry): string {
    if (view === 'portfolio') { const item = work.find((w) => w.slug === entry.slug)!; return `${item.year} · ${item.status} · ${item.stack}`; }
    if (view === 'blog') { const item = logs.find((l) => l.slug === entry.slug)!; return `${item.date} · ${item.tools}`; }
    const item = tutorials.find((t) => t.slug === entry.slug)!;
    return `${item.level} · ${item.duration} read`;
  }

  private row(view: Collection, entry: Entry, index: number): string {
    return link(`/${view}/${entry.slug}`, `<span class="entry-number">${String(index + 1).padStart(2, '0')}</span><div><span class="entry-meta">${escape(this.metadata(view, entry))}</span><h3>${escape(entry.title)}</h3></div><span class="entry-arrow">↗</span>`, 'entry-row');
  }

  private article(view: Collection, entry: Entry): string {
    const video = view === 'tutorials' ? `<aside class="video-note"><span>↗ VIDEO COMPANION / COMING LATER</span><p>This guide is readable now. The accompanying video is a placeholder.</p><code>${PLACEHOLDER_YOUTUBE_URL}</code></aside>` : '';
    return `<section class="article-page">${link(`/${view}`, `← BACK TO ${view.toUpperCase()}`, 'eyebrow back-link')}<header class="page-heading"><span class="eyebrow">${escape(this.metadata(view, entry))}</span><h1>${escape(entry.title)}</h1></header><article class="prose">${marked.parse(entry.body)}</article>${video}<div class="article-end"><span>END OF TRANSMISSION / KEEP BUILDING.</span>${link(`/${view}`, 'BACK TO INDEX ↗')}</div></section>`;
  }

  private placeholder(view: 'youtube' | 'patreon'): string {
    const name = view === 'youtube' ? 'YouTube' : 'Patreon';
    const token = view === 'youtube' ? PLACEHOLDER_YOUTUBE_URL : PLACEHOLDER_PATREON_URL;
    return `<section class="collection-page placeholder-page">${link('/', '← BACK TO THE WORKSHOP', 'eyebrow back-link')}<header class="page-heading"><span class="eyebrow">EXTERNAL DESTINATION / PLACEHOLDER</span><h1>${name}.<br>Not quite yet.</h1><p>This part of the workshop is still being built. There’s no public ${name} URL connected.</p></header><div class="placeholder-token"><span>UNCONFIGURED LINK</span><code>${token}</code></div>${link('/blog', 'Follow the progress in the blog ↗', 'text-link')}</section>`;
  }
}
