export const publishStageTheme = {
  backstage: '#1a1a1f',
  dim: '#24242c',
  dimBorder: '#33333d',
  spotlight: '#f5f1e8',
  spotlightMuted: '#c9c3b4',
  warmAmber: '#d4a64a',
  warmAmberDim: '#8a6f30',
  armedRed: '#c0392b',
  liveRed: '#e74c3c',
  liveGlow: 'rgba(231, 76, 60, 0.35)',
  mutedGold: '#7a6a3d',
  rehearsingBlue: '#3a5a7a',
} as const

export type PublishStageThemeKey = keyof typeof publishStageTheme
