/**
 * AudioPortSelector Component — Unified I/O Port Router
 *
 * Full-featured port selection for multi-channel audio interfaces (e.g. 10in/10out).
 * Supports:
 *  - Unified input + output selection in one modal
 *  - Per-flow (chain) port assignment or global routing
 *  - Visual port matrix with named channels
 *  - Quick presets (Stereo, Mono, S/PDIF, ADAT, etc.)
 *  - Adaptive layout based on what the audio node makes available
 *  - Stereo pair linking
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  SpeakerHigh,
  Microphone,
  X,
  Lightning,
  ArrowCounterClockwise,
  Link,
  LinkBreak,
  CaretRight,
} from '@phosphor-icons/react'
import { audioApi } from '../../../map2/api'
import type { AudioPort, AudioPortPreset } from '../../../map2/api'

export interface AudioPortSelectorProps {
  open: boolean
  onClose: () => void
  onPortsChange?: (inputPorts: number[], outputPorts: number[]) => void
  /** If set, routes apply to this chain only (per-flow). Otherwise global. */
  chainId?: number | null
  /** Flow label for display, e.g. "A" */
  flowLabel?: string
  /** Flow color accent */
  flowColor?: string
  /** @deprecated — ignored. Unified selector handles both input and output. */
  type?: 'input' | 'output'
}

// Port category detection for visual grouping
function getPortCategory(name: string): 'analog' | 'spdif' | 'adat' | 'digital' {
  const lower = name.toLowerCase()
  if (lower.includes('s/pdif') || lower.includes('spdif')) return 'spdif'
  if (lower.includes('adat')) return 'adat'
  if (lower.includes('digital')) return 'digital'
  return 'analog'
}

const CATEGORY_COLORS: Record<string, string> = {
  analog: '#3b82f6',
  spdif: '#f59e0b',
  adat: '#8b5cf6',
  digital: '#06b6d4',
}

const CATEGORY_LABELS: Record<string, string> = {
  analog: 'Analog',
  spdif: 'S/PDIF',
  adat: 'ADAT',
  digital: 'Digital',
}

