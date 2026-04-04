import { useEffect, useMemo } from 'react'

import {
  Close,
  TrashCan,
} from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  IconButton,
  Layer,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'

import type {
  Chain,
  MIDIMappingV2,
  Plugin,
  PluginParameter,
} from '../../../map2/types'
import type { JuceGridFlowSlotState } from '../JuceGrid/juceGridState'
import type { SnapshotEditorLiveChainProjection } from '../SnapshotEditor/snapshotEditorLiveChains'
import {
  AudioTableMidiField,
  AudioTableMidiTargetField,
  AudioTableParameterField,
  AudioTablePositionField,
  resolveAudioTableMidiMapping,
  type AudioTablePluginSelectionTarget,
} from './audioTablePluginPrimitives'
import type {
  AudioTableLiveGraphModel,
  AudioTableLiveGraphNodeData,
} from './audioTableLiveGraph'

type AudioTableLiveNodeCardData = AudioTableLiveGraphNodeData & {
  onSelectPlugin?: (target: AudioTablePluginSelectionTarget) => void
}

export interface AudioTableInspectorSelection {
  target: AudioTablePluginSelectionTarget
  chain: Chain
  plugin: Chain['plugins'][number]
  flowSlot: JuceGridFlowSlotState | null
  flowIndex: number | null
  parameters: PluginParameter[]
  inputDb: string
  outputDb: string
  projection: SnapshotEditorLiveChainProjection
}

interface AudioTableLiveGraphRailProps {
  graph: AudioTableLiveGraphModel
  selection: AudioTableInspectorSelection | null
  pluginInventoryByUri: Map<string, Plugin>
  midiMappings: MIDIMappingV2[]
  onSelectPlugin: (target: AudioTablePluginSelectionTarget) => void
  onCloseInspector: () => void
  onParameterChange: (
    chainId: number,
    uri: string,
    paramIndex: number,
    value: number,
    instanceId?: number,
    pluginPosition?: number,
  ) => void
  onMidiMappingChange: (
    chainId: number,
    plugin: Chain['plugins'][number],
    updates: Partial<MIDIMappingV2>,
  ) => void
  onBypassToggle: (chainId: number, uri: string, currentBypass: boolean, position: number) => void
  onRemovePlugin: (chainId: number, uri: string, position: number) => void
  onPositionChange: (
    chainId: number,
    plugins: Chain['plugins'],
    from: number,
    to: number,
  ) => void
}

const nodeTypes = {
  audioTableLiveNode: AudioTableLiveNodeCard,
}

function getToneBorder(tone: AudioTableLiveGraphNodeData['tone']) {
  switch (tone) {
    case 'live':
      return 'var(--cds-support-success)'
    case 'degraded':
      return 'var(--cds-border-inverse)'
    case 'workspace':
    default:
      return 'var(--cds-border-strong)'
  }
}

function getToneTagType(tone: AudioTableLiveGraphNodeData['tone']): 'green' | 'warm-gray' | 'cool-gray' {
  switch (tone) {
    case 'live':
      return 'green'
    case 'degraded':
      return 'warm-gray'
    case 'workspace':
    default:
      return 'cool-gray'
  }
}

function formatRuntimeStatus(runtimeStatus: SnapshotEditorLiveChainProjection['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'active':
      return 'Runtime active'
    case 'partial':
      return 'Runtime partial'
    case 'capability_gap':
      return 'Capability gap'
    case 'inactive':
      return 'Inactive'
    case 'missing':
      return 'Runtime unavailable'
    default:
      return runtimeStatus.replace(/_/g, ' ')
  }
}

