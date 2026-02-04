/**
 * @deprecated This hook is deprecated in favor of the MIDI Mapping Dialog.
 * MIDI CC mappings are now configured via the dialog accessed from the
 * plugin card menu (More Options → MIDI Mappings).
 *
 * This file is kept for backwards compatibility but may be removed in a future version.
 *
 * @see MidiMappingDialog - The new table-based MIDI mapping UI
 * @see useMidiMappingDialog - Hook for managing the dialog state
 *
 * Original description:
 * Provides MIDI CC learn/assign functionality for individual parameters.
 * Integrates with the MAP2 MIDI learn backend API.
 */

import { useState, useCallback, useEffect, createContext, useContext } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ============================================================================
// Types
// ============================================================================

export interface MidiMapping {
  id?: string
  cc: number
  channel: number // 0 = omni, 1-16 = specific
  parameterUri: string
  parameterIndex: number
  parameterName?: string
  minValue: number
  maxValue: number
  curve: 'linear' | 'exponential' | 'logarithmic' | 's_curve'
  inverted: boolean
  isLearned: boolean
  isEnabled: boolean
}

export interface MidiLearnState {
  isLearning: boolean
  learningTarget: { uri: string; paramIndex: number; paramName: string } | null
  mappings: Map<string, MidiMapping> // key: "uri:paramIndex"
  lastActivity: { cc: number; channel: number; value: number } | null
}

export interface MidiLearnContextValue extends MidiLearnState {
  startLearn: (uri: string, paramIndex: number, paramName: string) => void
  stopLearn: () => void
  getMapping: (uri: string, paramIndex: number) => MidiMapping | undefined
  hasMapping: (uri: string, paramIndex: number) => boolean
  removeMapping: (uri: string, paramIndex: number) => void
  updateMapping: (uri: string, paramIndex: number, updates: Partial<MidiMapping>) => void
  refreshMappings: () => void
}

// ============================================================================
// API Functions
// ============================================================================

const API_BASE = (() => {
  if (typeof window === 'undefined') return '/api'
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined
  if (envBase) return envBase
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return '/api'
  }
  return `http://${window.location.hostname}:8080/api`
})()

async function fetchMappings(): Promise<MidiMapping[]> {
  const response = await fetch(`${API_BASE}/midi-learn/mappings`)
  if (!response.ok) throw new Error('Failed to fetch MIDI mappings')
  const data = await response.json()
  // Transform backend format to frontend format
  return (data.mappings || []).map((m: any) => ({
    id: m.id || m.parameter_id,
    cc: m.cc_number,
    channel: m.channel ?? 0,
    parameterUri: m.parameter_id?.split(':')[0] || m.plugin_uri || '',
    parameterIndex: parseInt(m.parameter_id?.split(':')[1] || m.param_index || '0'),
    parameterName: m.param_name || m.name,
    minValue: m.min_value ?? 0,
    maxValue: m.max_value ?? 1,
    curve: m.curve || 'linear',
    inverted: m.inverted ?? false,
    isLearned: m.is_learned ?? true,
    isEnabled: m.is_enabled ?? true,
  }))
}

