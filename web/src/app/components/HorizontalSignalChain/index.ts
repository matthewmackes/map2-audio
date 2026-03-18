/**
 * Horizontal Signal Chain Components
 *
 * A compact, horizontal representation of a plugin signal chain
 * using monochrome icons with hover tooltips.
 *
 * Audio effect icons from PiPedal project
 * https://github.com/rerdavies/pipedal
 * MIT License - Robin E. R. Davies
 */

export { HorizontalSignalChain } from './HorizontalSignalChain'
export { HorizontalPluginNode } from './HorizontalPluginNode'
export { HorizontalConnector } from './HorizontalConnector'
export { SidechainConnector } from './SidechainConnector'
export { PluginTooltipContent } from './PluginTooltip'
export { getEffectIcon } from '../icons/effectIcons'
// Legacy re-exports for backward compatibility
export { getIconForCategory, getIconNameForCategory, FX_ICONS, CATEGORY_ICON_MAP } from './icons'
export type {
  HorizontalSignalChainProps,
  HorizontalPluginNodeProps,
  HorizontalConnectorProps,
  PluginTooltipProps,
  FxIconName,
  SidechainSource,
} from './types'
