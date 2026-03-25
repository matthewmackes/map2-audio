import { Layer } from '@carbon/react'
import { getPluginGlyph, type PluginType } from '../pluginLegacyCompat'
import './LegacyPluginIcon.css'

interface LegacyPluginIconProps {
  pluginType: PluginType
  size?: number
  opacity?: number
  color?: string
  pluginMissing?: boolean
  decorative?: boolean
  label?: string
}

export function LegacyPluginIcon({
  pluginType,
  size = 24,
  opacity = 0.8,
  color,
  pluginMissing = false,
  decorative = true,
  label = 'Plugin type icon',
}: LegacyPluginIconProps) {
  const glyph = getPluginGlyph(pluginType)
  const iconColor = pluginMissing ? '#da1e28' : (color ?? glyph.tone)
  const fontSize = Math.max(9, Math.round(size * (glyph.label.length > 2 ? 0.34 : 0.42)))
  const icon = (
    <span
      className="legacy-plugin-icon__glyph"
      style={{
        width: size,
        height: size,
        opacity,
        color: iconColor,
        borderColor: iconColor,
        fontSize,
      }}
    >
      {glyph.label}
    </span>
  )

  return (
    <Layer className="legacy-plugin-icon">
      {decorative ? <span aria-hidden="true">{icon}</span> : <span role="img" aria-label={label}>{icon}</span>}
    </Layer>
  )
}
