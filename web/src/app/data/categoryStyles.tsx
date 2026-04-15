import type { CSSProperties, ComponentType } from 'react'
import { FavoriteFilled as Star } from '@carbon/icons-react'
import { getEffectIcon } from '../components/icons/effectIcons'
import type { EffectIconComponent } from '../components/icons/effectIcons'

type IconProps = { size?: number; style?: CSSProperties; className?: string }

export interface CategoryConfig {
  color: string
  bg: string
  icon: ComponentType<IconProps>
}

interface CategoryPaletteDefinition {
  color: string
  icon: ComponentType<IconProps>
  bgAlpha?: number
}

export const CATEGORY_COLOR_OVERRIDE_STORAGE_KEY = 'map2.category-color-overrides.v1'
const CATEGORY_COLOR_OVERRIDE_EVENT = 'map2:category-color-overrides'

function wrapEffectIcon(SvgIcon: EffectIconComponent): ComponentType<IconProps> {
  return function WrappedIcon({ size = 24, style, className }: IconProps) {
    return <SvgIcon width={size} height={size} style={style} className={className} />
  }
}

const wrappedCache = new Map<string, ComponentType<IconProps>>()

function getWrappedEffectIcon(category: string): ComponentType<IconProps> {
  let wrapped = wrappedCache.get(category)
  if (!wrapped) {
    wrapped = wrapEffectIcon(getEffectIcon(category))
    wrappedCache.set(category, wrapped)
  }
  return wrapped
}

function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim()

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  return null
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex)
  if (!normalized) {
    return [148, 163, 184]
  }

  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ]
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function createCategoryConfig(definition: CategoryPaletteDefinition): CategoryConfig {
  const normalizedColor = normalizeHexColor(definition.color)
  const color = normalizedColor ?? definition.color
  const bgAlpha = definition.bgAlpha ?? 0.15

  return {
    color,
    bg: normalizedColor ? rgba(normalizedColor, bgAlpha) : `color-mix(in srgb, ${color} ${Math.round(bgAlpha * 100)}%, transparent)`,
    icon: definition.icon,
  }
}

const themeColor = {
  interactive: 'var(--interactive)',
  primaryStrong: 'var(--primary-strong)',
  accent: 'var(--accent)',
  success: 'var(--support-success)',
  warning: 'var(--support-warning)',
  danger: 'var(--support-danger)',
  info: 'var(--support-info)',
  secondaryText: 'var(--text-secondary)',
}

const CATEGORY_DEFINITIONS: Record<string, CategoryPaletteDefinition> = {
  Favorites: { color: themeColor.warning, icon: Star },
  Distortion: { color: themeColor.success, icon: getWrappedEffectIcon('distortion') },
  Drive: { color: themeColor.success, icon: getWrappedEffectIcon('distortion') },
  Overdrive: { color: themeColor.success, icon: getWrappedEffectIcon('distortion') },
  Fuzz: { color: themeColor.success, icon: getWrappedEffectIcon('distortion') },
  Amplifier: { color: themeColor.danger, icon: getWrappedEffectIcon('amplifier') },
  Preamp: { color: themeColor.danger, icon: getWrappedEffectIcon('amplifier') },
  Filter: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('filter') },
  EQ: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('eq') },
  Equaliser: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('eq') },
  Equalizer: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('eq') },
  Parametric: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('parametric eq') },
  Delay: { color: themeColor.interactive, icon: getWrappedEffectIcon('delay') },
  Echo: { color: themeColor.interactive, icon: getWrappedEffectIcon('delay') },
  Reverb: { color: themeColor.accent, icon: getWrappedEffectIcon('reverb') },
  Spatial: { color: themeColor.accent, icon: getWrappedEffectIcon('reverb') },
  Modulation: { color: themeColor.warning, icon: getWrappedEffectIcon('modulation') },
  Chorus: { color: themeColor.warning, icon: getWrappedEffectIcon('chorus') },
  Flanger: { color: themeColor.warning, icon: getWrappedEffectIcon('flanger') },
  Phaser: { color: themeColor.warning, icon: getWrappedEffectIcon('phaser') },
  Tremolo: { color: themeColor.warning, icon: getWrappedEffectIcon('modulation') },
  Vibrato: { color: themeColor.warning, icon: getWrappedEffectIcon('modulation') },
  Compressor: { color: themeColor.info, icon: getWrappedEffectIcon('compressor') },
  Dynamics: { color: themeColor.info, icon: getWrappedEffectIcon('compressor') },
  Limiter: { color: themeColor.info, icon: getWrappedEffectIcon('limiter') },
  Gate: { color: themeColor.info, icon: getWrappedEffectIcon('gate') },
  Expander: { color: themeColor.info, icon: getWrappedEffectIcon('gate') },
  Simulator: { color: themeColor.primaryStrong, icon: getWrappedEffectIcon('simulator') },
  NAM: { color: themeColor.primaryStrong, icon: getWrappedEffectIcon('amplifier') },
  Guitar: { color: themeColor.primaryStrong, icon: getWrappedEffectIcon('amplifier') },
  Instrument: { color: themeColor.primaryStrong, icon: getWrappedEffectIcon('instrument') },
  Cabinet: { color: themeColor.accent, icon: getWrappedEffectIcon('cabinet') },
  IR: { color: themeColor.accent, icon: getWrappedEffectIcon('cabinet') },
  Convolution: { color: themeColor.accent, icon: getWrappedEffectIcon('cabinet') },
  Pitch: { color: themeColor.accent, icon: getWrappedEffectIcon('pitch') },
  'Multi-Effect': { color: themeColor.primaryStrong, icon: getWrappedEffectIcon('multi-effect') },
  Utility: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('utility') },
  Gain: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('gain') },
  Mixer: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('mixer') },
  Effects: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('effect') },
  Analyser: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('analyzer') },
  Analyzer: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('analyzer') },
  Tuner: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('tuner') },
  Meter: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('meter') },
  Spectrum: { color: themeColor.accent, icon: getWrappedEffectIcon('spectrum') },
  Generator: { color: themeColor.primaryStrong, icon: getWrappedEffectIcon('generator') },
  lexicon: { color: themeColor.warning, icon: getWrappedEffectIcon('lexicon') },
  Hardware: { color: themeColor.warning, icon: getWrappedEffectIcon('hardware') },
  Effect: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('effect') },
  default: { color: themeColor.secondaryText, icon: getWrappedEffectIcon('plugin'), bgAlpha: 0.12 },
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = Object.fromEntries(
  Object.entries(CATEGORY_DEFINITIONS).map(([key, definition]) => [key, createCategoryConfig(definition)]),
)

