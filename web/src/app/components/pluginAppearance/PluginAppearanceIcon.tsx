import type { CSSProperties } from 'react'

import { getPluginGlyph, type PluginType } from '../../utils/pluginLegacyCompat'

import { renderPluginAppearanceFallback, resolvePluginAppearanceIconOption } from '../../utils/pluginAppearanceIcons'

interface PluginAppearanceIconProps {
  identifier?: string | null
  customSvg?: string | null
  fallbackCategory?: string
  fallbackPluginType?: PluginType
  size?: number
  opacity?: number
  color?: string
  className?: string
  style?: CSSProperties
  decorative?: boolean
  label?: string
}

export function PluginAppearanceIcon({
  identifier,
  customSvg,
  fallbackCategory,
  fallbackPluginType,
  size = 24,
  opacity = 0.9,
  color,
  className,
  style,
  decorative = true,
  label = 'Plugin icon',
}: PluginAppearanceIconProps) {
  const option = resolvePluginAppearanceIconOption(identifier)

  if (option) {
    const Icon = option.Icon
    return (
      <span className={className} style={{ display: 'inline-flex', color, opacity, ...style }} aria-hidden={decorative}>
        <Icon size={size} />
      </span>
    )
  }

  if (identifier?.startsWith('custom:') && customSvg) {
    const content = (
      <span
        className={className}
        style={{ display: 'inline-flex', inlineSize: size, blockSize: size, color, opacity, ...style }}
        dangerouslySetInnerHTML={{ __html: customSvg }}
      />
    )

    return decorative ? <span aria-hidden="true">{content}</span> : <span role="img" aria-label={label}>{content}</span>
  }

  if (fallbackCategory) {
    return (
      <span className={className} style={{ display: 'inline-flex', color, opacity, ...style }} aria-hidden={decorative}>
        {renderPluginAppearanceFallback(fallbackCategory, size)}
      </span>
    )
  }

  if (fallbackPluginType) {
    const glyph = getPluginGlyph(fallbackPluginType)
    const fontSize = Math.max(9, Math.round(size * (glyph.label.length > 2 ? 0.34 : 0.42)))
    const content = (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          inlineSize: size,
          blockSize: size,
          opacity,
          color: color ?? glyph.tone,
          border: '1px solid currentColor',
          borderRadius: '999px',
          background: 'color-mix(in srgb, currentColor 10%, transparent)',
          fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
          fontWeight: 600,
          lineHeight: 1,
          boxSizing: 'border-box',
          fontSize,
          ...style,
        }}
      >
        {glyph.label}
      </span>
    )

    return decorative ? <span aria-hidden="true">{content}</span> : <span role="img" aria-label={label}>{content}</span>
  }

  return null
}
