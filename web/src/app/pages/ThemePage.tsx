import { Accessibility, Checkmark, PaintBrush, Reset } from '@carbon/icons-react'
import {
  Button,
  InlineNotification,
  RadioTile,
  Tag,
  TextInput,
  TileGroup,
  Toggle,
} from '@carbon/react'
import { type CSSProperties, useMemo, useState, useSyncExternalStore } from 'react'

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
  CARBON_COLOR_FAMILIES,
  CARBON_FAMILY_BY_ID,
  PICKER_SHADES,
  deleteCustomTheme,
  generateThemeFromPalette,
  getCustomThemes,
  saveCustomTheme,
  themeOrder,
  themes as builtInThemes,
  type BaseShell,
  type PlatformFontPresetId,
  type Theme,
  type ThemeColors,
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

function baseShellDescription(base: BaseShell): string {
  switch (base) {
    case 'white':
      return 'Brightest documentation-first shell.'
    case 'g10':
      return 'Light-neutral desktop shell.'
    case 'g90':
      return 'Dense dark shell with softer contrast.'
    case 'g100':
    default:
      return 'Deep studio-dark baseline.'
  }
}

function usesCssVariables(theme: Theme): boolean {
  return Object.values(theme.colors).some((value) => typeof value === 'string' && value.includes('var('))
}

function resolvePreviewTheme(themeId: string, theme: Theme): Theme {
  if (themeId in builtInThemes || usesCssVariables(theme)) {
    return generateThemeFromPalette('blue', (theme.carbonTheme ?? 'g100') as BaseShell, {}, theme.id, theme.name)
  }

  return theme
}

function isHexLike(value: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(value.trim())
}

const PREVIEW_SWATCH_KEYS: Array<keyof Theme['colors']> = [
  'bg',
  'surface',
  'surface-2',
  'primary',
  'accent',
]

const BASE_SHELL_OPTIONS: BaseShell[] = ['g100', 'g90', 'g10', 'white']

const COLOR_SLOT_GROUPS: Array<{ label: string; slots: Array<keyof ThemeColors> }> = [
  {
    label: 'Surfaces',
    slots: ['bg', 'surface', 'surface-2', 'surface-3', 'surface-overlay'],
  },
  {
    label: 'Interactive',
    slots: [
      'interactive',
      'interactive-hover',
      'interactive-active',
      'interactive-disabled',
      'primary',
      'primary-strong',
      'accent',
      'focus-ring',
    ],
  },
  {
    label: 'Text',
    slots: [
      'text-primary',
      'text-secondary',
      'text-tertiary',
      'text-inverse',
      'muted',
      'muted-2',
    ],
  },
  {
    label: 'Borders',
    slots: ['border', 'border-strong'],
  },
  {
    label: 'Status',
    slots: ['support-success', 'support-warning', 'support-danger', 'support-info', 'success', 'warning', 'danger'],
  },
  {
    label: 'State backgrounds',
    slots: ['bg-empty', 'bg-offline', 'bg-fault', 'bg-warning'],
  },
  {
    label: 'Shadow',
    slots: ['shadow-strong', 'shadow-soft'],
  },
]

const SLOT_LABELS: Partial<Record<keyof ThemeColors, string>> = {
  bg: 'Background',
  surface: 'Surface 01',
  'surface-2': 'Surface 02',
  'surface-3': 'Surface 03',
  'surface-overlay': 'Overlay',
  interactive: 'Interactive',
  'interactive-hover': 'Interactive Hover',
  'interactive-active': 'Interactive Active',
  'interactive-disabled': 'Interactive Disabled',
  primary: 'Primary',
  'primary-strong': 'Primary Strong',
  accent: 'Accent',
  'focus-ring': 'Focus Ring',
  'text-primary': 'Text Primary',
  'text-secondary': 'Text Secondary',
  'text-tertiary': 'Text Tertiary',
  'text-inverse': 'Text Inverse',
  muted: 'Muted',
  'muted-2': 'Muted 2',
  border: 'Border',
  'border-strong': 'Border Strong',
  'support-success': 'Support Success',
  'support-warning': 'Support Warning',
  'support-danger': 'Support Danger',
  'support-info': 'Support Info',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
  'bg-empty': 'Background Empty',
  'bg-offline': 'Background Offline',
  'bg-fault': 'Background Fault',
  'bg-warning': 'Background Warning',
  'shadow-strong': 'Shadow Strong',
  'shadow-soft': 'Shadow Soft',
}

