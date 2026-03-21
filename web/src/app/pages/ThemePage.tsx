import { Accessibility, PaintBrush } from '@carbon/icons-react'
import {
  Button,
  InlineNotification,
  RadioTile,
  Tag,
  TileGroup,
  Toggle,
} from '@carbon/react'
import { type CSSProperties, useMemo, useState, useSyncExternalStore } from 'react'

import { ThemeChooserModal } from '../components/ThemeChooserModal'
import {
  getCategoryColorOverrideSnapshot,
  getEditableCategoryConfigs,
  resetAllCategoryColorOverrides,
  resetCategoryColorOverride,
  setCategoryColorOverride,
  subscribeCategoryColorOverrides,
} from '../data/categoryStyles'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import {
  themes as builtInThemes,
  type PlatformFontPresetId,
  type Theme,
  usePlatformFontPreference,
  useTheme,
} from '../theme'
import './ThemePage.css'

function carbonThemeLabel(carbonTheme: Theme['carbonTheme']): string {
  switch (carbonTheme) {
    case 'white':
      return 'White'
    case 'g10':
      return 'Gray 10'
    case 'g90':
      return 'Gray 90'
    case 'g100':
    default:
      return 'Gray 100'
  }
}

const PREVIEW_SWATCH_KEYS: Array<keyof Theme['colors']> = [
  'bg',
  'surface',
  'surface-2',
  'primary',
  'accent',
]

