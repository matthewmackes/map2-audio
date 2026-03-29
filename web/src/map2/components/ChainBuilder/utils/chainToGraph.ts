// ============================================================================
// MAP2 Audio Platform - Chain to React Graph Transformer
// Converts backend Chain model to React graph nodes and edges
// ============================================================================

import { Chain, ChainPlugin } from '../../../types';
import {
  AudioPluginNode,
  AudioPluginNodeData,
  createAudioPluginNode,
} from '../nodes/AudioPluginNodeTypes';
import { DeviceNode, createDeviceNode } from '../nodes/DeviceNodeTypes';
import {
  AudioConnectionEdge,
  createAudioConnectionEdge,
} from '../edges/AudioConnectionEdgeTypes';
import { loadNodePositions } from './positionStorage';
import { getPluginIdentityKey } from '../../../utils/pluginIdentity';

export interface FlowCallbacks {
  onRemove: (plugin: ChainPlugin) => void;
  onToggleBypass: (plugin: ChainPlugin) => void;
  onOpenParameters: (plugin: ChainPlugin) => void;
}

export interface ChainFlowData {
  nodes: ChainFlowNode[];
  edges: AudioConnectionEdge[];
}

export type ChainFlowNode = AudioPluginNode | DeviceNode;

interface DeviceIOConfig {
  inputChannels: number;
  outputChannels: number;
  inputName?: string;
  outputName?: string;
  bufferSize?: number;
  isRunning?: boolean;
}

interface PluginPerformanceData {
  cpuPercent?: number;
  latencySamples?: number;
  hasLfo?: boolean;
  hasEnvelope?: boolean;
  hasAutomation?: boolean;
}

interface PluginSidechainData {
  sidechainBuses?: number;
  sidechainBusNames?: string[];
  sidechainConnections?: Array<{
    sourcePluginUri: string;
    busIndex: number;
  }>;
}

/**
 * Transform Chain model to React Flow nodes and edges
 */
