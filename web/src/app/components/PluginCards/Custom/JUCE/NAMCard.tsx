/**
 * NAMCard - Neural Amp Modeler from JUCE NAMProcessor
 *
 * Parameters:
 * - inputGain: dB (-12 to 12)
 * - outputGain: dB (-12 to 12)
 * - normalize: boolean
 * - bypass: boolean
 *
 * Features:
 * - Model browser and selection
 * - Input/Output level meters
 * - Model metadata display
 * - Favorites and ratings
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { AmplifierCategoryLayout, type ParamSlot } from '../../Layouts/AmplifierCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import type { PluginCardProps } from '../../types'

// Plugin URI for MIDI mappings
const NAM_URI = 'map2://juce/nam'

// Parameter definitions for MIDI mapping dialog
const NAM_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Input Gain', symbol: 'inputGain' },
  { index: 1, name: 'Output Level', symbol: 'outputLevel' },
]

interface NAMStatus {
  available: boolean
  activeModel: string | null
  loading: boolean
  bypass: boolean
  inputLevel: number
  outputLevel: number
  inputGain: number
  outputGain: number
  normalize: boolean
}

interface NAMModel {
  name: string
  model_type?: string
  is_favorite?: boolean
  rating?: number
}

async function fetchNAMStatus(): Promise<NAMStatus> {
  const res = await fetch('/api/nam/status')
  if (!res.ok) throw new Error('Failed to fetch NAM status')
  return res.json()
}

async function fetchNAMModels(): Promise<NAMModel[]> {
  const res = await fetch('/api/nam/models')
  if (!res.ok) throw new Error('Failed to fetch NAM models')
  const data = await res.json()
  return data.models || []
}

interface NAMCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function NAMCardBase({
  plugin,
  accentColor = '#ff6b6b',
  compact = false,
  onOpenMidiMappings,
}: NAMCardProps) {
  const queryClient = useQueryClient()
  const [showBrowser, setShowBrowser] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const statusQuery = useQuery({
    queryKey: ['nam', 'status'],
    queryFn: fetchNAMStatus,
    refetchInterval: 500, // Fast updates for level meters
  })

  const modelsQuery = useQuery({
    queryKey: ['nam', 'models'],
    queryFn: fetchNAMModels,
  })

  const loadMutation = useMutation({
    mutationFn: async (modelName: string) => {
      const res = await fetch(`/api/nam/models/${encodeURIComponent(modelName)}/load`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to load NAM model')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nam'] })
      setShowBrowser(false)
    },
  })

  const setInputGain = useCallback(async (value: number) => {
    await fetch('/api/nam/input-gain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gain_db: value }),
    })
    queryClient.invalidateQueries({ queryKey: ['nam', 'status'] })
  }, [queryClient])

  const setOutputGain = useCallback(async (value: number) => {
    await fetch('/api/nam/output-gain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gain_db: value }),
    })
    queryClient.invalidateQueries({ queryKey: ['nam', 'status'] })
  }, [queryClient])

  const setNormalize = useCallback(async (normalize: boolean) => {
    await fetch('/api/nam/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalize }),
    })
    queryClient.invalidateQueries({ queryKey: ['nam', 'status'] })
  }, [queryClient])

  const setBypass = useCallback(async (bypass: boolean) => {
    await fetch('/api/nam/bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bypass }),
    })
    queryClient.invalidateQueries({ queryKey: ['nam', 'status'] })
  }, [queryClient])

  const status = statusQuery.data
  const models = modelsQuery.data || []

  // Filter models by search query
  const filteredModels = searchQuery
    ? models.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : models

  // Level meter helper
  const levelToPercent = (db: number) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100))

  const visualization = (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'center', justifyContent: 'center' }}>
      {/* Input Meter */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>IN</span>
        <div
          style={{
            width: '12px',
            height: compact ? 112 : 140,
            background: '#222',
            borderRadius: '2px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column-reverse',
          }}
        >
          <div
            style={{
              height: `${levelToPercent(status?.inputLevel ?? -60)}%`,
              background: `linear-gradient(to top, ${accentColor}, #ffaa00)`,
              transition: 'height 0.05s ease-out',
            }}
          />
        </div>
        <span style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-mono)' }}>
          {(status?.inputLevel ?? -60).toFixed(0)}
        </span>
      </div>

      {/* Model Display */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            padding: '12px 20px',
            background: '#1a1a1a',
            borderRadius: '8px',
            border: `1px solid ${accentColor}40`,
            marginBottom: '8px',
          }}
        >
          <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>
            NAM Model
          </div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: status?.activeModel ? '#fff' : '#666',
              maxWidth: '140px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {status?.loading ? 'Loading...' : status?.activeModel || 'No Model'}
          </div>
        </div>
        <button
          onClick={() => setShowBrowser(true)}
          style={{
            padding: '8px 20px',
            background: accentColor,
            border: 'none',
            borderRadius: '4px',
            color: '#000',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
          }}
        >
          BROWSE ({models.length})
        </button>
      </div>

      {/* Output Meter */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>OUT</span>
        <div
          style={{
            width: '12px',
            height: compact ? 112 : 140,
            background: '#222',
            borderRadius: '2px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column-reverse',
          }}
        >
          <div
            style={{
              height: `${levelToPercent(status?.outputLevel ?? -60)}%`,
              background: `linear-gradient(to top, ${accentColor}, #ffaa00)`,
              transition: 'height 0.05s ease-out',
            }}
          />
        </div>
        <span style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-mono)' }}>
          {(status?.outputLevel ?? -60).toFixed(0)}
        </span>
      </div>
    </div>
  )

  // Map parameters to AmplifierCategoryLayout slots
  const inputGainSlot: ParamSlot = {
    label: 'Input',
    value: status?.inputGain ?? 0,
    min: -12,
    max: 12,
    defaultValue: 0,
    step: 0.1,
    unit: 'dB',
    onChange: setInputGain,
    valueFormatter: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
  }

  const outputGainSlot: ParamSlot = {
    label: 'Output',
    value: status?.outputGain ?? 0,
    min: -12,
    max: 12,
    defaultValue: 0,
    step: 0.1,
    unit: 'dB',
    onChange: setOutputGain,
    valueFormatter: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
  }

  // Model browser in advanced sections
  const advancedSections: AdvancedSection[] = [
    {
      id: 'model-browser',
      title: 'Model Browser',
      defaultOpen: true,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => setShowBrowser(true)}
            className="carbon-toggle-btn active"
            style={{ background: accentColor, borderColor: accentColor }}
          >
            Browse Models ({models.length})
          </button>
          {status?.activeModel && (
            <div style={{ fontSize: '11px', color: '#c6c6c6' }}>
              Active: <strong>{status.activeModel}</strong>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'options',
      title: 'Options',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className={`carbon-toggle-btn ${status?.normalize ? 'active' : ''}`}
            onClick={() => setNormalize(!status?.normalize)}
            style={status?.normalize ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            Normalize Output
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <AmplifierCategoryLayout
        plugin={plugin}
        accentColor={accentColor}
        compact={compact}
        bypassed={status?.bypass ?? false}
        onBypassToggle={() => setBypass(!status?.bypass)}
        onOpenMidiMappings={onOpenMidiMappings}
        visualization={visualization}
        inputGain={inputGainSlot}
        outputGain={outputGainSlot}
        inputLevel={status?.inputLevel ?? 0}
        outputLevel={status?.outputLevel ?? 0}
        advancedSections={advancedSections}
      />

      {/* Browser Modal */}
      {showBrowser && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowBrowser(false)}
        >
          <div
            style={{
              background: '#1a1a1a',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '500px',
              maxHeight: '600px',
              display: 'flex',
              flexDirection: 'column',
              border: `1px solid ${accentColor}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: accentColor }}>Select NAM Model</h3>

            {/* Search */}
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: '12px',
                background: '#222',
                border: '1px solid #444',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
              }}
            />

            {/* Model List */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredModels.map((model) => (
                  <button
                    key={model.name}
                    onClick={() => loadMutation.mutate(model.name)}
                    disabled={loadMutation.isPending}
                    style={{
                      padding: '12px 16px',
                      background: status?.activeModel === model.name ? accentColor : '#2a2a2a',
                      border: 'none',
                      borderRadius: '6px',
                      color: status?.activeModel === model.name ? '#000' : '#fff',
                      cursor: loadMutation.isPending ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{model.name}</div>
                      {model.model_type && (
                        <div style={{ fontSize: '10px', opacity: 0.7 }}>{model.model_type}</div>
                      )}
                    </div>
                    {model.is_favorite && <span style={{ color: '#ffaa00' }}>★</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowBrowser(false)}
              style={{
                marginTop: '12px',
                padding: '10px',
                background: '#333',
                border: '1px solid #555',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Export base component for testing
export { NAMCardBase as NAMCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(NAMCardBase, NAM_URI, NAM_PARAMS)
