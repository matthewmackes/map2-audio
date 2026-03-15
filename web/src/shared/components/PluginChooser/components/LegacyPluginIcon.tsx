import { Layer } from '@carbon/react'
import PluginIcon from '../../../../pipedal/PluginIcon'
import type { PluginType } from '../../../../pipedal/Lv2Plugin'
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
  const icon = (
    <PluginIcon
      pluginType={pluginType}
      size={size}
      opacity={opacity}
      pluginMissing={pluginMissing}
      color={color}
    />
  )

  return (
    <Layer className="legacy-plugin-icon">
      {decorative ? <span aria-hidden="true">{icon}</span> : <span role="img" aria-label={label}>{icon}</span>}
    </Layer>
  )
}
