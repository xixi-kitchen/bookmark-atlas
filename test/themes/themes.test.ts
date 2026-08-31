import { applyTheme, THEMES, type ThemeId } from '../../src/themes';
import { describe, expect, it } from 'vitest';

describe('themes', () => {
  it('registers all planned visual styles', () => {
    expect(Object.keys(THEMES).sort()).toEqual([
      'bauhaus',
      'excalidraw',
      'memphis',
      'pixel',
      'pop',
      'surreal',
      'swiss',
    ]);
  });

  it('keeps theme ids aligned with registry keys', () => {
    for (const [themeId, theme] of Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][]) {
      expect(theme.id).toBe(themeId);
      expect(theme.tokens.typography.letterSpacing).toBe('0');
    }
  });

  it('writes semantic CSS variables to the document root', () => {
    const theme = applyTheme('bauhaus');
    const root = document.documentElement;

    expect(root.dataset.theme).toBe('bauhaus');
    expect(root.style.getPropertyValue('--atlas-color-background')).toBe(
      theme.tokens.color.background,
    );
    expect(root.style.getPropertyValue('--atlas-typography-font-family')).toBe(
      theme.tokens.typography.fontFamily,
    );
    expect(root.style.getPropertyValue('--atlas-border-strong-width')).toBe(
      theme.tokens.border.strongWidth,
    );
    expect(root.style.getPropertyValue('--atlas-pattern-background-image')).toBe(
      theme.tokens.pattern.backgroundImage,
    );
  });
});
