/** Mermaid is loaded on demand so the home/world bundle stays light. */

let ready = false;

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  run: (opts: { nodes: HTMLElement[] }) => Promise<void>;
};

let api: MermaidApi | null = null;

async function ensureMermaid(): Promise<MermaidApi> {
  if (api && ready) return api;
  const mod = await import('mermaid');
  api = mod.default as unknown as MermaidApi;
  api.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
    fontFamily: 'IBM Plex Mono, monospace',
    themeVariables: {
      darkMode: true,
      background: '#141613',
      primaryColor: '#20241b',
      primaryTextColor: '#e9e6dd',
      primaryBorderColor: '#343830',
      secondaryColor: '#1a1d16',
      tertiaryColor: '#20241b',
      lineColor: '#a2a69a',
      textColor: '#e9e6dd',
      mainBkg: '#20241b',
      nodeBorder: '#ff5b2b',
      clusterBkg: '#1a1d16',
      clusterBorder: '#343830',
      titleColor: '#e9e6dd',
      edgeLabelBackground: '#141613',
    },
  });
  ready = true;
  return api;
}

/** Turn marked `language-mermaid` code fences into rendered diagrams. */
export async function hydrateMermaid(root: ParentNode): Promise<void> {
  const blocks = root.querySelectorAll('pre code.language-mermaid');
  if (!blocks.length) return;
  const mermaid = await ensureMermaid();
  const targets: HTMLElement[] = [];
  blocks.forEach((code, index) => {
    const pre = code.parentElement;
    if (!(pre instanceof HTMLElement)) return;
    const host = document.createElement('div');
    host.className = 'mermaid-figure';
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', 'Lattice Memory architecture diagram');
    const diagram = document.createElement('pre');
    diagram.className = 'mermaid';
    diagram.textContent = code.textContent ?? '';
    diagram.id = `mermaid-${index}-${Math.random().toString(36).slice(2, 8)}`;
    host.append(diagram);
    pre.replaceWith(host);
    targets.push(diagram);
  });
  if (targets.length) {
    await mermaid.run({ nodes: targets });
  }
}
