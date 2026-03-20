import type { CSSProperties, ComponentType } from 'react'
import { FavoriteFilled as Star } from '@carbon/icons-react'
import { getEffectIcon } from '../components/icons/effectIcons'
import type { EffectIconComponent } from '../components/icons/effectIcons'

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

const CATEGORY_DEFINITIONS: Record<string, CategoryPaletteDefinition> = {
  Favorites: { color: '#fbbf24', icon: Star },
  Distortion: { color: '#ff6b6b', icon: getWrappedEffectIcon('distortion') },
  Amplifier: { color: '#ff6b6b', icon: getWrappedEffectIcon('amplifier') },
  Overdrive: { color: '#ff8c42', icon: getWrappedEffectIcon('distortion') },
  Fuzz: { color: '#ff6b6b', icon: getWrappedEffectIcon('distortion') },
  Filter: { color: '#4ecdc4', icon: getWrappedEffectIcon('filter') },
  EQ: { color: '#4ecdc4', icon: getWrappedEffectIcon('eq') },
  Equaliser: { color: '#4ecdc4', icon: getWrappedEffectIcon('eq') },
  Equalizer: { color: '#4ecdc4', icon: getWrappedEffectIcon('eq') },
  Parametric: { color: '#4ecdc4', icon: getWrappedEffectIcon('parametric eq') },
  Delay: { color: '#45b7d1', icon: getWrappedEffectIcon('delay') },
  Echo: { color: '#45b7d1', icon: getWrappedEffectIcon('delay') },
  Reverb: { color: '#a855f7', icon: getWrappedEffectIcon('reverb') },
  Spatial: { color: '#a855f7', icon: getWrappedEffectIcon('reverb') },
  Modulation: { color: '#f59e0b', icon: getWrappedEffectIcon('modulation') },
  Chorus: { color: '#f59e0b', icon: getWrappedEffectIcon('chorus') },
  Flanger: { color: '#f59e0b', icon: getWrappedEffectIcon('flanger') },
  Phaser: { color: '#f59e0b', icon: getWrappedEffectIcon('phaser') },
  Tremolo: { color: '#f59e0b', icon: getWrappedEffectIcon('modulation') },
  Vibrato: { color: '#f59e0b', icon: getWrappedEffectIcon('modulation') },
  Compressor: { color: '#22c55e', icon: getWrappedEffectIcon('compressor') },
  Dynamics: { color: '#22c55e', icon: getWrappedEffectIcon('compressor') },
  Limiter: { color: '#22c55e', icon: getWrappedEffectIcon('limiter') },
  Gate: { color: '#22c55e', icon: getWrappedEffectIcon('gate') },
  Expander: { color: '#22c55e', icon: getWrappedEffectIcon('gate') },
  Simulator: { color: '#ec4899', icon: getWrappedEffectIcon('simulator') },
  Instrument: { color: '#8b5cf6', icon: getWrappedEffectIcon('instrument') },
  Guitar: { color: '#ec4899', icon: getWrappedEffectIcon('amplifier') },
  Cabinet: { color: '#f97316', icon: getWrappedEffectIcon('cabinet') },
  IR: { color: '#f97316', icon: getWrappedEffectIcon('cabinet') },
  Convolution: { color: '#f97316', icon: getWrappedEffectIcon('cabinet') },
  Pitch: { color: '#06b6d4', icon: getWrappedEffectIcon('pitch') },
  'Multi-Effect': { color: '#ec4899', icon: getWrappedEffectIcon('multi-effect') },
  Utility: { color: '#64748b', icon: getWrappedEffectIcon('utility') },
  Gain: { color: '#64748b', icon: getWrappedEffectIcon('gain') },
  Mixer: { color: '#64748b', icon: getWrappedEffectIcon('mixer') },
  Analyser: { color: '#3b82f6', icon: getWrappedEffectIcon('analyzer') },
  Analyzer: { color: '#3b82f6', icon: getWrappedEffectIcon('analyzer') },
  Tuner: { color: '#22d3ee', icon: getWrappedEffectIcon('tuner') },
  Meter: { color: '#10b981', icon: getWrappedEffectIcon('meter') },
  Spectrum: { color: '#a855f7', icon: getWrappedEffectIcon('spectrum') },
  Generator: { color: '#8b5cf6', icon: getWrappedEffectIcon('generator') },
  lexicon: { color: '#c8a951', icon: getWrappedEffectIcon('lexicon') },
  Hardware: { color: '#c8a951', icon: getWrappedEffectIcon('hardware') },
  Effect: { color: '#06b6d4', icon: getWrappedEffectIcon('effect') },
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
