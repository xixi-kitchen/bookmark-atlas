export type ThemeId =
  | 'excalidraw'
  | 'swiss'
  | 'bauhaus'
  | 'surreal'
  | 'memphis'
  | 'pop'
  | 'pixel';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  mutedText: string;
  border: string;
  accent: string;
  accentText: string;
  folder: string;
  danger: string;
};

export type ThemeTypography = {
  fontFamily: string;
  headingWeight: string;
  bodyWeight: string;
  letterSpacing: string;
};

export type ThemeBorders = {
  width: string;
  strongWidth: string;
  style: string;
};

export type ThemeRadii = {
  small: string;
  medium: string;
  large: string;
};

export type ThemeShadows = {
  card: string;
  overlay: string;
};

export type ThemePattern = {
  backgroundImage: string;
  backgroundSize: string;
};

export type ThemeMotion = {
  duration: string;
  easing: string;
};

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  nameKey: 'themeExcalidraw' | 'themeSwiss' | 'themeBauhaus' | 'themeSurreal' | 'themeMemphis' | 'themePop' | 'themePixel';
  tokens: {
    color: ThemeColors;
    typography: ThemeTypography;
    border: ThemeBorders;
    radius: ThemeRadii;
    shadow: ThemeShadows;
    pattern: ThemePattern;
    motion: ThemeMotion;
  };
};

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  excalidraw: {
    id: 'excalidraw',
    name: 'Excalidraw',
    nameKey: 'themeExcalidraw',
    tokens: {
      color: {
        background: '#f5f5f7',
        surface: '#ffffff',
        surfaceRaised: '#f1f0ff',
        text: '#1b1b1f',
        mutedText: '#6b6b73',
        border: '#d6d6df',
        accent: '#6965db',
        accentText: '#ffffff',
        folder: '#6965db',
        danger: '#b42318',
      },
      typography: {
        fontFamily: 'Assistant, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        headingWeight: '700',
        bodyWeight: '400',
        letterSpacing: '0',
      },
      border: { width: '1px', strongWidth: '1px', style: 'solid' },
      radius: { small: '7px', medium: '10px', large: '14px' },
      shadow: {
        card: '0 1px 4px rgb(20 20 24 / 0.08)',
        overlay: '0 18px 55px rgb(20 20 24 / 0.20)',
      },
      pattern: {
        backgroundImage: 'none',
        backgroundSize: 'auto',
      },
      motion: { duration: '150ms', easing: 'cubic-bezier(.2, .8, .2, 1)' },
    },
  },
  swiss: {
    id: 'swiss',
    name: 'Swiss International',
    nameKey: 'themeSwiss',
    tokens: {
      color: {
        background: '#f7f7f3',
        surface: '#ffffff',
        surfaceRaised: '#f0f0eb',
        text: '#111111',
        mutedText: '#666666',
        border: '#151515',
        accent: '#e30613',
        accentText: '#ffffff',
        folder: '#0057b8',
        danger: '#b00020',
      },
      typography: {
        fontFamily: 'Avenir Next Condensed, Helvetica Neue, sans-serif',
        headingWeight: '700',
        bodyWeight: '400',
        letterSpacing: '0',
      },
      border: { width: '1px', strongWidth: '2px', style: 'solid' },
      radius: { small: '0px', medium: '2px', large: '4px' },
      shadow: { card: 'none', overlay: '0 12px 32px rgb(0 0 0 / 0.16)' },
      pattern: {
        backgroundImage:
          'linear-gradient(#d9d9d4 1px, transparent 1px), linear-gradient(90deg, #d9d9d4 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      },
      motion: { duration: '120ms', easing: 'cubic-bezier(.2, 0, 0, 1)' },
    },
  },
  bauhaus: {
    id: 'bauhaus',
    name: 'Bauhaus',
    nameKey: 'themeBauhaus',
    tokens: {
      color: {
        background: '#f2eadf',
        surface: '#fffaf0',
        surfaceRaised: '#e8dccb',
        text: '#161616',
        mutedText: '#5f564b',
        border: '#161616',
        accent: '#d71920',
        accentText: '#ffffff',
        folder: '#005baa',
        danger: '#a40000',
      },
      typography: {
        fontFamily: 'Futura, Avenir Next, Helvetica Neue, Arial, sans-serif',
        headingWeight: '800',
        bodyWeight: '500',
        letterSpacing: '0',
      },
      border: { width: '2px', strongWidth: '3px', style: 'solid' },
      radius: { small: '0px', medium: '6px', large: '8px' },
      shadow: { card: '6px 6px 0 #161616', overlay: '10px 10px 0 #161616' },
      pattern: {
        backgroundImage:
          'radial-gradient(circle at 20px 20px, #f7c600 0 9px, transparent 10px)',
        backgroundSize: '80px 80px',
      },
      motion: { duration: '140ms', easing: 'cubic-bezier(.4, 0, .2, 1)' },
    },
  },
  surreal: {
    id: 'surreal',
    name: 'Surrealism',
    nameKey: 'themeSurreal',
    tokens: {
      color: {
        background: '#eef3f1',
        surface: '#fffdf7',
        surfaceRaised: '#e4edf0',
        text: '#14121f',
        mutedText: '#656071',
        border: '#25213d',
        accent: '#ff6b4a',
        accentText: '#1b1024',
        folder: '#6a5acd',
        danger: '#c33a5b',
      },
      typography: {
        fontFamily: 'Optima, Avenir Next, Helvetica Neue, Arial, sans-serif',
        headingWeight: '700',
        bodyWeight: '400',
        letterSpacing: '0',
      },
      border: { width: '1px', strongWidth: '2px', style: 'solid' },
      radius: { small: '8px', medium: '16px', large: '24px' },
      shadow: {
        card: '0 18px 40px rgb(37 33 61 / 0.16)',
        overlay: '0 24px 64px rgb(37 33 61 / 0.22)',
      },
      pattern: {
        backgroundImage:
          'linear-gradient(135deg, rgb(255 107 74 / .14), transparent 34%), linear-gradient(45deg, transparent 62%, rgb(106 90 205 / .12))',
        backgroundSize: '120px 120px',
      },
      motion: { duration: '180ms', easing: 'cubic-bezier(.25, .8, .25, 1)' },
    },
  },
  memphis: {
    id: 'memphis',
    name: 'Memphis',
    nameKey: 'themeMemphis',
    tokens: {
      color: {
        background: '#fff9ed',
        surface: '#ffffff',
        surfaceRaised: '#ffe66d',
        text: '#171717',
        mutedText: '#5d5d5d',
        border: '#171717',
        accent: '#ff4f9a',
        accentText: '#171717',
        folder: '#00b8a9',
        danger: '#ef233c',
      },
      typography: {
        fontFamily: 'Avenir Next, Trebuchet MS, Helvetica Neue, Arial, sans-serif',
        headingWeight: '800',
        bodyWeight: '500',
        letterSpacing: '0',
      },
      border: { width: '2px', strongWidth: '3px', style: 'solid' },
      radius: { small: '2px', medium: '8px', large: '8px' },
      shadow: { card: '8px 8px 0 #00b8a9', overlay: '12px 12px 0 #171717' },
      pattern: {
        backgroundImage:
          'linear-gradient(45deg, transparent 45%, #171717 46%, #171717 54%, transparent 55%)',
        backgroundSize: '28px 28px',
      },
      motion: { duration: '150ms', easing: 'cubic-bezier(.2, .8, .2, 1)' },
    },
  },
  pop: {
    id: 'pop',
    name: 'Pop Art',
    nameKey: 'themePop',
    tokens: {
      color: {
        background: '#fff200',
        surface: '#ffffff',
        surfaceRaised: '#ff5c00',
        text: '#0b0b0b',
        mutedText: '#3e3e3e',
        border: '#0b0b0b',
        accent: '#00a3ff',
        accentText: '#ffffff',
        folder: '#ff2d55',
        danger: '#d00000',
      },
      typography: {
        fontFamily: 'Arial Black, Impact, Helvetica Neue, Arial, sans-serif',
        headingWeight: '900',
        bodyWeight: '700',
        letterSpacing: '0',
      },
      border: { width: '3px', strongWidth: '4px', style: 'solid' },
      radius: { small: '4px', medium: '8px', large: '8px' },
      shadow: { card: '7px 7px 0 #0b0b0b', overlay: '12px 12px 0 #0b0b0b' },
      pattern: {
        backgroundImage: 'radial-gradient(#0b0b0b 1.5px, transparent 1.5px)',
        backgroundSize: '12px 12px',
      },
      motion: { duration: '110ms', easing: 'steps(2, end)' },
    },
  },
  pixel: {
    id: 'pixel',
    name: 'Pixel',
    nameKey: 'themePixel',
    tokens: {
      color: {
        background: '#c7d8c6',
        surface: '#f8f8f0',
        surfaceRaised: '#dfe8d8',
        text: '#1f2a24',
        mutedText: '#526157',
        border: '#1f2a24',
        accent: '#2f6fed',
        accentText: '#ffffff',
        folder: '#2aa876',
        danger: '#b83232',
      },
      typography: {
        fontFamily: 'Courier New, ui-monospace, SFMono-Regular, Menlo, monospace',
        headingWeight: '700',
        bodyWeight: '400',
        letterSpacing: '0',
      },
      border: { width: '2px', strongWidth: '4px', style: 'solid' },
      radius: { small: '0px', medium: '0px', large: '0px' },
      shadow: { card: '4px 4px 0 #1f2a24', overlay: '8px 8px 0 #1f2a24' },
      pattern: {
        backgroundImage:
          'linear-gradient(90deg, rgb(31 42 36 / .16) 1px, transparent 1px), linear-gradient(rgb(31 42 36 / .16) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      },
      motion: { duration: '80ms', easing: 'steps(3, end)' },
    },
  },
};

export function applyTheme(id: ThemeId): ThemeDefinition {
  const theme = THEMES[id];
  const root = document.documentElement;

  root.dataset.theme = id;
  writeTokenGroup(root, 'color', theme.tokens.color);
  writeTokenGroup(root, 'typography', theme.tokens.typography);
  writeTokenGroup(root, 'border', theme.tokens.border);
  writeTokenGroup(root, 'radius', theme.tokens.radius);
  writeTokenGroup(root, 'shadow', theme.tokens.shadow);
  writeTokenGroup(root, 'pattern', theme.tokens.pattern);
  writeTokenGroup(root, 'motion', theme.tokens.motion);

  return theme;
}

function writeTokenGroup(
  root: HTMLElement,
  groupName: string,
  tokens: Record<string, string>,
): void {
  for (const [tokenName, tokenValue] of Object.entries(tokens)) {
    root.style.setProperty(`--atlas-${groupName}-${toKebabCase(tokenName)}`, tokenValue);
  }
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
