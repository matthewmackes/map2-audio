import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckmarkFilled, Flash, Link, Renew, VolumeUp, WarningAlt } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  Modal,
  Tab,
  TabList,
  Tabs,
  Tag,
  Tile,
} from '@carbon/react'
import {
  audioApi,
  type AudioAvbEndpoint,
  type AudioPort,
  type AudioPortPreset,
} from '../../map2/api'

export interface JuceGridAudioPortModalProps {
  open: boolean
  onClose: () => void
  onPortsChange?: (
    inputPorts: number[],
    outputPorts: number[],
    inputAvbEndpoints: string[],
    outputAvbEndpoints: string[],
  ) => void
  chainId?: number | null
  flowLabel?: string
  flowColor?: string
}

type PortTabId = 'input' | 'output'

const PORT_CATEGORY_LABELS: Record<string, string> = {
  analog: 'Analog',
  spdif: 'S/PDIF',
  adat: 'ADAT',
  digital: 'Digital',
}

function getPortCategory(name: string): 'analog' | 'spdif' | 'adat' | 'digital' {
  const lower = name.toLowerCase()
  if (lower.includes('s/pdif') || lower.includes('spdif')) return 'spdif'
  if (lower.includes('adat')) return 'adat'
  if (lower.includes('digital')) return 'digital'
  return 'analog'
}

function groupPorts(ports: AudioPort[]) {
  return ports.reduce<Record<string, AudioPort[]>>((groups, port) => {
    const category = getPortCategory(port.name)
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(port)
    return groups
  }, {})
}

function formatChannelSummary(ports: number[], avbEndpoints: string[]) {
  if (ports.length === 0) {
    if (avbEndpoints.length === 0) return 'None'
    return `${avbEndpoints.length} AVB`
  }
  if (ports.length === 1) return 'Mono'
  if (ports.length === 2 && ports[0] + 1 === ports[1]) return 'Stereo'
  if (ports.length === 2) return '2ch'
  const base = `${ports.length}ch`
  return avbEndpoints.length > 0 ? `${base} + ${avbEndpoints.length} AVB` : base
}