const SUGGESTED_DIRECTIONS: Array<{
  id: string
  name: string
  familyId: string
  base: BaseShell
  description: string
}> = [
  {
    id: 'studio-pulse',
    name: 'Studio Pulse',
    familyId: 'blue',
    base: 'g100',
    description: 'Balanced dark control-room palette for metering, routing graphs, and dense shells.',
  },
  {
    id: 'amber-relay',
    name: 'Amber Relay',
    familyId: 'orange',
    base: 'g90',
    description: 'Warmer alert-biased shell that makes state changes and warnings read faster.',
  },
  {
    id: 'teal-daylight',
    name: 'Teal Daylight',
    familyId: 'teal',
    base: 'g10',
    description: 'Light-neutral daytime layout with cleaner visual separation for long editing sessions.',
  },
  {
    id: 'volt-white',
    name: 'Volt White',
    familyId: 'green',
    base: 'white',
    description: 'Bright operator theme with assertive success semantics and minimal visual drag.',
  },
]

export function ThemePage() {
  const { theme, themeId, setTheme } = useTheme()
  const { fontPreset, fontPresetId, fontPresets, setFontPreset } = usePlatformFontPreference()
  const {
    reducedEffectsEnabled,
    prefersReducedMotion,
    shouldReduceEffects,
    setReducedEffectsEnabled,
  } = useReducedEffectsPreference()
  const [themeLibraryVersion, setThemeLibraryVersion] = useState(0)
  const [draftBase, setDraftBase] = useState<BaseShell>(() => (theme.carbonTheme ?? 'g100') as BaseShell)
  const [draftFamilyId, setDraftFamilyId] = useState('blue')
  const [draftName, setDraftName] = useState('')
  const [draftOverrides, setDraftOverrides] = useState<Partial<ThemeColors>>({})
  const [activeSlot, setActiveSlot] = useState<keyof ThemeColors | null>(null)
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
  const customThemes = useMemo(() => getCustomThemes(), [themeId, themeLibraryVersion])
  const customThemeEntries = useMemo(
    () => Object.values(customThemes).sort((left, right) => left.name.localeCompare(right.name)),
    [customThemes],
  )
  const previewTheme = useMemo(() => resolvePreviewTheme(themeId, theme), [theme, themeId])
  const draftTheme = useMemo(
    () =>
      generateThemeFromPalette(
        draftFamilyId,
        draftBase,
        draftOverrides,
        undefined,
        draftName.trim() || undefined,
      ),
    [draftBase, draftFamilyId, draftName, draftOverrides],
  )
  const isCustomTheme = !(themeId in builtInThemes)
  const totalThemeCount = themeOrder.length + customThemeEntries.length
  const draftOverrideCount = Object.keys(draftOverrides).length

  const handleLoadSuggestion = (familyId: string, base: BaseShell, name: string) => {
    setDraftFamilyId(familyId)
    setDraftBase(base)
    setDraftName(name)
    setDraftOverrides({})
    setActiveSlot(null)
  }

  const handleSaveDraftTheme = () => {
    const nextThemeId = `custom-${draftFamilyId}-${draftBase}-${Date.now()}`
    const name = draftName.trim() || draftTheme.name
    const savedTheme: Theme = {
      ...draftTheme,
      id: nextThemeId,
      name,
    }

    saveCustomTheme(savedTheme)
    setTheme(nextThemeId)
    setThemeLibraryVersion((value) => value + 1)
  }

  const handleDeleteCustomTheme = (customThemeId: string) => {
    deleteCustomTheme(customThemeId)
    if (themeId === customThemeId) {
      setTheme('default')
    }
    setThemeLibraryVersion((value) => value + 1)
  }

  const handleResetDraft = () => {
    setDraftFamilyId('blue')
    setDraftBase((theme.carbonTheme ?? 'g100') as BaseShell)
    setDraftName('')
    setDraftOverrides({})
    setActiveSlot(null)
  }

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
                The full MAP2 appearance system lives here now: preset library, custom theme builder, typography,
                motion, and shared category accents in one surface.
              </p>
            </div>
          </div>

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
            <Tag type={shouldReduceEffects ? 'green' : 'warm-gray'} size="sm">
              {shouldReduceEffects ? 'Reduced effects' : 'Full effects'}
            </Tag>
            {isCustomTheme ? (
              <Tag type="warm-gray" size="sm">
                Custom theme active
              </Tag>
            ) : null}
          </div>

          <div className="theme-page__stat-grid">
            <article className="theme-page__stat-card">
              <span className="theme-page__stat-label">Active shell</span>
              <strong>{carbonThemeLabel(theme.carbonTheme)}</strong>
            </article>
            <article className="theme-page__stat-card">
              <span className="theme-page__stat-label">Theme library</span>
              <strong>{totalThemeCount} choices</strong>
            </article>
            <article className="theme-page__stat-card">
              <span className="theme-page__stat-label">Category accents</span>
              <strong>{overriddenCategoryCount} custom</strong>
            </article>
            <article className="theme-page__stat-card">
              <span className="theme-page__stat-label">Draft overrides</span>
              <strong>{draftOverrideCount}</strong>
            </article>
          </div>
        </div>

        <div className="theme-page__hero-stage">
          <ThemeDeckPreview theme={previewTheme} />
          <div className="theme-page__hero-preview" aria-hidden="true">
            {PREVIEW_SWATCH_KEYS.map((key) => (
              <span
                key={key}
                className="theme-page__hero-swatch"
                style={{ background: previewTheme.colors[key] }}
              />
            ))}
          </div>
        </div>
      </header>

      <section className="theme-page__panel">
        <div className="theme-page__section-head">
          <div>
            <p className="theme-page__card-eyebrow">Library</p>
            <h2 className="theme-page__section-title">Theme library</h2>
            <p className="theme-page__section-copy">
              Apply the standard Carbon shells directly, then keep any locally saved custom palettes beside them.
            </p>
          </div>
          <Tag type="cool-gray" size="sm">
            {themeOrder.length} built-in
          </Tag>
        </div>

        <div className="theme-page__theme-grid">
          {themeOrder.map((builtInThemeId) => {
            const builtInTheme = builtInThemes[builtInThemeId]
            const builtInPreview = resolvePreviewTheme(builtInThemeId, builtInTheme)
            const active = themeId === builtInThemeId

            return (
              <article key={builtInThemeId} className={`theme-page__theme-card ${active ? 'theme-page__theme-card--active' : ''}`}>
                <div className="theme-page__theme-card-copy">
                  <div className="theme-page__theme-card-head">
                    <strong>{builtInTheme.name}</strong>
                    <Tag type={active ? 'blue' : 'cool-gray'} size="sm">
                      {active ? 'Active' : carbonThemeLabel(builtInTheme.carbonTheme)}
                    </Tag>
                  </div>
                  <p>{builtInTheme.description}</p>
                </div>
                <ThemeDeckPreview theme={builtInPreview} compact />
                <div className="theme-page__theme-actions">
                  <Button
                    kind={active ? 'secondary' : 'primary'}
                    size="sm"
                    disabled={active}
                    onClick={() => setTheme(builtInThemeId)}
                  >
                    {active ? 'Applied' : `Apply ${builtInTheme.name}`}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>

        <div className="theme-page__section-head theme-page__section-head--compact">
          <div>
            <p className="theme-page__card-eyebrow">Saved</p>
            <h3 className="theme-page__section-title">Custom themes</h3>
          </div>
          <Tag type={customThemeEntries.length > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
            {customThemeEntries.length > 0 ? `${customThemeEntries.length} saved` : 'None yet'}
          </Tag>
        </div>

        {customThemeEntries.length === 0 ? (
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="info"
            title="No saved custom themes yet."
            subtitle="Build one in Theme Studio below and it will appear here for fast reuse."
          />
        ) : (
          <div className="theme-page__theme-grid">
            {customThemeEntries.map((customTheme) => {
              const customPreview = resolvePreviewTheme(customTheme.id, customTheme)
              const active = themeId === customTheme.id

              return (
                <article key={customTheme.id} className={`theme-page__theme-card ${active ? 'theme-page__theme-card--active' : ''}`}>
                  <div className="theme-page__theme-card-copy">
                    <div className="theme-page__theme-card-head">
                      <strong>{customTheme.name}</strong>
                      <Tag type={active ? 'blue' : 'warm-gray'} size="sm">
                        {active ? 'Active' : 'Custom'}
                      </Tag>
                    </div>
                    <p>{customTheme.description}</p>
                  </div>
                  <ThemeDeckPreview theme={customPreview} compact />
                  <div className="theme-page__theme-actions">
                    <Button
                      kind={active ? 'secondary' : 'primary'}
                      size="sm"
                      disabled={active}
                      onClick={() => setTheme(customTheme.id)}
                    >
                      {active ? 'Applied' : 'Apply'}
                    </Button>
                    <Button
                      kind="danger--ghost"
                      size="sm"
                      onClick={() => handleDeleteCustomTheme(customTheme.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="theme-page__panel">
        <div className="theme-page__section-head">
          <div>
            <p className="theme-page__card-eyebrow">Suggested new</p>
            <h2 className="theme-page__section-title">Suggested directions</h2>
            <p className="theme-page__section-copy">
              Fresh starting points for different operator moods. Load one into the studio, then tune the token set.
            </p>
          </div>
          <Tag type="cyan" size="sm">
            Curated
          </Tag>
        </div>

        <div className="theme-page__theme-grid">
          {SUGGESTED_DIRECTIONS.map((suggestion) => {
            const suggestionTheme = generateThemeFromPalette(
              suggestion.familyId,
              suggestion.base,
              {},
              suggestion.id,
              suggestion.name,
            )

            return (
              <article key={suggestion.id} className="theme-page__theme-card theme-page__theme-card--suggested">
                <div className="theme-page__theme-card-copy">
                  <div className="theme-page__theme-card-head">
                    <strong>{suggestion.name}</strong>
                    <Tag type="cool-gray" size="sm">
                      {carbonThemeLabel(suggestion.base)}
                    </Tag>
                  </div>
                  <p>{suggestion.description}</p>
                </div>
                <ThemeDeckPreview theme={suggestionTheme} compact />
                <div className="theme-page__theme-actions">
                  <Button
                    kind="secondary"
                    size="sm"
                    onClick={() => handleLoadSuggestion(suggestion.familyId, suggestion.base, suggestion.name)}
                  >
                    Load into studio
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="theme-page__panel">
        <div className="theme-page__section-head">
          <div>
            <p className="theme-page__card-eyebrow">Composer</p>
            <h2 className="theme-page__section-title">Theme studio</h2>
            <p className="theme-page__section-copy">
              Build a new theme from Carbon color families, choose the shell base, then tune token-level overrides
              without leaving the page.
            </p>
          </div>
          <div className="theme-page__section-tags">
            <Tag type="blue" size="sm">
              {CARBON_FAMILY_BY_ID[draftFamilyId]?.name ?? 'Blue'}
            </Tag>
            <Tag type="cool-gray" size="sm">
              {carbonThemeLabel(draftBase)}
            </Tag>
            <Tag type={draftOverrideCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
              {draftOverrideCount > 0 ? `${draftOverrideCount} overrides` : 'No overrides'}
            </Tag>
          </div>
        </div>

        <div className="theme-page__studio-layout">
          <div className="theme-page__studio-rail">
            <article className="theme-page__studio-card">
              <div className="theme-page__studio-card-head">
                <h3>Draft preview</h3>
                <Tag type="blue" size="sm">
                  {draftName.trim() || draftTheme.name}
                </Tag>
              </div>
              <ThemeDeckPreview theme={draftTheme} />
              <div className="theme-page__hero-preview" aria-hidden="true">
                {PREVIEW_SWATCH_KEYS.map((key) => (
                  <span
                    key={key}
                    className="theme-page__hero-swatch"
                    style={{ background: draftTheme.colors[key] }}
                  />
                ))}
              </div>
            </article>

            <article className="theme-page__studio-card">
              <div className="theme-page__studio-card-head">
                <h3>Base shell</h3>
                <Tag type="cool-gray" size="sm">
                  4 shells
                </Tag>
              </div>
              <div className="theme-page__base-grid">
                {BASE_SHELL_OPTIONS.map((base) => (
                  <button
                    key={base}
                    type="button"
                    className={`theme-page__base-card ${draftBase === base ? 'theme-page__base-card--active' : ''}`}
                    onClick={() => setDraftBase(base)}
                    aria-pressed={draftBase === base}
                  >
                    <span className={`theme-page__base-dot theme-page__base-dot--${base}`} aria-hidden="true" />
                    <strong>{carbonThemeLabel(base)}</strong>
                    <span>{baseShellDescription(base)}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="theme-page__studio-card">
              <div className="theme-page__studio-card-head">
                <h3>Primary family</h3>
                <Tag type="cool-gray" size="sm">
                  {CARBON_COLOR_FAMILIES.length} Carbon families
                </Tag>
              </div>
              <div className="theme-page__family-grid">
                {CARBON_COLOR_FAMILIES.map((family) => {
                  const previewShade = draftBase === 'g100' || draftBase === 'g90' ? 50 : 60
                  const selected = draftFamilyId === family.id

                  return (
                    <button
                      key={family.id}
                      type="button"
                      className={`theme-page__family-card ${selected ? 'theme-page__family-card--active' : ''}`}
                      onClick={() => setDraftFamilyId(family.id)}
                      aria-pressed={selected}
                    >
                      <span
                        className="theme-page__family-band"
                        style={{
                          background: `linear-gradient(to right, ${Object.values(family.shades).join(', ')})`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="theme-page__family-copy">
                        <span
                          className="theme-page__family-dot"
                          style={{ background: family.shades[previewShade] }}
                          aria-hidden="true"
                        />
                        <strong>{family.name}</strong>
                        {selected ? <Checkmark size={14} aria-hidden /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </article>

            <article className="theme-page__studio-card">
              <div className="theme-page__studio-card-head">
                <h3>Save draft</h3>
                <Tag type="warm-gray" size="sm">
                  Local to this browser
                </Tag>
              </div>
              <TextInput
                id="theme-page-custom-theme-name"
                labelText="Custom theme name"
                placeholder={draftTheme.name}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                maxLength={60}
              />
              <div className="theme-page__studio-actions">
                <Button kind="ghost" renderIcon={Reset} onClick={handleResetDraft}>
                  Reset draft
                </Button>
                <Button kind="primary" renderIcon={PaintBrush} onClick={handleSaveDraftTheme}>
                  Save and apply custom theme
                </Button>
              </div>
            </article>
          </div>

          <div className="theme-page__slot-groups">
            {COLOR_SLOT_GROUPS.map((group) => (
              <article key={group.label} className="theme-page__studio-card">
                <div className="theme-page__studio-card-head">
                  <h3>{group.label}</h3>
                  <Tag type="cool-gray" size="sm">
                    {group.slots.length} tokens
                  </Tag>
                </div>
                <div className="theme-page__slot-grid">
                  {group.slots.map((slot) => {
                    const value = draftTheme.colors[slot]
                    const overridden = slot in draftOverrides
                    const open = activeSlot === slot

                    return (
                      <div
                        key={slot}
                        className={`theme-page__slot-card ${open ? 'theme-page__slot-card--open' : ''} ${overridden ? 'theme-page__slot-card--overridden' : ''}`}
                      >
                        <button
                          type="button"
                          className="theme-page__slot-button"
                          onClick={() => setActiveSlot(open ? null : slot)}
                        >
                          <span
                            className="theme-page__slot-swatch"
                            style={{
                              background: isHexLike(value) || value.startsWith('rgb') || value.startsWith('hsl') || value.startsWith('color-mix')
                                ? value
                                : 'transparent',
                              borderStyle: isHexLike(value) || value.startsWith('rgb') || value.startsWith('hsl') || value.startsWith('color-mix')
                                ? 'solid'
                                : 'dashed',
                            }}
                            aria-hidden="true"
                          />
                          <span className="theme-page__slot-copy">
                            <strong>{SLOT_LABELS[slot] ?? slot}</strong>
                            <code>{value}</code>
                          </span>
                          {overridden ? (
                            <Tag type="warm-gray" size="sm">
                              Edited
                            </Tag>
                          ) : null}
                        </button>

                        {overridden ? (
                          <Button
                            kind="ghost"
                            size="sm"
                            className="theme-page__slot-reset"
                            onClick={() =>
                              setDraftOverrides((current) => {
                                const next = { ...current }
                                delete next[slot]
                                return next
                              })
                            }
                          >
                            Reset
                          </Button>
                        ) : null}

                        {open ? (
                          <SlotPalettePicker
                            currentValue={value}
                            onPick={(color) => {
                              setDraftOverrides((current) => ({ ...current, [slot]: color }))
                              setActiveSlot(null)
                            }}
                            onClose={() => setActiveSlot(null)}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="theme-page__lower-grid">
        <section className="theme-page__panel">
          <div className="theme-page__section-head">
            <div>
              <p className="theme-page__card-eyebrow">Typography</p>
              <h2 className="theme-page__section-title">Platform GUI font</h2>
              <p className="theme-page__section-copy">
                Apply interface typography across the shell immediately. The selected preset persists for this browser.
              </p>
            </div>
            <Tag type="cyan" size="sm">
              Live
            </Tag>
          </div>
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

        <section className="theme-page__panel">
          <div className="theme-page__section-head">
            <div>
              <p className="theme-page__card-eyebrow">Motion</p>
              <h2 className="theme-page__section-title">Reduce Effects Mode</h2>
              <p className="theme-page__section-copy">
                Save a lighter transition profile for Home, Audio Artifacts, JUCE Grid, and MIDI Hub while keeping the
                shell responsive on slower hosts.
              </p>
            </div>
            <Tag type={reducedEffectsEnabled ? 'green' : 'warm-gray'} size="sm">
              {reducedEffectsEnabled ? 'Saved on' : 'Saved off'}
            </Tag>
          </div>
          <div className="theme-page__motion-strip">
            <div className="theme-page__motion-card">
              <div className="theme-page__motion-head">
                <Accessibility size={20} aria-hidden />
                <div>
                  <strong>Operator preference</strong>
                  <p>Use the saved toggle below to keep movement restrained even when the OS does not require it.</p>
                </div>
              </div>
              <Toggle
                id="theme-page-reduce-effects"
                labelText="Reduce Effects Mode"
                labelA="Off"
                labelB="On"
                toggled={reducedEffectsEnabled}
                onToggle={setReducedEffectsEnabled}
              />
            </div>
          </div>
          {prefersReducedMotion ? (
            <InlineNotification
              lowContrast
              hideCloseButton
              kind="info"
              title="System reduced-motion is active."
              subtitle="OS accessibility settings still force minimal motion even if the saved preference is off."
            />
          ) : null}
        </section>
      </div>

      <section className="theme-page__panel">
        <div className="theme-page__section-head">
          <div>
            <p className="theme-page__card-eyebrow">Shared accents</p>
            <h2 className="theme-page__section-title">Category color theming</h2>
            <p className="theme-page__section-copy">
              These accents are reused by plugin cards, browser badges, and JUCE Grid category markers.
            </p>
          </div>
          <div className="theme-page__section-tags">
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
    </section>
  )
}

function ThemeDeckPreview({ theme, compact = false }: { theme: Theme; compact?: boolean }) {
  return (
    <div
      className={`theme-page__preview-window ${compact ? 'theme-page__preview-window--compact' : ''}`}
      style={{
        background: theme.colors.bg,
        borderColor: theme.colors.border,
        boxShadow: `0 18px 44px ${theme.colors['shadow-soft']}`,
      }}
    >
      <div
        className="theme-page__preview-bar"
        style={{
          background: theme.colors.surface,
          borderBottomColor: theme.colors.border,
        }}
      >
        <span className="theme-page__preview-dot" style={{ background: theme.colors.primary }} />
        <span className="theme-page__preview-dot" style={{ background: theme.colors.accent }} />
        <span className="theme-page__preview-dot" style={{ background: theme.colors.success }} />
      </div>

      <div className="theme-page__preview-body">
        <div className="theme-page__preview-stack">
          <div
            className="theme-page__preview-block theme-page__preview-block--primary"
            style={{
              background: theme.colors.surface,
              borderColor: theme.colors.border,
            }}
          />
          <div
            className="theme-page__preview-block"
            style={{
              background: theme.colors['surface-2'],
              borderColor: theme.colors.border,
            }}
          />
        </div>

        <div
          className="theme-page__preview-accent"
          style={{
            background: `linear-gradient(135deg, ${theme.colors.primary}26 0%, ${theme.colors.accent}24 100%)`,
            borderColor: theme.colors.border,
          }}
        >
          <span style={{ color: theme.colors['text-primary'] }}>Signal path</span>
          <div className="theme-page__preview-pill-row">
            <span
              className="theme-page__preview-pill"
              style={{
                background: theme.colors.primary,
                color: theme.colors['text-inverse'],
              }}
            >
              Live
            </span>
            <span
              className="theme-page__preview-pill theme-page__preview-pill--ghost"
              style={{
                borderColor: theme.colors['border-strong'],
                color: theme.colors.accent,
              }}
            >
              Preview
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SlotPalettePickerProps {
  currentValue: string
  onPick: (color: string) => void
  onClose: () => void
}

function SlotPalettePicker({ currentValue, onPick, onClose }: SlotPalettePickerProps) {
  const [selectedFamilyId, setSelectedFamilyId] = useState(() => {
    for (const family of CARBON_COLOR_FAMILIES) {
      if (Object.values(family.shades).includes(currentValue)) {
        return family.id
      }
    }

    return 'blue'
  })

  const family = CARBON_FAMILY_BY_ID[selectedFamilyId]

  return (
    <div className="theme-page__picker">
      <div className="theme-page__picker-families">
        {CARBON_COLOR_FAMILIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`theme-page__picker-family ${selectedFamilyId === entry.id ? 'theme-page__picker-family--active' : ''}`}
            style={{ background: entry.shades[50] }}
            title={entry.name}
            onClick={() => setSelectedFamilyId(entry.id)}
          />
        ))}
      </div>

      <div className="theme-page__picker-shades">
        {PICKER_SHADES.map((shade) => {
          const shadeValue = family.shades[shade]
          const active = currentValue === shadeValue

          return (
            <button
              key={shade}
              type="button"
              className={`theme-page__picker-shade ${active ? 'theme-page__picker-shade--active' : ''}`}
              style={{ background: shadeValue }}
              title={`${family.name} ${shade}`}
              onClick={() => onPick(shadeValue)}
            >
              {active ? (
                <Checkmark
                  size={12}
                  style={{ color: shade <= 50 ? '#161616' : '#f4f4f4' }}
                  aria-hidden
                />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="theme-page__picker-foot">
        <code>{currentValue}</code>
        <Button kind="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}
