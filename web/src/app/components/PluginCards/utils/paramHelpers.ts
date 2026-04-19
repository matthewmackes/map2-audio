/**
 * Helpers for parameter definition management
 * 
 * Reduces boilerplate when defining plugin parameters and MIDI mappings.
 */

// Plugin parameter definition type
export interface PluginParamDef {
  key?: string
  name: string
  symbol?: string
  min?: number
  max?: number
  default?: number
  unit?: string
  index?: number
}

/**
 * Parameter definition input
 */
interface ParamDefinition {
  key: string
  name: string
  symbol?: string
}

/**
 * Result of parameter definition creation
 */
interface ParamResult {
  indices: Record<string, number>
  defs: PluginParamDef[]
}

/**
 * Create parameter indices and definitions from simplified input
 * 
 * @example
 * const { indices: PARAM, defs: CHORUS_PARAMS } = createParamDefs([
 *   { key: 'RATE', name: 'Rate' },
 *   { key: 'DEPTH', name: 'Depth', symbol: 'depth' },
 *   { key: 'MIX', name: 'Mix' },
 * ])
 * 
 * // Now use PARAM.RATE, PARAM.DEPTH, etc.
 * // And CHORUS_PARAMS for MIDI mapping dialog
 */
export const createParamDefs = (params: ParamDefinition[]): ParamResult => {
  const indices: Record<string, number> = {}
  const defs: PluginParamDef[] = []

  params.forEach((param, index) => {
    indices[param.key] = index
    defs.push({
      index,
      name: param.name,
      symbol: param.symbol || param.key.toLowerCase(),
    })
  })

  return { indices, defs }
}

/**
 * Create a simple parameter index map (for cases where MIDI defs aren't needed)
 */
export const createParamIndices = (keys: string[]): Record<string, number> => {
  const indices: Record<string, number> = {}
  keys.forEach((key, index) => {
    indices[key] = index
  })
  return indices
}

/**
 * Helper to ensure parameter indices are sequential and complete
 * Useful for validation during development
 */
export const validateParamIndices = (indices: Record<string, number>): boolean => {
  const values = Object.values(indices).sort((a, b) => a - b)
  
  // Check for sequential indices starting at 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== i) {
      console.error(`Parameter indices not sequential. Expected ${i}, got ${values[i]}`)
      return false
    }
  }
  
  return true
}

/**
 * All parameter helpers as a convenient object export
 */
export const paramHelpers = {
  createParamDefs,
  createParamIndices,
  validateParamIndices,
}
