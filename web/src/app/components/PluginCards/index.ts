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
// T2474 E2: Removed `registerTemplate` (eager) and `getTemplateComponent`
// (eager-only) exports — both backed by an eager TEMPLATE_REGISTRY Map
// that was never populated in production. All 10 template registrations
// in this file use `registerTemplateLazy` and resolve through
// `getTemplateCardComponent`, which is the canonical lazy-aware getter.
export {
  registerPluginCard,
  registerPluginPattern,
  registerTemplateLazy,
  getPluginCardConfig,
  getPluginCardComponent,
  getTemplateCardComponent,
  hasCustomCard,
  getRegisteredPlugins,
  getRegisteredTemplates,
  getDefaultVisualizations,
} from './registry'

// Base components
export { PluginCardShell } from './Base/PluginCardShell'
export { BypassSwitch } from './Base/BypassSwitch'
export { ParameterSection } from './Base/ParameterSection'
export { ParameterRow } from './Base/ParameterRow'
export { ParameterGrid } from './Base/ParameterGrid'
export { getSectionIcon } from './Base/sectionIcons'

// Templates (re-export types only — actual components are lazy-loaded via registry)
export type { PluginCardTemplate } from './types'

// Visualizations
export { TransferCurve } from './Visualizations/TransferCurve'
export { ReverbDecayCurve } from './Visualizations/ReverbDecayCurve'
export { EQCurveDisplay, type EQBandData } from './Visualizations/EQCurveDisplay'
export { DelayTapGrid } from './Visualizations/DelayTapGrid'
export { DistortionCurve } from './Visualizations/DistortionCurve'
export { LFOWaveform } from './Visualizations/LFOWaveform'
export { PitchDisplay } from './Visualizations/PitchDisplay'
export { TunerDisplay } from './Visualizations/TunerDisplay'

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
