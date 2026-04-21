import {
  PUBLIC_PANTONE_PALETTE_SETS,
  buildCarbonSemanticTokenRows,
  coercePaletteSetsFromManifest,
  mapPublicPaletteToTheme,
} from './pantonePaletteMapper';

describe('pantonePaletteMapper', () => {
  it('maps a public palette into concrete Carbon-compatible theme colors', () => {
    const palette = PUBLIC_PANTONE_PALETTE_SETS[1];
    const theme = mapPublicPaletteToTheme(palette, 'g100');
    const tokenRows = buildCarbonSemanticTokenRows(palette, theme);

    expect(theme.name).toContain(palette.name);
    expect(theme.carbonTheme).toBe('g100');
    expect(theme.colors.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(theme.colors.bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(theme.colors['support-danger']).toMatch(/^#[0-9a-f]{6}$/);
    expect(tokenRows.map((row) => row.token)).toContain('--cds-support-error');
    expect(tokenRows.map((row) => row.token)).toContain('--cds-button-primary');
  });

  it('coerces exported and imported palette manifests', () => {
    const palette = PUBLIC_PANTONE_PALETTE_SETS[0];

    expect(coercePaletteSetsFromManifest({ palette })).toEqual([palette]);
    expect(coercePaletteSetsFromManifest({ palettes: [palette] })).toEqual([palette]);
    expect(coercePaletteSetsFromManifest({ nope: true })).toEqual([]);
  });
});