export function AudioPortSelector({
  open,
  onClose,
  onPortsChange,
  chainId,
  flowLabel,
  flowColor,
}: AudioPortSelectorProps) {
  const queryClient = useQueryClient()
  const [selectedInputs, setSelectedInputs] = useState<number[]>([])
  const [selectedOutputs, setSelectedOutputs] = useState<number[]>([])
  const [linkStereo, setLinkStereo] = useState(true)
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('input')

  const isPerChain = chainId != null && chainId > 0
  const accentColor = flowColor || '#00d4ff'

  // Fetch available ports
  const portsQuery = useQuery({
    queryKey: ['audio', 'ports'],
    queryFn: audioApi.getPorts,
    enabled: open,
  })

  // Fetch current global routing
  const routingQuery = useQuery({
    queryKey: ['audio', 'routing'],
    queryFn: audioApi.getRouting,
    enabled: open,
  })

  // Fetch per-chain routing if applicable
  const chainRoutingQuery = useQuery({
    queryKey: ['audio', 'routing', 'chain', chainId],
    queryFn: () => audioApi.getChainRouting(chainId!),
    enabled: open && isPerChain,
  })

  // Fetch presets
  const presetsQuery = useQuery({
    queryKey: ['audio', 'ports', 'presets'],
    queryFn: audioApi.getPortPresets,
    enabled: open,
  })

  // Sync selected ports when routing data loads
  useEffect(() => {
    if (isPerChain && chainRoutingQuery.data) {
      setSelectedInputs(chainRoutingQuery.data.input_ports)
      setSelectedOutputs(chainRoutingQuery.data.output_ports)
    } else if (routingQuery.data?.available) {
      setSelectedInputs(routingQuery.data.input_ports)
      setSelectedOutputs(routingQuery.data.output_ports)
    }
  }, [routingQuery.data, chainRoutingQuery.data, isPerChain])

  // Mutation for global routing
  const globalRoutingMutation = useMutation({
    mutationFn: (config: { inputPorts: number[]; outputPorts: number[] }) =>
      audioApi.setRouting(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
    },
  })

  // Mutation for per-chain routing
  const chainRoutingMutation = useMutation({
    mutationFn: (config: { inputPorts: number[]; outputPorts: number[] }) =>
      audioApi.setChainRouting(chainId!, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing', 'chain', chainId] })
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
    },
  })

  // Mutation to revert chain to global
  const clearChainRoutingMutation = useMutation({
    mutationFn: () => audioApi.clearChainRouting(chainId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing', 'chain', chainId] })
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
    },
  })

  const inputPorts = portsQuery.data?.inputs || []
  const outputPorts = portsQuery.data?.outputs || []
  const presets = presetsQuery.data?.presets || []
  const deviceName = portsQuery.data?.device || 'Audio Interface'

  // Group ports by category
  const groupPorts = useCallback((ports: AudioPort[]) => {
    const groups: Record<string, AudioPort[]> = {}
    for (const port of ports) {
      const cat = getPortCategory(port.name)
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(port)
    }
    return groups
  }, [])

  const inputGroups = useMemo(() => groupPorts(inputPorts), [inputPorts, groupPorts])
  const outputGroups = useMemo(() => groupPorts(outputPorts), [outputPorts, groupPorts])

  const togglePort = useCallback((type: 'input' | 'output', index: number) => {
    const setter = type === 'input' ? setSelectedInputs : setSelectedOutputs
    const current = type === 'input' ? selectedInputs : selectedOutputs
    const ports = type === 'input' ? inputPorts : outputPorts

    setter(prev => {
      if (prev.includes(index)) {
        let next = prev.filter(p => p !== index)
        if (linkStereo) {
          const partner = index % 2 === 0 ? index + 1 : index - 1
          if (partner >= 0 && partner < ports.length) {
            next = next.filter(p => p !== partner)
          }
        }
        return next.sort((a, b) => a - b)
      }
      let next = [...prev, index]
      if (linkStereo) {
        const partner = index % 2 === 0 ? index + 1 : index - 1
        if (partner >= 0 && partner < ports.length && !prev.includes(partner)) {
          next.push(partner)
        }
      }
      return next.sort((a, b) => a - b)
    })
  }, [linkStereo, selectedInputs, selectedOutputs, inputPorts, outputPorts])

  const applyPreset = useCallback((preset: AudioPortPreset) => {
    setSelectedInputs(preset.input_ports)
    setSelectedOutputs(preset.output_ports)
  }, [])

  const handleApply = useCallback(() => {
    const mutation = isPerChain ? chainRoutingMutation : globalRoutingMutation
    mutation.mutate({ inputPorts: selectedInputs, outputPorts: selectedOutputs })
    onPortsChange?.(selectedInputs, selectedOutputs)
    onClose()
  }, [selectedInputs, selectedOutputs, isPerChain, chainRoutingMutation, globalRoutingMutation, onPortsChange, onClose])

  const handleRevertToGlobal = useCallback(() => {
    clearChainRoutingMutation.mutate()
    if (routingQuery.data) {
      setSelectedInputs(routingQuery.data.input_ports)
      setSelectedOutputs(routingQuery.data.output_ports)
    }
  }, [clearChainRoutingMutation, routingQuery.data])

  if (!open) return null

  const isPending = globalRoutingMutation.isPending || chainRoutingMutation.isPending
  const hasOverride = isPerChain && chainRoutingQuery.data?.is_override

  const formatChannelSummary = (ports: number[]) => {
    if (ports.length === 0) return 'None'
    if (ports.length === 1) return 'Mono'
    if (ports.length === 2 && ports[0] + 1 === ports[1]) return 'Stereo'
    if (ports.length === 2) return '2ch'
    return `${ports.length}ch`
  }

  const renderPortGrid = (
    type: 'input' | 'output',
    groups: Record<string, AudioPort[]>,
    selected: number[],
  ) => {
    const color = type === 'input' ? '#22c55e' : '#a855f7'
    const entries = Object.entries(groups)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {entries.map(([category, ports]) => (
          <div key={category}>
            {entries.length > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: CATEGORY_COLORS[category] || color,
                }} />
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {CATEGORY_LABELS[category] || category}
                </span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: ports.length <= 4
                ? 'repeat(2, 1fr)'
                : ports.length <= 6
                  ? 'repeat(3, 1fr)'
                  : 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 6,
            }}>
              {ports.map((port) => {
                const isSelected = selected.includes(port.index)
                const catColor = CATEGORY_COLORS[category] || color
                const partnerIdx = port.index % 2 === 0 ? port.index + 1 : port.index - 1
                const isStereoPaired = linkStereo && selected.includes(partnerIdx) && isSelected

                return (
                  <button
                    key={port.index}
                    onClick={() => togglePort(type, port.index)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      background: isSelected
                        ? `linear-gradient(135deg, ${catColor}22 0%, ${catColor}11 100%)`
                        : 'rgba(255,255,255,0.025)',
                      border: `2px solid ${isSelected ? catColor : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 8,
                      color: isSelected ? '#fff' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      background: isSelected ? catColor : 'rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? `0 0 8px ${catColor}40` : 'none',
                    }}>
                      {isSelected ? (
                        <Check size={12} weight="bold" style={{ color: '#fff' }} />
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
                          {port.index + 1}
                        </span>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {port.name}
                      </div>
                    </div>

                    {isStereoPaired && (
                      <Link size={10} weight="duotone" style={{ color: catColor, opacity: 0.6, flexShrink: 0 }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="audio-port-selector-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
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
          background: 'linear-gradient(145deg, #161625 0%, #0f1a2e 100%)',
          borderRadius: 16,
          border: `2px solid ${accentColor}30`,
          boxShadow: `0 0 60px ${accentColor}15, 0 30px 60px rgba(0, 0, 0, 0.5)`,
          padding: 0,
          width: 560,
          maxWidth: '95vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {flowLabel && (
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${accentColor}20`,
                border: `2px solid ${accentColor}50`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 800,
                color: accentColor,
              }}>
                {flowLabel}
              </div>
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>
                {isPerChain ? 'Flow Port Routing' : 'Audio Port Routing'}
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {deviceName}
                {inputPorts.length > 0 && (
                  <span> · {inputPorts.length}in / {outputPorts.length}out</span>
                )}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setLinkStereo(!linkStereo)}
              title={linkStereo ? 'Stereo linked — click to unlink' : 'Unlinked — click to link stereo pairs'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                background: linkStereo ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${linkStereo ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6,
                color: linkStereo ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {linkStereo ? <Link size={12} weight="duotone" /> : <LinkBreak size={12} weight="duotone" />}
              {linkStereo ? 'Linked' : 'Unlinked'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
              }}
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Scope indicator (per-chain vs global) */}
        {isPerChain && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 24px',
            background: hasOverride ? `${accentColor}08` : 'rgba(255,255,255,0.02)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: hasOverride ? accentColor : 'rgba(255,255,255,0.4)',
            }}>
              <CaretRight size={12} weight="bold" />
              {hasOverride
                ? `Custom routing for Flow ${flowLabel || ''}`
                : `Using global routing`}
            </div>
            {hasOverride && (
              <button
                onClick={handleRevertToGlobal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 5,
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                <ArrowCounterClockwise size={10} weight="duotone" />
                Revert to Global
              </button>
            )}
          </div>
        )}

        {/* Quick Presets */}
        {presets.length > 0 && (
          <div style={{
            padding: '12px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              marginBottom: 8,
            }}>
              Quick Presets
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {presets.map((preset) => {
                const isActive =
                  JSON.stringify(selectedInputs) === JSON.stringify(preset.input_ports) &&
                  JSON.stringify(selectedOutputs) === JSON.stringify(preset.output_ports)
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 12px',
                      background: isActive ? `${accentColor}20` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? accentColor + '60' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 6,
                      color: isActive ? accentColor : 'rgba(255,255,255,0.6)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    title={preset.description}
                  >
                    <Lightning size={10} weight="duotone" />
                    {preset.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Tab bar: Input / Output */}
        <div style={{
          display: 'flex',
          padding: '0 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.15)',
        }}>
          {(['input', 'output'] as const).map(tab => {
            const isActiveTab = activeTab === tab
            const tabColor = tab === 'input' ? '#22c55e' : '#a855f7'
            const count = tab === 'input' ? selectedInputs.length : selectedOutputs.length
            const total = tab === 'input' ? inputPorts.length : outputPorts.length
            const Icon = tab === 'input' ? Microphone : SpeakerHigh
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 20px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${isActiveTab ? tabColor : 'transparent'}`,
                  color: isActiveTab ? '#fff' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  marginBottom: -1,
                }}
              >
                <Icon size={14} style={{ color: isActiveTab ? tabColor : 'rgba(255,255,255,0.3)' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {tab === 'input' ? 'Inputs' : 'Outputs'}
                </span>
                <span style={{
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: isActiveTab ? `${tabColor}25` : 'rgba(255,255,255,0.06)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: isActiveTab ? tabColor : 'rgba(255,255,255,0.4)',
                }}>
                  {count}/{total}
                </span>
              </button>
            )
          })}
        </div>

        {/* Port Grid (scrollable) */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 24px',
          minHeight: 180,
        }}>
          {activeTab === 'input'
            ? renderPortGrid('input', inputGroups, selectedInputs)
            : renderPortGrid('output', outputGroups, selectedOutputs)
          }
          {activeTab === 'input' && inputPorts.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              No input ports available on this audio node
            </div>
          )}
          {activeTab === 'output' && outputPorts.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              No output ports available on this audio node
            </div>
          )}
        </div>

        {/* Footer: Selection summary + actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 14,
          }}>
            {/* Input summary */}
            <div style={{
              padding: '10px 12px',
              background: 'rgba(34, 197, 94, 0.06)',
              border: '1px solid rgba(34, 197, 94, 0.15)',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Microphone size={11} weight="duotone" style={{ color: '#22c55e' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Input
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {formatChannelSummary(selectedInputs)}
              </div>
              {selectedInputs.length > 0 && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                  Ch {selectedInputs.map(p => p + 1).join(', ')}
                </div>
              )}
            </div>

            {/* Output summary */}
            <div style={{
              padding: '10px 12px',
              background: 'rgba(168, 85, 247, 0.06)',
              border: '1px solid rgba(168, 85, 247, 0.15)',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <SpeakerHigh size={11} weight="duotone" style={{ color: '#a855f7' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Output
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {formatChannelSummary(selectedOutputs)}
              </div>
              {selectedOutputs.length > 0 && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                  Ch {selectedOutputs.map(p => p + 1).join(', ')}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '11px 18px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.6)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={(selectedInputs.length === 0 && selectedOutputs.length === 0) || isPending}
              style={{
                flex: 1,
                padding: '11px 18px',
                background:
                  selectedInputs.length > 0 || selectedOutputs.length > 0
                    ? `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}bb 100%)`
                    : 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: selectedInputs.length > 0 || selectedOutputs.length > 0 ? 'pointer' : 'not-allowed',
                opacity: selectedInputs.length > 0 || selectedOutputs.length > 0 ? 1 : 0.5,
                boxShadow: selectedInputs.length > 0 || selectedOutputs.length > 0
                  ? `0 4px 16px ${accentColor}40`
                  : 'none',
              }}
            >
              {isPending ? 'Applying…' : isPerChain ? `Apply to Flow ${flowLabel || ''}` : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AudioPortSelector
