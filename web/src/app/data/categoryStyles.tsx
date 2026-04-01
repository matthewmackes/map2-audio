import type { CSSProperties, ComponentType } from 'react'
import { FavoriteFilled as Star } from '@carbon/icons-react'
import { getEffectIcon } from '../components/icons/effectIcons'
import type { EffectIconComponent } from '../components/icons/effectIcons'
import { CARBON_FAMILY_BY_ID } from '../theme/carbonPalette'

type IconProps = { size?: number; style?: CSSProperties; className?: string }

export interface CategoryConfig {
  color: string
  bg: string
  gradient: string
  icon: ComponentType<IconProps>
}

interface CategoryPaletteDefinition {
  color: string
  icon: ComponentType<IconProps>
  bgAlpha?: number
  gradientStartAlpha?: number
  gradientEndAlpha?: number
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
  const color = normalizeHexColor(definition.color) ?? '#94a3b8'
  const bgAlpha = definition.bgAlpha ?? 0.15
  const gradientStartAlpha = definition.gradientStartAlpha ?? Math.min(bgAlpha + 0.01, 0.2)
  const gradientEndAlpha = definition.gradientEndAlpha ?? 0.04

  return {
    color,
    bg: rgba(color, bgAlpha),
    gradient: `linear-gradient(135deg, ${rgba(color, gradientStartAlpha)} 0%, ${rgba(color, gradientEndAlpha)} 100%)`,
    icon: definition.icon,
  }
}

const carbon = {
  blue40: CARBON_FAMILY_BY_ID.blue.shades[40],
  cyan40: CARBON_FAMILY_BY_ID.cyan.shades[40],
  teal40: CARBON_FAMILY_BY_ID.teal.shades[40],
  green40: CARBON_FAMILY_BY_ID.green.shades[40],
  purple40: CARBON_FAMILY_BY_ID.purple.shades[40],
  magenta40: CARBON_FAMILY_BY_ID.magenta.shades[40],
  red40: CARBON_FAMILY_BY_ID.red.shades[40],
  orange40: CARBON_FAMILY_BY_ID.orange.shades[40],
  gray40: CARBON_FAMILY_BY_ID.gray.shades[40],
  yellow40: CARBON_FAMILY_BY_ID.yellow.shades[40],
}

const CATEGORY_DEFINITIONS: Record<string, CategoryPaletteDefinition> = {
  Favorites: { color: carbon.yellow40, icon: Star },
  Distortion: { color: carbon.green40, icon: getWrappedEffectIcon('distortion') },
  Drive: { color: carbon.green40, icon: getWrappedEffectIcon('distortion') },
  Overdrive: { color: carbon.green40, icon: getWrappedEffectIcon('distortion') },
  Fuzz: { color: carbon.green40, icon: getWrappedEffectIcon('distortion') },
  Amplifier: { color: carbon.red40, icon: getWrappedEffectIcon('amplifier') },
  Preamp: { color: carbon.red40, icon: getWrappedEffectIcon('amplifier') },
  Filter: { color: carbon.gray40, icon: getWrappedEffectIcon('filter') },
  EQ: { color: carbon.gray40, icon: getWrappedEffectIcon('eq') },
  Equaliser: { color: carbon.gray40, icon: getWrappedEffectIcon('eq') },
  Equalizer: { color: carbon.gray40, icon: getWrappedEffectIcon('eq') },
  Parametric: { color: carbon.gray40, icon: getWrappedEffectIcon('parametric eq') },
  Delay: { color: carbon.blue40, icon: getWrappedEffectIcon('delay') },
  Echo: { color: carbon.blue40, icon: getWrappedEffectIcon('delay') },
  Reverb: { color: carbon.purple40, icon: getWrappedEffectIcon('reverb') },
  Spatial: { color: carbon.purple40, icon: getWrappedEffectIcon('reverb') },
  Modulation: { color: carbon.orange40, icon: getWrappedEffectIcon('modulation') },
  Chorus: { color: carbon.orange40, icon: getWrappedEffectIcon('chorus') },
  Flanger: { color: carbon.orange40, icon: getWrappedEffectIcon('flanger') },
  Phaser: { color: carbon.orange40, icon: getWrappedEffectIcon('phaser') },
  Tremolo: { color: carbon.orange40, icon: getWrappedEffectIcon('modulation') },
  Vibrato: { color: carbon.orange40, icon: getWrappedEffectIcon('modulation') },
  Compressor: { color: carbon.cyan40, icon: getWrappedEffectIcon('compressor') },
  Dynamics: { color: carbon.cyan40, icon: getWrappedEffectIcon('compressor') },
  Limiter: { color: carbon.cyan40, icon: getWrappedEffectIcon('limiter') },
  Gate: { color: carbon.cyan40, icon: getWrappedEffectIcon('gate') },
  Expander: { color: carbon.cyan40, icon: getWrappedEffectIcon('gate') },
  Simulator: { color: carbon.magenta40, icon: getWrappedEffectIcon('simulator') },
  NAM: { color: carbon.magenta40, icon: getWrappedEffectIcon('amplifier') },
  Guitar: { color: carbon.magenta40, icon: getWrappedEffectIcon('amplifier') },
  Instrument: { color: carbon.magenta40, icon: getWrappedEffectIcon('instrument') },
  Cabinet: { color: carbon.teal40, icon: getWrappedEffectIcon('cabinet') },
  IR: { color: carbon.teal40, icon: getWrappedEffectIcon('cabinet') },
  Convolution: { color: carbon.teal40, icon: getWrappedEffectIcon('cabinet') },
  Pitch: { color: carbon.purple40, icon: getWrappedEffectIcon('pitch') },
  'Multi-Effect': { color: carbon.magenta40, icon: getWrappedEffectIcon('multi-effect') },
  Utility: { color: carbon.gray40, icon: getWrappedEffectIcon('utility') },
  Gain: { color: carbon.gray40, icon: getWrappedEffectIcon('gain') },
  Mixer: { color: carbon.gray40, icon: getWrappedEffectIcon('mixer') },
  Effects: { color: carbon.gray40, icon: getWrappedEffectIcon('effect') },
  Analyser: { color: carbon.gray40, icon: getWrappedEffectIcon('analyzer') },
  Analyzer: { color: carbon.gray40, icon: getWrappedEffectIcon('analyzer') },
  Tuner: { color: carbon.gray40, icon: getWrappedEffectIcon('tuner') },
  Meter: { color: carbon.gray40, icon: getWrappedEffectIcon('meter') },
  Spectrum: { color: carbon.purple40, icon: getWrappedEffectIcon('spectrum') },
  Generator: { color: carbon.magenta40, icon: getWrappedEffectIcon('generator') },
  lexicon: { color: '#c8a951', icon: getWrappedEffectIcon('lexicon') },
  Hardware: { color: '#c8a951', icon: getWrappedEffectIcon('hardware') },
  Effect: { color: carbon.gray40, icon: getWrappedEffectIcon('effect') },
  default: { color: '#94a3b8', icon: getWrappedEffectIcon('plugin'), bgAlpha: 0.12, gradientStartAlpha: 0.12, gradientEndAlpha: 0.03 },
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
