// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Chain to A/B React Flow Transformer
// Converts two chains (A and B) into a unified parallel routing visualization
// ============================================================================

import { Chain } from '../../../types';
import {
  AudioPluginNode,
  AudioPluginNodeData,
  createAudioPluginNode,
} from '../nodes/AudioPluginNodeTypes';
import { DeviceNode, createDeviceNode } from '../nodes/DeviceNodeTypes';
import {
  RoutingNode,
  createSplitNode,
  createBlendNode,
} from '../nodes/RoutingNodeTypes';
import {
  AudioConnectionEdge,
  createAudioConnectionEdge,
} from '../edges/AudioConnectionEdgeTypes';

export interface ABFlowCallbacks {
  onRemoveA: (uri: string) => void;
  onRemoveB: (uri: string) => void;
  onToggleBypassA: (uri: string, bypass: boolean) => void;
  onToggleBypassB: (uri: string, bypass: boolean) => void;
  onOpenParametersA: (plugin: any) => void;
  onOpenParametersB: (plugin: any) => void;
}

export interface ABFlowData {
  nodes: ABFlowNode[];
  edges: AudioConnectionEdge[];
}

export type ABFlowNode = AudioPluginNode | DeviceNode | RoutingNode;

interface DeviceIOConfig {
  inputChannels: number;
  outputChannels: number;
  inputName?: string;
  outputName?: string;
}

interface PluginPerformanceData {
  cpuPercent?: number;
  latencySamples?: number;
  hasLfo?: boolean;
  hasEnvelope?: boolean;
  hasAutomation?: boolean;
}

/**
 * Transform two chains (A and B) into a unified A/B parallel routing flow
 *
 * Layout:
 *   Input → Split → [Chain A plugins] → Blend → Output
 *                 ↘ [Chain B plugins] ↗
 */
