import type { CSSProperties } from 'react'

import { LegacyPluginIcon } from '@/shared/components/PluginChooser/components/LegacyPluginIcon'
import type { PluginType } from '@/shared/components/PluginChooser/pluginLegacyCompat'

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
    return (
      <LegacyPluginIcon
        pluginType={fallbackPluginType}
        size={size}
        opacity={opacity}
        color={color}
        decorative={decorative}
        label={label}
      />
    )
  }

  return null
}