function AudioTableLiveNodeCard({ data }: NodeProps<AudioTableLiveNodeCardData>) {
  const borderColor = data.selected ? data.accentColor : getToneBorder(data.tone)
  const cardStyle = {
    width: data.kind === 'plugin' ? 248 : data.kind === 'routing' ? 260 : 184,
    minHeight: data.kind === 'plugin' ? 108 : 74,
    border: `1px solid ${borderColor}`,
    borderInlineStart: `6px solid ${data.accentColor}`,
    borderRadius: 8,
    background: data.selected ? 'var(--cds-layer-selected-01)' : 'var(--cds-layer-01)',
    color: 'var(--cds-text-primary)',
    padding: '0.75rem',
    boxShadow: data.selected ? `0 0 0 2px ${data.accentColor}33` : '0 2px 8px rgba(0, 0, 0, 0.16)',
    opacity: data.dimmed ? 0.68 : 1,
    textAlign: 'left' as const,
    cursor: data.pluginTarget ? 'pointer' : 'default',
  }

  const content = (
    <>
      <Handle type="target" position={Position.Left} style={{ background: data.accentColor }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
          {data.kind === 'plugin' ? 'Plugin' : data.kind === 'path-input' ? 'Input' : data.kind === 'path-output' ? 'Output' : 'Routing'}
        </span>
        <Tag type={getToneTagType(data.tone)} size="sm">
          {data.tone === 'workspace' ? 'Workspace' : data.tone === 'live' ? 'Live' : 'Degraded'}
        </Tag>
      </div>
      <div style={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.25 }}>{data.label}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.375rem', lineHeight: 1.3 }}>
        {data.caption}
      </div>
      {data.warningText ? (
        <div style={{ marginTop: '0.625rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
          {data.warningText}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} style={{ background: data.accentColor }} />
    </>
  )

  if (data.pluginTarget && data.onSelectPlugin) {
    return (
      <button
        type="button"
        style={cardStyle}
        onClick={() => data.onSelectPlugin?.(data.pluginTarget!)}
        aria-label={`Inspect ${data.label}`}
      >
        {content}
      </button>
    )
  }

  return <div style={cardStyle}>{content}</div>
}

function AudioTableLiveGraphCanvas({
  nodes,
  edges,
}: {
  nodes: Array<Node<AudioTableLiveNodeCardData>>
  edges: Edge[]
}) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    fitView({ padding: 0.16, duration: 180 })
  }, [edges, fitView, nodes])

  return (
    <ReactFlow
      fitView
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      minZoom={0.55}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--cds-border-subtle)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

function AudioTablePluginInspector({
  selection,
  pluginInventoryByUri,
  midiMappings,
  onCloseInspector,
  onParameterChange,
  onMidiMappingChange,
  onBypassToggle,
  onRemovePlugin,
  onPositionChange,
}: {
  selection: AudioTableInspectorSelection
  pluginInventoryByUri: Map<string, Plugin>
  midiMappings: MIDIMappingV2[]
  onCloseInspector: () => void
  onParameterChange: AudioTableLiveGraphRailProps['onParameterChange']
  onMidiMappingChange: AudioTableLiveGraphRailProps['onMidiMappingChange']
  onBypassToggle: AudioTableLiveGraphRailProps['onBypassToggle']
  onRemovePlugin: AudioTableLiveGraphRailProps['onRemovePlugin']
  onPositionChange: AudioTableLiveGraphRailProps['onPositionChange']
}) {
  const midiMapping = resolveAudioTableMidiMapping(selection.chain.id, selection.plugin, midiMappings)
  const headerTags = [
    { label: selection.target.flowLabel ? `Path ${selection.target.flowLabel}` : 'Unmapped path', type: 'blue' as const },
    { label: formatRuntimeStatus(selection.projection.runtimeStatus), type: selection.projection.status === 'live' ? 'green' as const : 'warm-gray' as const },
    { label: selection.target.syntheticFlow ? 'Runtime-only' : 'Table-linked', type: 'cool-gray' as const },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontWeight: 600 }}>
            Bottom inspector
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>{selection.target.pluginName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {headerTags.map((tag) => (
              <Tag key={tag.label} type={tag.type} size="sm">
                {tag.label}
              </Tag>
            ))}
          </div>
        </div>
        <IconButton kind="ghost" size="sm" label="Close inspector" onClick={onCloseInspector}>
          <Close />
        </IconButton>
      </div>

      {selection.target.syntheticFlow ? (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 6, background: 'var(--cds-layer-accent-01)', color: 'var(--cds-text-secondary)' }}>
          This live plugin is reported by runtime state but is not assigned to a current workspace path, so row scrolling stays unavailable until the chain is mapped locally.
        </div>
      ) : null}

      <TableContainer title="Overview">
        <Table size="sm" aria-label="Audio Table inspector overview">
          <TableHead>
            <TableRow>
              <TableHeader>Chain</TableHeader>
              <TableHeader>URI</TableHeader>
              <TableHeader>Levels</TableHeader>
              <TableHeader>Routing truth</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>{selection.chain.name}</TableCell>
              <TableCell>{selection.plugin.uri}</TableCell>
              <TableCell>{`In ${selection.inputDb} dB / Out ${selection.outputDb} dB`}</TableCell>
              <TableCell>Workspace-derived final merge stage</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <TableContainer title="Actions">
        <Table size="sm" aria-label="Audio Table inspector actions">
          <TableHead>
            <TableRow>
              <TableHeader>Position</TableHeader>
              <TableHeader>Bypass</TableHeader>
              <TableHeader>Row link</TableHeader>
              <TableHeader>Remove</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>
                <AudioTablePositionField
                  chainId={selection.chain.id}
                  plugin={selection.plugin}
                  plugins={selection.chain.plugins}
                  controlId={`inspector-position-${selection.chain.id}-${selection.plugin.position}`}
                  onPositionChange={onPositionChange}
                />
              </TableCell>
              <TableCell>
                <Checkbox
                  id={`inspector-bypass-${selection.chain.id}-${selection.plugin.position}`}
                  checked={selection.plugin.bypassed}
                  labelText=""
                  hideLabel
                  onChange={() => onBypassToggle(
                    selection.chain.id,
                    selection.plugin.uri,
                    selection.plugin.bypassed,
                    selection.plugin.position,
                  )}
                />
              </TableCell>
              <TableCell>
                {selection.target.syntheticFlow ? 'No matching table row' : `Linked to ${selection.target.flowLabel}`}
              </TableCell>
              <TableCell>
                <Button
                  kind="danger--ghost"
                  size="sm"
                  renderIcon={TrashCan}
                  onClick={() => onRemovePlugin(
                    selection.chain.id,
                    selection.plugin.uri,
                    selection.plugin.position,
                  )}
                >
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <TableContainer title="Parameters">
        <Table size="sm" aria-label="Audio Table inspector parameters">
          <TableHead>
            <TableRow>
              <TableHeader>Parameter</TableHeader>
              <TableHeader>Symbol</TableHeader>
              <TableHeader>Range</TableHeader>
              <TableHeader>Value</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {selection.parameters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>No editable parameters are available for this plugin.</TableCell>
              </TableRow>
            ) : selection.parameters.map((parameter) => (
              <TableRow key={`${selection.plugin.uri}:${parameter.symbol}`}>
                <TableCell>{parameter.name}</TableCell>
                <TableCell>{parameter.symbol}</TableCell>
                <TableCell>{`${parameter.min ?? 0} - ${parameter.max ?? 1}`}</TableCell>
                <TableCell>
                  <AudioTableParameterField
                    chainId={selection.chain.id}
                    plugin={selection.plugin}
                    parameter={parameter}
                    controlId={`inspector-param-${selection.chain.id}-${selection.plugin.position}-${parameter.symbol}`}
                    onParameterChange={onParameterChange}
                    width={120}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TableContainer title="MIDI mapping">
        <Table size="sm" aria-label="Audio Table inspector MIDI mapping">
          <TableHead>
            <TableRow>
              <TableHeader>Target</TableHeader>
              <TableHeader>CC</TableHeader>
              <TableHeader>Channel</TableHeader>
              <TableHeader>Curve</TableHeader>
              <TableHeader>Min</TableHeader>
              <TableHeader>Max</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>
                <AudioTableMidiTargetField
                  chainId={selection.chain.id}
                  plugin={selection.plugin}
                  midiMappings={midiMappings}
                  pluginInventoryByUri={pluginInventoryByUri}
                  controlId={`inspector-midi-target-${selection.chain.id}-${selection.plugin.position}`}
                  onMidiMappingChange={onMidiMappingChange}
                />
              </TableCell>
              <TableCell>
                {AudioTableMidiField({
                  field: 'midiCc',
                  chainId: selection.chain.id,
                  plugin: selection.plugin,
                  midiMappings,
                  pluginInventoryByUri,
                  controlId: `inspector-midi-cc-${selection.chain.id}-${selection.plugin.position}`,
                  onMidiMappingChange,
                })}
              </TableCell>
              <TableCell>
                {AudioTableMidiField({
                  field: 'midiChannel',
                  chainId: selection.chain.id,
                  plugin: selection.plugin,
                  midiMappings,
                  pluginInventoryByUri,
                  controlId: `inspector-midi-channel-${selection.chain.id}-${selection.plugin.position}`,
                  onMidiMappingChange,
                })}
              </TableCell>
              <TableCell>
                {AudioTableMidiField({
                  field: 'midiCurve',
                  chainId: selection.chain.id,
                  plugin: selection.plugin,
                  midiMappings,
                  pluginInventoryByUri,
                  controlId: `inspector-midi-curve-${selection.chain.id}-${selection.plugin.position}`,
                  onMidiMappingChange,
                })}
              </TableCell>
              <TableCell>
                {AudioTableMidiField({
                  field: 'midiMin',
                  chainId: selection.chain.id,
                  plugin: selection.plugin,
                  midiMappings,
                  pluginInventoryByUri,
                  controlId: `inspector-midi-min-${selection.chain.id}-${selection.plugin.position}`,
                  onMidiMappingChange,
                })}
              </TableCell>
              <TableCell>
                {AudioTableMidiField({
                  field: 'midiMax',
                  chainId: selection.chain.id,
                  plugin: selection.plugin,
                  midiMappings,
                  pluginInventoryByUri,
                  controlId: `inspector-midi-max-${selection.chain.id}-${selection.plugin.position}`,
                  onMidiMappingChange,
                })}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={6}>
                {midiMapping
                  ? `Editing mapping #${midiMapping.id}`
                  : 'No mapping exists yet. Changing any field creates one with the selected target parameter.'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  )
}

export function AudioTableLiveGraphRail({
  graph,
  selection,
  pluginInventoryByUri,
  midiMappings,
  onSelectPlugin,
  onCloseInspector,
  onParameterChange,
  onMidiMappingChange,
  onBypassToggle,
  onRemovePlugin,
  onPositionChange,
}: AudioTableLiveGraphRailProps) {
  const graphNodes = useMemo<Array<Node<AudioTableLiveNodeCardData>>>(() => (
    graph.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onSelectPlugin,
      },
    }))
  ), [graph.nodes, onSelectPlugin])

  return (
    <Layer>
      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 360,
          width: '100%',
          borderRadius: 8,
          background: 'var(--cds-layer-01)',
          overflow: 'hidden',
          border: '1px solid var(--cds-border-subtle)',
        }}
        data-testid="audio-table-live-graph-rail"
      >
        <div style={{ padding: '1rem 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
              Control-plane truth
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>Live path rail</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              Read-only topology sourced from committed control-plane path truth. Selecting a plugin node opens the shared advanced inspector and links back to the table when a matching row exists.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Tag type="green" size="sm">{graph.livePathCount} live</Tag>
            {graph.degradedPathCount > 0 ? <Tag type="warm-gray" size="sm">{graph.degradedPathCount} degraded</Tag> : null}
            <Tag type="cool-gray" size="sm">{graph.routingTruthLabel}</Tag>
            {graph.syntheticPathCount > 0 ? <Tag type="purple" size="sm">{graph.syntheticPathCount} runtime-only</Tag> : null}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
            {graph.routingCaption}
          </div>
        </div>

        <div style={{ minHeight: 360, height: 420, borderTop: '1px solid var(--cds-border-subtle)' }} data-testid="audio-table-live-graph">
          {graph.nodes.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '1.5rem', color: 'var(--cds-text-secondary)', textAlign: 'center' }}>
              {graph.emptyCopy}
            </div>
          ) : (
            <ReactFlowProvider>
              <AudioTableLiveGraphCanvas nodes={graphNodes} edges={graph.edges} />
            </ReactFlowProvider>
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--cds-border-subtle)',
            background: 'var(--cds-layer-02)',
            maxHeight: selection ? 680 : 96,
            overflow: 'hidden',
            transition: 'max-height 160ms ease',
          }}
          data-testid="audio-table-graph-inspector"
          data-state={selection ? 'open' : 'closed'}
        >
          {selection ? (
            <AudioTablePluginInspector
              selection={selection}
              pluginInventoryByUri={pluginInventoryByUri}
              midiMappings={midiMappings}
              onCloseInspector={onCloseInspector}
              onParameterChange={onParameterChange}
              onMidiMappingChange={onMidiMappingChange}
              onBypassToggle={onBypassToggle}
              onRemovePlugin={onRemovePlugin}
              onPositionChange={onPositionChange}
            />
          ) : (
            <div style={{ padding: '1rem', color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
              Select a plugin node in the live graph to open the advanced bottom inspector.
            </div>
          )}
        </div>
      </aside>
    </Layer>
  )
}
