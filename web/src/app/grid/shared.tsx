import { CATEGORY_CONFIG, getCategoryBg, getCategoryColor, getCategoryConfig, getCategoryIcon } from '../data/categoryStyles'
export type { CategoryConfig } from '../data/categoryStyles'

export interface MidiMapping {
  id: string
  parameterName: string
  pluginName: string
  pluginUri: string
  ccNumber: number
  channel: number
  min: number
  max: number
  inverted: boolean
}

export interface AutomationPoint {
  id: string
  time: number
  value: number
  curve: 'linear' | 'step' | 'smooth'
}

export interface AutomationLane {
  id: string
  parameterName: string
  pluginName: string
  pluginUri: string
  parameterSymbol: string
  points: AutomationPoint[]
  enabled: boolean
  armed: boolean
  color: string
}
export { CATEGORY_CONFIG, getCategoryBg, getCategoryColor, getCategoryConfig, getCategoryIcon }
