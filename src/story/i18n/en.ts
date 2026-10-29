import type { Lang, TalkKind, Visibility } from '../../lib/model';

export const plural = (lang: Lang, n: number, one: string, other: string): string =>
  new Intl.PluralRules(lang).select(n) === 'one' ? one : other;

export interface I18nStrings {
  visibility: Record<Visibility, string>;
  talkKind: Record<TalkKind, string>;
  hero: {
    availableForWork: string;
    scrollCue: string;
  };
  numbers: {
    actLabel: string;
    yearsShipping: (n: number) => string;
    commits: (n: number) => string;
    clients: (n: number) => string;
    repositories: (n: number) => string;
    icebergHigh: string;
    icebergLow: string;
    publicLabel: string;
    privateLabel: string;
    splitAriaLabel: string;
  };
  clientsSection: {
    actLabel: string;
    ndaTag: string;
    publicTag: string;
  };
  timeline: {
    actLabel: string;
    now: string;
    clientsPrefix: string;
    at: string;
  };
  work: {
    actLabel: string;
    forPrefix: string;
    screenshot: (title: string) => string;
    redactedTitle: string;
    redactedSourceCode: string;
    redactedRepoUrl: string;
    redactedArchitecture: string;
    seeItLive: string;
    viewSource: string;
  };
  accolades: {
    actLabel: string;
    certified: string;
    verify: string;
    verifyLabel: (name: string) => string;
  };
  pressTour: {
    actLabel: string;
  };
  activity: {
    actLabelActivity: string;
    actLabelPlatforms: string;
    contributions: (n: number) => string;
    commitsPerDay: (year: number) => string;
    contributionHeatmap: (year: number) => string;
    imported: string;
    selfReported: string;
    repos: (n: number) => string;
    repositoriesLabel: string;
  };
  training: {
    actLabel: string;
    languagesHeader: string;
  };
  behindTheScenes: {
    actLabel: string;
  };
  critics: {
    actLabel: string;
  };
  footer: {
    thatsAWrap: string;
    madeWith: string;
    terms: string;
    privacy: string;
  };
}

const en: I18nStrings = {
  visibility: {
    public: 'Open source',
    private: 'Private repo',
    nda: 'Under NDA',
  },
  talkKind: {
    talk: 'Talk',
    article: 'Article',
    podcast: 'Podcast',
    video: 'Video',
    book: 'Book',
  },
  hero: {
    availableForWork: 'Available for work',
    scrollCue: 'Scroll — the show starts ↓',
  },
  numbers: {
    actLabel: 'By the numbers',
    yearsShipping: (n) => plural('en', n, 'year shipping', 'years shipping'),
    commits: (n) => plural('en', n, 'commit', 'commits'),
    clients: (n) => plural('en', n, 'client', 'clients'),
    repositories: (n) => plural('en', n, 'repository', 'repositories'),
    icebergHigh: 'of this work lives in private repos. GitHub only shows the tip.',
    icebergLow: 'of this work lives in private repos — the part GitHub never shows.',
    publicLabel: 'Public',
    privateLabel: 'Private',
    splitAriaLabel: 'Public versus private commits',
  },
  clientsSection: {
    actLabel: 'Who trusted me with production',
    ndaTag: 'NDA',
    publicTag: 'Public',
  },
  timeline: {
    actLabel: 'The road',
    now: 'now',
    clientsPrefix: 'Clients:',
    at: '@',
  },
  work: {
    actLabel: 'Featured work',
    forPrefix: 'for',
    screenshot: (title) => `${title} — screenshot`,
    redactedTitle: 'Code and details under NDA',
    redactedSourceCode: 'source code',
    redactedRepoUrl: 'internal repo url',
    redactedArchitecture: 'architecture diagram',
    seeItLive: 'See it live ↗',
    viewSource: 'View source ↗',
  },
  accolades: {
    actLabel: 'Accolades',
    certified: 'Certified',
    verify: 'Verify ↗',
    verifyLabel: (name) => `Verify ${name}`,
  },
  pressTour: {
    actLabel: 'Press tour',
  },
  activity: {
    actLabelActivity: 'Every commit counts',
    actLabelPlatforms: 'Where the code lives',
    contributions: (n) => plural('en', n, 'contribution', 'contributions'),
    commitsPerDay: (year) => `Commits per day for ${year}`,
    contributionHeatmap: (year) => `Contribution heatmap for ${year}`,
    imported: '✓ imported',
    selfReported: 'self-reported',
    repos: (n) => plural('en', n, 'repo', 'repos'),
    repositoriesLabel: 'repositories',
  },
  training: {
    actLabel: 'Training montage',
    languagesHeader: 'Languages',
  },
  behindTheScenes: {
    actLabel: 'Behind the scenes',
  },
  critics: {
    actLabel: 'The critics',
  },
  footer: {
    thatsAWrap: "That's a wrap",
    madeWith: 'Made with Starring — open source',
    terms: 'Terms',
    privacy: 'Privacy',
  },
};

export default en;
