/**
 * CabinetIRCard - Custom card for JUCE ConvolutionProcessor (Cabinet IR mode)
 *
 * Parameters:
 * - mix: % (0 to 100)
 * - bypass: boolean
 *
 * Features:
 * - IR file browser
 * - IR waveform visualization
 * - Navigation (prev/next)
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

// Plugin URI for MIDI mappings
const CABINET_IR_URI = 'map2://juce/ir/cabinet'

// Parameter definitions for MIDI mapping dialog
const CABINET_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Mix', symbol: 'mix' },
]

interface IRStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  availableIRs: Array<{ name: string; size: string; length: number }>
}

async function fetchCabinetStatus(): Promise<IRStatus> {
  const res = await fetch('/api/ir/status?type=cabinet')
  if (!res.ok) throw new Error('Failed to fetch cabinet status')
  return res.json()
}

async function fetchCabinetList(): Promise<Array<{ name: string; size: string }>> {
  const res = await fetch('/api/ir/cabinets')
  if (!res.ok) throw new Error('Failed to fetch cabinets')
  const data = await res.json()
  return data.cabinets || []
}

interface CabinetIRCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function CabinetIRCardBase({
  plugin,
  accentColor = '#f97316',
  compact = false,
  onOpenMidiMappings,
}: CabinetIRCardProps) {
  const queryClient = useQueryClient()
  const [showBrowser, setShowBrowser] = useState(false)

  const statusQuery = useQuery({
    queryKey: ['ir', 'cabinet', 'status'],
    queryFn: fetchCabinetStatus,
    refetchInterval: 2000,
  })

  const listQuery = useQuery({
    queryKey: ['ir', 'cabinet', 'list'],
    queryFn: fetchCabinetList,
  })

  const loadMutation = useMutation({
    mutationFn: async (irName: string) => {
      const res = await fetch(`/api/ir/cabinets/${encodeURIComponent(irName)}/load`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to load cabinet IR')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet'] })
      setShowBrowser(false)
    },
  })

  const setMix = useCallback(async (value: number) => {
    await fetch(`/api/ir/set-cabinet-mix/${value}`, { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [queryClient])

  const setBypass = useCallback(async (bypass: boolean) => {
    await fetch(`/api/ir/set-cabinet-bypass/${bypass}`, { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [queryClient])

  const navigate = useCallback(async (direction: 'prev' | 'next') => {
    await fetch(`/api/ir/navigate-cabinet/${direction}`, { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [queryClient])

  const status = statusQuery.data
  const cabinets = listQuery.data || []

  const visualization = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      {/* Current IR Name */}
      <div
        style={{
          padding: '12px 24px',
          background: '#1a1a1a',
          borderRadius: '8px',
          border: `1px solid ${accentColor}40`,
          textAlign: 'center',
          minWidth: '200px',
        }}
      >
        <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>
          Cabinet IR
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: status?.loaded ? '#fff' : '#666',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '180px',
          }}
        >
          {status?.loaded || 'No IR Loaded'}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => navigate('prev')}
          style={{
            padding: '6px 16px',
            background: '#333',
            border: '1px solid #555',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ◀
        </button>
        <button
          onClick={() => setShowBrowser(true)}
          style={{
            padding: '6px 16px',
            background: accentColor,
            border: 'none',
            borderRadius: '4px',
            color: '#000',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
          }}
        >
          BROWSE
        </button>
        <button
          onClick={() => navigate('next')}
          style={{
            padding: '6px 16px',
            background: '#333',
            border: '1px solid #555',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ▶
        </button>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={status?.bypass ?? false}
      onBypassToggle={() => setBypass(!status?.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      compact={compact}
    >
      {/* Mix Control */}
      <ParameterSection title="Mix" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Dry/Wet"
            value={status?.mix ?? 100}
            min={0}
            max={100}
            defaultValue={100}
            step={1}
            unit="%"
            onChange={setMix}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
      </ParameterSection>

      {/* IR Count */}
      <div
        style={{
          textAlign: 'center',
          padding: '8px 0',
          fontSize: '10px',
          color: '#666',
        }}
      >
        {cabinets.length} cabinet IRs available
      </div>

      {/* Browser Modal */}
      {showBrowser && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
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
              maxWidth: '400px',
              maxHeight: '500px',
              overflow: 'auto',
              border: `1px solid ${accentColor}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: accentColor }}>Select Cabinet IR</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {cabinets.map((cab) => (
                <button
                  key={cab.name}
                  onClick={() => loadMutation.mutate(cab.name)}
                  style={{
                    padding: '12px 16px',
                    background: status?.loaded === cab.name ? accentColor : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    color: status?.loaded === cab.name ? '#000' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{cab.name}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7 }}>{cab.size}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </PluginCardShell>
  )
}

// Export base component for testing
export { CabinetIRCardBase as CabinetIRCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(CabinetIRCardBase, CABINET_IR_URI, CABINET_PARAMS)