async function startLearnMode(uri: string, paramIndex: number): Promise<void> {
  const response = await fetch(`${API_BASE}/midi-learn/learn/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parameter_id: `${uri}:${paramIndex}`,
    }),
  })
  if (!response.ok) throw new Error('Failed to start MIDI learn')
}

async function stopLearnMode(): Promise<void> {
  const response = await fetch(`${API_BASE}/midi-learn/learn/stop`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Failed to stop MIDI learn')
}

async function deleteMapping(parameterId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/midi-learn/mappings/${encodeURIComponent(parameterId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('Failed to delete MIDI mapping')
}

async function getLearnStatus(): Promise<{ learning: boolean; target?: string }> {
  const response = await fetch(`${API_BASE}/midi-learn/learn/status`)
  if (!response.ok) return { learning: false }
  return response.json()
}

// ============================================================================
// Context
// ============================================================================

const MidiLearnContext = createContext<MidiLearnContextValue | null>(null)

export function MidiLearnProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [isLearning, setIsLearning] = useState(false)
  const [learningTarget, setLearningTarget] = useState<MidiLearnState['learningTarget']>(null)
  const [lastActivity, setLastActivity] = useState<MidiLearnState['lastActivity']>(null)

  // Fetch all mappings
  const { data: mappingsArray = [], refetch: refreshMappings } = useQuery({
    queryKey: ['midiMappings'],
    queryFn: fetchMappings,
    refetchInterval: isLearning ? 500 : 5000, // Poll faster during learn mode
  })

  // Convert to Map for fast lookup
  const mappings = new Map<string, MidiMapping>()
  mappingsArray.forEach(m => {
    const key = `${m.parameterUri}:${m.parameterIndex}`
    mappings.set(key, m)
  })

  // Poll learn status when learning
  const { data: learnStatus } = useQuery({
    queryKey: ['midiLearnStatus'],
    queryFn: getLearnStatus,
    refetchInterval: isLearning ? 200 : false,
    enabled: isLearning,
  })

  // Handle learn status changes
  useEffect(() => {
    if (learnStatus && !learnStatus.learning && isLearning) {
      // Learn mode ended (either timeout or mapping created)
      setIsLearning(false)
      setLearningTarget(null)
      refreshMappings()
    }
  }, [learnStatus, isLearning, refreshMappings])

  // Start learn mutation
  const startLearnMutation = useMutation({
    mutationFn: ({ uri, paramIndex }: { uri: string; paramIndex: number }) =>
      startLearnMode(uri, paramIndex),
    onSuccess: () => {
      setIsLearning(true)
    },
  })

  // Stop learn mutation
  const stopLearnMutation = useMutation({
    mutationFn: stopLearnMode,
    onSuccess: () => {
      setIsLearning(false)
      setLearningTarget(null)
    },
  })

  // Delete mapping mutation
  const deleteMutation = useMutation({
    mutationFn: deleteMapping,
    onSuccess: () => {
      refreshMappings()
    },
  })

  const startLearn = useCallback((uri: string, paramIndex: number, paramName: string) => {
    setLearningTarget({ uri, paramIndex, paramName })
    startLearnMutation.mutate({ uri, paramIndex })
  }, [startLearnMutation])

  const stopLearn = useCallback(() => {
    stopLearnMutation.mutate()
  }, [stopLearnMutation])

  const getMapping = useCallback((uri: string, paramIndex: number) => {
    return mappings.get(`${uri}:${paramIndex}`)
  }, [mappings])

  const hasMapping = useCallback((uri: string, paramIndex: number) => {
    return mappings.has(`${uri}:${paramIndex}`)
  }, [mappings])

  const removeMapping = useCallback((uri: string, paramIndex: number) => {
    deleteMutation.mutate(`${uri}:${paramIndex}`)
  }, [deleteMutation])

  const updateMapping = useCallback((uri: string, paramIndex: number, updates: Partial<MidiMapping>) => {
    // TODO: Implement mapping update via API
    console.log('Update mapping:', uri, paramIndex, updates)
  }, [])

  const value: MidiLearnContextValue = {
    isLearning,
    learningTarget,
    mappings,
    lastActivity,
    startLearn,
    stopLearn,
    getMapping,
    hasMapping,
    removeMapping,
    updateMapping,
    refreshMappings,
  }

  return (
    <MidiLearnContext.Provider value={value}>
      {children}
    </MidiLearnContext.Provider>
  )
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access the global MIDI learn context
 */
export function useMidiLearnContext() {
  const context = useContext(MidiLearnContext)
  if (!context) {
    throw new Error('useMidiLearnContext must be used within a MidiLearnProvider')
  }
  return context
}

/**
 * Hook for a specific parameter's MIDI CC assignment
 */
export function useMidiLearn(pluginUri: string, paramIndex: number, paramName: string) {
  const context = useContext(MidiLearnContext)

  // Fallback for when used outside provider (non-breaking)
  const [localLearning, setLocalLearning] = useState(false)

  if (!context) {
    // Return stub implementation
    return {
      mapping: undefined,
      hasMapping: false,
      isLearning: false,
      isLearningThis: false,
      startLearn: () => console.warn('MidiLearnProvider not found'),
      stopLearn: () => {},
      removeMapping: () => {},
    }
  }

  const mapping = context.getMapping(pluginUri, paramIndex)
  const isLearningThis = context.learningTarget?.uri === pluginUri &&
                         context.learningTarget?.paramIndex === paramIndex

  return {
    mapping,
    hasMapping: !!mapping,
    isLearning: context.isLearning,
    isLearningThis,
    startLearn: () => context.startLearn(pluginUri, paramIndex, paramName),
    stopLearn: context.stopLearn,
    removeMapping: () => context.removeMapping(pluginUri, paramIndex),
  }
}

export default useMidiLearn
