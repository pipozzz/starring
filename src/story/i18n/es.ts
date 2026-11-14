import { plural, type I18nStrings } from './en';

const es = {
  visibility: {
    public: 'Código abierto',
    private: 'Repositorio privado',
    nda: 'Bajo NDA',
  },
  talkKind: {
    talk: 'Charla',
    article: 'Artículo',
    podcast: 'Podcast',
    video: 'Vídeo',
    book: 'Libro',
  },
  hero: {
    availableForWork: 'Disponible para trabajar',
    scrollCue: 'Desplázate — el show empieza ↓',
  },
  numbers: {
    actLabel: 'En cifras',
    yearsShipping: (n) => plural('es', n, 'año programando', 'años programando'),
    commits: (n) => plural('es', n, 'commit', 'commits'),
    clients: (n) => plural('es', n, 'cliente', 'clientes'),
    repositories: (n) => plural('es', n, 'repositorio', 'repositorios'),
    icebergHigh: 'de este trabajo vive en repos privados. GitHub solo muestra la punta del iceberg.',
    icebergLow: 'de este trabajo vive en repos privados — la parte que GitHub nunca muestra.',
    publicLabel: 'Público',
    privateLabel: 'Privado',
    splitAriaLabel: 'Commits públicos versus privados',
  },
  clientsSection: {
    actLabel: 'Quién confió en mí para producción',
    ndaTag: 'NDA',
    publicTag: 'Público',
  },
  timeline: {
    actLabel: 'El camino',
    now: 'hoy',
    clientsPrefix: 'Clientes:',
    at: '@',
  },
  work: {
    actLabel: 'Proyectos destacados',
    forPrefix: 'para',
    screenshot: (title) => `${title} — captura de pantalla`,
    redactedTitle: 'Código y detalles bajo NDA',
    redactedSourceCode: 'código fuente',
    redactedRepoUrl: 'url del repo interno',
    redactedArchitecture: 'diagrama de arquitectura',
    seeItLive: 'Verlo en vivo ↗',
    viewSource: 'Ver código ↗',
  },
  accolades: {
    actLabel: 'Reconocimientos',
    certified: 'Certificaciones',
    verify: 'Verificar ↗',
    verifyLabel: (name) => `Verificar ${name}`,
  },
  pressTour: {
    actLabel: 'Gira de prensa',
  },
  activity: {
    actLabelActivity: 'Cada commit cuenta',
    actLabelPlatforms: 'Dónde vive el código',
    contributions: (n) => plural('es', n, 'contribución', 'contribuciones'),
    commitsPerDay: (year) => `Commits por día en ${year}`,
    contributionHeatmap: (year) => `Mapa de contribuciones de ${year}`,
    imported: '✓ importado',
    selfReported: 'auto-reportado',
    repos: (n) => plural('es', n, 'repo', 'repos'),
    repositoriesLabel: 'repositorios',
  },
  training: {
    actLabel: 'Formación',
    languagesHeader: 'Idiomas',
  },
  behindTheScenes: {
    actLabel: 'Tras las cámaras',
  },
  critics: {
    actLabel: 'La crítica',
  },
  footer: {
    thatsAWrap: 'Fin de la función',
    madeWith: 'Hecho con Starring — código abierto',
    terms: 'Términos',
    privacy: 'Privacidad',
  },
} satisfies I18nStrings;

export default es;