function readOverrides(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => {
        if (typeof value !== 'string') {
          return []
        }

        const normalized = normalizeHexColor(value)
        return normalized ? [[key, normalized]] : []
      }),
    )
  } catch {
    return {}
  }
}

function writeOverrides(overrides: Record<string, string>): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY)
    } else {
      window.localStorage.setItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY, JSON.stringify(overrides))
    }
  } catch {
    // Ignore storage failures and keep runtime defaults.
  }

  window.dispatchEvent(new CustomEvent(CATEGORY_COLOR_OVERRIDE_EVENT))
}

function resolveCategoryKey(category: string | undefined): string {
  if (!category) {
    return 'default'
  }

  if (CATEGORY_DEFINITIONS[category]) {
    return category
  }

  const normalized = category.toLowerCase()
  for (const key of Object.keys(CATEGORY_DEFINITIONS)) {
    if (normalized.includes(key.toLowerCase())) {
      return key
    }
  }

  return 'default'
}

export function getCategoryConfig(category: string | undefined): CategoryConfig {
  const key = resolveCategoryKey(category)
  const baseDefinition = CATEGORY_DEFINITIONS[key] ?? CATEGORY_DEFINITIONS.default
  const overrideColor = readOverrides()[key]

  if (!overrideColor) {
    return CATEGORY_CONFIG[key] ?? CATEGORY_CONFIG.default
  }

  return createCategoryConfig({
    ...baseDefinition,
    color: overrideColor,
  })
}

export function getCategoryColor(category: string | undefined): string {
  return getCategoryConfig(category).color
}

export function getCategoryBg(category: string | undefined): string {
  return getCategoryConfig(category).bg
}

export function getCategoryIcon(category: string | undefined): ComponentType<IconProps> {
  return getCategoryConfig(category).icon
}

export function getCategoryColorOverrideSnapshot(): string {
  return JSON.stringify(readOverrides())
}

export function subscribeCategoryColorOverrides(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handler = () => callback()
  window.addEventListener(CATEGORY_COLOR_OVERRIDE_EVENT, handler)
  window.addEventListener('storage', handler)

  return () => {
    window.removeEventListener(CATEGORY_COLOR_OVERRIDE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function setCategoryColorOverride(category: string, color: string): boolean {
  const resolvedCategory = resolveCategoryKey(category)
  const normalizedColor = normalizeHexColor(color)

  if (!normalizedColor || !CATEGORY_DEFINITIONS[resolvedCategory]) {
    return false
  }

  const overrides = readOverrides()
  overrides[resolvedCategory] = normalizedColor
  writeOverrides(overrides)
  return true
}

export function resetCategoryColorOverride(category: string): void {
  const resolvedCategory = resolveCategoryKey(category)
  const overrides = readOverrides()

  if (!(resolvedCategory in overrides)) {
    return
  }

  delete overrides[resolvedCategory]
  writeOverrides(overrides)
}

export function resetAllCategoryColorOverrides(): void {
  writeOverrides({})
}

export function getEditableCategoryConfigs(): Array<{
  key: string
  label: string
  config: CategoryConfig
  overridden: boolean
}> {
  const overrides = readOverrides()

  return Object.keys(CATEGORY_DEFINITIONS).map((key) => ({
    key,
    label: key,
    config: getCategoryConfig(key),
    overridden: key in overrides,
  }))
}
