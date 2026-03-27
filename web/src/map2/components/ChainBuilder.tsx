// ============================================================================
// MAP2 Audio Platform - Signal Chain Builder Component
// Visual editor inspired by PiPedal's professional pedalboard interface
// Enhanced with CPU profiling, latency display, snapshots, and modulation
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
  Stack,
  Divider,
  Drawer,
  Switch,
  FormControlLabel,
  Badge,
} from '@mui/material';
import {
  Add,
  ChartLine,
  Close,
  Delete,
  PlayFilled,
  Redo,
  Renew,
  Save,
  Settings,
  SettingsAdjust,
  StopFilled,
  Undo,
} from '@carbon/icons-react';
import { chainsApi, pluginsApi, usbApi, historyApi, audioApi, automationApi } from '../api';
import { useChainUpdates, useMeterData } from '../hooks/useWebSocket';
import type { Chain, ChainPlugin, Plugin, PluginOrderRef, PluginParameter } from '../types';
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../displayNames';
import {
  buildPluginOrderRef,
  getPluginIdentityKey,
  getPluginIdentityKeyFromParts,
  samePluginIdentity,
} from '../utils/pluginIdentity';
import { buildPluginLevelMap, buildPluginPerformanceMap } from '../utils/pluginTelemetry';
import {
  ChainFlowCanvas,
  chainToFlow,
  chainToABFlow,
  autoLayoutNodes,
  hasSavedPositions,
  saveNodePositions,
  flowToChainOrder,
  type AudioPluginNodeType,
  type DeviceNode,
  type ABFlowNode,
} from './ChainBuilder/index';
import { usePluginDragSource } from './ChainBuilder/hooks/useNodeDragDrop';
import ChainABMode from './ChainABMode';
import { PluginChooser, normalizeMap2Plugins, UnifiedPlugin } from '../../shared/components/PluginChooser';

// Import new feature components
import SnapshotBar from './SnapshotBar';
import PluginCpuIndicator, { PluginCpuBadge } from './PluginCpuIndicator';
import LatencyDisplay, { LatencyBadge } from './LatencyDisplay';
import LFOQuickButton from './LFOQuickButton';
import EnvelopeFollowerPanel from './EnvelopeFollowerPanel';
import ABQuickToggle from './ABQuickToggle';
import { NumberInput } from '../../app/components/ParameterControl';

// Import JUCE integration components
import { LatencyOverlay, SnapshotBar as EnhancedSnapshotBar } from './ChainBuilder';
import { AudioConfigDialog } from './Audio';
import { MidiLearnButton } from './MIDI';
import { AutomationTimeline } from './Automation';