export function chainToABFlow(
  chainA: Chain,
  chainB: Chain,
  callbacks: ABFlowCallbacks,
  blendPosition: number, // 0-100
  deviceIO?: DeviceIOConfig,
  options?: {
    compact?: boolean;
    pluginMetersA?: Record<string, { input?: number; output?: number }>;
    pluginMetersB?: Record<string, { input?: number; output?: number }>;
    pluginMeta?: Record<string, any>;
    quickParamValuesA?: Record<string, Record<string, number>>;
    quickParamValuesB?: Record<string, Record<string, number>>;
    pluginPerformanceA?: Record<string, PluginPerformanceData>;
    pluginPerformanceB?: Record<string, PluginPerformanceData>;
    sampleRate?: number;
  }
): ABFlowData {
  const inputChannels = deviceIO?.inputChannels ?? 2;
  const outputChannels = deviceIO?.outputChannels ?? 2;
  const inputName = deviceIO?.inputName ?? 'Input';
  const outputName = deviceIO?.outputName ?? 'Output';

  const nodes: ABFlowNode[] = [];
  const edges: AudioConnectionEdge[] = [];

  // Layout constants
  const NODE_WIDTH = 280;
  const NODE_SPACING = 40;
  const ROUTING_NODE_WIDTH = 160;
  const PATH_Y_OFFSET = 180; // Vertical offset between A and B paths
  const START_X = 0;
  const PATH_A_Y = 0;
  const PATH_B_Y = PATH_A_Y + PATH_Y_OFFSET;

  // Calculate max plugins between A and B for proper spacing
  const maxPlugins = Math.max(chainA.plugins.length, chainB.plugins.length);

  // 1. Input device node
  const inputNodeId = 'device-input';
  nodes.push(
    createDeviceNode(inputNodeId, {
      name: inputName,
      channels: inputChannels,
      kind: 'input',
    }, { x: START_X, y: (PATH_A_Y + PATH_B_Y) / 2 })
  );

  // 2. Split node
  const splitNodeId = 'routing-split';
  const splitX = START_X + NODE_WIDTH + NODE_SPACING;
  nodes.push(
    createSplitNode(
      splitNodeId,
      inputChannels,
      { x: splitX, y: (PATH_A_Y + PATH_B_Y) / 2 },
      chainA.name,
      chainB.name
    )
  );

  // Edge: Input → Split
  edges.push(
    createAudioConnectionEdge(
      `edge-${inputNodeId}-${splitNodeId}`,
      inputNodeId,
      splitNodeId,
      inputChannels,
      inputChannels
    )
  );

  // 3. Chain A plugins (top path)
  const pluginStartX = splitX + ROUTING_NODE_WIDTH + NODE_SPACING;
  const pluginNodesA = createPluginNodes(
    chainA,
    'A',
    pluginStartX,
    PATH_A_Y,
    callbacks.onRemoveA,
    callbacks.onToggleBypassA,
    callbacks.onOpenParametersA,
    options?.compact,
    options?.pluginMetersA,
    options?.pluginMeta,
    options?.quickParamValuesA,
    options?.pluginPerformanceA,
    options?.sampleRate
  );
  nodes.push(...pluginNodesA);

  // 4. Chain B plugins (bottom path)
  const pluginNodesB = createPluginNodes(
    chainB,
    'B',
    pluginStartX,
    PATH_B_Y,
    callbacks.onRemoveB,
    callbacks.onToggleBypassB,
    callbacks.onOpenParametersB,
    options?.compact,
    options?.pluginMetersB,
    options?.pluginMeta,
    options?.quickParamValuesB,
    options?.pluginPerformanceB,
    options?.sampleRate
  );
  nodes.push(...pluginNodesB);

  // 5. Blend node
  const blendX = pluginStartX + (maxPlugins * (NODE_WIDTH + NODE_SPACING)) + NODE_SPACING;
  const blendNodeId = 'routing-blend';
  nodes.push(
    createBlendNode(
      blendNodeId,
      outputChannels,
      { x: blendX, y: (PATH_A_Y + PATH_B_Y) / 2 },
      blendPosition,
      chainA.name,
      chainB.name
    )
  );

  // 6. Output device node
  const outputNodeId = 'device-output';
  const outputX = blendX + ROUTING_NODE_WIDTH + NODE_SPACING;
  nodes.push(
    createDeviceNode(outputNodeId, {
      name: outputName,
      channels: outputChannels,
      kind: 'output',
    }, { x: outputX, y: (PATH_A_Y + PATH_B_Y) / 2 })
  );

  // Edge: Blend → Output
  edges.push(
    createAudioConnectionEdge(
      `edge-${blendNodeId}-${outputNodeId}`,
      blendNodeId,
      outputNodeId,
      outputChannels,
      outputChannels
    )
  );

  // 7. Connect Split → Chain A → Blend
  if (pluginNodesA.length > 0) {
    // Split → first plugin A
    edges.push(
      createAudioConnectionEdge(
        `edge-${splitNodeId}-${pluginNodesA[0].id}`,
        splitNodeId,
        pluginNodesA[0].id,
        inputChannels,
        pluginNodesA[0].data.inputPorts,
        'output-a'
      )
    );

    // Chain A plugin connections
    for (let i = 0; i < pluginNodesA.length - 1; i++) {
      edges.push(
        createAudioConnectionEdge(
          `edge-${pluginNodesA[i].id}-${pluginNodesA[i + 1].id}`,
          pluginNodesA[i].id,
          pluginNodesA[i + 1].id,
          pluginNodesA[i].data.outputPorts,
          pluginNodesA[i + 1].data.inputPorts
        )
      );
    }

    // Last plugin A → Blend
    const lastPluginA = pluginNodesA[pluginNodesA.length - 1];
    edges.push(
      createAudioConnectionEdge(
        `edge-${lastPluginA.id}-${blendNodeId}`,
        lastPluginA.id,
        blendNodeId,
        lastPluginA.data.outputPorts,
        outputChannels,
        undefined,
        'input-a'
      )
    );
  } else {
    // Direct Split → Blend for path A if no plugins
    edges.push(
      createAudioConnectionEdge(
        `edge-${splitNodeId}-${blendNodeId}-a`,
        splitNodeId,
        blendNodeId,
        inputChannels,
        outputChannels,
        'output-a',
        'input-a'
      )
    );
  }

  // 8. Connect Split → Chain B → Blend
  if (pluginNodesB.length > 0) {
    // Split → first plugin B
    edges.push(
      createAudioConnectionEdge(
        `edge-${splitNodeId}-${pluginNodesB[0].id}`,
        splitNodeId,
        pluginNodesB[0].id,
        inputChannels,
        pluginNodesB[0].data.inputPorts,
        'output-b'
      )
    );

    // Chain B plugin connections
    for (let i = 0; i < pluginNodesB.length - 1; i++) {
      edges.push(
        createAudioConnectionEdge(
          `edge-${pluginNodesB[i].id}-${pluginNodesB[i + 1].id}`,
          pluginNodesB[i].id,
          pluginNodesB[i + 1].id,
          pluginNodesB[i].data.outputPorts,
          pluginNodesB[i + 1].data.inputPorts
        )
      );
    }

    // Last plugin B → Blend
    const lastPluginB = pluginNodesB[pluginNodesB.length - 1];
    edges.push(
      createAudioConnectionEdge(
        `edge-${lastPluginB.id}-${blendNodeId}`,
        lastPluginB.id,
        blendNodeId,
        lastPluginB.data.outputPorts,
        outputChannels,
        undefined,
        'input-b'
      )
    );
  } else {
    // Direct Split → Blend for path B if no plugins
    edges.push(
      createAudioConnectionEdge(
        `edge-${splitNodeId}-${blendNodeId}-b`,
        splitNodeId,
        blendNodeId,
        inputChannels,
        outputChannels,
        'output-b',
        'input-b'
      )
    );
  }

  return { nodes, edges };
}

