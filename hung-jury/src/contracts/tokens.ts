// Design tokens. Part 1 draws with these and Part 4's verdict card (see
// src/media/cards.ts) uses the same values, so the card always matches the
// app. Font names are portable fallbacks from the Part 3/4 handoff; swap
// them for the team's final installed UI fonts and rebuild cached cards.

export const TOKENS = {
  displayFont: 'DejaVu Serif',
  bodyFont: 'DejaVu Sans',
  monoFont: 'DejaVu Sans Mono',
  wood900: '#2B1B12',
  wood700: '#5A3A25',
  parchment100: '#F6EBD4',
  brass500: '#C99A2E',
  ink900: '#1B1410',
  verdictRed: '#B3261E',
  verdictGreen: '#2E7D4F',
  toneSerious: '#3F5B7A',
  toneSilly: '#FF5DA2',
} as const;

export const SPACING_TOKENS = {
  grid: 8,
  cardRadius: 12,
  pillRadius: 999,
  mobileWidth: 390,
  desktopWidth: 1280,
} as const;