function Glyph({
  icon: Icon,
  size = 18,
  color = 'inherit',
}: {
  icon: React.ComponentType<{ size?: number }>;
  size?: number;
  color?: string;
}) {
  return (
    <Box component="span" sx={{ color, display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
      <Icon size={size} />
    </Box>
  );
}

// Old grid visualization components removed - now using React Flow

interface ParameterControlProps {
  param: PluginParameter;
  value: number;
  onChange: (value: number) => void;
}

function ParameterControl({ param, value, onChange }: ParameterControlProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (_: Event, newValue: number | number[]) => {
    const val = Array.isArray(newValue) ? newValue[0] : newValue;
    setLocalValue(val);
  };

  const handleCommit = (_: Event | React.SyntheticEvent, newValue: number | number[]) => {
    const val = Array.isArray(newValue) ? newValue[0] : newValue;
    onChange(val);
  };

  if (param.is_toggled) {
    return (
      <FormControlLabel
        control={
          <Switch
            checked={localValue > (param.min + (param.max - param.min) / 2)}
            onChange={(e) => onChange(e.target.checked ? param.max : param.min)}
          />
        }
        label={param.name}
      />
    );
  }

  const range = param.max - param.min;
  const step = range > 100 ? 1 : range > 10 ? 0.1 : 0.01;

  return (
    <Box sx={{ px: 2 }}>
      <NumberInput
        label={param.name}
        value={localValue}
        min={param.min}
        max={param.max}
        step={step}
        onChange={(v) => {
          setLocalValue(v);
          onChange(v);
        }}
        size="small"
      />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
        Range: {param.min.toFixed(1)} - {param.max.toFixed(1)} | Default: {param.default.toFixed(2)}
      </Typography>
    </Box>
  );
}

function syncSelectedPluginNodeState<
  T extends {
    type?: string;
    data?: Record<string, any>;
    selected?: boolean;
  }
>(nodes: T[], selectedPlugin: ChainPlugin | null): T[] {
  return nodes.map((node) => {
    if (node.type !== 'audioPlugin' || !node.data?.plugin) {
      return node;
    }

    const isSelected = Boolean(selectedPlugin && samePluginIdentity(node.data.plugin, selectedPlugin));

    return {
      ...node,
      selected: isSelected,
      data: {
        ...node.data,
        isSelected,
      },
    };
  });
}

export default function ChainBuilder() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [availablePlugins, setAvailablePlugins] = useState<Plugin[]>([]);
  const [selectedChain, setSelectedChain] = useState<Chain | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<any | null>(null);
  const [pluginDetails, setPluginDetails] = useState<Plugin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paramSearch, setParamSearch] = useState('');
  const [pinnedParams, setPinnedParams] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('map2_pinned_params');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // A/B Mode State - Load from localStorage for persistence
  const [abModeEnabled, setAbModeEnabled] = useState(() => {
    try {
      return localStorage.getItem('map2_ab_mode_enabled') === 'true';
    } catch { return false; }
  });
  const [selectedChainIdA, setSelectedChainIdA] = useState<number | null>(() => {
    try {
      const val = localStorage.getItem('map2_ab_chain_a');
      return val ? parseInt(val, 10) : null;
    } catch { return null; }
  });
  const [selectedChainIdB, setSelectedChainIdB] = useState<number | null>(() => {
    try {
      const val = localStorage.getItem('map2_ab_chain_b');
      return val ? parseInt(val, 10) : null;
    } catch { return null; }
  });
  const [currentBlend, setCurrentBlend] = useState(() => {
    try {
      const val = localStorage.getItem('map2_ab_blend');
      return val ? parseInt(val, 10) : 0;
    } catch { return 0; }
  });
  const [dspLoadA, setDspLoadA] = useState<number | undefined>();
  const [dspLoadB, setDspLoadB] = useState<number | undefined>();

  // Plugin performance data (CPU, latency, modulation status)
  const [pluginPerformance, setPluginPerformance] = useState<Record<string, { cpuPercent?: number; latencySamples?: number; hasLfo?: boolean; hasEnvelope?: boolean; hasAutomation?: boolean }>>({});

  // Drag-and-drop hook
  const { onDragStart } = usePluginDragSource();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newChainName, setNewChainName] = useState('');
  const [addPluginDialogOpen, setAddPluginDialogOpen] = useState(false);
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [parametersPanelOpen, setParametersPanelOpen] = useState(false);
  const [pluginSearch, setPluginSearch] = useState('');
  const [pluginCategory, setPluginCategory] = useState<string>('all');

  const [compactView, setCompactView] = useState(() => {
    try {
      return localStorage.getItem('map2_compact_view') === 'true';
    } catch { return false; }
  });
  const [showStageTheme, setShowStageTheme] = useState(() => {
    try {
      return localStorage.getItem('map2_stage_theme') === 'true';
    } catch { return false; }
  });
  const [snapshots, setSnapshots] = useState<number>(0);
  const [processingSnapshot, setProcessingSnapshot] = useState(false);
  const [historyState, setHistoryState] = useState<{ canUndo: boolean; canRedo: boolean; nextUndo?: string; nextRedo?: string }>({ canUndo: false, canRedo: false });
  const [globalLevels, setGlobalLevels] = useState<{ input_left: number; input_right: number; output_left: number; output_right: number } | null>(null);
  const [pluginLevels, setPluginLevels] = useState<Record<string, { input: number; output: number }>>({});
  const [quickParamValues, setQuickParamValues] = useState<Record<string, Record<string, number>>>({});
  const [favoriteUris, setFavoriteUris] = useState<string[]>([]);
  const [recentUris, setRecentUris] = useState<string[]>([]);
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [insertTargetPlugin, setInsertTargetPlugin] = useState<PluginOrderRef | null>(null);

  // JUCE Integration Feature State
  const [audioConfigDialogOpen, setAudioConfigDialogOpen] = useState(false);
  const [midiLearnMode, setMidiLearnMode] = useState(false);
  const [automationTimelineExpanded, setAutomationTimelineExpanded] = useState(false);
  const [automationPlaying, setAutomationPlaying] = useState(false);
  const [automationRecording, setAutomationRecording] = useState(false);
  const [automationLoopEnabled, setAutomationLoopEnabled] = useState(false);
  const [automationCurrentTime, setAutomationCurrentTime] = useState(0);
  const [automationDuration, setAutomationDuration] = useState(60); // 60 seconds default
  const [automationArmedLanes, setAutomationArmedLanes] = useState<Set<string>>(new Set());
  const [automationLaneDialogOpen, setAutomationLaneDialogOpen] = useState(false);

  // React Flow state
  const [flowNodes, setFlowNodes] = useState<Array<AudioPluginNodeType | DeviceNode>>([]);
  const [flowEdges, setFlowEdges] = useState<any[]>([]);

  // React Flow state for Chain B (A/B split view)
  const [flowNodesB, setFlowNodesB] = useState<Array<AudioPluginNodeType | DeviceNode>>([]);
  const [flowEdgesB, setFlowEdgesB] = useState<any[]>([]);
  const [chainB, setChainB] = useState<Chain | null>(null);

  // React Flow state for unified A/B routing visualization
  const [abFlowNodes, setAbFlowNodes] = useState<ABFlowNode[]>([]);
  const [abFlowEdges, setAbFlowEdges] = useState<any[]>([]);

  const [deviceInfo, setDeviceInfo] = useState<{ inputChannels: number; outputChannels: number; name?: string } | null>(null);

  // WebSocket updates
  const { lastEvent } = useChainUpdates();
  const { levels: meterLevels } = useMeterData();

  // Track when local mutations are in progress to avoid WebSocket race conditions
  const localMutationInProgress = useRef(false);

  // Reload chains only (for WebSocket updates) - doesn't reload plugins
  const reloadChains = useCallback(async () => {
    try {
      const [chainsRes, snapshotsRes, historyStatus] = await Promise.all([
        chainsApi.list(),
        historyApi.getSnapshots().catch(() => ({ snapshots: [], count: 0 })),
        historyApi.getStatus().catch(() => ({ can_undo: false, can_redo: false } as any)),
      ]);
      setChains(chainsRes.chains || []);
      setSnapshots(snapshotsRes?.count ?? 0);
      setHistoryState({
        canUndo: (historyStatus as any).can_undo ?? false,
        canRedo: (historyStatus as any).can_redo ?? false,
        nextUndo: (historyStatus as any).next_undo,
        nextRedo: (historyStatus as any).next_redo,
      });
    } catch (err) {
      // Silently fail for background updates
    }
  }, []);

  // Full data load (chains + plugins) - called once on mount
  const loadData = useCallback(async () => {
    try {
      const [chainsRes, pluginsRes, usbRes, snapshotsRes, historyStatus] = await Promise.all([
        chainsApi.list(),
        pluginsApi.discover(),
        usbApi.getPrimaryHotoneDevice().catch(() => null),
        historyApi.getSnapshots().catch(() => ({ snapshots: [], count: 0 })),
        historyApi.getStatus().catch(() => ({ can_undo: false, can_redo: false } as any)),
      ]);

      setChains(chainsRes.chains || []);
      setAvailablePlugins(pluginsRes.plugins || []);
      setSnapshots(snapshotsRes?.count ?? 0);
      setHistoryState({
        canUndo: (historyStatus as any).can_undo ?? false,
        canRedo: (historyStatus as any).can_redo ?? false,
        nextUndo: (historyStatus as any).next_undo,
        nextRedo: (historyStatus as any).next_redo,
      });
      if (usbRes) {
        setDeviceInfo({
          inputChannels: usbRes.channels_in ?? 2,
          outputChannels: usbRes.channels_out ?? 2,
          name: usbRes.name || usbRes.model,
        });
      } else {
        setDeviceInfo({ inputChannels: 2, outputChannels: 2 });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load favorites/recent from localStorage
  useEffect(() => {
    try {
      const fav = localStorage.getItem('map2_favorite_plugins');
      if (fav) setFavoriteUris(JSON.parse(fav));
      const recent = localStorage.getItem('map2_recent_plugins');
      if (recent) setRecentUris(JSON.parse(recent));
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist A/B mode settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('map2_ab_mode_enabled', String(abModeEnabled));
      if (selectedChainIdA !== null) {
        localStorage.setItem('map2_ab_chain_a', String(selectedChainIdA));
      } else {
        localStorage.removeItem('map2_ab_chain_a');
      }
      if (selectedChainIdB !== null) {
        localStorage.setItem('map2_ab_chain_b', String(selectedChainIdB));
      } else {
        localStorage.removeItem('map2_ab_chain_b');
      }
      localStorage.setItem('map2_ab_blend', String(currentBlend));
    } catch (e) {
      // ignore storage errors
    }
  }, [abModeEnabled, selectedChainIdA, selectedChainIdB, currentBlend]);

  // Persist UI preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('map2_compact_view', String(compactView));
    } catch { /* ignore */ }
  }, [compactView]);

  useEffect(() => {
    try {
      localStorage.setItem('map2_stage_theme', String(showStageTheme));
    } catch { /* ignore */ }
  }, [showStageTheme]);

  useEffect(() => {
    try {
      localStorage.setItem('map2_pinned_params', JSON.stringify(pinnedParams));
    } catch { /* ignore */ }
  }, [pinnedParams]);

  // A/B Mode: Keyboard shortcuts - DISABLED DURING DIALOG
  useEffect(() => {
    if (createDialogOpen) return; // Skip if dialog is open
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!abModeEnabled) return;
      
      // Space: Toggle between A and B
      if (e.code === 'Space') {
        e.preventDefault();
        if (selectedChainIdA && selectedChainIdB) {
          setSelectedChain(currentBlend < 50
            ? chains.find(c => c.id === selectedChainIdA) || null
            : chains.find(c => c.id === selectedChainIdB) || null
          );
        }
      }
      
      // Arrow Left: Decrease blend (more A)
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setCurrentBlend(prev => Math.max(0, prev - 5));
        handleBlendChange(Math.max(0, currentBlend - 5));
      }
      
      // Arrow Right: Increase blend (more B)
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        setCurrentBlend(prev => Math.min(100, prev + 5));
        handleBlendChange(Math.min(100, currentBlend + 5));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abModeEnabled, selectedChainIdA, selectedChainIdB, currentBlend, chains, createDialogOpen]);

  // A/B Mode: Update DSP loads
  useEffect(() => {
    const updateDspLoads = async () => {
      if (selectedChainIdA) {
        try {
          const res = await fetch(`/api/chains/ab/${selectedChainIdA}/dsp-load`);
          if (res.ok) {
            const data = await res.json();
            setDspLoadA(data.total_dsp_load_percent);
          }
        } catch (e) { /* ignore */ }
      }
      if (selectedChainIdB) {
        try {
          const res = await fetch(`/api/chains/ab/${selectedChainIdB}/dsp-load`);
          if (res.ok) {
            const data = await res.json();
            setDspLoadB(data.total_dsp_load_percent);
          }
        } catch (e) { /* ignore */ }
      }
    };
    
    if (abModeEnabled && !createDialogOpen) {
      updateDspLoads();
      const interval = setInterval(updateDspLoads, 2000);
      return () => clearInterval(interval);
    }
  }, [abModeEnabled, selectedChainIdA, selectedChainIdB, createDialogOpen]);

  // Fetch plugin performance data (CPU, modulation status)
  useEffect(() => {
    const fetchPerformance = async () => {
      try {
        const res = await fetch('/profiling/plugins');
        if (res.ok) {
          const data = await res.json();
          const perfMap: Record<string, any> = buildPluginPerformanceMap(data.plugins || []);
          
          // Also fetch automation/LFO status
          try {
            const autoRes = await fetch('/api/automation/status');
            if (autoRes.ok) {
              const autoData = await autoRes.json();
              // Mark plugins that have active LFO or envelope
              (autoData.automated_parameters || []).forEach((paramId: string) => {
                const separatorIndex = paramId.lastIndexOf(':');
                const uri = separatorIndex >= 0 ? paramId.slice(0, separatorIndex) : paramId;
                if (perfMap[uri]) {
                  perfMap[uri].hasAutomation = true;
                }
              });
            }
          } catch (e) { /* ignore */ }
          
          setPluginPerformance(perfMap);
        }
      } catch (e) {
        // Silently fail - profiling may not be available
      }
    };
    
    fetchPerformance();
    const interval = setInterval(fetchPerformance, 2000);
    return () => clearInterval(interval);
  }, []);

  // Handle WebSocket chain updates - only reload chains, not plugins
  // Skip if a local mutation is in progress to avoid race conditions
  useEffect(() => {
    if (lastEvent && !localMutationInProgress.current) {
      reloadChains();
    }
  }, [lastEvent, reloadChains]);

  // Update meters via websocket
  useEffect(() => {
    if (meterLevels) {
      setGlobalLevels({
        input_left: meterLevels.input_left,
        input_right: meterLevels.input_right,
        output_left: meterLevels.output_left,
        output_right: meterLevels.output_right,
      });
      if (meterLevels.plugins) {
        setPluginLevels(buildPluginLevelMap(meterLevels.plugins));
      }
    }
  }, [meterLevels]);

  // Poll global levels as fallback
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [levelsRes, pluginLevelsRes] = await Promise.all([
          audioApi.getLevels(),
          audioApi.getPluginLevels(),
        ]);
        setGlobalLevels(levelsRes as any);
        if (Array.isArray(pluginLevelsRes.plugins)) {
          setPluginLevels(buildPluginLevelMap(pluginLevelsRes.plugins));
        }
      } catch (e) {
        // ignore
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Sync selectedChain to React Flow nodes and edges
  useEffect(() => {
    if (selectedChain) {
      const pluginMeta = availablePlugins.reduce<Record<string, Plugin>>((acc, p) => {
        acc[p.uri] = p;
        return acc;
      }, {});

      const { nodes, edges } = chainToFlow(selectedChain, {
        onRemove: handleRemovePlugin,
        onToggleBypass: handleToggleBypass,
        onOpenParameters: openPluginParameters,
      }, deviceInfo ? {
        inputChannels: deviceInfo.inputChannels,
        outputChannels: deviceInfo.outputChannels,
        inputName: deviceInfo.name,
        outputName: deviceInfo.name ? `${deviceInfo.name} Out` : undefined,
      } : undefined, {
        compact: compactView,
        pluginMeters: pluginLevels,
        pluginMeta,
        quickParamValues,
        pluginPerformance, // Pass performance data for CPU/LFO/ENV indicators
      });

      // Auto-layout if no saved positions
      if (!hasSavedPositions(selectedChain.id)) {
        const layoutedNodes = autoLayoutNodes(nodes, edges).map((n) => {
          if (n.type === 'audioPlugin') {
            return {
              ...n,
              data: {
                ...n.data,
                onQuickParamChange: (symbol: string, value: number, index: number) =>
                  handleQuickParamChange((n as any).data.plugin, symbol, index, value),
              },
            } as any;
          }
          return n;
        });
        const nextNodes = syncSelectedPluginNodeState(layoutedNodes, selectedPlugin);
        setFlowNodes(nextNodes);
        saveNodePositions(selectedChain.id, nextNodes);
      } else {
        const enhanced = nodes.map((n) => {
          if (n.type === 'audioPlugin') {
            return {
              ...n,
              data: {
                ...n.data,
                onQuickParamChange: (symbol: string, value: number, index: number) =>
                  handleQuickParamChange(n.data.plugin, symbol, index, value),
              },
            } as any;
          }
          return n;
        });
        setFlowNodes(syncSelectedPluginNodeState(enhanced, selectedPlugin));
      }

      setFlowEdges(edges);
    }
  }, [selectedChain, compactView, pluginLevels, deviceInfo, availablePlugins, quickParamValues, pluginPerformance, selectedPlugin, openPluginParameters]);

  // Load Chain B when in A/B mode
  useEffect(() => {
    const loadChainB = async () => {
      if (abModeEnabled && selectedChainIdB) {
        try {
          const chain = await chainsApi.get(selectedChainIdB);
          setChainB(chain);
        } catch (err) {
          console.error('Failed to load chain B:', err);
          setChainB(null);
        }
      } else {
        setChainB(null);
      }
    };
    loadChainB();
  }, [abModeEnabled, selectedChainIdB]);

  // Sync selectedChain with selectedChainIdA when in A/B mode
  useEffect(() => {
    if (abModeEnabled && selectedChainIdA) {
      const chain = chains.find(c => c.id === selectedChainIdA);
      if (chain && chain.id !== selectedChain?.id) {
        setSelectedChain(chain);
      }
    }
  }, [abModeEnabled, selectedChainIdA, chains]);

  // Sync Chain B to React Flow nodes and edges (A/B split view)
  useEffect(() => {
    if (chainB && abModeEnabled) {
      const pluginMeta = availablePlugins.reduce<Record<string, Plugin>>((acc, p) => {
        acc[p.uri] = p;
        return acc;
      }, {});

      const { nodes, edges } = chainToFlow(chainB, {
        onRemove: handleRemovePluginB,
        onToggleBypass: handleToggleBypassB,
        onOpenParameters: openPluginParameters,
      }, deviceInfo ? {
        inputChannels: deviceInfo.inputChannels,
        outputChannels: deviceInfo.outputChannels,
        inputName: deviceInfo.name,
        outputName: deviceInfo.name ? `${deviceInfo.name} Out` : undefined,
      } : undefined, {
        compact: compactView,
        pluginMeters: pluginLevels,
        pluginMeta,
        quickParamValues,
        pluginPerformance, // Pass performance data for CPU/LFO/ENV indicators
      });

      // Auto-layout if no saved positions
      if (!hasSavedPositions(chainB.id)) {
        const layoutedNodes = autoLayoutNodes(nodes, edges);
        const nextNodes = syncSelectedPluginNodeState(layoutedNodes, selectedPlugin);
        setFlowNodesB(nextNodes);
        saveNodePositions(chainB.id, nextNodes);
      } else {
        setFlowNodesB(syncSelectedPluginNodeState(nodes, selectedPlugin));
      }

      setFlowEdgesB(edges);
    } else {
      setFlowNodesB([]);
      setFlowEdgesB([]);
    }
  }, [chainB, abModeEnabled, compactView, pluginLevels, deviceInfo, availablePlugins, quickParamValues, pluginPerformance, selectedPlugin, openPluginParameters]);

  // Generate unified A/B routing flow visualization
  useEffect(() => {
    if (abModeEnabled && selectedChain && chainB) {
      const pluginMeta = availablePlugins.reduce<Record<string, Plugin>>((acc, p) => {
        acc[p.uri] = p;
        return acc;
      }, {});

      const { nodes, edges } = chainToABFlow(
        selectedChain,
        chainB,
        {
          onRemoveA: handleRemovePlugin,
          onRemoveB: handleRemovePluginB,
          onToggleBypassA: handleToggleBypass,
          onToggleBypassB: handleToggleBypassB,
          onOpenParametersA: openPluginParameters,
          onOpenParametersB: openPluginParameters,
        },
        currentBlend,
        deviceInfo ? {
          inputChannels: deviceInfo.inputChannels,
          outputChannels: deviceInfo.outputChannels,
          inputName: deviceInfo.name,
          outputName: deviceInfo.name ? `${deviceInfo.name} Out` : undefined,
        } : undefined,
        {
          compact: compactView,
          pluginMetersA: pluginLevels,
          pluginMetersB: pluginLevels,
          pluginMeta,
          quickParamValuesA: quickParamValues,
          quickParamValuesB: quickParamValues,
          pluginPerformanceA: pluginPerformance,
          pluginPerformanceB: pluginPerformance,
        }
      );

      setAbFlowNodes(syncSelectedPluginNodeState(nodes, selectedPlugin));
      setAbFlowEdges(edges);
    } else {
      setAbFlowNodes([]);
      setAbFlowEdges([]);
    }
  }, [abModeEnabled, selectedChain, chainB, currentBlend, compactView, pluginLevels, deviceInfo, availablePlugins, quickParamValues, pluginPerformance, selectedPlugin, openPluginParameters]);

  // Load plugin details when selected
  useEffect(() => {
    const loadPluginDetails = async () => {
      if (selectedPlugin?.uri) {
        try {
          const details = availablePlugins.find(p => p.uri === selectedPlugin.uri);
          if (details) {
            setPluginDetails(details);
            setParametersPanelOpen(true);
          }
        } catch (err) {
          console.error('Failed to load plugin details:', err);
        }
      }
    };

    loadPluginDetails();
  }, [selectedPlugin, availablePlugins]);

  // Create new chain
  const handleCreateChain = useCallback(() => {
    const chainNameValue = newChainName.trim();
    if (!chainNameValue) return;

    setCreateDialogOpen(false);

    // Use proper API client for remote access support
    chainsApi.create(chainNameValue)
      .then(() => {
        setNewChainName('');
        reloadChains();
      })
      .catch(err => {
        setError('Failed to create chain: ' + (err instanceof Error ? err.message : 'Unknown error'));
        setCreateDialogOpen(true);
      });
  }, [newChainName, reloadChains]);

  // Delete chain
  const handleDeleteChain = async (chainId: number) => {
    if (!confirm('Are you sure you want to delete this chain?')) return;

    try {
      await chainsApi.delete(chainId);
      if (selectedChain?.id === chainId) {
        setSelectedChain(null);
        setSelectedPlugin(null);
      }
      await reloadChains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete chain');
    }
  };

  // Activate/deactivate chain
  const handleToggleChain = async (chainId: number, isActive: boolean) => {
    try {
      if (isActive) {
        await chainsApi.deactivate(chainId);
      } else {
        // Activating this chain will deactivate all others (backend enforces single-active)
        await chainsApi.activate(chainId);
      }
      await reloadChains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle chain');
    }
  };

  // Add plugin to chain
  const handleAddPlugin = async (pluginUri: string) => {
    if (!selectedChain) return;

    try {
      await chainsApi.addPlugin(selectedChain.id, pluginUri);
      setAddPluginDialogOpen(false);
      await reloadChains();
      const updated = await chainsApi.get(selectedChain.id);
      setSelectedChain(updated);
      setRecentUris((prev) => {
        const next = [pluginUri, ...prev.filter((u) => u !== pluginUri)].slice(0, 8);
        localStorage.setItem('map2_recent_plugins', JSON.stringify(next));
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add plugin');
    }
  };

  // Remove plugin from chain
  const handleRemovePlugin = async (plugin: ChainPlugin) => {
    if (!selectedChain) return;

    // Prevent WebSocket-triggered reloads from racing with our explicit reload
    localMutationInProgress.current = true;
    try {
      await chainsApi.removePlugin(selectedChain.id, plugin.uri, plugin.position);
      if (selectedPlugin && samePluginIdentity(selectedPlugin, plugin)) {
        setSelectedPlugin(null);
        setParametersPanelOpen(false);
      }
      const updated = await chainsApi.get(selectedChain.id);
      setSelectedChain(updated);
      await reloadChains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove plugin');
    } finally {
      localMutationInProgress.current = false;
    }
  };

  // Toggle plugin bypass
  const handleToggleBypass = async (plugin: ChainPlugin) => {
    if (!selectedChain) return;

    try {
      await chainsApi.togglePluginBypass(selectedChain.id, plugin.uri, !plugin.bypassed, plugin.position);
      const updated = await chainsApi.get(selectedChain.id);
      setSelectedChain(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle bypass');
    }
  };

  // Remove plugin from Chain B (A/B split view)
  const handleRemovePluginB = async (plugin: ChainPlugin) => {
    if (!chainB) return;

    localMutationInProgress.current = true;
    try {
      await chainsApi.removePlugin(chainB.id, plugin.uri, plugin.position);
      if (selectedPlugin && samePluginIdentity(selectedPlugin, plugin)) {
        setSelectedPlugin(null);
        setParametersPanelOpen(false);
      }
      const updated = await chainsApi.get(chainB.id);
      setChainB(updated);
      await reloadChains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove plugin from Chain B');
    } finally {
      localMutationInProgress.current = false;
    }
  };

  // Toggle plugin bypass on Chain B (A/B split view)
  const handleToggleBypassB = async (plugin: ChainPlugin) => {
    if (!chainB) return;

    try {
      await chainsApi.togglePluginBypass(chainB.id, plugin.uri, !plugin.bypassed, plugin.position);
      const updated = await chainsApi.get(chainB.id);
      setChainB(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle bypass on Chain B');
    }
  };

  // Update parameter value
  const handleParameterChange = async (paramIndex: number, value: number) => {
    if (!selectedPlugin?.uri) return;

    try {
      await pluginsApi.setParameter(
        selectedPlugin.uri,
        paramIndex,
        value,
        selectedPlugin.instance_id,
        selectedPlugin.position,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update parameter');
    }
  };

  const togglePinParam = (symbol: string) => {
    setPinnedParams((prev) => (prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]));
  };

  const handleQuickParamChange = async (
    plugin: ChainPlugin,
    symbol: string,
    index: number,
    value: number,
  ) => {
    const pluginKey = getPluginIdentityKey(plugin);
    setQuickParamValues((prev) => ({
      ...prev,
      [pluginKey]: { ...prev[pluginKey], [symbol]: value },
    }));
    try {
      await pluginsApi.setParameter(plugin.uri, index, value, plugin.instance_id, plugin.position);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update parameter');
    }
  };

  // A/B Mode: Handle blend change
  const handleBlendChange = async (newBlend: number) => {
    setCurrentBlend(newBlend);
    if (selectedChainIdA && selectedChainIdB) {
      try {
        await fetch(`/api/chains/ab/${selectedChainIdA}/blend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain_a_id: selectedChainIdA,
            chain_b_id: selectedChainIdB,
            blend_position: newBlend / 100,
            enabled: true,
          }),
        });
      } catch (err) {
        console.error('Failed to update blend:', err);
      }
    }
  };

  const handleInsertUtility = async (utilityUri: string) => {
    if (!selectedChain || !insertTargetPlugin) return;
    try {
      const addResult = await chainsApi.addPlugin(selectedChain.id, utilityUri);
      const updated = await chainsApi.get(selectedChain.id);
      const addedPosition = typeof addResult.plugin_position === 'number' ? addResult.plugin_position : null;
      const currentOrder = (updated.plugins || []).map((plugin) => buildPluginOrderRef(plugin));
      const addedIndex = currentOrder.findIndex((pluginRef) => (
        pluginRef.uri === utilityUri
        && (addedPosition === null || pluginRef.position === addedPosition)
      ));
      const targetIndex = currentOrder.findIndex((pluginRef) => (
        pluginRef.uri === insertTargetPlugin.uri && pluginRef.position === insertTargetPlugin.position
      ));
      if (addedIndex < 0) {
        throw new Error('Inserted utility could not be resolved after add')
      }
      const nextOrder = [...currentOrder];
      const [addedPlugin] = nextOrder.splice(addedIndex, 1);
      const insertionIndex = targetIndex >= 0 ? nextOrder.findIndex((pluginRef) => (
        pluginRef.uri === insertTargetPlugin.uri && pluginRef.position === insertTargetPlugin.position
      )) : -1;
      if (insertionIndex >= 0) {
        nextOrder.splice(insertionIndex, 0, addedPlugin);
      } else {
        nextOrder.push(addedPlugin);
      }
      await chainsApi.reorderPlugins(selectedChain.id, nextOrder);
      const finalChain = await chainsApi.get(selectedChain.id);
      setSelectedChain(finalChain);
      setInsertDialogOpen(false);
      setInsertTargetPlugin(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert utility');
    }
  };

  const toggleFavoritePlugin = (uri: string) => {
    setFavoriteUris((prev) => {
      const next = prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri];
      localStorage.setItem('map2_favorite_plugins', JSON.stringify(next));
      return next;
    });
  };

  // Save preset
  const handleSavePreset = async () => {
    if (!selectedChain || !presetName.trim()) return;

    try {
      await chainsApi.savePreset(selectedChain.id, presetName);
      setPresetName('');
      setSavePresetDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset');
    }
  };

  const handleUndo = async () => {
    try {
      const res = await historyApi.undo();
      setHistoryState((prev) => ({ ...prev, canUndo: res.can_undo, canRedo: res.can_redo, nextUndo: res.next_undo }));
      await reloadChains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo');
    }
  };

  const handleRedo = async () => {
    try {
      const res = await historyApi.redo();
      setHistoryState((prev) => ({ ...prev, canUndo: res.can_undo, canRedo: res.can_redo, nextRedo: res.next_redo }));
      await reloadChains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to redo');
    }
  };

  const handleRestoreSnapshot = async (index: number) => {
    setProcessingSnapshot(true);
    try {
      await historyApi.restoreSnapshot(index);
      await reloadChains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore snapshot');
    } finally {
      setProcessingSnapshot(false);
    }
  };

  const openPluginParameters = useCallback((plugin: ChainPlugin) => {
    if (plugin.uri === 'hardware://lexicon-mpx1-spdif') {
      window.location.href = '/mpx1/panel';
      return;
    }

    setSelectedPlugin(plugin);
    setParametersPanelOpen(true);
  }, []);

  const categories = React.useMemo(() => {
    const cats = new Set(availablePlugins.map(p => p.category).filter(Boolean));
    return ['all', ...Array.from(cats).sort()];
  }, [availablePlugins]);

  const utilityPlugins = useMemo(() => availablePlugins.filter((p) => p.category === 'Utility' || p.class_label === 'Utility' || p.name.toLowerCase().includes('gain')), [availablePlugins]);

  const filteredPlugins = React.useMemo(() => {
    const query = pluginSearch.toLowerCase();
    let pool = availablePlugins;
    if (pluginCategory === 'favorites') {
      pool = availablePlugins.filter(p => favoriteUris.includes(p.uri));
    } else if (pluginCategory === 'recent') {
      pool = recentUris
        .map(uri => availablePlugins.find(p => p.uri === uri))
        .filter((p): p is Plugin => Boolean(p));
    } else if (pluginCategory !== 'all') {
      pool = availablePlugins.filter((p) => p.category === pluginCategory);
    }

    return pool.filter((plugin) => {
      if (!query) return true;
      const displayName = getDisplayPluginName(plugin.name, plugin.uri).toLowerCase();
      const displayAuthor = sanitizeRestrictedDisplayText(plugin.author).toLowerCase();
      return (
        displayName.includes(query) ||
        displayAuthor.includes(query) ||
        plugin.category.toLowerCase().includes(query) ||
        plugin.class_label.toLowerCase().includes(query)
      );
    });
  }, [availablePlugins, pluginSearch, pluginCategory, favoriteUris, recentUris]);

  // Unified plugins for the new PluginChooser component
  const unifiedPlugins = React.useMemo(() => {
    return normalizeMap2Plugins(availablePlugins, favoriteUris);
  }, [availablePlugins, favoriteUris]);

  const filteredParams = useMemo(() => {
    if (!pluginDetails) return [] as PluginParameter[];
    const query = paramSearch.toLowerCase();
    const params = pluginDetails.parameters || [];
    const matches = params.filter((p) =>
      p.name.toLowerCase().includes(query) || p.symbol.toLowerCase().includes(query)
    );
    const pinned = matches.filter((p) => pinnedParams.includes(p.symbol));
    const others = matches.filter((p) => !pinnedParams.includes(p.symbol));
    return [...pinned, ...others];
  }, [pluginDetails, paramSearch, pinnedParams]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: showStageTheme ? 'grey.900' : 'background.default', color: showStageTheme ? 'grey.100' : 'inherit' }}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
      {/* Quick Snapshots Bar - Always visible at top */}
      <SnapshotBar compact />

      {/* Top Controls: theme, compact, history, CPU, latency */}
      <Paper sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }} elevation={0}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControlLabel
              control={<Switch checked={compactView} onChange={(e) => setCompactView(e.target.checked)} size="small" />}
              label="Compact"
            />
            <FormControlLabel
              control={<Switch checked={showStageTheme} onChange={(e) => setShowStageTheme(e.target.checked)} size="small" />}
              label="Stage"
            />
          </Stack>
          <Divider flexItem orientation="vertical" />
          
          {/* Undo/Redo with badges */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Tooltip title={historyState.nextUndo ? `Undo: ${historyState.nextUndo}` : 'Undo'}>
              <span>
                <IconButton size="small" onClick={handleUndo} disabled={!historyState.canUndo}>
                  <Undo size={16} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={historyState.nextRedo ? `Redo: ${historyState.nextRedo}` : 'Redo'}>
              <span>
                <IconButton size="small" onClick={handleRedo} disabled={!historyState.canRedo}>
                  <Redo size={16} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
          
          <Divider flexItem orientation="vertical" />
          
          {/* CPU & Latency Indicators */}
          <PluginCpuIndicator compact showChainTotal />
          <LatencyDisplay compact />

          <Divider flexItem orientation="vertical" />

          {/* JUCE Integration Controls */}
          <MidiLearnButton
            isActive={midiLearnMode}
            onToggle={() => setMidiLearnMode(!midiLearnMode)}
          />

          <Tooltip title="Audio Configuration">
            <IconButton
              size="small"
              onClick={() => setAudioConfigDialogOpen(true)}
            >
              <SettingsAdjust size={16} />
            </IconButton>
          </Tooltip>

          <Tooltip title={automationTimelineExpanded ? 'Hide Automation Timeline' : 'Show Automation Timeline'}>
            <IconButton
              size="small"
              onClick={() => setAutomationTimelineExpanded(!automationTimelineExpanded)}
              sx={{
                color: automationTimelineExpanded ? 'primary.main' : 'inherit',
              }}
            >
              <ChartLine size={16} />
            </IconButton>
          </Tooltip>

          <Box sx={{ flexGrow: 1 }} />
          
          {/* Global Meters */}
          {globalLevels && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 200 }}>
              <Typography variant="caption" sx={{ minWidth: 20 }}>In</Typography>
              <Box sx={{ flex: 1, height: 6, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ width: `${Math.min(Math.max(globalLevels.input_left * 100, 0), 100)}%`, height: '100%', bgcolor: 'info.main', transition: 'width 120ms linear' }} />
              </Box>
              <Typography variant="caption" sx={{ minWidth: 24 }}>Out</Typography>
              <Box sx={{ flex: 1, height: 6, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ width: `${Math.min(Math.max(globalLevels.output_left * 100, 0), 100)}%`, height: '100%', bgcolor: 'success.main', transition: 'width 120ms linear' }} />
              </Box>
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Header */}
      <Paper sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }} elevation={0}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            Signal Chain Builder
          </Typography>
          <IconButton onClick={loadData}>
            <Renew size={18} />
          </IconButton>
        </Box>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Enhanced A/B Mode Panel */}
      <Box sx={{ px: 2, py: 1 }}>
        <ABQuickToggle
          chains={chains.map(c => ({ id: c.id, name: c.name, pluginCount: c.plugins?.length || 0 }))}
          chainAId={selectedChainIdA || undefined}
          chainBId={selectedChainIdB || undefined}
          blendPosition={currentBlend}
          enabled={abModeEnabled}
          dspLoadA={dspLoadA}
          dspLoadB={dspLoadB}
          onChainAChange={(id) => {
            setSelectedChainIdA(id);
            const chain = chains.find(c => c.id === id);
            if (chain) setSelectedChain(chain);
          }}
          onChainBChange={setSelectedChainIdB}
          onBlendChange={handleBlendChange}
          onToggle={setAbModeEnabled}
          onSwap={() => {
            const tempA = selectedChainIdA;
            setSelectedChainIdA(selectedChainIdB);
            setSelectedChainIdB(tempA);
          }}
          compact
        />
      </Box>

      {/* Main Content - Three Panel Layout */}
      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        {/* Left Panel: Chains List */}
        <Paper
          sx={{
            width: 280,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          elevation={0}
        >
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle1" fontWeight="bold">
              Chains ({chains.length})
            </Typography>
          </Box>
          <List sx={{ flexGrow: 1, overflow: 'auto', py: 0 }}>
            {chains.map((chain) => {
              const hasActiveChain = chains.some(c => c.is_active && c.id !== chain.id);
              const buttonTooltip = chain.is_active
                ? 'Deactivate'
                : hasActiveChain
                  ? 'Switch to this chain (will deactivate current)'
                  : 'Activate';

              return (
                <ListItem
                  key={chain.id}
                  component="div"
                  onClick={() => {
                    setSelectedChain(chain);
                    // Also set as Chain A when in A/B mode
                    if (abModeEnabled) {
                      setSelectedChainIdA(chain.id);
                    }
                  }}
                  sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    cursor: 'pointer',
                    bgcolor: selectedChain?.id === chain.id ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <ListItemText
                    primary={chain.name}
                    secondary={
                      <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                        {chain.is_active && (
                          <Chip label="Active" color="success" size="small" />
                        )}
                        <Chip label={`${chain.plugins?.length || 0} plugins`} size="small" />
                        {chain.is_active && (
                          <LatencyBadge chainId={chain.id} />
                        )}
                      </Stack>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title={buttonTooltip}>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleChain(chain.id, chain.is_active);
                        }}
                        color={hasActiveChain && !chain.is_active ? 'warning' : 'default'}
                      >
                        {chain.is_active ? <StopFilled size={18} /> : <PlayFilled size={18} />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChain(chain.id);
                        }}
                      >
                        <Delete size={18} />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
            {chains.length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No chains"
                  secondary="Create a new chain to get started"
                />
              </ListItem>
            )}
          </List>
        </Paper>

        {/* Center Panel: Visual Chain Display */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedChain ? (
            <>
              {/* Chain Controls */}
              <Paper sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }} elevation={0}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    {selectedChain.name}
                  </Typography>
                  <Button
                    startIcon={<Save size={16} />}
                    onClick={() => setSavePresetDialogOpen(true)}
                    size="small"
                  >
                    Save Preset
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<Add size={16} />}
                    onClick={() => setAddPluginDialogOpen(true)}
                    size="small"
                  >
                    Add Plugin
                  </Button>
                </Stack>
              </Paper>

              {/* Signal Chain Visualization - React Flow */}
              {abModeEnabled && chainB ? (
                /* A/B Unified Routing View - Single canvas showing parallel signal flow */
                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
                  {/* A/B Routing Header */}
                  <Box sx={{
                    p: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                  }}>
                    <Chip
                      label={`A: ${selectedChain.name}`}
                      size="small"
                      color="primary"
                      sx={{ fontWeight: 'bold' }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Split → Parallel Processing → Blend
                    </Typography>
                    <Chip
                      label={`B: ${chainB.name}`}
                      size="small"
                      color="secondary"
                      sx={{ fontWeight: 'bold' }}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      Blend: {100 - currentBlend}% A / {currentBlend}% B
                    </Typography>
                  </Box>
                  {/* Unified A/B Flow Canvas */}
                  <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    <ChainFlowCanvas
                      nodes={abFlowNodes}
                      edges={abFlowEdges}
                      onNodesChange={(updatedNodes) => {
                        setAbFlowNodes(updatedNodes);
                      }}
                      onNodeClick={(node) => {
                        if (node.type === 'audioPlugin') {
                          openPluginParameters(node.data.plugin);
                        }
                      }}
                      onNodeContextMenu={(node) => {
                        if (node.type === 'audioPlugin') {
                          setSelectedPlugin(node.data.plugin);
                          setInsertTargetPlugin(buildPluginOrderRef(node.data.plugin));
                          setInsertDialogOpen(true);
                        }
                      }}
                      onDrop={async (pluginUri, position) => {
                        // Determine which chain to add to based on Y position
                        // Top half = Chain A, Bottom half = Chain B
                        const addToChainA = position.y < 90;
                        const targetChain = addToChainA ? selectedChain : chainB;
                        if (targetChain) {
                          try {
                            await chainsApi.addPlugin(targetChain.id, pluginUri);
                            const updated = await chainsApi.get(targetChain.id);
                            if (addToChainA) {
                              setSelectedChain(updated);
                            } else {
                              setChainB(updated);
                            }
                            setAddPluginDialogOpen(false);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : `Failed to add plugin to Chain ${addToChainA ? 'A' : 'B'}`);
                          }
                        }
                      }}
                    />
                  </Box>
                </Box>
              ) : (
                /* Single Chain View with Latency Overlay and Automation Timeline */
                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
                  {/* Chain Flow Canvas */}
                  <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    <ChainFlowCanvas
                      nodes={flowNodes}
                      edges={flowEdges}
                      onNodesChange={(updatedNodes) => {
                        setFlowNodes(updatedNodes);
                        if (selectedChain) {
                          saveNodePositions(selectedChain.id, updatedNodes);
                        }
                      }}
                      onNodeClick={(node) => {
                        if (node.type === 'audioPlugin') {
                          openPluginParameters(node.data.plugin);
                        }
                      }}
                      onNodeContextMenu={(node) => {
                        if (node.type === 'audioPlugin') {
                          setSelectedPlugin(node.data.plugin);
                          setInsertTargetPlugin(buildPluginOrderRef(node.data.plugin));
                          setInsertDialogOpen(true);
                        }
                      }}
                      onDrop={async (pluginUri, position) => {
                        if (selectedChain) {
                          try {
                            await chainsApi.addPlugin(selectedChain.id, pluginUri);
                            const updated = await chainsApi.get(selectedChain.id);
                            setSelectedChain(updated);
                            setAddPluginDialogOpen(false);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to add plugin');
                          }
                        }
                      }}
                      onNodeDragStop={async (updatedNodes) => {
                        if (selectedChain) {
                          try {
                            const newOrder = flowToChainOrder(updatedNodes);
                            await chainsApi.reorderPlugins(selectedChain.id, newOrder);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to reorder plugins');
                            const updated = await chainsApi.get(selectedChain.id);
                            setSelectedChain(updated);
                          }
                        }
                      }}
                    />
                  </Box>

                  {/* Latency Overlay - Shows cumulative latency across plugins */}
                  <LatencyOverlay
                    plugins={(selectedChain?.plugins || []).map((p: any) => ({
                      uri: p.uri,
                      name: p.name,
                      latencySamples: pluginPerformance[getPluginIdentityKey(p)]?.latencySamples
                        ?? pluginPerformance[p.uri]?.latencySamples
                        ?? 0,
                      isCompensated: true,
                    }))}
                    sampleRate={48000}
                    position="bottom"
                    pdcEnabled
                  />

                  {/* Automation Timeline - Collapsible */}
                  {automationTimelineExpanded && (
                    <AutomationTimeline
                      lanes={[]}
                      isPlaying={automationPlaying}
                      isRecording={automationRecording}
                      loopEnabled={automationLoopEnabled}
                      currentTime={automationCurrentTime}
                      duration={automationDuration}
                      onPlay={() => setAutomationPlaying(!automationPlaying)}
                      onStop={() => {
                        setAutomationPlaying(false);
                        setAutomationRecording(false);
                        setAutomationCurrentTime(0);
                      }}
                      onRecord={() => {
                        setAutomationRecording(!automationRecording);
                        if (!automationPlaying) setAutomationPlaying(true);
                      }}
                      onToggleLoop={() => setAutomationLoopEnabled(!automationLoopEnabled)}
                      onSeek={(time) => setAutomationCurrentTime(time)}
                      onAddLane={() => {
                        // Open parameter selector dialog for automation lane
                        setAutomationLaneDialogOpen(true);
                      }}
                      onDeleteLane={(laneId) => {
                        automationApi.deleteLane(laneId).catch(() => {});
                        // Also remove from armed lanes if present
                        setAutomationArmedLanes(prev => {
                          const next = new Set(prev);
                          next.delete(laneId);
                          return next;
                        });
                      }}
                      onToggleLaneEnabled={async (laneId) => {
                        // Fetch lane, toggle enabled, and recreate with same points
                        try {
                          const lane = await automationApi.getLane(laneId);
                          await automationApi.deleteLane(laneId);
                          await automationApi.createLane({
                            parameter_id: laneId,
                            points: lane.points,
                            enabled: !lane.enabled,
                            loop_start: lane.loop_start,
                            loop_end: lane.loop_end,
                          });
                        } catch (err) {
                          setError('Failed to toggle lane enabled state');
                        }
                      }}
                      onToggleLaneArmed={(laneId) => {
                        // Armed state is local to UI for recording
                        setAutomationArmedLanes(prev => {
                          const next = new Set(prev);
                          if (next.has(laneId)) {
                            next.delete(laneId);
                          } else {
                            next.add(laneId);
                          }
                          return next;
                        });
                      }}
                      onAddPoint={(laneId, time, value) => {
                        automationApi.addPoint(laneId, time, value).catch(() => {});
                      }}
                      onMovePoint={(laneId, pointId, time, value) => {
                        // Move = delete old + add new at new position
                        automationApi.addPoint(laneId, time, value).catch(() => {});
                      }}
                      onDeletePoint={(laneId, pointId) => {
                        // pointId contains the time for the point
                        const time = typeof pointId === 'number' ? pointId : parseFloat(pointId);
                        if (!isNaN(time)) {
                          automationApi.removePoint(laneId, time).catch(() => {});
                        }
                      }}
                      onChangeCurve={async (laneId, pointId, curve) => {
                        // Curve changes require re-adding the point with new curve type
                        try {
                          const lane = await automationApi.getLane(laneId);
                          // Find the point by ID (which contains the time)
                          const time = typeof pointId === 'number' ? pointId : parseFloat(pointId);
                          const point = lane.points.find(p => Math.abs(p.time - time) < 0.001);
                          if (point) {
                            // Remove old point and add with new curve
                            await automationApi.removePoint(laneId, point.time);
                            await automationApi.addPoint(laneId, point.time, point.value, curve);
                          }
                        } catch (err) {
                          setError('Failed to update curve type');
                        }
                      }}
                      defaultCollapsed={false}
                      position="bottom"
                      expandedSize={200}
                    />
                  )}
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
              <Typography variant="body1" color="text.secondary">
                Select a chain to view details
              </Typography>
            </Box>
          )}
        </Box>

        {/* Right Panel: Parameter Controls (Drawer) */}
        <Drawer
          anchor="right"
          open={parametersPanelOpen}
          onClose={() => setParametersPanelOpen(false)}
          variant="persistent"
          sx={{
            '& .MuiDrawer-paper': {
              width: 360,
              position: 'relative',
              height: '100%',
            },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Glyph icon={Settings} color="primary.main" />
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Parameters
              </Typography>
              <IconButton onClick={() => setParametersPanelOpen(false)} size="small">
                <Close size={18} />
              </IconButton>
            </Box>

            {pluginDetails ? (
              <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  {pluginDetails.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                  {pluginDetails.author}
                </Typography>
                
                {/* Plugin CPU Badge */}
                <Box sx={{ my: 1 }}>
                  <PluginCpuBadge pluginUri={pluginDetails.uri} showText />
                </Box>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ my: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search parameters"
                    value={paramSearch}
                    onChange={(e) => setParamSearch(e.target.value)}
                  />
                  <Chip
                    label={`Pinned (${pinnedParams.length})`}
                    size="small"
                    color={pinnedParams.length ? 'primary' : 'default'}
                  />
                </Stack>

                <Divider sx={{ my: 2 }} />
                
                {/* Envelope Follower for this plugin */}
                <EnvelopeFollowerPanel
                  parameterId={`${pluginDetails.uri}:master`}
                  parameterName={`${pluginDetails.name} - Master`}
                  compact
                />
                
                <Divider sx={{ my: 2 }} />

                {pluginDetails.parameters && pluginDetails.parameters.length > 0 ? (
                  <Stack spacing={3}>
                    {pluginDetails.parameters
                      .filter((param) => {
                        if (!paramSearch.trim()) return true;
                        const q = paramSearch.toLowerCase();
                        return param.name.toLowerCase().includes(q) || param.symbol.toLowerCase().includes(q);
                      })
                      .sort((a, b) => {
                        const aPinned = pinnedParams.includes(a.symbol);
                        const bPinned = pinnedParams.includes(b.symbol);
                        if (aPinned && !bPinned) return -1;
                        if (!aPinned && bPinned) return 1;
                        return 0;
                      })
                      .map((param, idx) => (
                        <Box key={param.symbol} sx={{ border: pinnedParams.includes(param.symbol) ? 1 : 0, borderColor: 'primary.main', borderRadius: 1, p: pinnedParams.includes(param.symbol) ? 1 : 0 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Typography variant="caption" color="text.secondary">{param.symbol}</Typography>
                              {/* LFO Quick Button for this parameter */}
                              <LFOQuickButton
                                parameterId={`${pluginDetails.uri}:${param.symbol}`}
                                parameterName={param.name}
                                currentValue={selectedPlugin?.parameters?.[param.symbol] ?? param.default}
                                size="small"
                              />
                            </Stack>
                            <Button size="small" variant={pinnedParams.includes(param.symbol) ? 'contained' : 'text'} onClick={() => togglePinParam(param.symbol)}>
                              {pinnedParams.includes(param.symbol) ? 'Unpin' : 'Pin'}
                            </Button>
                          </Stack>
                          <ParameterControl
                            param={param}
                            value={selectedPlugin?.parameters?.[param.symbol] ?? param.default}
                            onChange={(value) => handleParameterChange(param.index ?? idx, value)}
                          />
                        </Box>
                      ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No parameters available
                  </Typography>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Select a plugin to view parameters
                </Typography>
              </Box>
            )}
          </Box>
        </Drawer>
      </Box>

      {/* Insert Utility Dialog */}
      <Dialog open={insertDialogOpen} onClose={() => { setInsertDialogOpen(false); setInsertTargetPlugin(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Insert Utility Before Selected</DialogTitle>
        <DialogContent dividers>
          {utilityPlugins.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No utility plugins available.</Typography>
          ) : (
            <List sx={{ maxHeight: 360, overflow: 'auto' }}>
              {utilityPlugins.map((plugin) => (
                <ListItem
                  key={plugin.uri}
                  button
                  onClick={() => handleInsertUtility(plugin.uri)}
                >
                  <ListItemText
                    primary={getDisplayPluginName(plugin.name, plugin.uri)}
                    secondary={`${sanitizeRestrictedDisplayText(plugin.author)} • ${plugin.category}`}
                  />
                  <Chip label={`${plugin.in_ports} in / ${plugin.out_ports} out`} size="small" />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setInsertDialogOpen(false); setInsertTargetPlugin(null); }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Add Plugin Dialog - Unified PluginChooser */}
      <PluginChooser
        mode="dialog"
        open={addPluginDialogOpen}
        onClose={() => setAddPluginDialogOpen(false)}
        onSelect={(uri) => handleAddPlugin(uri)}
        plugins={unifiedPlugins}
        showQuickAdd={true}
        showPreviewPanel={true}
        allowDragDrop={true}
        targetChainId={selectedChain?.id}
      />

      {/* Save Preset Dialog */}
      <Dialog open={savePresetDialogOpen} onClose={() => setSavePresetDialogOpen(false)}>
        <DialogTitle>Save Chain as Preset</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Preset Name"
            fullWidth
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSavePreset();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSavePresetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSavePreset} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Audio Configuration Dialog */}
      <AudioConfigDialog
        open={audioConfigDialogOpen}
        onClose={() => setAudioConfigDialogOpen(false)}
        onApply={async (config) => {
          try {
            await audioApi.configure({
              sampleRate: config.sampleRate,
              bufferSize: config.bufferSize,
            });
            setAudioConfigDialogOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply audio configuration');
          }
        }}
      />
      {/* Automation Lane Parameter Selector Dialog */}
      <Dialog
        open={automationLaneDialogOpen}
        onClose={() => setAutomationLaneDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Automation Lane</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a parameter to automate:
          </Typography>
          {selectedChain?.plugins && selectedChain.plugins.length > 0 ? (
            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
              {selectedChain.plugins.map((plugin) => (
                <Box key={getPluginIdentityKey(plugin)} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    {getDisplayPluginName(plugin.name, plugin.uri)}
                  </Typography>
                  <Box sx={{ pl: 2 }}>
                    {plugin.parameters?.map((param) => {
                      const pluginPosition = typeof plugin.position === 'number' ? plugin.position : undefined;
                      const paramId = `${plugin.uri}:${param.index}${pluginPosition !== undefined ? `@${pluginPosition}` : ''}`;
                      return (
                        <Button
                          key={`${getPluginIdentityKey(plugin)}:${param.index}`}
                          variant="outlined"
                          size="small"
                          fullWidth
                          sx={{ mb: 0.5, justifyContent: 'flex-start', textTransform: 'none' }}
                          onClick={async () => {
                            try {
                              await automationApi.createLane({
                                parameter_id: paramId,
                                plugin_uri: plugin.uri,
                                plugin_position: pluginPosition,
                                param_index: param.index,
                                param_name: param.name,
                                points: [],
                                enabled: true,
                              });
                              setAutomationLaneDialogOpen(false);
                            } catch (err) {
                              setError('Failed to create automation lane');
                            }
                          }}
                        >
                          {param.name}
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                            {param.min.toFixed(1)} - {param.max.toFixed(1)}
                          </Typography>
                        </Button>
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No plugins in the current chain. Add plugins first to create automation lanes.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutomationLaneDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
        </>
      )}
    </Box>
  );
}