export function ThemePage() {
  const [showThemeChooser, setShowThemeChooser] = useState(false)
  const { theme, themeId } = useTheme()
  const { fontPreset, fontPresetId, fontPresets, setFontPreset } = usePlatformFontPreference()
  const {
    reducedEffectsEnabled,
    prefersReducedMotion,
    setReducedEffectsEnabled,
  } = useReducedEffectsPreference()
  const categoryOverrideSnapshot = useSyncExternalStore(
    subscribeCategoryColorOverrides,
    getCategoryColorOverrideSnapshot,
    getCategoryColorOverrideSnapshot,
  )

  const editableCategoryConfigs = useMemo(() => getEditableCategoryConfigs(), [categoryOverrideSnapshot])
  const overriddenCategoryCount = useMemo(
    () => editableCategoryConfigs.filter(({ overridden }) => overridden).length,
    [editableCategoryConfigs],
  )
  const isCustomTheme = !(themeId in builtInThemes)

  return (
    <section className="theme-page">
      <header className="theme-page__hero">
        <div className="theme-page__hero-copy">
          <div className="theme-page__eyebrow">Platform appearance</div>
          <div className="theme-page__hero-title-row">
            <PaintBrush size={28} aria-hidden />
            <div>
              <h1 className="theme-page__title">Theme</h1>
              <p className="theme-page__subtitle">
                Tune the entire MAP2 shell from one Platform window: Carbon palette, GUI typography, motion profile,
                and shared category accents.
              </p>
            </div>
          </div>
        </div>

        <div className="theme-page__hero-actions">
          <div className="theme-page__hero-tags">
            <Tag type="blue" size="sm">
              {theme.name}
            </Tag>
            <Tag type="cool-gray" size="sm">
              {carbonThemeLabel(theme.carbonTheme)}
            </Tag>
            <Tag type="cyan" size="sm">
              {fontPreset.name}
            </Tag>
            {isCustomTheme ? (
              <Tag type="warm-gray" size="sm">
                Custom theme
              </Tag>
            ) : null}
          </div>
          <Button kind="primary" renderIcon={PaintBrush} onClick={() => setShowThemeChooser(true)}>
            Open Theme Studio
          </Button>
        </div>

        <div className="theme-page__hero-preview" aria-hidden="true">
          {PREVIEW_SWATCH_KEYS.map((key) => (
            <span
              key={key}
              className="theme-page__hero-swatch"
              style={{ background: theme.colors[key] }}
            />
          ))}
        </div>
      </header>

      <div className="theme-page__grid">
        <section className="theme-page__card">
          <div className="theme-page__card-head">
            <div>
              <p className="theme-page__card-eyebrow">Carbon palette</p>
              <h2 className="theme-page__card-title">Shell theme</h2>
            </div>
            <Tag type={isCustomTheme ? 'warm-gray' : 'blue'} size="sm">
              {isCustomTheme ? 'Custom saved' : 'Preset active'}
            </Tag>
          </div>
          <p className="theme-page__card-copy">{theme.description}</p>
          <div className="theme-page__theme-preview">
            <div
              className="theme-page__theme-preview-window"
              style={{
                background: theme.colors.bg,
                borderColor: theme.colors.border,
                boxShadow: theme.colors['shadow-soft'],
              }}
            >
              <div
                className="theme-page__theme-preview-bar"
                style={{ background: theme.colors.surface, borderBottomColor: theme.colors.border }}
              >
                <span
                  className="theme-page__theme-preview-dot"
                  style={{ background: theme.colors.primary }}
                />
                <span
                  className="theme-page__theme-preview-dot"
                  style={{ background: theme.colors.accent }}
                />
                <span
                  className="theme-page__theme-preview-dot"
                  style={{ background: theme.colors.success }}
                />
              </div>
              <div className="theme-page__theme-preview-body">
                <div
                  className="theme-page__theme-preview-layer"
                  style={{ background: theme.colors.surface }}
                />
                <div
                  className="theme-page__theme-preview-layer theme-page__theme-preview-layer--accent"
                  style={{
                    background: `linear-gradient(135deg, ${theme.colors.primary}22 0%, ${theme.colors.accent}1a 100%)`,
                    borderColor: theme.colors.border,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="theme-page__card">
          <div className="theme-page__card-head">
            <div>
              <p className="theme-page__card-eyebrow">Typography</p>
              <h2 className="theme-page__card-title">Platform GUI font</h2>
            </div>
            <Tag type="cyan" size="sm">
              Live
            </Tag>
          </div>
          <p className="theme-page__card-copy">
            Changes apply across the app shell immediately and persist for this browser profile.
          </p>
          <TileGroup
            className="theme-page__font-grid"
            legend="Platform GUI font"
            name="platform-gui-font"
            valueSelected={fontPresetId}
            onChange={(value) => {
              if (typeof value === 'string' && value in fontPresets) {
                setFontPreset(value as PlatformFontPresetId)
              }
            }}
          >
            {Object.values(fontPresets).map((preset) => (
              <RadioTile
                key={preset.id}
                id={`platform-font-${preset.id}`}
                value={preset.id}
                className="theme-page__font-tile"
              >
                <div className="theme-page__font-tile-copy">
                  <div className="theme-page__font-tile-head">
                    <strong>{preset.name}</strong>
                    <span
                      className="theme-page__font-chip"
                      style={{ '--theme-page-font-accent': preset.accent } as CSSProperties}
                    >
                      {preset.id === fontPresetId ? 'Active' : 'Available'}
                    </span>
                  </div>
                  <p>{preset.description}</p>
                  <div className="theme-page__font-sample" style={{ fontFamily: preset.family }}>
                    {preset.sample}
                  </div>
                </div>
              </RadioTile>
            ))}
          </TileGroup>
        </section>

        <section className="theme-page__card">
          <div className="theme-page__card-head">
            <div>
              <p className="theme-page__card-eyebrow">Motion</p>
              <h2 className="theme-page__card-title">Reduce Effects Mode</h2>
            </div>
            <Tag type={reducedEffectsEnabled ? 'green' : 'warm-gray'} size="sm">
              {reducedEffectsEnabled ? 'Saved on' : 'Saved off'}
            </Tag>
          </div>
          <p className="theme-page__card-copy">
            Saves a lighter transition profile for Home, Audio Artifacts, JUCE Grid, and MIDI Hub while keeping the
            shell responsive on slower hosts.
          </p>
          <div className="theme-page__motion-controls">
            <Toggle
              id="theme-page-reduce-effects"
              labelText="Reduce Effects Mode"
              labelA="Off"
              labelB="On"
              toggled={reducedEffectsEnabled}
              onToggle={setReducedEffectsEnabled}
            />
          </div>
          {prefersReducedMotion ? (
            <InlineNotification
              lowContrast
              hideCloseButton
              kind="info"
              title="System reduced-motion is active."
              subtitle="OS accessibility settings will still force minimal motion even if the saved preference is off."
            />
          ) : null}
        </section>
      </div>

      <section className="theme-page__card theme-page__card--full">
        <div className="theme-page__card-head theme-page__card-head--spread">
          <div>
            <p className="theme-page__card-eyebrow">Shared accents</p>
            <h2 className="theme-page__card-title">Category color theming</h2>
            <p className="theme-page__card-copy theme-page__card-copy--tight">
              These accents are reused by plugin cards, browser badges, and JUCE Grid category markers.
            </p>
          </div>
          <div className="theme-page__category-actions">
            <Tag type={overriddenCategoryCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
              {overriddenCategoryCount > 0 ? `${overriddenCategoryCount} customized` : 'All default'}
            </Tag>
            <Button
              kind="ghost"
              size="sm"
              disabled={overriddenCategoryCount === 0}
              onClick={() => resetAllCategoryColorOverrides()}
            >
              Reset all
            </Button>
          </div>
        </div>

        <div className="theme-page__category-grid">
          {editableCategoryConfigs.map(({ key, label, config, overridden }) => {
            const Icon = config.icon

            return (
              <div key={key} className="theme-page__category-card">
                <div className="theme-page__category-top">
                  <span
                    className="theme-page__category-icon"
                    style={{
                      color: config.color,
                      background: config.gradient,
                    }}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="theme-page__category-copy">
                    <span className="theme-page__category-label">{label}</span>
                    <span className="theme-page__category-value">{config.color}</span>
                  </div>
                  {overridden ? (
                    <Tag type="warm-gray" size="sm">
                      Custom
                    </Tag>
                  ) : null}
                </div>

                <div className="theme-page__category-controls">
                  <input
                    aria-label={`${label} color`}
                    className="theme-page__category-picker"
                    type="color"
                    value={config.color}
                    onChange={(event) => {
                      setCategoryColorOverride(key, event.target.value)
                    }}
                  />
                  <Button
                    kind="ghost"
                    size="sm"
                    disabled={!overridden}
                    onClick={() => resetCategoryColorOverride(key)}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <ThemeChooserModal
        isOpen={showThemeChooser}
        onClose={() => setShowThemeChooser(false)}
      />
    </section>
  )
}
