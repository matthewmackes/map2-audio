import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckmarkFilled, Flash, Link, Renew, VolumeUp } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  InlineNotification,
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
} from '../../../map2/api'
import { useToasts } from '../Toasts'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'
import '../../pages/SnapshotEditorPage.css'

type PortTabId = 'input' | 'output'

const PORT_CATEGORY_LABELS: Record<string, string> = {
  analog: 'Analog',
  spdif: 'S/PDIF',
  adat: 'ADAT',
  digital: 'Digital',
}

export interface SnapshotPublishAudioPortWorkspaceProps {
  nodeId?: string | null
  title?: string
  description?: string
  readOnly?: boolean
  beforeApply?: () => Promise<void>
  chainId?: number | null
  flowLabel?: string
  flowColor?: string
  applyButtonText?: string
  onPortsChange?: (
    inputPorts: number[],
    outputPorts: number[],
    inputAvbEndpoints: string[],
    outputAvbEndpoints: string[],
  ) => void
  onApplied?: () => void
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

export function SnapshotPublishAudioPortWorkspace({
  nodeId = null,
  title = 'Inputs and outputs',
  description = 'Choose local ports and AVB endpoints for the selected live host.',
  readOnly = false,
  beforeApply,
  chainId,
  flowLabel,
  flowColor,
  applyButtonText = 'Apply host I/O',
  onPortsChange,
  onApplied,
}: SnapshotPublishAudioPortWorkspaceProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const [selectedInputs, setSelectedInputs] = useState<number[]>([])
  const [selectedOutputs, setSelectedOutputs] = useState<number[]>([])
  const [selectedInputAvbEndpoints, setSelectedInputAvbEndpoints] = useState<string[]>([])
  const [selectedOutputAvbEndpoints, setSelectedOutputAvbEndpoints] = useState<string[]>([])
  const [linkStereo, setLinkStereo] = useState(true)
  const [allowMultiSelect, setAllowMultiSelect] = useState(true)
  const [activeTab, setActiveTab] = useState<PortTabId>('input')

  const isPerChain = chainId != null && chainId > 0

  const portsQuery = useQuery({
    queryKey: ['audio', 'ports', nodeId ?? 'local'],
    queryFn: () => audioApi.getPorts(nodeId),
    enabled: Boolean(nodeId),
  })

  const routingQuery = useQuery({
    queryKey: ['audio', 'routing', nodeId ?? 'local'],
    queryFn: () => audioApi.getRouting(nodeId),
    enabled: Boolean(nodeId),
  })

  const chainRoutingQuery = useQuery({
    queryKey: ['audio', 'routing', 'chain', chainId, nodeId ?? 'local'],
    queryFn: () => audioApi.getChainRouting(chainId!, nodeId),
    enabled: Boolean(nodeId) && isPerChain,
  })

  const portPresetsQuery = useQuery({
    queryKey: ['audio', 'ports', 'presets', nodeId ?? 'local'],
    queryFn: () => audioApi.getPortPresets(nodeId),
    enabled: Boolean(nodeId),
  })

  useEffect(() => {
    if (!nodeId) {
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
  }, [nodeId, isPerChain, chainRoutingQuery.data, routingQuery.data])

  useEffect(() => {
    setActiveTab('input')
  }, [nodeId])

  const invalidateRoutingQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['audio', 'ports', nodeId ?? 'local'] })
    void queryClient.invalidateQueries({ queryKey: ['audio', 'routing', nodeId ?? 'local'] })
    if (isPerChain && chainId != null) {
      void queryClient.invalidateQueries({ queryKey: ['audio', 'routing', 'chain', chainId, nodeId ?? 'local'] })
    }
  }, [chainId, isPerChain, nodeId, queryClient])

  const globalRoutingMutation = useMutation({
    mutationFn: async (config: {
      inputPorts: number[]
      outputPorts: number[]
      inputAvbEndpoints: string[]
      outputAvbEndpoints: string[]
    }) => {
      await beforeApply?.()
      return audioApi.setRouting(config, nodeId)
    },
    onSuccess: () => {
      invalidateRoutingQueries()
      pushToast('Host inputs and outputs updated', 'success')
      onApplied?.()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update host I/O', 'error')
    },
  })

  const chainRoutingMutation = useMutation({
    mutationFn: async (config: {
      inputPorts: number[]
      outputPorts: number[]
      inputAvbEndpoints: string[]
      outputAvbEndpoints: string[]
    }) => {
      await beforeApply?.()
      return audioApi.setChainRouting(chainId!, config, nodeId)
    },
    onSuccess: () => {
      invalidateRoutingQueries()
      pushToast(`Flow ${flowLabel || ''} routing updated`, 'success')
      onApplied?.()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update flow routing', 'error')
    },
  })

  const clearChainRoutingMutation = useMutation({
    mutationFn: async () => {
      await beforeApply?.()
      return audioApi.clearChainRouting(chainId!, nodeId)
    },
    onSuccess: () => {
      invalidateRoutingQueries()
      pushToast(`Flow ${flowLabel || ''} reverted to host routing`, 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to revert flow routing', 'error')
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
    if (readOnly) {
      return
    }
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
  }, [allowMultiSelect, inputPorts, linkStereo, outputPorts, readOnly])

  const toggleAvbEndpoint = useCallback((type: PortTabId, endpointId: string) => {
    if (readOnly) {
      return
    }
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
  }, [allowMultiSelect, readOnly])

  const applyPreset = useCallback((preset: AudioPortPreset) => {
    if (readOnly) {
      return
    }
    setSelectedInputs(preset.input_ports)
    setSelectedOutputs(preset.output_ports)
    setSelectedInputAvbEndpoints([])
    setSelectedOutputAvbEndpoints([])
  }, [readOnly])

  const handleApply = useCallback(() => {
    if (readOnly || !nodeId) {
      return
    }
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
  }, [
    chainRoutingMutation,
    globalRoutingMutation,
    isPerChain,
    nodeId,
    onPortsChange,
    readOnly,
    selectedInputAvbEndpoints,
    selectedInputs,
    selectedOutputAvbEndpoints,
    selectedOutputs,
  ])

  const handleRevertToGlobal = useCallback(() => {
    if (readOnly) {
      return
    }
    clearChainRoutingMutation.mutate()
    if (routingQuery.data) {
      setSelectedInputs(routingQuery.data.input_ports)
      setSelectedOutputs(routingQuery.data.output_ports)
      setSelectedInputAvbEndpoints(routingQuery.data.input_avb_endpoints || [])
      setSelectedOutputAvbEndpoints(routingQuery.data.output_avb_endpoints || [])
    }
  }, [clearChainRoutingMutation, readOnly, routingQuery.data])

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
                    disabled={readOnly}
                  >
                    <span className="juce-grid-page__port-card-index">
                      {isSelected ? <CheckmarkFilled size={16} /> : port.index + 1}
                    </span>
                    <span className="juce-grid-page__port-card-copy">
                      <strong>{port.name}</strong>
                      <span>Local {type === 'input' ? 'input' : 'output'} port</span>
                    </span>
                    {stereoPaired ? <Link size={14} className="juce-grid-page__port-card-link" /> : null}
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
          <EmptyState
            className="juce-grid-page__empty-state"
            title="No AVB endpoints discovered"
            description={`${type === 'input' ? 'Talker inputs' : 'Listener outputs'} will appear here when the AVB fabric is ready.`}
            compact
            align="left"
          />
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
                  disabled={readOnly || !endpoint.available}
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

  if (!nodeId) {
    return (
      <Tile className="snapshot-publish-page__panel">
        <EmptyState
          className="snapshot-publish-page__empty"
          title="Select a live host first"
          description="Choose the host that will run this snapshot before configuring local or AVB I/O."
          compact
        />
      </Tile>
    )
  }

  const currentSelectionCount = activeTab === 'input'
    ? selectedInputs.length + selectedInputAvbEndpoints.length
    : selectedOutputs.length + selectedOutputAvbEndpoints.length

  const totalSelectionCount = activeTab === 'input'
    ? inputPorts.length + avbTalkers.length
    : outputPorts.length + avbListeners.length

  return (
    <Tile className="snapshot-publish-page__panel">
      <div
        className="juce-grid-page__port-modal snapshot-publish-page__port-workspace"
        style={{ '--juce-grid-port-accent': flowColor || '#2563eb' } as CSSProperties}
      >
        <div className="snapshot-publish-page__panel-header">
          <div>
            <p className="snapshot-publish-page__panel-kicker">Inputs and outputs</p>
            <h2>{title}</h2>
            <p className="snapshot-publish-page__plain-copy">{description}</p>
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

        <div className="juce-grid-page__port-modal-header">
          <div className="juce-grid-page__port-modal-copy">
            <strong>{deviceName}</strong>
            <p>
              Choose one or more local ports and AVB endpoints for {isPerChain ? `Flow ${flowLabel || ''}` : 'the current live host'}.
            </p>
          </div>
        </div>

        <div className="juce-grid-page__port-toolbar">
          <Checkbox
            id={`snapshot-publish-port-multi-select-${nodeId}`}
            labelText="Multi-select assignments"
            checked={allowMultiSelect}
            onChange={(_, data) => setAllowMultiSelect(Boolean(data.checked))}
            disabled={readOnly}
          />
          <Checkbox
            id={`snapshot-publish-port-link-stereo-${nodeId}`}
            labelText="Link stereo pairs"
            checked={linkStereo}
            onChange={(_, data) => setLinkStereo(Boolean(data.checked))}
            disabled={readOnly}
          />
          <div className="juce-grid-page__port-toolbar-actions">
            {hasOverride ? (
              <Button size="sm" kind="ghost" renderIcon={Renew} onClick={handleRevertToGlobal} disabled={readOnly}>
                Revert to host
              </Button>
            ) : null}
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
                  disabled={readOnly}
                >
                  {preset.name}
                </Button>
              )
            })}
          </div>
        </div>

        {isPerChain ? (
          <Tile className="juce-grid-page__port-scope-tile">
            <div className="juce-grid-page__port-scope-copy">
              <strong>{hasOverride ? `Custom routing for Flow ${flowLabel || ''}` : 'Using host routing'}</strong>
              <p>{hasOverride ? 'This flow is overriding the shared host routing map.' : 'Apply changes to create a flow-specific override.'}</p>
            </div>
            <Tag type={hasOverride ? 'blue' : 'cool-gray'}>
              {hasOverride ? 'Override active' : 'Inherited'}
            </Tag>
          </Tile>
        ) : null}

        {(portsQuery.isLoading || routingQuery.isLoading || (isPerChain && chainRoutingQuery.isLoading)) ? (
          <div className="juce-grid-page__port-loading">
            <LoadingState description="Loading host routing" />
          </div>
        ) : null}

        {(portsQuery.isError || routingQuery.isError || chainRoutingQuery.isError) ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Host routing unavailable"
            subtitle="The selected host did not return its local or AVB routing state."
          />
        ) : null}

        <Tabs selectedIndex={activeTab === 'input' ? 0 : 1} onChange={({ selectedIndex }) => setActiveTab(selectedIndex === 0 ? 'input' : 'output')}>
          <TabList aria-label="Host routing tabs" contained fullWidth>
            <Tab>Inputs</Tab>
            <Tab>Outputs</Tab>
          </TabList>
        </Tabs>

        {activeTab === 'input' ? (
          <div className="juce-grid-page__port-panel">
            <section className="juce-grid-page__port-pane">
              <div className="juce-grid-page__compact-section-header">
                <h2>Local input ports</h2>
                <p>Select one or more local channels for the active host.</p>
              </div>
              {inputPorts.length > 0 ? renderPortCards('input', inputGroups, selectedInputs) : (
                <EmptyState
                  className="juce-grid-page__empty-state"
                  title="No local input ports"
                  description="This host is not currently exposing input channels."
                  compact
                  align="left"
                />
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
                <EmptyState
                  className="juce-grid-page__empty-state"
                  title="No local output ports"
                  description="This host is not currently exposing output channels."
                  compact
                  align="left"
                />
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
              {selectedInputs.length > 0 ? <span>Ch {selectedInputs.map((port) => port + 1).join(', ')}</span> : null}
              {selectedInputAvbEndpoints.length > 0 ? <span>AVB {selectedInputAvbEndpoints.length}</span> : null}
            </div>
          </Tile>
          <Tile className="juce-grid-page__port-summary-tile">
            <div className="juce-grid-page__port-summary-copy">
              <strong>Outputs</strong>
              <p>{formatChannelSummary(selectedOutputs, selectedOutputAvbEndpoints)}</p>
            </div>
            <div className="juce-grid-page__port-summary-meta">
              {selectedOutputs.length > 0 ? <span>Ch {selectedOutputs.map((port) => port + 1).join(', ')}</span> : null}
              {selectedOutputAvbEndpoints.length > 0 ? <span>AVB {selectedOutputAvbEndpoints.length}</span> : null}
            </div>
          </Tile>
        </div>

        {(missingInputAvbEndpointIds.length > 0 || missingOutputAvbEndpointIds.length > 0) ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Retained AVB endpoints need review"
            subtitle="One or more saved AVB endpoints are currently missing from discovery. Reapply the routing if you want to clear them."
          />
        ) : null}

        {!hasAnySelection ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Nothing selected"
            subtitle="Choose at least one input or output target before applying the routing change."
          />
        ) : null}

        <div className="snapshot-publish-page__workspace-actions">
          <Button
            size="sm"
            kind="secondary"
            onClick={handleApply}
            disabled={readOnly || !hasAnySelection || isPending || portsQuery.isLoading || routingQuery.isLoading}
          >
            {isPending ? 'Applying…' : applyButtonText}
          </Button>
        </div>
      </div>
    </Tile>
  )
}

export default SnapshotPublishAudioPortWorkspace