/**
 * Helper: Create plugin nodes for a chain
 */
function createPluginNodes(
  chain: Chain,
  pathId: 'A' | 'B',
  startX: number,
  y: number,
  onRemove: (uri: string) => void,
  onToggleBypass: (uri: string, bypass: boolean) => void,
  onOpenParameters: (plugin: any) => void,
  compact?: boolean,
  pluginMeters?: Record<string, { input?: number; output?: number }>,
  pluginMeta?: Record<string, any>,
  quickParamValues?: Record<string, Record<string, number>>,
  pluginPerformance?: Record<string, PluginPerformanceData>,
  sampleRate?: number
): AudioPluginNode[] {
  const NODE_WIDTH = 280;
  const NODE_SPACING = 40;

  return chain.plugins.map((plugin, index) => {
    const nodeId = `plugin-${pathId}-${plugin.uri}-${index}`;
    const x = startX + index * (NODE_WIDTH + NODE_SPACING);

    const meta = pluginMeta?.[plugin.uri];
    const perf = pluginPerformance?.[plugin.uri];
    const quickParams = (meta?.parameters || []).filter((p: any) => !p.is_toggled).slice(0, 2);

    const nodeData: AudioPluginNodeData = {
      plugin,
      isSelected: false,
      isBypassed: plugin.bypassed,
      inputPorts: plugin.in_ports || 0,
      outputPorts: plugin.out_ports || 0,
      compact,
      meters: pluginMeters?.[plugin.uri],
      cpuPercent: perf?.cpuPercent ?? plugin.cpu_percent,
      latencySamples: perf?.latencySamples ?? plugin.latency_samples,
      sampleRate,
      hasLfo: perf?.hasLfo,
      hasEnvelope: perf?.hasEnvelope,
      hasAutomation: perf?.hasAutomation,
      quickParameters: quickParams.map((p: any) => ({
        name: p.name,
        symbol: p.symbol,
        value: quickParamValues?.[plugin.uri]?.[p.symbol] ?? p.default,
        min: p.min,
        max: p.max,
        index: p.index,
      })),
      onRemove: () => onRemove(plugin.uri),
      onToggleBypass: () => onToggleBypass(plugin.uri, plugin.bypassed),
      onOpenParameters: () => onOpenParameters(plugin),
      // Visual indicator for which path this plugin belongs to
      pathIndicator: pathId,
    };

    return createAudioPluginNode(nodeId, nodeData, { x, y });
  });
}
