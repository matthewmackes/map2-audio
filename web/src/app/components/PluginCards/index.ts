/**
 * PluginCards - World-class LV2 plugin parameter cards
 *
 * Provides professional UI cards for LV2 plugins with:
 * - Category-based templates (dynamics, reverb, EQ, delay, etc.)
 * - Custom visualizations (transfer curves, decay envelopes, etc.)
 * - Plugin registry for custom overrides
 * - Smart parameter grouping and detection
 *
 * All custom cards and templates use lazy dynamic imports
 * to avoid bloating the initial bundle.
 */

// Types
export * from './types'

// Registry
export {
  registerPluginCard,
  registerPluginPattern,
  registerTemplate,
  registerTemplateLazy,
  getPluginCardConfig,
  getPluginCardComponent,
  getTemplateComponent,
  getTemplateCardComponent,
  hasCustomCard,
  getRegisteredPlugins,
  getRegisteredTemplates,
  getDefaultVisualizations,
} from './registry'

// Base components
export * from './Base'

// Templates (re-export types only — actual components are lazy-loaded via registry)
export type { PluginCardTemplate } from './types'

// Visualizations
export * from './Visualizations'

// Router
export { PluginCardRouter } from './PluginCardRouter'

// ============================================================================
// Initialize templates in the registry using LAZY loaders
// Templates are loaded on-demand when a plugin of that category is opened
// ============================================================================
import { registerTemplateLazy } from './registry'

registerTemplateLazy('dynamics', () => import('./Templates/DynamicsTemplate').then(m => ({ default: m.DynamicsTemplate })))
registerTemplateLazy('reverb', () => import('./Templates/ReverbTemplate').then(m => ({ default: m.ReverbTemplate })))
registerTemplateLazy('eq', () => import('./Templates/EQTemplate').then(m => ({ default: m.EQTemplate })))
registerTemplateLazy('delay', () => import('./Templates/DelayTemplate').then(m => ({ default: m.DelayTemplate })))
registerTemplateLazy('distortion', () => import('./Templates/DistortionTemplate').then(m => ({ default: m.DistortionTemplate })))
registerTemplateLazy('modulation', () => import('./Templates/ModulationTemplate').then(m => ({ default: m.ModulationTemplate })))
registerTemplateLazy('utility', () => import('./Templates/UtilityTemplate').then(m => ({ default: m.UtilityTemplate })))
registerTemplateLazy('pitch', () => import('./Templates/PitchTemplate').then(m => ({ default: m.PitchTemplate })))

// Filter template uses EQ (similar functionality)
registerTemplateLazy('filter', () => import('./Templates/EQTemplate').then(m => ({ default: m.EQTemplate })))

// Instrument template uses utility
registerTemplateLazy('instrument', () => import('./Templates/UtilityTemplate').then(m => ({ default: m.UtilityTemplate })))
