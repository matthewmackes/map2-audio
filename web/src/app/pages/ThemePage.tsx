import { Accessibility, Checkmark, Loop, PaintBrush, Reset, Search, Settings } from '@carbon/icons-react'
import {
  Button,
  InlineNotification,
  Modal,
  Search as CarbonSearch,
  Tag,
  TextInput,
  Toggle,
} from '@carbon/react'
import { type ChangeEvent, type CSSProperties, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import AutoSizer from 'react-virtualized-auto-sizer'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FixedSizeList, type ListChildComponentProps } from 'react-window'

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
import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '../components/navigation/UnifiedWorkspaceSideNav'
import {
  CARBON_COLOR_FAMILIES,
  CARBON_FAMILY_BY_ID,
  PICKER_SHADES,
  PRESET_THEME_ORDER,
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
import { IconPickerModal } from '../components/pluginAppearance/IconPickerModal'
import { PluginAppearanceIcon } from '../components/pluginAppearance/PluginAppearanceIcon'
import { PluginColorPicker } from '../components/pluginAppearance/PluginColorPicker'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { usePluginAppearances } from '../hooks/usePluginAppearances'
import type { PageTransitionPreset } from '../stores/effectsSettingsStore'
import {
  readDesktopWallpaperState,
  writeDesktopWallpaperState,
  type DesktopWallpaperState,
} from './desktopWallpaper'
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

/** Core Carbon shell theme IDs (non-preset) */
const CORE_THEME_IDS = ['default', 'gray-90', 'gray-10', 'white']

/** Preset theme grouping for catalog display */
const PRESET_THEME_GROUPS: Array<{ label: string; tag: string; ids: string[] }> = [
  {
    label: 'Windows Classic Era',
    tag: '3.1 – 2000',
    ids: ['win31-program-manager', 'win95-desktop', 'win98-active-desktop', 'win2000-professional', 'win-me-millennium', 'win-nt-workstation', 'win31-hot-dog-stand', 'win-classic-high-contrast'],
  },
  {
    label: 'Windows XP Era',
    tag: 'Luna',
    ids: ['xp-luna-blue', 'xp-luna-olive', 'xp-luna-silver', 'xp-royale', 'xp-zune'],
  },
  {
    label: 'Windows Vista / 7',
    tag: 'Aero',
    ids: ['vista-aero', 'vista-basic', 'win7-aero', 'win7-starter', 'win7-high-contrast-black', 'win7-high-contrast-white'],
  },
  {
    label: 'Windows 8 / 8.1',
    tag: 'Metro',
    ids: ['win8-metro', 'win81-modern', 'win8-start-screen', 'win-phone-8'],
  },
  {
    label: 'Windows 10 / 11',
    tag: 'Fluent',
    ids: ['win10-dark', 'win10-light', 'win10-blueberry', 'win11-dark', 'win11-light', 'win11-bloom', 'win11-glow', 'win-terminal', 'win365-cloud'],
  },
  {
    label: 'Microsoft Products',
    tag: 'MS',
    ids: ['azure-devops', 'visual-studio-dark', 'vscode-dark-plus', 'ms-teams', 'office-365'],
  },
  {
    label: 'Developer / Web',
    tag: 'Community',
    ids: ['dracula', 'solarized-dark', 'solarized-light', 'nord-polar', 'monokai-pro', 'one-dark-pro', 'gruvbox-dark', 'catppuccin-mocha', 'synthwave-84', 'github-dark', 'material-palenight', 'tokyo-night', 'cyberpunk-2077'],
  },
]

const PRESET_THEME_ROW_HEIGHT = 88
const PRESET_THEME_LIST_MAX_HEIGHT = 352

const THEME_PAGE_SECTION_IDS = {
  library: 'theme-library',
  preview: 'theme-preview',
  colorScheme: 'theme-color-scheme',
  font: 'theme-font',
  tokenStudio: 'theme-token-studio',
  appearanceAssets: 'theme-appearance-assets',
  personalization: 'theme-personalization',
  behavior: 'theme-behavior',
} as const

const THEME_PAGE_SECTION_LINKS: Array<{ id: string; label: string }> = [
  { id: THEME_PAGE_SECTION_IDS.library, label: 'Library' },
  { id: THEME_PAGE_SECTION_IDS.preview, label: 'Preview' },
  { id: THEME_PAGE_SECTION_IDS.colorScheme, label: 'Color Scheme' },
  { id: THEME_PAGE_SECTION_IDS.font, label: 'Font' },
  { id: THEME_PAGE_SECTION_IDS.tokenStudio, label: 'Token Studio' },
  { id: THEME_PAGE_SECTION_IDS.appearanceAssets, label: 'Appearance Assets' },
  { id: THEME_PAGE_SECTION_IDS.personalization, label: 'Personalization' },
  { id: THEME_PAGE_SECTION_IDS.behavior, label: 'Behavior' },
]

type PluginAppearanceEditorMode = 'categories' | 'plugins'
type PluginSourceFilter = 'all' | 'lv2' | 'juce' | 'toobamp' | 'hardware'
type ThemePreviewFocus = 'desktop' | 'inactive-window' | 'active-window' | 'message-box'

const PLUGIN_SOURCE_FILTER_LABELS: Record<Exclude<PluginSourceFilter, 'all'>, string> = {
  lv2: 'LV2',
  juce: 'JUCE',
  toobamp: 'Toob Amp',
  hardware: 'Hardware',
}

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

function inferFamilyIdFromTheme(theme: Theme): string {
  const primary = theme.colors.primary

  for (const family of CARBON_COLOR_FAMILIES) {
    if (Object.values(family.shades).includes(primary)) {
      return family.id
    }
  }

  return 'blue'
}

export function ThemePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
  const [draftFamilyId, setDraftFamilyId] = useState(() => inferFamilyIdFromTheme(resolvePreviewTheme(themeId, theme)))
  const [draftName, setDraftName] = useState('')
  const [draftOverrides, setDraftOverrides] = useState<Partial<ThemeColors>>({})
  const [draftDirty, setDraftDirty] = useState(false)
  const [activeSlot, setActiveSlot] = useState<keyof ThemeColors | null>(null)
  const [previewFocus, setPreviewFocus] = useState<ThemePreviewFocus>('active-window')
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
  const [desktopWallpaper, setDesktopWallpaper] = useState<DesktopWallpaperState>(() => readDesktopWallpaperState())
  const [wallpaperUploadError, setWallpaperUploadError] = useState<string | null>(null)
  const [pendingThemeSwitchId, setPendingThemeSwitchId] = useState<string | null>(null)
  const [activeCategoryPicker, setActiveCategoryPicker] = useState<string | null>(null)
  const wallpaperUploadInputRef = useRef<HTMLInputElement | null>(null)
  const activeSlotTriggerRef = useRef<HTMLButtonElement | null>(null)
  const activeCategoryTriggerRef = useRef<HTMLButtonElement | null>(null)
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
  const editorPreviewTheme = draftDirty ? draftTheme : previewTheme

  useEffect(() => {
    if (searchParams.get('themeModal') !== 'launchers') {
      return
    }

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('themeModal')
    const nextQuery = nextSearchParams.toString()
    navigate(`/platforms/theme${nextQuery ? `?${nextQuery}` : ''}`, { replace: true })
  }, [navigate, searchParams])

  useEffect(() => {
    if (categoryEditorMode !== 'plugins' || pluginInventory.length > 0) {
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
  }, [categoryEditorMode, pluginInventory.length])

  useEffect(() => {
    if (draftDirty) {
      return
    }

    const nextBase = (theme.carbonTheme ?? 'g100') as BaseShell
    const nextFamilyId = inferFamilyIdFromTheme(previewTheme)

    if (draftBase !== nextBase) {
      setDraftBase(nextBase)
    }
    if (draftFamilyId !== nextFamilyId) {
      setDraftFamilyId(nextFamilyId)
    }
    if (draftName !== '') {
      setDraftName('')
    }
    setDraftOverrides((current) => (Object.keys(current).length === 0 ? current : {}))
  }, [draftBase, draftDirty, draftFamilyId, draftName, previewTheme, theme.carbonTheme])

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

  const applyDesktopWallpaper = (nextState: DesktopWallpaperState) => {
    setDesktopWallpaper(writeDesktopWallpaperState(nextState))
    setWallpaperUploadError(null)
  }

  const applyThemeSelection = (nextThemeId: string) => {
    setActiveSlot(null)
    setTheme(nextThemeId)
    setDraftDirty(false)
  }

  const requestThemeSelection = (nextThemeId: string) => {
    if (draftDirty && draftOverrideCount > 0) {
      setPendingThemeSwitchId(nextThemeId)
      return
    }

    applyThemeSelection(nextThemeId)
  }

  const handleConfirmThemeSwitch = () => {
    if (!pendingThemeSwitchId) {
      return
    }

    applyThemeSelection(pendingThemeSwitchId)
    setPendingThemeSwitchId(null)
  }

  const selectDesktopWallpaperMode = (mode: DesktopWallpaperState['mode']) => {
    if (mode === 'uploaded-image') {
      applyDesktopWallpaper({
        version: 1,
        mode,
        imageDataUrl: desktopWallpaper.imageDataUrl,
      })
      return
    }

    applyDesktopWallpaper({ version: 1, mode })
  }

  const openWallpaperUploadPicker = () => {
    wallpaperUploadInputRef.current?.click()
  }

  const handleWallpaperUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setWallpaperUploadError('Choose an image file for the desktop wallpaper.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) {
        setWallpaperUploadError('Failed to load the selected wallpaper image.')
        return
      }

      applyDesktopWallpaper({
        version: 1,
        mode: 'uploaded-image',
        imageDataUrl: result,
      })
    }
    reader.onerror = () => {
      setWallpaperUploadError('Failed to load the selected wallpaper image.')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
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
    setDraftDirty(true)
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
    setDraftDirty(false)
  }

  const handleDeleteCustomTheme = (customThemeId: string) => {
    deleteCustomTheme(customThemeId)
    if (themeId === customThemeId) {
      setTheme('default')
    }
    setThemeLibraryVersion((value) => value + 1)
  }

  const handleResetDraft = () => {
    setDraftFamilyId(inferFamilyIdFromTheme(previewTheme))
    setDraftBase((theme.carbonTheme ?? 'g100') as BaseShell)
    setDraftName('')
    setDraftOverrides({})
    setActiveSlot(null)
    setDraftDirty(false)
  }

  const handleSpecialSettingsSave = async ({ hiddenPlugins }: { hiddenPlugins: string[] }) => {
    await updateSpecialSettings({ hiddenPlugins })
    setShowSpecialSettings(false)
  }

  const closeActiveSlot = () => {
    setActiveSlot(null)
    activeSlotTriggerRef.current?.focus({ preventScroll: true })
  }

  const closeActiveCategoryPicker = () => {
    setActiveCategoryPicker(null)
    activeCategoryTriggerRef.current?.focus({ preventScroll: true })
  }

  const [activeNavSection, setActiveNavSection] = useState<string>(THEME_PAGE_SECTION_IDS.library)

  const scrollToSection = (sectionId: string) => {
    setActiveNavSection(sectionId)
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const activeThemeLabel = draftDirty ? draftName.trim() || draftTheme.name : theme.name
  const previewFocusLabel = (() => {
    switch (previewFocus) {
      case 'desktop':
        return 'Desktop'
      case 'inactive-window':
        return 'Inactive window'
      case 'message-box':
        return 'Message box'
      case 'active-window':
      default:
        return 'Active window'
    }
  })()

  const themeSectionNavItems = useMemo<UnifiedWorkspaceSideNavItem[]>(() => {
    const iconBySectionId: Record<string, typeof PaintBrush> = {
      [THEME_PAGE_SECTION_IDS.library]: Search,
      [THEME_PAGE_SECTION_IDS.preview]: PaintBrush,
      [THEME_PAGE_SECTION_IDS.colorScheme]: PaintBrush,
      [THEME_PAGE_SECTION_IDS.font]: Checkmark,
      [THEME_PAGE_SECTION_IDS.tokenStudio]: Settings,
      [THEME_PAGE_SECTION_IDS.appearanceAssets]: Accessibility,
      [THEME_PAGE_SECTION_IDS.personalization]: Loop,
      [THEME_PAGE_SECTION_IDS.behavior]: Settings,
    }

    return THEME_PAGE_SECTION_LINKS.map((section) => ({
      key: section.id,
      label: section.label,
      description: `Jump to the ${section.label.toLowerCase()} editor section in the Theme workspace.`,
      to: `#${section.id}`,
      icon: iconBySectionId[section.id] ?? PaintBrush,
      active: activeNavSection === section.id,
      onOpen: () => scrollToSection(section.id),
      meta: activeNavSection === section.id ? 'Current' : undefined,
    }))
  }, [activeNavSection])

  const desktopThemeDialog = (
    <>
      <header className="theme-page__route-head">
        <p className="theme-page__eyebrow">Platform appearance</p>
        <div className="theme-page__hero-title-row">
          <PaintBrush size={24} aria-hidden />
          <div>
            <h1 className="theme-page__title">Theme</h1>
            <p className="theme-page__subtitle">
              Desktop-theme dialog workflow with a classic preview pane, tighter grouping, and Carbon-backed controls.
            </p>
          </div>
        </div>
      </header>

      <section className="theme-page__desktop-dialog">
        <div className="theme-page__workspace-shell">
          <UnifiedWorkspaceSideNav
            ariaLabel="Theme sections"
            className="theme-page__tree-nav"
            eyebrow="Appearance editor"
            title="Theme"
            description="One tree for library, preview, color, type, tokens, assets, personalization, and behavior tuning."
            items={themeSectionNavItems}
            metaBlocks={[
              { key: 'theme-active', label: 'Active theme', value: activeThemeLabel },
              { key: 'theme-carbon', label: 'Carbon base', value: carbonThemeLabel(draftDirty ? draftBase : theme.carbonTheme) },
              { key: 'theme-preview', label: 'Preview focus', value: previewFocusLabel },
            ]}
            callout={{
              kind: draftDirty ? 'warning' : 'info',
              text: draftDirty
                ? 'Draft theme edits are active in preview and not yet committed to the live shell.'
                : 'The live shell theme matches the values shown in this workspace.',
            }}
            storageKey="theme-workspace"
          />

          <div className="theme-page__workspace-content">
            <div className="theme-page__desktop-titlebar">
              <div className="theme-page__desktop-titlecopy">
                <strong>Desktop Themes</strong>
                <span>Preview the active shell, load a preset or direction, then tune tokens and assets from the same editor.</span>
              </div>
              <div className="theme-page__desktop-titlemeta">
                <div className="theme-page__section-tags">
                  <Tag type="blue" size="sm">{activeThemeLabel}</Tag>
                  <Tag type="cool-gray" size="sm">{carbonThemeLabel(draftDirty ? draftBase : theme.carbonTheme)}</Tag>
                  <Tag type="cyan" size="sm">{fontPreset.name}</Tag>
                  <Tag type={draftDirty ? 'warm-gray' : 'green'} size="sm">
                    {draftDirty ? 'Draft preview active' : 'Live shell'}
                  </Tag>
                </div>
                <div className="theme-page__desktop-titlecontrols" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>

            <div className="theme-page__desktop-main">
              <div className="theme-page__desktop-column theme-page__desktop-column--library">
                <fieldset className="theme-page__dialog-group" id={THEME_PAGE_SECTION_IDS.library}>
                  <legend>Theme selection</legend>
                  <div className="theme-page__catalog-grid">
                    <section className="theme-page__catalog-block">
                      <div className="theme-page__dialog-subhead">
                        <strong>Core Carbon themes</strong>
                        <Tag type="cool-gray" size="sm">{CORE_THEME_IDS.length}</Tag>
                      </div>
                      <div className="theme-page__catalog-list">
                    {CORE_THEME_IDS.map((coreId) => {
                      const coreTheme = builtInThemes[coreId]
                      const active = !draftDirty && themeId === coreId

                      return (
                        <button
                          key={coreId}
                          type="button"
                          className={`theme-page__catalog-item${active ? ' theme-page__catalog-item--active' : ''}`}
                          onClick={() => requestThemeSelection(coreId)}
                          aria-pressed={active}
                        >
                          <span className="theme-page__catalog-item-copy">
                            <strong>{coreTheme.name}</strong>
                            <span>{coreTheme.description}</span>
                          </span>
                          <span className="theme-page__catalog-item-meta">
                            <Tag type={active ? 'blue' : 'cool-gray'} size="sm">
                              {active ? 'Active' : carbonThemeLabel(coreTheme.carbonTheme)}
                            </Tag>
                            <ThemeSwatchStrip theme={resolvePreviewTheme(coreId, coreTheme)} />
                          </span>
                        </button>
                      )
                    })}
                      </div>
                    </section>

                    {PRESET_THEME_GROUPS.map((group) => (
                      <section key={group.label} className="theme-page__catalog-block">
                        <div className="theme-page__dialog-subhead">
                          <strong>{group.label}</strong>
                          <Tag type="teal" size="sm">{group.tag}</Tag>
                          <Tag type="cool-gray" size="sm">{group.ids.length}</Tag>
                        </div>
                        <ThemeCatalogVirtualList
                          ids={group.ids.filter((pid) => builtInThemes[pid])}
                          themeId={themeId}
                          draftDirty={draftDirty}
                          onSelect={requestThemeSelection}
                    />
                  </section>
                ))}

                <section className="theme-page__catalog-block">
                  <div className="theme-page__dialog-subhead">
                    <strong>Suggested directions</strong>
                    <Tag type="cyan" size="sm">Curated</Tag>
                  </div>
                  <div className="theme-page__catalog-list">
                    {SUGGESTED_DIRECTIONS.map((suggestion) => {
                      const selected = draftDirty
                        && draftName.trim() === suggestion.name
                        && draftBase === suggestion.base
                        && draftFamilyId === suggestion.familyId
                        && draftOverrideCount === 0

                      return (
                        <button
                          key={suggestion.id}
                          type="button"
                          className={`theme-page__catalog-item${selected ? ' theme-page__catalog-item--active' : ''}`}
                          onClick={() => handleLoadSuggestion(suggestion.familyId, suggestion.base, suggestion.name)}
                          aria-pressed={selected}
                        >
                          <span className="theme-page__catalog-item-copy">
                            <strong>{suggestion.name}</strong>
                            <span>{suggestion.description}</span>
                          </span>
                          <span className="theme-page__catalog-item-meta">
                            <Tag type={selected ? 'blue' : 'cool-gray'} size="sm">
                              {selected ? 'Draft' : carbonThemeLabel(suggestion.base)}
                            </Tag>
                            <ThemeSwatchStrip
                              theme={generateThemeFromPalette(suggestion.familyId, suggestion.base, {}, suggestion.id, suggestion.name)}
                            />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="theme-page__catalog-block">
                  <div className="theme-page__dialog-subhead">
                    <strong>Custom themes</strong>
                    <Tag type={customThemeEntries.length > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                      {customThemeEntries.length > 0 ? `${customThemeEntries.length} saved` : 'None'}
                    </Tag>
                  </div>
                  {customThemeEntries.length === 0 ? (
                    <p className="theme-page__group-note">Save the current draft to build a reusable library entry.</p>
                  ) : (
                    <div className="theme-page__catalog-list">
                      {customThemeEntries.map((customTheme) => {
                        const active = !draftDirty && themeId === customTheme.id

                        return (
                          <div key={customTheme.id} className="theme-page__catalog-row">
                            <button
                              type="button"
                              className={`theme-page__catalog-item${active ? ' theme-page__catalog-item--active' : ''}`}
                              onClick={() => requestThemeSelection(customTheme.id)}
                              aria-pressed={active}
                            >
                              <span className="theme-page__catalog-item-copy">
                                <strong>{customTheme.name}</strong>
                                <span>{customTheme.description}</span>
                              </span>
                              <span className="theme-page__catalog-item-meta">
                                <Tag type={active ? 'blue' : 'warm-gray'} size="sm">
                                  {active ? 'Active' : 'Custom'}
                                </Tag>
                                <ThemeSwatchStrip theme={resolvePreviewTheme(customTheme.id, customTheme)} />
                              </span>
                            </button>
                            <Button kind="ghost" size="sm" onClick={() => handleDeleteCustomTheme(customTheme.id)}>
                              Delete
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </div>
            </fieldset>

            <fieldset className="theme-page__dialog-group">
              <legend>Save as</legend>
              <TextInput
                id="theme-page-custom-theme-name-dialog"
                labelText="Custom theme name"
                placeholder={draftTheme.name}
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value)
                  setDraftDirty(true)
                }}
                maxLength={60}
              />
              {draftDirty && draftOverrideCount > 0 ? (
                <div className="theme-page__draft-warning">
                  <InlineNotification
                    lowContrast
                    hideCloseButton
                    kind="warning"
                    title="Token overrides are still in draft."
                    subtitle="These token changes are not saved yet. Presets, fonts, appearance assets, and behavior settings still apply immediately."
                  />
                  <Button kind="secondary" size="sm" onClick={handleSaveDraftTheme}>
                    Save now
                  </Button>
                </div>
              ) : null}
              <div className="theme-page__dialog-actions">
                <Button kind="ghost" renderIcon={Reset} onClick={handleResetDraft} disabled={!draftDirty}>
                  Reset draft
                </Button>
                <Button kind="primary" renderIcon={PaintBrush} onClick={handleSaveDraftTheme} disabled={!draftDirty}>
                  Save and apply custom theme
                </Button>
              </div>
              <p className="theme-page__group-note">
                Preset changes, font changes, category accents, and plugin appearance updates still persist immediately.
              </p>
            </fieldset>
          </div>

          <div className="theme-page__desktop-column theme-page__desktop-column--preview">
            <fieldset className="theme-page__dialog-group theme-page__dialog-group--stretch" id={THEME_PAGE_SECTION_IDS.preview}>
              <legend>Preview</legend>
              <div className="theme-page__dialog-head">
                <div>
                  <h2 className="theme-page__section-title">Desktop Themes</h2>
                  <p className="theme-page__section-copy">
                    The preview now mirrors the classic desktop-theme flow more directly: desktop scene, active window, inactive window, and message box.
                  </p>
                </div>
                <div className="theme-page__section-tags">
                  <Tag type="cool-gray" size="sm">{CARBON_FAMILY_BY_ID[draftFamilyId]?.name ?? 'Blue'}</Tag>
                  <Tag type={draftOverrideCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                    {draftOverrideCount > 0 ? `${draftOverrideCount} token edits` : 'No token edits'}
                  </Tag>
                </div>
              </div>

              <ThemeDesktopPreview
                theme={editorPreviewTheme}
                activeThemeLabel={activeThemeLabel}
                previewFocus={previewFocus}
              />

              <div className="theme-page__preview-meta">
                <span>Preview of {activeThemeLabel}</span>
                <ThemeSwatchStrip theme={editorPreviewTheme} />
              </div>
            </fieldset>
          </div>

          <div className="theme-page__desktop-column theme-page__desktop-column--options">
            <fieldset className="theme-page__dialog-group" id={THEME_PAGE_SECTION_IDS.colorScheme}>
              <legend>Color scheme</legend>
              <h2 className="theme-page__section-title">Scheme</h2>
              <p className="theme-page__section-copy">Choose the Carbon shell baseline used for the preview windows and routed chrome.</p>
              <div className="theme-page__option-list" role="radiogroup" aria-label="Base shell">
                {BASE_SHELL_OPTIONS.map((base) => (
                  <button
                    key={base}
                    type="button"
                    role="radio"
                    aria-checked={draftBase === base}
                    className={`theme-page__option-item${draftBase === base ? ' theme-page__option-item--active' : ''}`}
                    onClick={() => {
                      setDraftBase(base)
                      setDraftDirty(true)
                    }}
                  >
                    <span className="theme-page__option-copy">
                      <strong>{carbonThemeLabel(base)}</strong>
                      <span>{baseShellDescription(base)}</span>
                    </span>
                    <span className={`theme-page__base-dot theme-page__base-dot--${base}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="theme-page__dialog-group" id={THEME_PAGE_SECTION_IDS.font}>
              <legend>Accent family</legend>
              <h2 className="theme-page__section-title">Accent family</h2>
              <p className="theme-page__section-copy">Retain token-based color editing, but group the family choices like a dialog palette instead of launcher cards.</p>
              <div className="theme-page__family-grid theme-page__family-grid--dialog" role="radiogroup" aria-label="Accent family">
                {CARBON_COLOR_FAMILIES.map((family) => {
                  const previewShade = draftBase === 'g100' || draftBase === 'g90' ? 50 : 60
                  const selected = draftFamilyId === family.id

                  return (
                    <button
                      key={family.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`theme-page__family-card ${selected ? ' theme-page__family-card--active' : ''}`}
                      onClick={() => {
                        setDraftFamilyId(family.id)
                        setDraftDirty(true)
                      }}
                    >
                      <span
                        className="theme-page__family-band"
                        style={{ background: `linear-gradient(to right, ${Object.values(family.shades).join(', ')})` }}
                        aria-hidden="true"
                      />
                      <span className="theme-page__family-copy">
                        <span className="theme-page__family-dot" style={{ background: family.shades[previewShade] }} aria-hidden="true" />
                        <strong>{family.name}</strong>
                        {selected ? <Checkmark size={14} aria-hidden /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="theme-page__dialog-group">
              <legend>Font face</legend>
              <h2 className="theme-page__section-title">Platform GUI font</h2>
              <p className="theme-page__section-copy">Font changes stay live, but they now live in the same right-hand option stack as the classic dialog reference.</p>
              <div className="theme-page__option-list" role="radiogroup" aria-label="Platform GUI font">
                {Object.values(fontPresets).map((preset) => {
                  const active = preset.id === fontPresetId

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`theme-page__option-item${active ? ' theme-page__option-item--active' : ''}`}
                      onClick={() => setFontPreset(preset.id as PlatformFontPresetId)}
                    >
                      <span className="theme-page__option-copy">
                        <strong>{preset.name}</strong>
                        <span>{preset.description}</span>
                      </span>
                      <span className="theme-page__font-inline-sample" style={{ fontFamily: preset.family }}>
                        {preset.sample}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="theme-page__dialog-group">
              <legend>Preview target</legend>
              <h2 className="theme-page__section-title">Preview target</h2>
              <p className="theme-page__section-copy">Focus the classic preview on the desktop scene, active window, inactive window, or message box.</p>
              <div className="theme-page__option-list" role="radiogroup" aria-label="Preview target">
                {([
                  ['desktop', 'Desktop', 'Highlights the wallpaper scene, desktop icons, and overall shell backdrop.'],
                  ['inactive-window', 'Inactive window', 'Shows the passive title bar and background window chrome.'],
                  ['active-window', 'Active window', 'Focuses the primary route window, live title bar, and content panels.'],
                  ['message-box', 'Message box', 'Targets alerts and confirmation prompts layered above the desktop.'],
                ] as const).map(([id, label, description]) => {
                  const active = previewFocus === id

                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`theme-page__option-item${active ? ' theme-page__option-item--active' : ''}`}
                      onClick={() => setPreviewFocus(id)}
                    >
                      <span className="theme-page__option-copy">
                        <strong>{label}</strong>
                        <span>{description}</span>
                      </span>
                      <span className="theme-page__option-status">
                        {active ? 'Selected' : 'Available'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="theme-page__dialog-group">
              <legend>Status</legend>
              <h2 className="theme-page__section-title">Editor status</h2>
              <div className="theme-page__dialog-facts">
                <div>
                  <span>Theme library</span>
                  <strong>{totalThemeCount} choices</strong>
                </div>
                <div>
                  <span>Token overrides</span>
                  <strong>{draftOverrideCount}</strong>
                </div>
                <div>
                  <span>Appearance assets</span>
                  <strong>{overriddenCategoryCount + pluginOverrideCount} custom</strong>
                </div>
                <div>
                  <span>Motion preset</span>
                  <strong>{pageTransitionPresetLabel(pageTransitionPreset)}</strong>
                </div>
              </div>
            </fieldset>
          </div>
        </div>

        <div className="theme-page__desktop-lower-grid">
          <fieldset className="theme-page__dialog-group theme-page__dialog-group--wide" id={THEME_PAGE_SECTION_IDS.tokenStudio}>
            <legend>Theme tokens</legend>
            <div className="theme-page__dialog-head">
              <div>
                <h2 className="theme-page__section-title">Token studio</h2>
                <p className="theme-page__section-copy">
                  Tune semantic shell tokens from grouped lists underneath the preview, then open a family/shade picker inline.
                </p>
              </div>
              <Tag type={draftOverrideCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                {draftOverrideCount > 0 ? `${draftOverrideCount} overrides` : 'No overrides'}
              </Tag>
            </div>

            <div className="theme-page__slot-groups theme-page__slot-groups--dialog">
              {COLOR_SLOT_GROUPS.map((group) => (
                <article key={group.label} className="theme-page__studio-card">
                  <div className="theme-page__studio-card-head">
                    <h3>{group.label}</h3>
                    <Tag type="cool-gray" size="sm">{group.slots.length} tokens</Tag>
                  </div>
                  <div className="theme-page__slot-grid">
                    {group.slots.map((slot) => {
                      const value = draftTheme.colors[slot]
                      const overridden = slot in draftOverrides
                      const open = activeSlot === slot

                      return (
                        <div
                          key={slot}
                          className={`theme-page__slot-card${open ? ' theme-page__slot-card--open' : ''}${overridden ? ' theme-page__slot-card--overridden' : ''}`}
                        >
                          <button
                            type="button"
                            className="theme-page__slot-button"
                            onClick={(event) => {
                              activeSlotTriggerRef.current = event.currentTarget
                              setActiveSlot(open ? null : slot)
                            }}
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
                            {overridden ? <Tag type="warm-gray" size="sm">Edited</Tag> : null}
                          </button>

                          {overridden ? (
                            <Button
                              kind="ghost"
                              size="sm"
                              className="theme-page__slot-reset"
                              onClick={() => {
                                setDraftOverrides((current) => {
                                  const next = { ...current }
                                  delete next[slot]
                                  return next
                                })
                                setDraftDirty(true)
                              }}
                            >
                              Reset
                            </Button>
                          ) : null}

                          {open ? (
                            <SlotPalettePicker
                              currentValue={value}
                              onPick={(color) => {
                                setDraftOverrides((current) => ({ ...current, [slot]: color }))
                                setDraftDirty(true)
                                closeActiveSlot()
                              }}
                              onClose={closeActiveSlot}
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </article>
              ))}
            </div>
          </fieldset>

          <fieldset className="theme-page__dialog-group theme-page__dialog-group--wide" id={THEME_PAGE_SECTION_IDS.appearanceAssets}>
            <legend>Appearance assets</legend>
            <div className="theme-page__dialog-head">
              <div>
                <h2 className="theme-page__section-title">Appearance assets</h2>
                <p className="theme-page__section-copy">
                  Keep shared category accents and per-plugin icon or color overrides grouped together without mixing them into the main shell chooser.
                </p>
              </div>
              <div className="theme-page__section-tags">
                <Tag type={overriddenCategoryCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                  {overriddenCategoryCount > 0 ? `${overriddenCategoryCount} category accents` : 'All category defaults'}
                </Tag>
                <Tag type={pluginOverrideCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                  {pluginOverrideCount > 0 ? `${pluginOverrideCount} plugin overrides` : 'No plugin overrides'}
                </Tag>
              </div>
            </div>

            <div className="theme-page__editor-mode-grid" role="group" aria-label="Appearance assets mode">
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
                <div className="theme-page__section-tags">
                  <Button kind="ghost" size="sm" disabled={overriddenCategoryCount === 0} onClick={() => resetAllCategoryColorOverrides()}>
                    Reset all category accents
                  </Button>
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
                          {overridden ? <Tag type="warm-gray" size="sm">Custom</Tag> : null}
                        </div>

                        <div className="theme-page__category-controls">
                          <button
                            type="button"
                            className="theme-page__category-picker-button"
                            aria-expanded={activeCategoryPicker === key}
                            aria-label={`${label} color`}
                            onClick={(event) => {
                              activeCategoryTriggerRef.current = event.currentTarget
                              setActiveCategoryPicker(activeCategoryPicker === key ? null : key)
                            }}
                          >
                            <span
                              className="theme-page__category-picker-swatch"
                              style={{ background: config.color }}
                              aria-hidden="true"
                            />
                            <span className="theme-page__category-picker-copy">Choose from Carbon palette</span>
                          </button>
                          <Button kind="ghost" size="sm" disabled={!overridden} onClick={() => resetCategoryColorOverride(key)}>
                            Reset
                          </Button>
                        </div>
                        {activeCategoryPicker === key ? (
                          <SlotPalettePicker
                            currentValue={config.color}
                            onPick={(color) => {
                              setCategoryColorOverride(key, color)
                              closeActiveCategoryPicker()
                            }}
                            onClose={closeActiveCategoryPicker}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="theme-page__plugin-editor">
                <div className="theme-page__plugin-toolbar">
                  <CarbonSearch
                    id="theme-plugin-appearance-search-dialog"
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
                        {filter === 'all' ? 'All sources' : PLUGIN_SOURCE_FILTER_LABELS[filter]}
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
                      <LoadingState className="theme-page__plugin-empty" description="Loading plugin catalog" />
                    ) : filteredPlugins.length === 0 ? (
                      <EmptyState
                        className="theme-page__plugin-empty"
                        compact
                        title="No plugins match the current filter"
                        description="Try adjusting the search or source filters."
                      />
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
                                <Tag type="cool-gray" size="sm">{inferPluginSource(plugin)}</Tag>
                                {override ? <Tag type="warm-gray" size="sm">Custom</Tag> : null}
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
                            <Tag type="cool-gray" size="sm">{inferPluginSource(selectedPlugin)}</Tag>
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
                          id="theme-plugin-description-dialog"
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
                      <EmptyState
                        className="theme-page__plugin-empty"
                        compact
                        title="Select a plugin to edit its appearance"
                        description="Choose a plugin from the list to change its icon, accent, and description."
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </fieldset>
        </div>

        <fieldset className="theme-page__dialog-group theme-page__dialog-group--wide" id={THEME_PAGE_SECTION_IDS.personalization}>
          <legend>Desktop personalization</legend>
          <div className="theme-page__dialog-head">
            <div>
              <h2 className="theme-page__section-title">Desktop personalization</h2>
              <p className="theme-page__section-copy">
                Control the desktop wallpaper and jump directly back to the desktop or display settings workflow from the same page.
              </p>
            </div>
            <div className="theme-page__section-tags">
              <Tag type="cool-gray" size="sm">
                {desktopWallpaper.mode === 'default-image'
                  ? 'Default wallpaper'
                  : desktopWallpaper.mode === 'solid-theme'
                    ? 'Theme solid color'
                    : 'Uploaded wallpaper'}
              </Tag>
              <Tag type="blue" size="sm">{carbonThemeLabel(theme.carbonTheme ?? 'g10')}</Tag>
            </div>
          </div>

          <div className="theme-page__settings-stack">
            <div className="theme-page__settings-row theme-page__settings-row--stacked">
              <div className="theme-page__motion-head">
                <PaintBrush size={20} aria-hidden />
                <div>
                  <strong>Wallpaper source</strong>
                  <p>Choose the platform hero wallpaper, a theme-colored desktop, or an uploaded image stored locally in this browser.</p>
                </div>
              </div>
              <div className="theme-page__option-list" role="radiogroup" aria-label="Desktop wallpaper source">
                {([
                  ['default-image', 'Platform hero', 'Use the platform hero icon over a black desktop background.'],
                  ['solid-theme', 'Theme solid color', 'Use the active Carbon theme background color as the desktop wallpaper.'],
                  ['uploaded-image', 'Uploaded image', 'Use a custom image stored locally in this browser.'],
                ] as const).map(([id, label, description]) => {
                  const active = desktopWallpaper.mode === id

                  return (
                    <div key={id} className="theme-page__option-stack">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`theme-page__option-item${active ? ' theme-page__option-item--active' : ''}`}
                        onClick={() => selectDesktopWallpaperMode(id)}
                      >
                        <span className="theme-page__option-copy">
                          <strong>{label}</strong>
                          <span>{description}</span>
                        </span>
                        <span className="theme-page__option-status">
                          {active ? 'Selected' : 'Available'}
                        </span>
                      </button>
                      {id === 'uploaded-image' && active ? (
                        <div className="theme-page__option-detail" aria-live="polite">
                          <Button kind="secondary" size="sm" onClick={openWallpaperUploadPicker}>
                            Choose file...
                          </Button>
                          <span className="theme-page__option-detail-copy">
                            {desktopWallpaper.imageDataUrl
                              ? 'Custom wallpaper loaded from local browser storage.'
                              : 'No file chosen.'}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              <input
                ref={wallpaperUploadInputRef}
                type="file"
                accept="image/*"
                aria-label="Upload desktop wallpaper"
                style={{ display: 'none' }}
                onChange={handleWallpaperUpload}
              />
              {desktopWallpaper.mode === 'uploaded-image' && desktopWallpaper.imageDataUrl ? (
                <p className="theme-page__group-note">Custom wallpaper loaded from local browser storage.</p>
              ) : null}
              {wallpaperUploadError ? (
                <InlineNotification
                  lowContrast
                  hideCloseButton
                  kind="error"
                  title="Wallpaper upload failed."
                  subtitle={wallpaperUploadError}
                />
              ) : null}
            </div>

            <div className="theme-page__settings-row">
              <div className="theme-page__motion-head">
                <Settings size={20} aria-hidden />
                <div>
                  <strong>Display entry points</strong>
                  <p>Use the desktop wallpaper context menu or return to the desktop now to validate the current personalization settings live.</p>
                </div>
              </div>
              <div className="theme-page__motion-actions">
                <Button kind="tertiary" onClick={() => navigate('/')}>
                  Open desktop
                </Button>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="theme-page__dialog-group theme-page__dialog-group--wide" id={THEME_PAGE_SECTION_IDS.behavior}>
          <legend>Behavior and accessibility</legend>
          <div className="theme-page__dialog-head">
            <div>
              <h2 className="theme-page__section-title">Behavior and accessibility</h2>
              <p className="theme-page__section-copy">
                Motion and utility behavior stay on the same page, but in a dedicated lower panel rather than mixed into the shell chooser.
              </p>
            </div>
            <div className="theme-page__section-tags">
              <Tag type="blue" size="sm">{pageTransitionPresetLabel(pageTransitionPreset)}</Tag>
              <Tag type={shouldReduceEffects ? 'green' : 'warm-gray'} size="sm">
                {shouldReduceEffects ? 'Reduced effects active' : 'Full effects active'}
              </Tag>
            </div>
          </div>

          <div className="theme-page__settings-stack">
            <div className="theme-page__settings-row">
              <div className="theme-page__motion-head">
                <Accessibility size={20} aria-hidden />
                <div>
                  <strong>Reduce effects</strong>
                  <p>Use the saved toggle below to keep movement restrained even when the OS does not require it.</p>
                </div>
              </div>
              <Toggle
                id="theme-page-reduce-effects-dialog"
                labelText="Reduce Effects Mode"
                labelA="Off"
                labelB="On"
                toggled={reducedEffectsEnabled}
                onToggle={setReducedEffectsEnabled}
              />
            </div>

            <div className="theme-page__settings-row theme-page__settings-row--stacked">
              <div className="theme-page__motion-head">
                <Loop size={20} aria-hidden />
                <div>
                  <strong>Page transition style</strong>
                  <p>Choose how supported shell routes animate. Reduced motion still forces the minimal fade.</p>
                </div>
              </div>
              <div className="theme-page__option-list" role="radiogroup" aria-label="Page transition style">
                {PAGE_TRANSITION_PRESET_OPTIONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={preset.id === pageTransitionPreset}
                    className={`theme-page__option-item${preset.id === pageTransitionPreset ? ' theme-page__option-item--active' : ''}`}
                    onClick={() => setPageTransitionPreset(preset.id)}
                  >
                    <span className="theme-page__option-copy">
                      <strong>{preset.name}</strong>
                      <span>{preset.description}</span>
                    </span>
                    <span className="theme-page__option-status">
                      {preset.id === pageTransitionPreset ? 'Selected' : 'Available'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="theme-page__settings-row">
              <div className="theme-page__motion-head">
                <Settings size={20} aria-hidden />
                <div>
                  <strong>Special Settings Menu</strong>
                  <p>Keep native-plugin visibility controls and related utility behavior outside the shell-theme tokens.</p>
                </div>
              </div>
              <div className="theme-page__motion-actions">
                <Tag type={hiddenPluginCount > 0 ? 'warm-gray' : 'cool-gray'} size="sm">
                  {hiddenPluginCount > 0 ? `${hiddenPluginCount} hidden plugin${hiddenPluginCount === 1 ? '' : 's'}` : 'All native plugins visible'}
                </Tag>
                {specialSettingsLoading ? <Tag type="cyan" size="sm">Loading</Tag> : null}
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
        </fieldset>

        <div className="theme-page__dialog-footer" role="status" aria-live="polite">
          <span>Auto-save active for presets, fonts, appearance assets, and behavior preferences.</span>
          <span>Preview target: {previewFocusLabel}</span>
          <button type="button" className="theme-page__footer-link" onClick={() => scrollToSection(THEME_PAGE_SECTION_IDS.tokenStudio)}>
            {draftOverrideCount} token edit{draftOverrideCount === 1 ? '' : 's'}
          </button>
          <button type="button" className="theme-page__footer-link" onClick={() => scrollToSection(THEME_PAGE_SECTION_IDS.appearanceAssets)}>
            {overriddenCategoryCount + pluginOverrideCount} appearance override{overriddenCategoryCount + pluginOverrideCount === 1 ? '' : 's'}
          </button>
        </div>
          </div>
        </div>
      </section>
    </>
  )

  return (
    <section className="theme-page">
      {desktopThemeDialog}

      <SpecialSettingsDialog
        isOpen={showSpecialSettings}
        onClose={() => setShowSpecialSettings(false)}
        currentHiddenPlugins={specialSettingsHiddenPlugins}
        onSave={handleSpecialSettingsSave}
      />

      <Modal
        open={pendingThemeSwitchId !== null}
        size="sm"
        modalHeading="Discard unsaved token edits?"
        primaryButtonText="Discard and switch"
        secondaryButtonText="Cancel"
        onRequestClose={() => setPendingThemeSwitchId(null)}
        onSecondarySubmit={() => setPendingThemeSwitchId(null)}
        onRequestSubmit={handleConfirmThemeSwitch}
      >
        <p>
          Switching themes will discard the current draft token overrides. Save the draft first if you want to keep those edits.
        </p>
      </Modal>

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

function ThemeSwatchStrip({ theme }: { theme: Theme }) {
  return (
    <span className="theme-page__catalog-swatches" aria-hidden="true">
      {PREVIEW_SWATCH_KEYS.map((key) => (
        <span key={key} className="theme-page__catalog-swatch" style={{ background: theme.colors[key] }} />
      ))}
    </span>
  )
}

function ThemeDesktopPreview({
  theme,
  activeThemeLabel,
  previewFocus,
}: {
  theme: Theme
  activeThemeLabel: string
  previewFocus: ThemePreviewFocus
}) {
  return (
    <div
      className={`theme-page__desktop-preview theme-page__desktop-preview--focus-${previewFocus}`}
      style={{
        background: `linear-gradient(145deg, ${theme.colors['surface-2']} 0%, ${theme.colors.bg} 48%, ${theme.colors.surface} 100%)`,
        borderColor: theme.colors.border,
        boxShadow: `0 24px 54px ${theme.colors['shadow-soft']}`,
      }}
    >
      <div className={`theme-page__desktop-scene${previewFocus === 'desktop' ? ' theme-page__desktop-scene--focused' : ''}`}>
        <div className="theme-page__desktop-icons">
          {['Meters', 'Console', 'Scenes'].map((label) => (
            <div key={label} className="theme-page__desktop-icon">
              <span
                className="theme-page__desktop-icon-glyph"
                style={{
                  background: theme.colors.primary,
                  borderColor: theme.colors['border-strong'],
                }}
              />
              <span style={{ color: theme.colors['text-primary'] }}>{label}</span>
            </div>
          ))}
        </div>

        <div
          className="theme-page__desktop-window-shell theme-page__desktop-window-shell--inactive"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors['border-strong'],
            color: theme.colors['text-primary'],
          }}
        >
          <div
            className={`theme-page__desktop-window-frame${previewFocus === 'inactive-window' ? ' theme-page__desktop-window-frame--focused' : ''}`}
            style={{
              outlineColor: theme.colors.primary,
            }}
          >
            <div
              className="theme-page__desktop-window-bar"
              style={{
                background: theme.colors['surface-2'],
                borderBottomColor: theme.colors.border,
              }}
            >
              <span>Inactive Window</span>
              <span className="theme-page__desktop-window-controls" aria-hidden="true">
                <span />
                <span />
              </span>
            </div>
          </div>
        </div>

        <div
          className="theme-page__desktop-window-shell theme-page__desktop-window-shell--active"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors['border-strong'],
            color: theme.colors['text-primary'],
          }}
        >
          <div
            className={`theme-page__desktop-window-frame${previewFocus === 'active-window' ? ' theme-page__desktop-window-frame--focused' : ''}`}
            style={{
              outlineColor: theme.colors.primary,
            }}
          >
            <div
              className="theme-page__desktop-window-bar"
              style={{
                background: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.accent} 100%)`,
                color: theme.colors['text-inverse'],
              }}
            >
              <span>Active Window</span>
              <span className="theme-page__desktop-window-controls" aria-hidden="true">
                <span />
                <span />
              </span>
            </div>
            <div className="theme-page__desktop-window-body">
              <div
                className="theme-page__desktop-window-line"
                style={{ background: theme.colors['surface-2'], borderColor: theme.colors.border }}
              />
              <div
                className="theme-page__desktop-window-line"
                style={{ background: theme.colors.bg, borderColor: theme.colors.border }}
              />
            </div>
          </div>
        </div>

        <div
          className="theme-page__desktop-message-box"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors['border-strong'],
            color: theme.colors['text-primary'],
          }}
        >
          <div
            className={`theme-page__desktop-window-frame${previewFocus === 'message-box' ? ' theme-page__desktop-window-frame--focused' : ''}`}
            style={{
              outlineColor: theme.colors.primary,
            }}
          >
            <div
              className="theme-page__desktop-window-bar"
              style={{
                background: theme.colors['surface-2'],
                borderBottomColor: theme.colors.border,
              }}
            >
              <span>Message Box</span>
              <span className="theme-page__desktop-window-controls" aria-hidden="true">
                <span />
              </span>
            </div>
            <div className="theme-page__desktop-message-copy">
              <p>{activeThemeLabel}</p>
              <button
                type="button"
                className="theme-page__desktop-message-button"
                style={{
                  background: theme.colors.primary,
                  borderColor: theme.colors['border-strong'],
                  color: theme.colors['text-inverse'],
                }}
              >
                OK
              </button>
            </div>
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
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const [selectedFamilyId, setSelectedFamilyId] = useState(() => {
    for (const family of CARBON_COLOR_FAMILIES) {
      if (Object.values(family.shades).includes(currentValue)) {
        return family.id
      }
    }

    return 'blue'
  })

  const family = CARBON_FAMILY_BY_ID[selectedFamilyId]

  useEffect(() => {
    const firstFamilyButton = pickerRef.current?.querySelector<HTMLButtonElement>('.theme-page__picker-family')
    firstFamilyButton?.focus({ preventScroll: true })
  }, [])

  return (
    <div ref={pickerRef} className="theme-page__picker">
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

function ThemeCatalogVirtualList({
  ids,
  themeId,
  draftDirty,
  onSelect,
}: {
  ids: string[]
  themeId: string
  draftDirty: boolean
  onSelect: (themeId: string) => void
}) {
  const height = Math.min(ids.length * PRESET_THEME_ROW_HEIGHT, PRESET_THEME_LIST_MAX_HEIGHT)

  return (
    <div className="theme-page__catalog-list theme-page__catalog-list--virtualized" style={{ height }}>
      <AutoSizer defaultWidth={320} defaultHeight={height}>
        {({ width, height: autoHeight }) => (
          <FixedSizeList
            width={width || 320}
            height={autoHeight || height}
            itemCount={ids.length}
            itemSize={PRESET_THEME_ROW_HEIGHT}
            overscanCount={4}
            itemData={{ ids, themeId, draftDirty, onSelect }}
          >
            {PresetThemeRow}
          </FixedSizeList>
        )}
      </AutoSizer>
    </div>
  )
}

function PresetThemeRow({
  index,
  style,
  data,
}: ListChildComponentProps<{
  ids: string[]
  themeId: string
  draftDirty: boolean
  onSelect: (themeId: string) => void
}>) {
  const presetThemeId = data.ids[index]
  const presetTheme = builtInThemes[presetThemeId]
  const active = !data.draftDirty && data.themeId === presetThemeId

  return (
    <div style={style} className="theme-page__catalog-row-virtual">
      <button
        type="button"
        className={`theme-page__catalog-item${active ? ' theme-page__catalog-item--active' : ''}`}
        onClick={() => data.onSelect(presetThemeId)}
        aria-pressed={active}
      >
        <span className="theme-page__catalog-item-copy">
          <strong>{presetTheme.name}</strong>
          <span>{presetTheme.description}</span>
        </span>
        <span className="theme-page__catalog-item-meta">
          <Tag type={active ? 'blue' : 'cool-gray'} size="sm">
            {active ? 'Active' : carbonThemeLabel(presetTheme.carbonTheme)}
          </Tag>
          <ThemeSwatchStrip theme={presetTheme} />
        </span>
      </button>
    </div>
  )
}
