/**
 * PluginCards - World-class LV2 plugin parameter cards
 *
 * Provides professional UI cards for LV2 plugins with:
 * - Category-based templates (dynamics, reverb, EQ, delay, etc.)
 * - Custom visualizations (transfer curves, decay envelopes, etc.)
 * - Plugin registry for custom overrides
 * - Smart parameter grouping and detection
 */

// Types
export * from './types'

// Registry
export {
  registerPluginCard,
  registerPluginPattern,
  registerTemplate,
  getPluginCardConfig,
  getPluginCardComponent,
  getTemplateComponent,
  hasCustomCard,
  getRegisteredPlugins,
  getRegisteredTemplates,
  getDefaultVisualizations,
} from './registry'

// Base components
export * from './Base'

// Templates
export * from './Templates'

// Visualizations
export * from './Visualizations'

// Custom plugin-specific cards
export * from './Custom'

// Router
export { PluginCardRouter } from './PluginCardRouter'

// Initialize templates in the registry
import { registerTemplate } from './registry'
import { DynamicsTemplate } from './Templates/DynamicsTemplate'
import { ReverbTemplate } from './Templates/ReverbTemplate'
import { EQTemplate } from './Templates/EQTemplate'
import { DelayTemplate } from './Templates/DelayTemplate'
import { DistortionTemplate } from './Templates/DistortionTemplate'
import { ModulationTemplate } from './Templates/ModulationTemplate'
import { UtilityTemplate } from './Templates/UtilityTemplate'
import { PitchTemplate } from './Templates/PitchTemplate'

// Register all templates
registerTemplate('dynamics', DynamicsTemplate)
registerTemplate('reverb', ReverbTemplate)
registerTemplate('eq', EQTemplate)
registerTemplate('delay', DelayTemplate)
registerTemplate('distortion', DistortionTemplate)
registerTemplate('modulation', ModulationTemplate)
registerTemplate('utility', UtilityTemplate)
registerTemplate('pitch', PitchTemplate)

// Filter template uses EQ (similar functionality)
registerTemplate('filter', EQTemplate)

// Instrument template uses utility
registerTemplate('instrument', UtilityTemplate)
