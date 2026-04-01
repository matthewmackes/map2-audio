import { Accessibility, Checkmark, PaintBrush, Reset, Search, Settings } from '@carbon/icons-react'
import {
  Button,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  RadioTile,
  Search as CarbonSearch,
  Tag,
  TextInput,
  TileGroup,
  Toggle,
} from '@carbon/react'
import { type CSSProperties, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router-dom'

import { pluginsApi } from '@/map2/api'
import type { Plugin, PluginAppearanceOverride } from '@/map2/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '@/map2/displayNames'

import {
  getCategoryColorOverrideSnapshot,
  getEditableCategoryConfigs,
  resetAllCategoryColorOverrides,
  resetCategoryColorOverride,
  setCategoryColorOverride,
  subscribeCategoryColorOverrides,
} from '../data/categoryStyles'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
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
import { SpecialSettingsDialog } from '../components/SpecialSettingsDialog'
import { PlatformLaunchersWorkspace } from '../components/Platform/PlatformLaunchersWorkspace'
import { IconPickerModal } from '../components/pluginAppearance/IconPickerModal'
import { PluginAppearanceIcon } from '../components/pluginAppearance/PluginAppearanceIcon'
import { PluginColorPicker } from '../components/pluginAppearance/PluginColorPicker'
import { usePluginAppearances } from '../hooks/usePluginAppearances'
import type { PageTransitionPreset } from '../stores/effectsSettingsStore'
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

function pageTransitionPresetLabel(preset: PageTransitionPreset): string {
  switch (preset) {
    case 'pager-slide':
      return 'Pager slide'
    case 'hyperactive-block':
    default:
      return 'Hyperactive block'
  }
}

function isPageTransitionPreset(value: string): value is PageTransitionPreset {
  return value === 'hyperactive-block' || value === 'pager-slide'
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

const THEME_PLUGIN_DISCOVERY_TIMEOUT_MS = 3000

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

const PAGE_TRANSITION_PRESET_OPTIONS: Array<{
  id: PageTransitionPreset
  name: string
  description: string
}> = [
  {
    id: 'hyperactive-block',
    name: 'Hyperactive Block Reveal',
    description: 'Blueprint-style blocks sweep across supported shell routes for a harder-edged transition cue.',
  },
  {
    id: 'pager-slide',
    name: 'Pager Slide',
    description: 'Bring the next page in with a horizontal pager-style glide inspired by card-deck navigation.',
  },
]

type ThemeWorkspaceModal =
  | 'library'
  | 'directions'
  | 'studio'
  | 'typography'
  | 'motion'
  | 'launchers'
  | 'category'

type PluginAppearanceEditorMode = 'categories' | 'plugins'
type PluginSourceFilter = 'all' | 'lv2' | 'juce' | 'toobamp' | 'hardware'

function inferPluginSource(plugin: Plugin): PluginSourceFilter {
  if (plugin.is_hardware || plugin.format === 'Hardware') {
    return 'hardware'
  }

  const normalizedUri = plugin.uri.toLowerCase()
  if (normalizedUri.includes('map2://juce')) {
    return 'juce'
  }
  if (normalizedUri.includes('toob')) {
    return 'toobamp'
  }
  return 'lv2'
}

function sanitizePluginAppearanceDraft(draft: Partial<PluginAppearanceOverride>): Partial<PluginAppearanceOverride> {
  return {
    accent_color: draft.accent_color?.trim() || null,
    dark_variant: draft.dark_variant?.trim() || null,
    light_variant: draft.light_variant?.trim() || null,
    icon_identifier: draft.icon_identifier?.trim() || null,
    custom_svg: draft.custom_svg?.trim() || null,
    description: draft.description?.trim() || null,
  }
}

async function loadThemePluginInventory(): Promise<Plugin[]> {
  try {
    const discovery = await Promise.race([
      pluginsApi.discover(false).then((response) => response.plugins),
      new Promise<Plugin[]>((_, reject) => {
        window.setTimeout(() => reject(new Error('Plugin discovery timed out')), THEME_PLUGIN_DISCOVERY_TIMEOUT_MS)
      }),
    ])
    return Array.isArray(discovery) ? discovery : []
  } catch {
    const fallback = await pluginsApi.getAll()
    return Array.isArray(fallback) ? fallback : []
  }
}

function ThemeWorkspaceLauncher({
  title,
  description,
  tag,
  buttonLabel,
  onOpen,
}: {
  title: string
  description: string
  tag: string
  buttonLabel: string
  onOpen: () => void
}) {
  return (
    <article className="theme-page__launcher-card">
      <div className="theme-page__launcher-copy">
        <div className="theme-page__theme-card-head">
          <strong>{title}</strong>
          <Tag type="cool-gray" size="sm">
            {tag}
          </Tag>
        </div>
        <p>{description}</p>
      </div>
      <Button kind="primary" size="sm" onClick={onOpen}>
        {buttonLabel}
      </Button>
    </article>
  )
}

export function ThemePage({ initialModal = null }: { initialModal?: ThemeWorkspaceModal | null } = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { theme, themeId, setTheme } = useTheme()
  const { fontPreset, fontPresetId, fontPresets, setFontPreset } = usePlatformFontPreference()
  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    error: specialSettingsError,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()
  const {
    reducedEffectsEnabled,
    pageTransitionPreset,
    prefersReducedMotion,
    shouldReduceEffects,
    setReducedEffectsEnabled,
    setPageTransitionPreset,
  } = useReducedEffectsPreference()
  const [themeLibraryVersion, setThemeLibraryVersion] = useState(0)
  const [draftBase, setDraftBase] = useState<BaseShell>(() => (theme.carbonTheme ?? 'g100') as BaseShell)
  const [draftFamilyId, setDraftFamilyId] = useState('blue')
  const [draftName, setDraftName] = useState('')
  const [draftOverrides, setDraftOverrides] = useState<Partial<ThemeColors>>({})
  const [activeSlot, setActiveSlot] = useState<keyof ThemeColors | null>(null)
  const [activeModal, setActiveModal] = useState<ThemeWorkspaceModal | null>(null)
  const [showSpecialSettings, setShowSpecialSettings] = useState(false)
  const [categoryEditorMode, setCategoryEditorMode] = useState<PluginAppearanceEditorMode>('categories')
  const [pluginInventory, setPluginInventory] = useState<Plugin[]>([])
  const [pluginInventoryLoading, setPluginInventoryLoading] = useState(false)
  const [pluginInventoryError, setPluginInventoryError] = useState<string | null>(null)
  const [pluginSearch, setPluginSearch] = useState('')
  const [pluginSourceFilter, setPluginSourceFilter] = useState<PluginSourceFilter>('all')
  const [selectedPluginUri, setSelectedPluginUri] = useState<string | null>(null)
  const [pluginAppearanceDrafts, setPluginAppearanceDrafts] = useState<Record<string, Partial<PluginAppearanceOverride>>>({})
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const categoryOverrideSnapshot = useSyncExternalStore(
    subscribeCategoryColorOverrides,
    getCategoryColorOverrideSnapshot,
    getCategoryColorOverrideSnapshot,
  )
  const {
    appearances,
    setPluginAppearance,
    resetPluginAppearance,
    uploadPluginAppearanceIcon,
  } = usePluginAppearances()

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
  const specialSettingsHiddenPlugins = useMemo(
    () => specialSettings?.hiddenPlugins ?? [],
    [specialSettings?.hiddenPlugins],
  )
  const hiddenPluginCount = specialSettingsHiddenPlugins.length
  const landingTileCount = specialSettings?.landingTiles.length ?? 0
  const pinnedRouteCount = specialSettings?.pinnedRoutes.length ?? 0
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
  const pluginOverrideCount = Object.keys(appearances).length

  useEffect(() => {
    if (!initialModal) {
      return
    }

    setActiveModal((current) => current ?? initialModal)
  }, [initialModal])

  useEffect(() => {
    if (searchParams.get('themeModal') !== 'launchers') {
      return
    }

    setActiveModal((current) => current ?? 'launchers')

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('themeModal')
    setSearchParams(nextSearchParams, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (activeModal !== 'category' || pluginInventory.length > 0) {
      return
    }

    let cancelled = false
    setPluginInventoryLoading(true)
    setPluginInventoryError(null)
    void loadThemePluginInventory()
      .then((plugins) => {
        if (cancelled) {
          return
        }
        setPluginInventory(plugins)
        setSelectedPluginUri((current) => current ?? plugins[0]?.uri ?? null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setPluginInventoryError(error instanceof Error ? error.message : 'Failed to load plugins.')
      })
      .finally(() => {
        if (!cancelled) {
          setPluginInventoryLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeModal, pluginInventory.length])

  const filteredPlugins = useMemo(() => {
    const query = pluginSearch.trim().toLowerCase()

    return [...pluginInventory]
      .filter((plugin) => pluginSourceFilter === 'all' || inferPluginSource(plugin) === pluginSourceFilter)
      .filter((plugin) => {
        if (!query) {
          return true
        }

        return [
          getDisplayPluginName(plugin.name, plugin.uri),
          sanitizeRestrictedDisplayText(plugin.author),
          plugin.category,
          plugin.class_label,
          plugin.uri,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort((left, right) =>
        getDisplayPluginName(left.name, left.uri).localeCompare(getDisplayPluginName(right.name, right.uri)),
      )
  }, [pluginInventory, pluginSearch, pluginSourceFilter])

  useEffect(() => {
    if (!filteredPlugins.length) {
      setSelectedPluginUri(null)
      return
    }

    if (!selectedPluginUri || !filteredPlugins.some((plugin) => plugin.uri === selectedPluginUri)) {
      setSelectedPluginUri(filteredPlugins[0]?.uri ?? null)
    }
  }, [filteredPlugins, selectedPluginUri])

  const selectedPlugin = useMemo(
    () => pluginInventory.find((plugin) => plugin.uri === selectedPluginUri) ?? null,
    [pluginInventory, selectedPluginUri],
  )
  const selectedPluginAppearance = selectedPluginUri ? appearances[selectedPluginUri] ?? null : null
  const selectedPluginDraft = selectedPluginUri ? (pluginAppearanceDrafts[selectedPluginUri] ?? selectedPluginAppearance ?? { uri: selectedPluginUri }) : null

  const handlePluginDraftChange = (update: Partial<PluginAppearanceOverride>) => {
    if (!selectedPluginUri) {
      return
    }

    setPluginAppearanceDrafts((current) => ({
      ...current,
      [selectedPluginUri]: {
        ...(current[selectedPluginUri] ?? selectedPluginAppearance ?? { uri: selectedPluginUri }),
        ...update,
        uri: selectedPluginUri,
      },
    }))
  }

  const handleSavePluginAppearance = async () => {
    if (!selectedPluginUri || !selectedPluginDraft) {
      return
    }

    await setPluginAppearance(selectedPluginUri, sanitizePluginAppearanceDraft(selectedPluginDraft))
  }

  const handleResetPluginAppearance = async () => {
    if (!selectedPluginUri) {
      return
    }

    setPluginAppearanceDrafts((current) => {
      const next = { ...current }
      delete next[selectedPluginUri]
      return next
    })
    await resetPluginAppearance(selectedPluginUri)
  }

  const handleResetAllPluginAppearances = async () => {
    const uris = Object.keys(appearances)
    if (!uris.length) {
      return
    }

    await Promise.all(uris.map((uri) => resetPluginAppearance(uri)))
    setPluginAppearanceDrafts({})
  }

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

  const handleSpecialSettingsSave = async ({ hiddenPlugins }: { hiddenPlugins: string[] }) => {
    await updateSpecialSettings({ hiddenPlugins })
    setShowSpecialSettings(false)
  }

  const modalHeading =
    activeModal === 'library'
      ? 'Theme library'
      : activeModal === 'directions'
        ? 'Suggested directions'
        : activeModal === 'studio'
          ? 'Theme studio'
        : activeModal === 'typography'
            ? 'Platform GUI font'
            : activeModal === 'motion'
              ? 'Motion & effects'
              : activeModal === 'launchers'
                ? 'Launcher organizer'
              : activeModal === 'category'
                ? 'Category color theming'
                : ''

  const modalBody =
    activeModal === 'library' ? (
      <div className="theme-page__modal-stack">
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
              subtitle="Build one in Theme Studio and it will appear here for fast reuse."
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
                      <Button kind="danger--ghost" size="sm" onClick={() => handleDeleteCustomTheme(customTheme.id)}>
                        Delete
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    ) : activeModal === 'directions' ? (
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
                    onClick={() => {
                      handleLoadSuggestion(suggestion.familyId, suggestion.base, suggestion.name)
                      setActiveModal('studio')
                    }}
                  >
                    Load into studio
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    ) : activeModal === 'studio' ? (
      <section className="theme-page__panel">
        <div className="theme-page__section-head">
          <div>
            <p className="theme-page__card-eyebrow">Composer</p>
            <h2 className="theme-page__section-title">Theme studio</h2>
            <p className="theme-page__section-copy">
              Build a new theme from Carbon color families, choose the shell base, then tune token-level overrides.
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
                        style={{ background: `linear-gradient(to right, ${Object.values(family.shades).join(', ')})` }}
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
    ) : activeModal === 'typography' ? (
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
    ) : activeModal === 'motion' ? (
      <section className="theme-page__panel">
        <div className="theme-page__section-head">
          <div>
            <p className="theme-page__card-eyebrow">Motion</p>
            <h2 className="theme-page__section-title">Motion & effects</h2>
            <p className="theme-page__section-copy">
              Tune the routed shell&apos;s transition style, reduced-effects preference, and Theme-linked special settings in one place.
            </p>
          </div>
          <div className="theme-page__section-tags">
            <Tag type="blue" size="sm">
              {pageTransitionPresetLabel(pageTransitionPreset)}
            </Tag>
            <Tag type={reducedEffectsEnabled ? 'green' : 'warm-gray'} size="sm">
              {reducedEffectsEnabled ? 'Saved on' : 'Saved off'}
            </Tag>
          </div>
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
          <div className="theme-page__motion-card">
            <div className="theme-page__motion-head">
              <PaintBrush size={20} aria-hidden />
              <div>
                <strong>Page transition style</strong>
                <p>Choose how supported shell routes animate. Reduced motion still forces the minimal fade.</p>
              </div>
            </div>
            <TileGroup
              className="theme-page__motion-choice-grid"
              legend="Page transition style"
              name="theme-page-transition-style"
              valueSelected={pageTransitionPreset}
              onChange={(value) => {
                if (typeof value === 'string' && isPageTransitionPreset(value)) {
                  setPageTransitionPreset(value)
                }
              }}
            >
              {PAGE_TRANSITION_PRESET_OPTIONS.map((preset) => (
                <RadioTile
                  key={preset.id}
                  id={`theme-page-transition-${preset.id}`}
                  value={preset.id}
                  className="theme-page__motion-choice-tile"
                >
                  <div className="theme-page__motion-choice-copy">
                    <div className="theme-page__motion-choice-head">
                      <strong>{preset.name}</strong>
                      <span className="theme-page__motion-choice-chip">
                        {preset.id === pageTransitionPreset ? 'Selected' : 'Available'}
                      </span>
                    </div>
                    <p>{preset.description}</p>
                  </div>
                </RadioTile>
              ))}
            </TileGroup>
          </div>
          <div className="theme-page__motion-card">
            <div className="theme-page__motion-head">
              <Settings size={20} aria-hidden />
              <div>
                <strong>Special Settings Menu</strong>
                <p>Keep native-plugin visibility controls in the Theme workspace instead of the global header.</p>
              </div>
            </div>
            <div className="theme-page__motion-actions">
              <Tag type={hiddenPluginCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                {hiddenPluginCount > 0 ? `${hiddenPluginCount} hidden plugin${hiddenPluginCount === 1 ? '' : 's'}` : 'All native plugins visible'}
              </Tag>
              {specialSettingsLoading ? (
                <Tag type="cyan" size="sm">
                  Loading
                </Tag>
              ) : null}
              <Button kind="secondary" size="sm" renderIcon={Settings} onClick={() => setShowSpecialSettings(true)}>
                Open Special Settings Menu
              </Button>
            </div>
          </div>
        </div>
        {specialSettingsError ? (
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="error"
            title="Special settings are unavailable."
            subtitle={specialSettingsError}
          />
        ) : null}
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
    ) : activeModal === 'launchers' ? (
      <PlatformLaunchersWorkspace
        settings={specialSettings}
        isLoading={specialSettingsLoading}
        updateSettings={updateSpecialSettings}
      />
    ) : activeModal === 'category' ? (
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
            <Button kind="ghost" size="sm" disabled={overriddenCategoryCount === 0} onClick={() => resetAllCategoryColorOverrides()}>
              Reset all
            </Button>
          </div>
        </div>

        <div className="theme-page__editor-mode-grid" role="group" aria-label="Category editor mode">
          <Button
            kind={categoryEditorMode === 'categories' ? 'primary' : 'tertiary'}
            onClick={() => setCategoryEditorMode('categories')}
          >
            <span className="theme-page__editor-mode-copy">
              <strong>Category accents</strong>
              <span>Shared palette used by cards, chips, and browser badges.</span>
            </span>
          </Button>
          <Button
            kind={categoryEditorMode === 'plugins' ? 'primary' : 'tertiary'}
            onClick={() => setCategoryEditorMode('plugins')}
          >
            <span className="theme-page__editor-mode-copy">
              <strong>Plugin overrides</strong>
              <span>Per-plugin icon, accent, and description overrides.</span>
            </span>
          </Button>
        </div>

        {categoryEditorMode === 'categories' ? (
          <>
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
                      <Button kind="ghost" size="sm" disabled={!overridden} onClick={() => resetCategoryColorOverride(key)}>
                        Reset
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="theme-page__plugin-editor">
              <div className="theme-page__plugin-toolbar">
                <CarbonSearch
                  id="theme-plugin-appearance-search"
                  labelText="Search plugins"
                  placeholder="Search plugins, authors, categories"
                  value={pluginSearch}
                  onChange={(event) => setPluginSearch(event.currentTarget.value)}
                />
                <div className="theme-page__plugin-filter-row">
                  {(['all', 'lv2', 'juce', 'toobamp', 'hardware'] as PluginSourceFilter[]).map((filter) => (
                    <Button
                      key={filter}
                      kind={pluginSourceFilter === filter ? 'primary' : 'tertiary'}
                      size="sm"
                      onClick={() => setPluginSourceFilter(filter)}
                    >
                      {filter === 'all' ? 'All sources' : filter}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="theme-page__plugin-grid">
                <div className="theme-page__plugin-list">
                  <div className="theme-page__plugin-list-head">
                    <strong>Plugins</strong>
                    <Tag type={pluginOverrideCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                      {pluginOverrideCount > 0 ? `${pluginOverrideCount} customized` : 'No overrides'}
                    </Tag>
                  </div>
                  {pluginInventoryError ? (
                    <InlineNotification
                      lowContrast
                      hideCloseButton
                      kind="error"
                      title="Plugin catalog unavailable."
                      subtitle={pluginInventoryError}
                    />
                  ) : null}
                  {pluginInventoryLoading ? (
                    <div className="theme-page__plugin-empty">Loading plugin catalog…</div>
                  ) : filteredPlugins.length === 0 ? (
                    <div className="theme-page__plugin-empty">No plugins match the current filter.</div>
                  ) : (
                    <div className="theme-page__plugin-list-scroll">
                      {filteredPlugins.map((plugin) => {
                        const isSelected = plugin.uri === selectedPluginUri
                        const override = appearances[plugin.uri]
                        return (
                          <button
                            key={plugin.uri}
                            type="button"
                            className={`theme-page__plugin-list-item${isSelected ? ' theme-page__plugin-list-item--selected' : ''}`}
                            onClick={() => setSelectedPluginUri(plugin.uri)}
                          >
                            <span className="theme-page__plugin-list-icon">
                              <PluginAppearanceIcon
                                identifier={override?.icon_identifier}
                                customSvg={override?.custom_svg}
                                fallbackCategory={plugin.category}
                                size={22}
                              />
                            </span>
                            <span className="theme-page__plugin-list-copy">
                              <strong>{getDisplayPluginName(plugin.name, plugin.uri)}</strong>
                              <span>{plugin.category || plugin.class_label}</span>
                            </span>
                            <span className="theme-page__plugin-list-tags">
                              <Tag type="cool-gray" size="sm">
                                {inferPluginSource(plugin)}
                              </Tag>
                              {override ? (
                                <Tag type="warm-gray" size="sm">
                                  Custom
                                </Tag>
                              ) : null}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="theme-page__plugin-detail">
                  {selectedPlugin && selectedPluginDraft ? (
                    <>
                      <div className="theme-page__plugin-detail-head">
                        <div className="theme-page__plugin-detail-title">
                          <span className="theme-page__plugin-list-icon theme-page__plugin-list-icon--large">
                            <PluginAppearanceIcon
                              identifier={selectedPluginDraft.icon_identifier}
                              customSvg={selectedPluginDraft.custom_svg}
                              fallbackCategory={selectedPlugin.category}
                              size={28}
                            />
                          </span>
                          <div>
                            <h3>{getDisplayPluginName(selectedPlugin.name, selectedPlugin.uri)}</h3>
                            <p>{sanitizeRestrictedDisplayText(selectedPlugin.author)} · {selectedPlugin.category || selectedPlugin.class_label}</p>
                          </div>
                        </div>
                        <div className="theme-page__section-tags">
                          <Tag type="cool-gray" size="sm">
                            {inferPluginSource(selectedPlugin)}
                          </Tag>
                          <Button kind="ghost" size="sm" renderIcon={Search} onClick={() => setIconPickerOpen(true)}>
                            Pick icon
                          </Button>
                        </div>
                      </div>

                      <PluginColorPicker
                        accentColor={selectedPluginDraft.accent_color}
                        darkVariant={selectedPluginDraft.dark_variant}
                        lightVariant={selectedPluginDraft.light_variant}
                        onChange={handlePluginDraftChange}
                      />

                      <TextInput
                        id="theme-plugin-description"
                        labelText="Short description override"
                        value={selectedPluginDraft.description ?? ''}
                        onChange={(event) => handlePluginDraftChange({ description: event.currentTarget.value })}
                      />

                      <div className="theme-page__plugin-detail-actions">
                        <Button kind="secondary" size="sm" onClick={() => void handleSavePluginAppearance()}>
                          Save plugin override
                        </Button>
                        <Button kind="ghost" size="sm" disabled={!selectedPluginAppearance} onClick={() => void handleResetPluginAppearance()}>
                          Reset this plugin
                        </Button>
                        <Button kind="ghost" size="sm" disabled={pluginOverrideCount === 0} onClick={() => void handleResetAllPluginAppearances()}>
                          Reset all plugin overrides
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="theme-page__plugin-empty">Select a plugin to edit its icon, accent, and description.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="theme-page__plugin-editor">
              <div className="theme-page__plugin-toolbar">
                <CarbonSearch
                  id="theme-plugin-appearance-search"
                  labelText="Search plugins"
                  placeholder="Search plugins, authors, categories"
                  value={pluginSearch}
                  onChange={(event) => setPluginSearch(event.currentTarget.value)}
                />
                <div className="theme-page__plugin-filter-row">
                  {(['all', 'lv2', 'juce', 'toobamp', 'hardware'] as PluginSourceFilter[]).map((filter) => (
                    <Button
                      key={filter}
                      kind={pluginSourceFilter === filter ? 'primary' : 'tertiary'}
                      size="sm"
                      onClick={() => setPluginSourceFilter(filter)}
                    >
                      {filter === 'all' ? 'All sources' : filter}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="theme-page__plugin-grid">
                <div className="theme-page__plugin-list">
                  <div className="theme-page__plugin-list-head">
                    <strong>Plugins</strong>
                    <Tag type={pluginOverrideCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                      {pluginOverrideCount > 0 ? `${pluginOverrideCount} customized` : 'No overrides'}
                    </Tag>
                  </div>
                  {pluginInventoryError ? (
                    <InlineNotification
                      lowContrast
                      hideCloseButton
                      kind="error"
                      title="Plugin catalog unavailable."
                      subtitle={pluginInventoryError}
                    />
                  ) : null}
                  {pluginInventoryLoading ? (
                    <div className="theme-page__plugin-empty">Loading plugin catalog…</div>
                  ) : filteredPlugins.length === 0 ? (
                    <div className="theme-page__plugin-empty">No plugins match the current filter.</div>
                  ) : (
                    <div className="theme-page__plugin-list-scroll">
                      {filteredPlugins.map((plugin) => {
                        const isSelected = plugin.uri === selectedPluginUri
                        const override = appearances[plugin.uri]
                        return (
                          <button
                            key={plugin.uri}
                            type="button"
                            className={`theme-page__plugin-list-item${isSelected ? ' theme-page__plugin-list-item--selected' : ''}`}
                            onClick={() => setSelectedPluginUri(plugin.uri)}
                          >
                            <span className="theme-page__plugin-list-icon">
                              <PluginAppearanceIcon
                                identifier={override?.icon_identifier}
                                customSvg={override?.custom_svg}
                                fallbackCategory={plugin.category}
                                size={22}
                              />
                            </span>
                            <span className="theme-page__plugin-list-copy">
                              <strong>{getDisplayPluginName(plugin.name, plugin.uri)}</strong>
                              <span>{plugin.category || plugin.class_label}</span>
                            </span>
                            <span className="theme-page__plugin-list-tags">
                              <Tag type="cool-gray" size="sm">
                                {inferPluginSource(plugin)}
                              </Tag>
                              {override ? (
                                <Tag type="warm-gray" size="sm">
                                  Custom
                                </Tag>
                              ) : null}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="theme-page__plugin-detail">
                  {selectedPlugin && selectedPluginDraft ? (
                    <>
                      <div className="theme-page__plugin-detail-head">
                        <div className="theme-page__plugin-detail-title">
                          <span className="theme-page__plugin-list-icon theme-page__plugin-list-icon--large">
                            <PluginAppearanceIcon
                              identifier={selectedPluginDraft.icon_identifier}
                              customSvg={selectedPluginDraft.custom_svg}
                              fallbackCategory={selectedPlugin.category}
                              size={28}
                            />
                          </span>
                          <div>
                            <h3>{getDisplayPluginName(selectedPlugin.name, selectedPlugin.uri)}</h3>
                            <p>{sanitizeRestrictedDisplayText(selectedPlugin.author)} · {selectedPlugin.category || selectedPlugin.class_label}</p>
                          </div>
                        </div>
                        <div className="theme-page__section-tags">
                          <Tag type="cool-gray" size="sm">
                            {inferPluginSource(selectedPlugin)}
                          </Tag>
                          <Button kind="ghost" size="sm" renderIcon={Search} onClick={() => setIconPickerOpen(true)}>
                            Pick icon
                          </Button>
                        </div>
                      </div>

                      <PluginColorPicker
                        accentColor={selectedPluginDraft.accent_color}
                        darkVariant={selectedPluginDraft.dark_variant}
                        lightVariant={selectedPluginDraft.light_variant}
                        onChange={handlePluginDraftChange}
                      />

                      <TextInput
                        id="theme-plugin-description"
                        labelText="Short description override"
                        value={selectedPluginDraft.description ?? ''}
                        onChange={(event) => handlePluginDraftChange({ description: event.currentTarget.value })}
                      />

                      <div className="theme-page__plugin-detail-actions">
                        <Button kind="secondary" size="sm" onClick={() => void handleSavePluginAppearance()}>
                          Save plugin override
                        </Button>
                        <Button kind="ghost" size="sm" disabled={!selectedPluginAppearance} onClick={() => void handleResetPluginAppearance()}>
                          Reset this plugin
                        </Button>
                        <Button kind="ghost" size="sm" disabled={pluginOverrideCount === 0} onClick={() => void handleResetAllPluginAppearances()}>
                          Reset all plugin overrides
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="theme-page__plugin-empty">Select a plugin to edit its icon, accent, and description.</div>
                  )}
                </div>
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
                      <Button kind="ghost" size="sm" disabled={!overridden} onClick={() => resetCategoryColorOverride(key)}>
                        Reset
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>
    ) : null

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
                The Theme workspace is now a modal launcher. Open only the area you need instead of scrolling one long page.
              </p>
            </div>
          </div>

          <div className="theme-page__hero-tags">
            <Tag type="blue" size="sm">{theme.name}</Tag>
            <Tag type="cool-gray" size="sm">{carbonThemeLabel(theme.carbonTheme)}</Tag>
            <Tag type="cyan" size="sm">{fontPreset.name}</Tag>
            <Tag type="purple" size="sm">{pageTransitionPresetLabel(pageTransitionPreset)}</Tag>
            <Tag type={shouldReduceEffects ? 'green' : 'warm-gray'} size="sm">
              {shouldReduceEffects ? 'Reduced effects' : 'Full effects'}
            </Tag>
            {isCustomTheme ? <Tag type="warm-gray" size="sm">Custom theme active</Tag> : null}
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
              <span key={key} className="theme-page__hero-swatch" style={{ background: previewTheme.colors[key] }} />
            ))}
          </div>
        </div>
      </header>

      <section className="theme-page__launcher-grid">
        <ThemeWorkspaceLauncher
          title="Theme library"
          description="Apply built-in shells and reuse saved custom themes."
          tag={`${totalThemeCount} choices`}
          buttonLabel="Open theme library"
          onOpen={() => setActiveModal('library')}
        />
        <ThemeWorkspaceLauncher
          title="Suggested directions"
          description="Load curated theme directions before refining them."
          tag="Curated"
          buttonLabel="Open directions"
          onOpen={() => setActiveModal('directions')}
        />
        <ThemeWorkspaceLauncher
          title="Theme studio"
          description="Build and save new themes through a dedicated editor modal."
          tag={draftOverrideCount > 0 ? `${draftOverrideCount} overrides` : 'Draft'}
          buttonLabel="Open theme studio"
          onOpen={() => setActiveModal('studio')}
        />
        <ThemeWorkspaceLauncher
          title="Platform GUI font"
          description="Choose the platform font without keeping the rest of the theme tools visible."
          tag={fontPreset.name}
          buttonLabel="Open font modal"
          onOpen={() => setActiveModal('typography')}
        />
        <ThemeWorkspaceLauncher
          title="Motion & effects"
          description="Adjust transition style, reduced-effects behavior, and special settings in one focused modal."
          tag={pageTransitionPresetLabel(pageTransitionPreset)}
          buttonLabel="Open motion modal"
          onOpen={() => setActiveModal('motion')}
        />
        <ThemeWorkspaceLauncher
          title="Launcher organizer"
          description="Use a Carbon-style launcher table to open workspaces and configure Home or nav placement from Theme."
          tag={specialSettingsLoading ? 'Loading' : `${landingTileCount} home · ${pinnedRouteCount} nav`}
          buttonLabel="Open launcher organizer"
          onOpen={() => setActiveModal('launchers')}
        />
        <ThemeWorkspaceLauncher
          title="Category color theming"
          description="Edit shared category accents in their own modal."
          tag={overriddenCategoryCount > 0 ? `${overriddenCategoryCount} custom` : 'All default'}
          buttonLabel="Open category modal"
          onOpen={() => setActiveModal('category')}
        />
      </section>

      <SpecialSettingsDialog
        isOpen={showSpecialSettings}
        onClose={() => setShowSpecialSettings(false)}
        currentHiddenPlugins={specialSettingsHiddenPlugins}
        onSave={handleSpecialSettingsSave}
      />

      {activeModal ? (
        <ComposedModal open size="lg" onClose={() => setActiveModal(null)}>
          <ModalHeader title={modalHeading} label="Theme workspace modal" closeModal={() => setActiveModal(null)} />
          <ModalBody hasScrollingContent>{modalBody}</ModalBody>
          <ModalFooter>
            <Button kind="secondary" onClick={() => setActiveModal(null)}>
              Close
            </Button>
          </ModalFooter>
        </ComposedModal>
      ) : null}

      {selectedPlugin ? (
        <IconPickerModal
          open={iconPickerOpen}
          pluginName={getDisplayPluginName(selectedPlugin.name, selectedPlugin.uri)}
          currentIdentifier={selectedPluginDraft?.icon_identifier}
          currentCustomSvg={selectedPluginDraft?.custom_svg}
          fallbackCategory={selectedPlugin.category}
          onClose={() => setIconPickerOpen(false)}
          onSelect={(selection) => {
            handlePluginDraftChange({
              icon_identifier: selection.identifier,
              custom_svg: selection.customSvg ?? null,
            })
          }}
          onUploadCustomIcon={async (file) => {
            const response = await uploadPluginAppearanceIcon({ uri: selectedPlugin.uri, file })
            return {
              identifier: response.response.icon_identifier ?? 'custom:uploaded',
              customSvg: response.response.custom_svg ?? null,
            }
          }}
        />
      ) : null}
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
      <div className="theme-page__picker-families" role="radiogroup" aria-label="Color family">
        {CARBON_COLOR_FAMILIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`theme-page__picker-family ${selectedFamilyId === entry.id ? 'theme-page__picker-family--active' : ''}`}
            style={{ background: entry.shades[50] }}
            title={entry.name}
            role="radio"
            aria-checked={selectedFamilyId === entry.id}
            aria-label={`Select ${entry.name} family`}
            onClick={() => setSelectedFamilyId(entry.id)}
          />
        ))}
      </div>

      <div className="theme-page__picker-shades" role="radiogroup" aria-label={`${family.name} shades`}>
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
              role="radio"
              aria-checked={active}
              aria-label={`Select ${family.name} ${shade}`}
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