export function JuceGridAudioPortModal({
  open,
  onClose,
  onPortsChange,
  chainId,
  flowLabel,
  flowColor,
}: JuceGridAudioPortModalProps) {
  const queryClient = useQueryClient()
  const [selectedInputs, setSelectedInputs] = useState<number[]>([])
  const [selectedOutputs, setSelectedOutputs] = useState<number[]>([])
  const [selectedInputAvbEndpoints, setSelectedInputAvbEndpoints] = useState<string[]>([])
  const [selectedOutputAvbEndpoints, setSelectedOutputAvbEndpoints] = useState<string[]>([])
  const [linkStereo, setLinkStereo] = useState(true)
  const [allowMultiSelect, setAllowMultiSelect] = useState(true)
  const [activeTab, setActiveTab] = useState<PortTabId>('input')

  const isPerChain = chainId != null && chainId > 0

  const portsQuery = useQuery({
    queryKey: ['audio', 'ports'],
    queryFn: audioApi.getPorts,
    enabled: open,
  })

  const routingQuery = useQuery({
    queryKey: ['audio', 'routing'],
    queryFn: audioApi.getRouting,
    enabled: open,
  })

  const chainRoutingQuery = useQuery({
    queryKey: ['audio', 'routing', 'chain', chainId],
    queryFn: () => audioApi.getChainRouting(chainId!),
    enabled: open && isPerChain,
  })

  const portPresetsQuery = useQuery({
    queryKey: ['audio', 'ports', 'presets'],
    queryFn: audioApi.getPortPresets,
    enabled: open,
  })

  useEffect(() => {
    if (!open) {
      return
    }

    if (isPerChain && chainRoutingQuery.data) {
      setSelectedInputs(chainRoutingQuery.data.input_ports)
      setSelectedOutputs(chainRoutingQuery.data.output_ports)
      setSelectedInputAvbEndpoints(chainRoutingQuery.data.input_avb_endpoints || [])
      setSelectedOutputAvbEndpoints(chainRoutingQuery.data.output_avb_endpoints || [])
      return
    }

    if (routingQuery.data?.available) {
      setSelectedInputs(routingQuery.data.input_ports)
      setSelectedOutputs(routingQuery.data.output_ports)
      setSelectedInputAvbEndpoints(routingQuery.data.input_avb_endpoints || [])
      setSelectedOutputAvbEndpoints(routingQuery.data.output_avb_endpoints || [])
    }
  }, [open, isPerChain, chainRoutingQuery.data, routingQuery.data])

  useEffect(() => {
    if (open) {
      setActiveTab('input')
    }
  }, [open])

  const globalRoutingMutation = useMutation({
    mutationFn: (config: {
      inputPorts: number[]
      outputPorts: number[]
      inputAvbEndpoints: string[]
      outputAvbEndpoints: string[]
    }) => audioApi.setRouting(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
    },
  })

  const chainRoutingMutation = useMutation({
    mutationFn: (config: {
      inputPorts: number[]
      outputPorts: number[]
      inputAvbEndpoints: string[]
      outputAvbEndpoints: string[]
    }) => audioApi.setChainRouting(chainId!, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing', 'chain', chainId] })
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
    },
  })

  const clearChainRoutingMutation = useMutation({
    mutationFn: () => audioApi.clearChainRouting(chainId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing', 'chain', chainId] })
      queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
    },
  })

  const inputPorts = portsQuery.data?.inputs || []
  const outputPorts = portsQuery.data?.outputs || []
  const avbTalkers = portsQuery.data?.avb_talkers || []
  const avbListeners = portsQuery.data?.avb_listeners || []
  const presets = portPresetsQuery.data?.presets || []
  const deviceName = portsQuery.data?.device || 'Audio Interface'
  const hasOverride = isPerChain && Boolean(chainRoutingQuery.data?.is_override)

  const avbReadinessState = useMemo(() => {
    const readiness = portsQuery.data?.avb_readiness
    if (!readiness || typeof readiness !== 'object') return 'unknown'
    const state = (readiness as Record<string, unknown>).state
    return typeof state === 'string' && state.trim() ? state : 'unknown'
  }, [portsQuery.data?.avb_readiness])

  const missingInputAvbEndpointIds = useMemo(() => {
    const discovered = new Set(avbTalkers.map((endpoint) => endpoint.endpoint_id))
    return selectedInputAvbEndpoints.filter((endpointId) => !discovered.has(endpointId))
  }, [avbTalkers, selectedInputAvbEndpoints])

  const missingOutputAvbEndpointIds = useMemo(() => {
    const discovered = new Set(avbListeners.map((endpoint) => endpoint.endpoint_id))
    return selectedOutputAvbEndpoints.filter((endpointId) => !discovered.has(endpointId))
  }, [avbListeners, selectedOutputAvbEndpoints])

  const inputGroups = useMemo(() => groupPorts(inputPorts), [inputPorts])
  const outputGroups = useMemo(() => groupPorts(outputPorts), [outputPorts])

  const togglePort = useCallback((type: PortTabId, index: number) => {
    const setter = type === 'input' ? setSelectedInputs : setSelectedOutputs
    const ports = type === 'input' ? inputPorts : outputPorts

    setter((previous) => {
      if (previous.includes(index)) {
        let next = previous.filter((portIndex) => portIndex !== index)
        if (linkStereo) {
          const partner = index % 2 === 0 ? index + 1 : index - 1
          if (partner >= 0 && partner < ports.length) {
            next = next.filter((portIndex) => portIndex !== partner)
          }
        }
        return next.sort((left, right) => left - right)
      }

      let next = allowMultiSelect ? [...previous, index] : [index]
      if (linkStereo) {
        const partner = index % 2 === 0 ? index + 1 : index - 1
        if (partner >= 0 && partner < ports.length) {
          next = [...next, partner]
        }
      }
      return [...new Set(next)].sort((left, right) => left - right)
    })
  }, [allowMultiSelect, inputPorts, linkStereo, outputPorts])

  const toggleAvbEndpoint = useCallback((type: PortTabId, endpointId: string) => {
    if (type === 'input') {
      setSelectedInputAvbEndpoints((previous) => (
        previous.includes(endpointId)
          ? previous.filter((id) => id !== endpointId)
          : allowMultiSelect ? [...previous, endpointId] : [endpointId]
      ))
      return
    }

    setSelectedOutputAvbEndpoints((previous) => (
      previous.includes(endpointId)
        ? previous.filter((id) => id !== endpointId)
        : allowMultiSelect ? [...previous, endpointId] : [endpointId]
    ))
  }, [allowMultiSelect])

  const applyPreset = useCallback((preset: AudioPortPreset) => {
    setSelectedInputs(preset.input_ports)
    setSelectedOutputs(preset.output_ports)
    setSelectedInputAvbEndpoints([])
    setSelectedOutputAvbEndpoints([])
  }, [])

  const handleApply = useCallback(() => {
    const mutation = isPerChain ? chainRoutingMutation : globalRoutingMutation
    mutation.mutate({
      inputPorts: selectedInputs,
      outputPorts: selectedOutputs,
      inputAvbEndpoints: selectedInputAvbEndpoints,
      outputAvbEndpoints: selectedOutputAvbEndpoints,
    })
    onPortsChange?.(
      selectedInputs,
      selectedOutputs,
      selectedInputAvbEndpoints,
      selectedOutputAvbEndpoints,
    )
    onClose()
  }, [
    chainRoutingMutation,
    globalRoutingMutation,
    isPerChain,
    onClose,
    onPortsChange,
    selectedInputAvbEndpoints,
    selectedInputs,
    selectedOutputAvbEndpoints,
    selectedOutputs,
  ])

  const handleRevertToGlobal = useCallback(() => {
    clearChainRoutingMutation.mutate()
    if (routingQuery.data) {
      setSelectedInputs(routingQuery.data.input_ports)
      setSelectedOutputs(routingQuery.data.output_ports)
      setSelectedInputAvbEndpoints(routingQuery.data.input_avb_endpoints || [])
      setSelectedOutputAvbEndpoints(routingQuery.data.output_avb_endpoints || [])
    }
  }, [clearChainRoutingMutation, routingQuery.data])

  const isPending = globalRoutingMutation.isPending || chainRoutingMutation.isPending
  const hasAnySelection = (
    selectedInputs.length > 0 ||
    selectedOutputs.length > 0 ||
    selectedInputAvbEndpoints.length > 0 ||
    selectedOutputAvbEndpoints.length > 0
  )

  const renderPortCards = (
    type: PortTabId,
    groups: Record<string, AudioPort[]>,
    selected: number[],
  ) => {
    const entries = Object.entries(groups)

    return (
      <div className="juce-grid-page__port-groups">
        {entries.map(([category, ports]) => (
          <section key={`${type}-${category}`} className="juce-grid-page__port-section">
            {entries.length > 1 && (
              <div className="juce-grid-page__port-section-header">
                <span>{PORT_CATEGORY_LABELS[category] || category}</span>
              </div>
            )}
            <div className="juce-grid-page__port-grid">
              {ports.map((port) => {
                const isSelected = selected.includes(port.index)
                const partnerIdx = port.index % 2 === 0 ? port.index + 1 : port.index - 1
                const stereoPaired = linkStereo && isSelected && selected.includes(partnerIdx)

                return (
                  <button
                    key={`${type}-port-${port.index}`}
                    type="button"
                    className={`juce-grid-page__port-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => togglePort(type, port.index)}
                  >
                    <span className="juce-grid-page__port-card-index">
                      {isSelected ? <CheckmarkFilled size={16} /> : port.index + 1}
                    </span>
                    <span className="juce-grid-page__port-card-copy">
                      <strong>{port.name}</strong>
                      <span>Local {type === 'input' ? 'input' : 'output'} port</span>
                    </span>
                    {stereoPaired && <Link size={14} className="juce-grid-page__port-card-link" />}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    )
  }

  const renderEndpointCards = (
    type: PortTabId,
    endpoints: AudioAvbEndpoint[],
    selectedEndpointIds: string[],
    missingEndpointIds: string[],
  ) => {
    return (
      <div className="juce-grid-page__port-endpoint-stack">
        {missingEndpointIds.map((endpointId) => (
          <InlineNotification
            key={`${type}-missing-${endpointId}`}
            kind="warning"
            lowContrast
            hideCloseButton
            title="Missing retained AVB endpoint"
            subtitle={endpointId}
          />
        ))}

        {endpoints.length === 0 ? (
          <div className="juce-grid-page__empty-state">
            <p>No AVB endpoints discovered</p>
            <p className="juce-grid-page__empty-state-copy">
              {type === 'input' ? 'Talker inputs' : 'Listener outputs'} will appear here when the AVB fabric is ready.
            </p>
          </div>
        ) : (
          <div className="juce-grid-page__port-grid juce-grid-page__port-grid--wide">
            {endpoints.map((endpoint) => {
              const isSelected = selectedEndpointIds.includes(endpoint.endpoint_id)
              return (
                <button
                  key={`${type}-endpoint-${endpoint.endpoint_id}`}
                  type="button"
                  className={`juce-grid-page__port-card juce-grid-page__port-card--endpoint ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => toggleAvbEndpoint(type, endpoint.endpoint_id)}
                  disabled={!endpoint.available}
                >
                  <span className="juce-grid-page__port-card-index">
                    {isSelected ? <CheckmarkFilled size={16} /> : <VolumeUp size={16} />}
                  </span>
                  <span className="juce-grid-page__port-card-copy">
                    <strong>{endpoint.device_name}</strong>
                    <span>
                      {(endpoint.host || 'Unknown host')} · {endpoint.channels}ch @ {endpoint.sample_rate}Hz
                    </span>
                  </span>
                  <Tag type={endpoint.available ? 'green' : 'warm-gray'}>
                    {endpoint.available ? 'Available' : 'Offline'}
                  </Tag>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (!open) {
    return null
  }

  const currentSelectionCount = activeTab === 'input'
    ? selectedInputs.length + selectedInputAvbEndpoints.length
    : selectedOutputs.length + selectedOutputAvbEndpoints.length

  const totalSelectionCount = activeTab === 'input'
    ? inputPorts.length + avbTalkers.length
    : outputPorts.length + avbListeners.length

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading={isPerChain ? 'Flow port routing' : 'Audio port routing'}
      modalLabel={flowLabel ? `Flow ${flowLabel}` : deviceName}
      primaryButtonText={isPending ? 'Applying...' : isPerChain ? `Apply to Flow ${flowLabel || ''}` : 'Apply'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!hasAnySelection || isPending || portsQuery.isLoading || routingQuery.isLoading}
      onRequestClose={onClose}
      onRequestSubmit={handleApply}
    >
      <div
        className="juce-grid-page__port-modal"
        style={{ '--juce-grid-port-accent': flowColor || '#2563eb' } as React.CSSProperties}
      >
        <div className="juce-grid-page__port-modal-header">
          <div className="juce-grid-page__port-modal-copy">
            <strong>{deviceName}</strong>
            <p>
              Choose one or more local ports and AVB endpoints for {isPerChain ? `Flow ${flowLabel || ''}` : 'the current audio node'}.
            </p>
          </div>
          <div className="juce-grid-page__port-modal-meta">
            <Tag type="cool-gray">
              {inputPorts.length} in / {outputPorts.length} out
            </Tag>
            <Tag type={allowMultiSelect ? 'blue' : 'cool-gray'}>
              {allowMultiSelect ? 'Multi-select' : 'Single-select'}
            </Tag>
            <Tag type={avbReadinessState === 'operational' ? 'green' : avbReadinessState === 'degraded' ? 'warm-gray' : 'cool-gray'}>
              AVB {avbReadinessState}
            </Tag>
            <Tag type="blue">
              {currentSelectionCount}/{totalSelectionCount || 0} selected
            </Tag>
          </div>
        </div>

        <div className="juce-grid-page__port-toolbar">
          <Checkbox
            id="juce-grid-port-multi-select"
            labelText="Multi-select assignments"
            checked={allowMultiSelect}
            onChange={(_, data) => setAllowMultiSelect(Boolean(data.checked))}
          />
          <Checkbox
            id="juce-grid-port-link-stereo"
            labelText="Link stereo pairs"
            checked={linkStereo}
            onChange={(_, data) => setLinkStereo(Boolean(data.checked))}
          />
          <div className="juce-grid-page__port-toolbar-actions">
            {hasOverride && (
              <Button size="sm" kind="ghost" renderIcon={Renew} onClick={handleRevertToGlobal}>
                Revert to global
              </Button>
            )}
            {presets.map((preset) => {
              const isActive =
                JSON.stringify(selectedInputs) === JSON.stringify(preset.input_ports) &&
                JSON.stringify(selectedOutputs) === JSON.stringify(preset.output_ports) &&
                selectedInputAvbEndpoints.length === 0 &&
                selectedOutputAvbEndpoints.length === 0

              return (
                <Button
                  key={preset.id}
                  size="sm"
                  kind={isActive ? 'secondary' : 'ghost'}
                  renderIcon={Flash}
                  iconDescription={preset.name}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.name}
                </Button>
              )
            })}
          </div>
        </div>

        {isPerChain && (
          <Tile className="juce-grid-page__port-scope-tile">
            <div className="juce-grid-page__port-scope-copy">
              <strong>{hasOverride ? `Custom routing for Flow ${flowLabel || ''}` : 'Using global routing'}</strong>
              <p>{hasOverride ? 'This flow is overriding the shared routing map.' : 'Apply changes to create a flow-specific override.'}</p>
            </div>
            <Tag type={hasOverride ? 'blue' : 'cool-gray'}>
              {hasOverride ? 'Override active' : 'Inherited'}
            </Tag>
          </Tile>
        )}

        {(portsQuery.isLoading || routingQuery.isLoading || (isPerChain && chainRoutingQuery.isLoading)) && (
          <div className="juce-grid-page__port-loading">
            <InlineLoading description="Loading port routing" />
          </div>
        )}

        {(portsQuery.isError || routingQuery.isError || chainRoutingQuery.isError) && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Port routing unavailable"
            subtitle="The audio routing endpoints did not respond. Try reopening the modal after the engine settles."
          />
        )}

        <Tabs selectedIndex={activeTab === 'input' ? 0 : 1} onChange={({ selectedIndex }) => setActiveTab(selectedIndex === 0 ? 'input' : 'output')}>
          <TabList aria-label="Port routing tabs" contained fullWidth>
            <Tab>Inputs</Tab>
            <Tab>Outputs</Tab>
          </TabList>
        </Tabs>

        {activeTab === 'input' ? (
          <div className="juce-grid-page__port-panel">
            <section className="juce-grid-page__port-pane">
              <div className="juce-grid-page__compact-section-header">
                <h2>Local input ports</h2>
                <p>Select one or more local channels for the active signal path.</p>
              </div>
              {inputPorts.length > 0 ? renderPortCards('input', inputGroups, selectedInputs) : (
                <div className="juce-grid-page__empty-state">
                  <p>No local input ports</p>
                  <p className="juce-grid-page__empty-state-copy">This node is not currently exposing input channels.</p>
                </div>
              )}
            </section>

            <section className="juce-grid-page__port-pane">
              <div className="juce-grid-page__compact-section-header">
                <h2>AVB talker inputs</h2>
                <p>Select one or more remote network streams. AVB remains available alongside local input selection.</p>
              </div>
              {renderEndpointCards('input', avbTalkers, selectedInputAvbEndpoints, missingInputAvbEndpointIds)}
            </section>
          </div>
        ) : (
          <div className="juce-grid-page__port-panel">
            <section className="juce-grid-page__port-pane">
              <div className="juce-grid-page__compact-section-header">
                <h2>Local output ports</h2>
                <p>Select one or more local destinations for the processed signal.</p>
              </div>
              {outputPorts.length > 0 ? renderPortCards('output', outputGroups, selectedOutputs) : (
                <div className="juce-grid-page__empty-state">
                  <p>No local output ports</p>
                  <p className="juce-grid-page__empty-state-copy">This node is not currently exposing output channels.</p>
                </div>
              )}
            </section>

            <section className="juce-grid-page__port-pane">
              <div className="juce-grid-page__compact-section-header">
                <h2>AVB listener outputs</h2>
                <p>Select one or more remote AVB destinations. AVB remains available alongside local output selection.</p>
              </div>
              {renderEndpointCards('output', avbListeners, selectedOutputAvbEndpoints, missingOutputAvbEndpointIds)}
            </section>
          </div>
        )}

        <div className="juce-grid-page__port-summary-grid">
          <Tile className="juce-grid-page__port-summary-tile">
            <div className="juce-grid-page__port-summary-copy">
              <strong>Inputs</strong>
              <p>{formatChannelSummary(selectedInputs, selectedInputAvbEndpoints)}</p>
            </div>
            <div className="juce-grid-page__port-summary-meta">
              {selectedInputs.length > 0 && <span>Ch {selectedInputs.map((port) => port + 1).join(', ')}</span>}
              {selectedInputAvbEndpoints.length > 0 && <span>AVB {selectedInputAvbEndpoints.length}</span>}
            </div>
          </Tile>
          <Tile className="juce-grid-page__port-summary-tile">
            <div className="juce-grid-page__port-summary-copy">
              <strong>Outputs</strong>
              <p>{formatChannelSummary(selectedOutputs, selectedOutputAvbEndpoints)}</p>
            </div>
            <div className="juce-grid-page__port-summary-meta">
              {selectedOutputs.length > 0 && <span>Ch {selectedOutputs.map((port) => port + 1).join(', ')}</span>}
              {selectedOutputAvbEndpoints.length > 0 && <span>AVB {selectedOutputAvbEndpoints.length}</span>}
            </div>
          </Tile>
        </div>

        {(missingInputAvbEndpointIds.length > 0 || missingOutputAvbEndpointIds.length > 0) && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Retained AVB endpoints need review"
            subtitle="One or more saved AVB endpoints are currently missing from discovery. Reapply the routing if you want to clear them."
          />
        )}

        {!hasAnySelection && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Nothing selected"
            subtitle="Choose at least one input or output target before applying the routing change."
          />
        )}
      </div>
    </Modal>
  )
}

export default JuceGridAudioPortModal
