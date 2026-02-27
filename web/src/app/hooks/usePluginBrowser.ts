/**
 * usePluginBrowser - Multi-format plugin discovery and management
 *
 * Provides access to VST3, AudioUnit, LV2, and LADSPA plugins
 * with scanning, filtering, and loading capabilities.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames';

// Plugin format types
export type PluginFormat = 'VST3' | 'AudioUnit' | 'LV2' | 'LADSPA' | 'All';

// Plugin info from engine
export interface PluginInfo {
  uri: string;
  name: string;
  author: string;
  brand: string;
  category: string;
  version: string;
  format: PluginFormat;
  formatName: string;
  filePath: string;
  audioInputs: number;
  audioOutputs: number;
  hasMidiInput: boolean;
  hasMidiOutput: boolean;
  latencySamples: number;
  supportsDoublePrecision: boolean;
  numSidechainBuses: number;
}

// Plugin scan status
export interface ScanStatus {
  isScanning: boolean;
  progress: number;
  currentPath: string;
  totalFound: number;
  errors: string[];
}

// Filter options
export interface PluginFilter {
  format?: PluginFormat;
  category?: string;
  search?: string;
  hasAudioInput?: boolean;
  hasAudioOutput?: boolean;
  hasMidi?: boolean;
  hasSidechain?: boolean;
}

interface UsePluginBrowserOptions {
  /** Auto-refresh interval in ms (0 to disable) */
  refreshInterval?: number;
  /** Initial format filter */
  initialFormat?: PluginFormat;
}