export function chainToFlow(
  chain: Chain,
  callbacks: FlowCallbacks,
  deviceIO?: DeviceIOConfig,
  options?: {
    compact?: boolean;
    pluginMeters?: Record<string, { input?: number; output?: number }>;
    pluginMeta?: Record<string, any>;
    quickParamValues?: Record<string, Record<string, number>>;
    pluginPerformance?: Record<string, PluginPerformanceData>;
    pluginSidechain?: Record<string, PluginSidechainData>;
    sampleRate?: number;
    expandedMeterPanels?: Set<string>;
    onToggleMeterPanel?: (plugin: ChainPlugin) => void;
  }
): ChainFlowData {
  const savedPositions = loadNodePositions(chain.id);

  const inputChannels = deviceIO?.inputChannels ?? 2;
  const outputChannels = deviceIO?.outputChannels ?? 2;
  const inputName = deviceIO?.inputName ?? 'Input';
  const outputName = deviceIO?.outputName ?? 'Output';

  // Create nodes from chain plugins
  const nodes: ChainFlowNode[] = [];

  // Input device node
  const inputNodeId = 'device-input';
  nodes.push(
    createDeviceNode(inputNodeId, {
      name: inputName,
      channels: inputChannels,
      kind: 'input',
      sampleRate: options?.sampleRate,
      bufferSize: deviceIO?.bufferSize,
      isRunning: deviceIO?.isRunning,
      chainActive: chain.is_active,
    }, savedPositions[inputNodeId] || { x: 0, y: 0 })
  );

  const pluginNodes: AudioPluginNode[] = chain.plugins.map((plugin, index) => {
    const pluginKey = getPluginIdentityKey(plugin);
    const nodeId = `plugin-${pluginKey}`;

    const meta = options?.pluginMeta?.[plugin.uri];
    const perf = options?.pluginPerformance?.[pluginKey] ?? options?.pluginPerformance?.[plugin.uri];
    const sidechain = options?.pluginSidechain?.[pluginKey] ?? options?.pluginSidechain?.[plugin.uri];
    const quickParams = (meta?.parameters || []).filter((p: any) => !p.is_toggled).slice(0, 2);

    // Get sidechain info from plugin metadata or sidechain data
    const sidechainBuses = sidechain?.sidechainBuses ?? meta?.sidechain_buses ?? plugin.sidechain_bus ?? 0;
    const sidechainBusNames = sidechain?.sidechainBusNames ?? meta?.sidechain_bus_names;

    const isHardware = plugin.format === 'Hardware' || plugin.uri.startsWith('hardware://');

    const nodeData: AudioPluginNodeData = {
      plugin,
      isSelected: false,
      isBypassed: plugin.bypassed,
      inputPorts: plugin.in_ports || 0,
      outputPorts: plugin.out_ports || 0,
      compact: options?.compact,
      meters: options?.pluginMeters?.[pluginKey] ?? options?.pluginMeters?.[plugin.uri],
      meterPanelExpanded: options?.expandedMeterPanels?.has(pluginKey) || options?.expandedMeterPanels?.has(plugin.uri),
      isHardware,
      // Performance and modulation indicators
      cpuPercent: perf?.cpuPercent ?? plugin.cpu_percent,
      latencySamples: perf?.latencySamples ?? plugin.latency_samples,
      sampleRate: options?.sampleRate,
      hasLfo: perf?.hasLfo,
      hasEnvelope: perf?.hasEnvelope,
      hasAutomation: perf?.hasAutomation,
      // Sidechain routing
      sidechainBuses: sidechainBuses > 0 ? sidechainBuses : undefined,
      sidechainBusNames: sidechainBusNames,
      sidechainConnections: sidechain?.sidechainConnections,
      // Quick parameters
      quickParameters: quickParams.map((p: any) => ({
        name: p.name,
        symbol: p.symbol,
        value: options?.quickParamValues?.[pluginKey]?.[p.symbol] ?? options?.quickParamValues?.[plugin.uri]?.[p.symbol] ?? p.default,
        min: p.min,
        max: p.max,
        index: p.index,
      })),
      // Callbacks
      onRemove: () => callbacks.onRemove(plugin),
      onToggleBypass: () => callbacks.onToggleBypass(plugin),
      onOpenParameters: () => callbacks.onOpenParameters(plugin),
      onToggleMeterPanel: options?.onToggleMeterPanel
        ? () => options.onToggleMeterPanel!(plugin)
        : undefined,
    };

    // Extract key parameters if available (top 2 parameters)
    if (plugin.parameters && Object.keys(plugin.parameters).length > 0) {
      const paramEntries = Object.entries(plugin.parameters).slice(0, 2);
      nodeData.keyParameters = paramEntries.map(([name, value]) => ({
        name,
        value: value as number,
        min: 0, // Will be updated from plugin metadata if available
        max: 1,
      }));
    }

    // Use saved position if available, otherwise will be auto-laid out
    const position = savedPositions[nodeId] || { x: 0, y: 0 };

    return createAudioPluginNode(nodeId, nodeData, position);
  });

  nodes.push(...pluginNodes);

  // Output device node
  const outputNodeId = 'device-output';
  nodes.push(
    createDeviceNode(outputNodeId, {
      name: outputName,
      channels: outputChannels,
      kind: 'output',
      sampleRate: options?.sampleRate,
      bufferSize: deviceIO?.bufferSize,
      isRunning: deviceIO?.isRunning,
      chainActive: chain.is_active,
    }, savedPositions[outputNodeId] || { x: (pluginNodes.length + 1) * 320, y: 0 })
  );

  // Create edges (linear chain connections)
  const edges: AudioConnectionEdge[] = [];

  // Input to first plugin (if present) or to output directly
  if (pluginNodes.length > 0) {
    const firstPlugin = pluginNodes[0];
    edges.push(
      createAudioConnectionEdge(
        `edge-${inputNodeId}-${firstPlugin.id}`,
        inputNodeId,
        firstPlugin.id,
        inputChannels,
        firstPlugin.data.inputPorts
      )
    );
  }

  // Between plugins
  for (let i = 0; i < pluginNodes.length - 1; i++) {
    const sourceNode = pluginNodes[i];
    const targetNode = pluginNodes[i + 1];
    const sourceChannels = chain.plugins[i].out_ports || 0;
    const targetChannels = chain.plugins[i + 1].in_ports || 0;

    const edgeId = `edge-${sourceNode.id}-${targetNode.id}`;

    edges.push(
      createAudioConnectionEdge(
        edgeId,
        sourceNode.id,
        targetNode.id,
        sourceChannels,
        targetChannels
      )
    );
  }

  // Last plugin to output (or input to output if empty)
  if (pluginNodes.length > 0) {
    const lastPlugin = pluginNodes[pluginNodes.length - 1];
    edges.push(
      createAudioConnectionEdge(
        `edge-${lastPlugin.id}-${outputNodeId}`,
        lastPlugin.id,
        outputNodeId,
        lastPlugin.data.outputPorts,
        outputChannels
      )
    );
  } else {
    edges.push(
      createAudioConnectionEdge(
        `edge-${inputNodeId}-${outputNodeId}`,
        inputNodeId,
        outputNodeId,
        inputChannels,
        outputChannels
      )
    );
  }

  return { nodes, edges };
}

/**
 * Check if any saved positions exist for this chain
 */
export function hasSavedPositions(chainId: number): boolean {
  const positions = loadNodePositions(chainId);
  return Object.keys(positions).length > 0;
}

export type GraphCallbacks = FlowCallbacks;
export type ChainGraphData = ChainFlowData;
export type ChainGraphNode = ChainFlowNode;
export const chainToGraph = chainToFlow;
