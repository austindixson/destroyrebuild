type Contribution = {
  project: string;
  title: string;
  summary: string;
  status: 'Published plugin' | 'Open PR';
  date: string;
  dateLabel: string;
  url: string;
  reference: string;
};

// Editorial snapshot verified against the upstream GitHub records on 2026-09-10.
// Marketplace publication is not a merged code PR; keep those labels distinct.
export const contributions: Contribution[] = [
  {
    project: 'Omarchy Marketplace',
    title: 'A more useful Touch Bar.',
    summary: 'Customizable Omarchy actions on Apple Silicon Touch Bars. Accepted and published in the plugin marketplace.',
    status: 'Published plugin',
    date: '2026-09-08',
    dateLabel: 'Published 08 Sep 2026',
    url: 'https://github.com/omacom/omarchy-plugin-marketplace/issues/5394#issuecomment-5584197796',
    reference: 'Publication #5394',
  },
  {
    project: 'Omarchy Marketplace',
    title: 'Input settings, within reach.',
    summary: 'Ominput brings Hyprland input settings into an Omarchy panel, with a managed configuration block and a reset path.',
    status: 'Published plugin',
    date: '2026-09-06',
    dateLabel: 'Published 06 Sep 2026',
    url: 'https://github.com/omacom/omarchy-plugin-marketplace/issues/4991#issuecomment-5556098417',
    reference: 'Publication #4991',
  },
  {
    project: 'Cua / trycua',
    title: 'Cursor recording that can stop.',
    summary: 'Bounded, cancellable Hyprland cursor sampling for recording telemetry in Cua’s computer-use tooling.',
    status: 'Open PR',
    date: '2026-09-05',
    dateLabel: 'Submitted 05 Sep 2026',
    url: 'https://github.com/trycua/cua/pull/3553',
    reference: 'Pull request #3553',
  },
  {
    project: 'Omarchy Mac',
    title: 'Native actions for Apple Silicon.',
    summary: 'A proposed default Touch Bar row for brightness, terminal, lock, media, and more, with user-customizable layouts.',
    status: 'Open PR',
    date: '2026-09-07',
    dateLabel: 'Submitted 07 Sep 2026',
    url: 'https://github.com/omacom/omarchy-mac/pull/363',
    reference: 'Pull request #363',
  },
];