export function usePluginBrowser(options: UsePluginBrowserOptions = {}) {
  const { refreshInterval = 0, initialFormat = 'All' } = options;
  const queryClient = useQueryClient();

  // Filter state
  const [filter, setFilter] = useState<PluginFilter>({
    format: initialFormat,
    search: '',
  });

  const sanitizePluginInfo = useCallback((plugin: PluginInfo): PluginInfo => ({
    ...plugin,
    name: getDisplayPluginName(plugin.name, plugin.uri),
    author: sanitizeRestrictedDisplayText(plugin.author),
    brand: sanitizeRestrictedDisplayText(plugin.brand),
  }), []);

  // Fetch all plugins
  const pluginsQuery = useQuery<PluginInfo[]>({
    queryKey: ['plugins', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/plugins/all');
      if (!res.ok) throw new Error('Failed to fetch plugins');
      const data = await res.json();
      return (data as PluginInfo[]).map(sanitizePluginInfo);
    },
    refetchInterval: refreshInterval || false,
    staleTime: 60000, // Cache for 1 minute
  });

  // Fetch VST3 plugins
  const vst3Query = useQuery<PluginInfo[]>({
    queryKey: ['plugins', 'vst3'],
    queryFn: async () => {
      const res = await fetch('/api/plugins/vst3');
      if (!res.ok) throw new Error('Failed to fetch VST3 plugins');
      const data = await res.json();
      return (data as PluginInfo[]).map(sanitizePluginInfo);
    },
    enabled: filter.format === 'VST3' || filter.format === 'All',
    staleTime: 60000,
  });

  // Fetch AudioUnit plugins
  const auQuery = useQuery<PluginInfo[]>({
    queryKey: ['plugins', 'au'],
    queryFn: async () => {
      const res = await fetch('/api/plugins/au');
      if (!res.ok) throw new Error('Failed to fetch AU plugins');
      const data = await res.json();
      return (data as PluginInfo[]).map(sanitizePluginInfo);
    },
    enabled: filter.format === 'AudioUnit' || filter.format === 'All',
    staleTime: 60000,
  });

  // Fetch LV2 plugins
  const lv2Query = useQuery<PluginInfo[]>({
    queryKey: ['plugins', 'lv2'],
    queryFn: async () => {
      const res = await fetch('/api/plugins/lv2');
      if (!res.ok) throw new Error('Failed to fetch LV2 plugins');
      const data = await res.json();
      return (data as PluginInfo[]).map(sanitizePluginInfo);
    },
    enabled: filter.format === 'LV2' || filter.format === 'All',
    staleTime: 60000,
  });

  // Fetch scan status
  const scanStatusQuery = useQuery<ScanStatus>({
    queryKey: ['plugins', 'scan-status'],
    queryFn: async () => {
      const res = await fetch('/api/plugins/scan-status');
      if (!res.ok) throw new Error('Failed to fetch scan status');
      return res.json();
    },
    refetchInterval: 1000, // Poll during scan
  });

  // Trigger plugin scan
  const scanMutation = useMutation({
    mutationFn: async (format?: PluginFormat) => {
      const url = format && format !== 'All'
        ? `/api/plugins/scan?format=${format}`
        : '/api/plugins/scan';
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start plugin scan');
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all plugin queries after scan
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  // Load plugin into chain
  const loadPluginMutation = useMutation({
    mutationFn: async (params: { uri: string; chainId?: string }) => {
      const res = await fetch('/api/plugins/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to load plugin');
      return res.json();
    },
  });

  // Get plugin info by URI
  const getPluginInfoMutation = useMutation({
    mutationFn: async (uri: string) => {
      const res = await fetch(`/api/plugins/info/${encodeURIComponent(uri)}`);
      if (!res.ok) throw new Error('Failed to get plugin info');
      return res.json();
    },
  });

  // Combine all plugins
  const allPlugins = useMemo(() => {
    return pluginsQuery.data || [];
  }, [pluginsQuery.data]);

  // Apply filters
  const filteredPlugins = useMemo(() => {
    let plugins = allPlugins;

    // Format filter
    if (filter.format && filter.format !== 'All') {
      plugins = plugins.filter(p => p.format === filter.format);
    }

    // Category filter
    if (filter.category) {
      plugins = plugins.filter(p =>
        p.category.toLowerCase().includes(filter.category!.toLowerCase())
      );
    }

    // Search filter
    if (filter.search) {
      const search = filter.search.toLowerCase();
      plugins = plugins.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.author.toLowerCase().includes(search) ||
        p.brand.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
      );
    }

    // Audio input filter
    if (filter.hasAudioInput !== undefined) {
      plugins = plugins.filter(p =>
        filter.hasAudioInput ? p.audioInputs > 0 : p.audioInputs === 0
      );
    }

    // Audio output filter
    if (filter.hasAudioOutput !== undefined) {
      plugins = plugins.filter(p =>
        filter.hasAudioOutput ? p.audioOutputs > 0 : p.audioOutputs === 0
      );
    }

    // MIDI filter
    if (filter.hasMidi !== undefined) {
      plugins = plugins.filter(p =>
        filter.hasMidi ? (p.hasMidiInput || p.hasMidiOutput) : (!p.hasMidiInput && !p.hasMidiOutput)
      );
    }

    // Sidechain filter
    if (filter.hasSidechain !== undefined) {
      plugins = plugins.filter(p =>
        filter.hasSidechain ? p.numSidechainBuses > 0 : p.numSidechainBuses === 0
      );
    }

    return plugins;
  }, [allPlugins, filter]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    allPlugins.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [allPlugins]);

  // Get unique brands/authors
  const brands = useMemo(() => {
    const b = new Set<string>();
    allPlugins.forEach(p => {
      if (p.brand) b.add(p.brand);
      else if (p.author) b.add(p.author);
    });
    return Array.from(b).sort();
  }, [allPlugins]);

  // Plugin counts by format
  const formatCounts = useMemo(() => {
    const counts: Record<PluginFormat, number> = {
      'All': allPlugins.length,
      'VST3': 0,
      'AudioUnit': 0,
      'LV2': 0,
      'LADSPA': 0,
    };

    allPlugins.forEach(p => {
      if (p.format in counts) {
        counts[p.format as PluginFormat]++;
      }
    });

    return counts;
  }, [allPlugins]);

  // Helper functions
  const setFormatFilter = useCallback((format: PluginFormat) => {
    setFilter(prev => ({ ...prev, format }));
  }, []);

  const setSearchFilter = useCallback((search: string) => {
    setFilter(prev => ({ ...prev, search }));
  }, []);

  const setCategoryFilter = useCallback((category: string | undefined) => {
    setFilter(prev => ({ ...prev, category }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilter({ format: 'All', search: '' });
  }, []);

  const scanPlugins = useCallback((format?: PluginFormat) => {
    return scanMutation.mutateAsync(format);
  }, [scanMutation]);

  const loadPlugin = useCallback((uri: string, chainId?: string) => {
    return loadPluginMutation.mutateAsync({ uri, chainId });
  }, [loadPluginMutation]);

  const getPluginInfo = useCallback((uri: string) => {
    return getPluginInfoMutation.mutateAsync(uri);
  }, [getPluginInfoMutation]);

  const refreshPlugins = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['plugins'] });
  }, [queryClient]);

  return {
    // Data
    plugins: filteredPlugins,
    allPlugins,
    categories,
    brands,
    formatCounts,

    // Filter state
    filter,
    setFilter,
    setFormatFilter,
    setSearchFilter,
    setCategoryFilter,
    clearFilters,

    // Scan status
    scanStatus: scanStatusQuery.data,
    isScanning: scanStatusQuery.data?.isScanning || false,

    // Loading states
    isLoading: pluginsQuery.isLoading,
    isError: pluginsQuery.isError,
    error: pluginsQuery.error,

    // Actions
    scanPlugins,
    loadPlugin,
    getPluginInfo,
    refreshPlugins,

    // Mutation states
    isScanningPlugins: scanMutation.isPending,
    isLoadingPlugin: loadPluginMutation.isPending,
  };
}

export default usePluginBrowser;
