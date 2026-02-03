/**
 * AudioPortSelector Component
 * Allows selection of input/output ports on the connected audio interface
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Check,
  AudioLines,
  Speaker,
  Mic,
  X,
  Zap,
} from 'lucide-react'
import { audioApi } from '../../../map2/api'
import type { AudioPort, AudioPortPreset } from '../../../map2/api'

export interface AudioPortSelectorProps {
  type: 'input' | 'output'
  open: boolean
  onClose: () => void
  onPortsChange?: (ports: number[]) => void
}

export function AudioPortSelector({
  type,
  open,
  onClose,
  onPortsChange,
}: AudioPortSelectorProps) {
  const queryClient = useQueryClient()
  const [selectedPorts, setSelectedPorts] = useState<number[]>([])

  // Fetch available ports
  const portsQuery = useQuery({
    queryKey: ['audio', 'ports'],
    queryFn: audioApi.getPorts,
    enabled: open,
  })

  // Fetch current routing
  const routingQuery = useQuery({
    queryKey: ['audio', 'routing'],
    queryFn: audioApi.getRouting,
    enabled: open,
  })

  // Sync selected ports when routing data loads
  useEffect(() => {
    if (routingQuery.data?.available) {
      setSelectedPorts(type === 'input' ? routingQuery.data.input_ports : routingQuery.data.output_ports)
    }
  }, [routingQuery.data, type])

  // Fetch presets
  const presetsQuery = useQuery({
    queryKey: ['audio', 'ports', 'presets'],
    queryFn: audioApi.getPortPresets,
    enabled: open,
  })

  // Mutation for updating routing
  const routingMutation = useMutation({
    mutationFn: (ports: number[]) =>
      audioApi.setRouting(
        type === 'input' ? { inputPorts: ports } : { outputPorts: ports }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
      onPortsChange?.(selectedPorts)
    },
  })

  const ports = type === 'input'
    ? portsQuery.data?.inputs || []
    : portsQuery.data?.outputs || []

  const presets = presetsQuery.data?.presets || []

  const togglePort = useCallback((index: number) => {
    setSelectedPorts(prev => {
      if (prev.includes(index)) {
        return prev.filter(p => p !== index)
      }
      return [...prev, index].sort((a, b) => a - b)
    })
  }, [])

  const applyPreset = useCallback((preset: AudioPortPreset) => {
    const newPorts = type === 'input' ? preset.input_ports : preset.output_ports
    setSelectedPorts(newPorts)
  }, [type])

  const handleApply = useCallback(() => {
    routingMutation.mutate(selectedPorts)
    onClose()
  }, [selectedPorts, routingMutation, onClose])

  if (!open) return null

  const color = type === 'input' ? '#22c55e' : '#a855f7'
  const Icon = type === 'input' ? Mic : Speaker

  return (
    <div
      className="audio-port-selector-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="audio-port-selector"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: 16,
          border: `2px solid ${color}40`,
          boxShadow: `0 0 40px ${color}30, 0 25px 50px rgba(0, 0, 0, 0.5)`,
          padding: 24,
          minWidth: 400,
          maxWidth: 500,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: `1px solid ${color}30`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: `${color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
                {type === 'input' ? 'Input' : 'Output'} Ports
              </h2>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {portsQuery.data?.device || 'Audio Interface'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 8,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick Presets */}
        {presets.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 10,
              }}
            >
              Quick Presets
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {presets.map((preset) => {
                const presetPorts = type === 'input' ? preset.input_ports : preset.output_ports
                const isActive = JSON.stringify(selectedPorts) === JSON.stringify(presetPorts)
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      background: isActive ? `${color}30` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 8,
                      color: isActive ? color : 'rgba(255,255,255,0.7)',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    title={preset.description}
                  >
                    <Zap size={12} />
                    {preset.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Port List */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 10,
            }}
          >
            Available Ports ({ports.length})
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
            }}
          >
            {ports.map((port: AudioPort) => {
              const isSelected = selectedPorts.includes(port.index)
              return (
                <button
                  key={port.index}
                  onClick={() => togglePort(port.index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    background: isSelected
                      ? `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`
                      : 'rgba(255,255,255,0.03)',
                    border: `2px solid ${isSelected ? color : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10,
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: isSelected ? color : 'rgba(255,255,255,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    {isSelected ? (
                      <Check size={14} style={{ color: '#fff' }} />
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{port.index + 1}</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{port.name}</div>
                    <div style={{ fontSize: 10, opacity: 0.6 }}>Channel {port.index + 1}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selection Summary */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
              Selected
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              {selectedPorts.length === 0 ? (
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>None selected</span>
              ) : selectedPorts.length === 1 ? (
                'Mono'
              ) : selectedPorts.length === 2 ? (
                'Stereo'
              ) : (
                `${selectedPorts.length} channels`
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selectedPorts.map((idx) => {
              const port = ports.find((p: AudioPort) => p.index === idx)
              return (
                <div
                  key={idx}
                  style={{
                    padding: '4px 10px',
                    background: `${color}30`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color,
                  }}
                >
                  {port?.name || `Ch ${idx + 1}`}
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              color: 'rgba(255,255,255,0.7)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={selectedPorts.length === 0 || routingMutation.isPending}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: selectedPorts.length > 0 ? `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: selectedPorts.length > 0 ? 'pointer' : 'not-allowed',
              opacity: selectedPorts.length > 0 ? 1 : 0.5,
              boxShadow: selectedPorts.length > 0 ? `0 4px 20px ${color}50` : 'none',
            }}
          >
            {routingMutation.isPending ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AudioPortSelector
