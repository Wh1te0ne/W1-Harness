/** Primary colors read from local Codex 26.1013.4894.0 theme resources; W1 owns the token mapping. */
import type { W1Palette } from './w1-appearance.ts'
export const W1_PRESETS: readonly { id: string; name: string; light: W1Palette; dark: W1Palette }[] = [
  {
    'id': 'absolutely',
    'name': 'Absolutely',
    'light': {
      'accent': '#cc7d5e',
      'surface': '#f9f9f7',
      'ink': '#2d2d2b',
    },
    'dark': {
      'accent': '#cc7d5e',
      'surface': '#2d2d2b',
      'ink': '#f9f9f7',
    },
  },
  {
    'id': 'codex',
    'name': 'Codex',
    'light': {
      'accent': '#0169cc',
      'surface': '#ffffff',
      'ink': '#0d0d0d',
    },
    'dark': {
      'accent': '#0169cc',
      'surface': '#111111',
      'ink': '#fcfcfc',
    },
  },
  {
    'id': 'catppuccin',
    'name': 'Catppuccin',
    'light': {
      'accent': '#8839ef',
      'surface': '#eff1f5',
      'ink': '#4c4f69',
    },
    'dark': {
      'accent': '#cba6f7',
      'surface': '#1e1e2e',
      'ink': '#cdd6f4',
    },
  },
  {
    'id': 'everforest',
    'name': 'Everforest',
    'light': {
      'accent': '#93b259',
      'surface': '#fdf6e3',
      'ink': '#5c6a72',
    },
    'dark': {
      'accent': '#a7c080',
      'surface': '#2d353b',
      'ink': '#d3c6aa',
    },
  },
  {
    'id': 'github',
    'name': 'GitHub',
    'light': {
      'accent': '#1f883d',
      'surface': '#ffffff',
      'ink': '#1f2328',
    },
    'dark': {
      'accent': '#238636',
      'surface': '#0d1117',
      'ink': '#e6edf3',
    },
  },
  {
    'id': 'linear',
    'name': 'Linear',
    'light': {
      'accent': '#5e6ad2',
      'surface': '#f7f8fa',
      'ink': '#2a3140',
    },
    'dark': {
      'accent': '#5e6ad2',
      'surface': '#17181d',
      'ink': '#e6e9ef',
    },
  },
  {
    'id': 'notion',
    'name': 'Notion',
    'light': {
      'accent': '#3183d8',
      'surface': '#ffffff',
      'ink': '#37352f',
    },
    'dark': {
      'accent': '#3183d8',
      'surface': '#191919',
      'ink': '#d9d9d8',
    },
  },
  {
    'id': 'one',
    'name': 'One',
    'light': {
      'accent': '#5871EF',
      'surface': '#FAFAFA',
      'ink': '#383A42',
    },
    'dark': {
      'accent': '#404754',
      'surface': '#282c34',
      'ink': '#abb2bf',
    },
  },
  {
    'id': 'raycast',
    'name': 'Raycast',
    'light': {
      'accent': '#138AF2',
      'surface': '#FFFFFF',
      'ink': '#000000',
    },
    'dark': {
      'accent': '#4FA3F8',
      'surface': '#141414',
      'ink': '#FFFFFF',
    },
  },
  {
    'id': 'rose-pine',
    'name': 'Rosé Pine',
    'light': {
      'accent': '#d7827e',
      'surface': '#faf4ed',
      'ink': '#575279',
    },
    'dark': {
      'accent': '#ebbcba',
      'surface': '#191724',
      'ink': '#e0def4',
    },
  },
  {
    'id': 'vercel',
    'name': 'Vercel',
    'light': {
      'accent': '#006aff',
      'surface': '#ffffff',
      'ink': '#171717',
    },
    'dark': {
      'accent': '#006efe',
      'surface': '#000000',
      'ink': '#ededed',
    },
  },
]
