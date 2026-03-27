/**
 * PluginCardRouter Component
 *
 * Routes plugin editing to the appropriate card component based on
 * the plugin registry. Falls back to the generic editor if no
 * custom card or template is available.
 */

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pluginsApi, chainsApi } from '../../../map2/api'
import type { Plugin } from '../../../map2/types'
import { getPluginIdentityKeyFromParts } from '../../../map2/utils/pluginIdentity'
import { getPluginCardComponent, getTemplateCardComponent } from './registry'
import { getCategoryConfig, type PluginCardProps, type PluginCardTemplate, type PluginRealtimeData } from './types'
import { usePluginOutput } from '../../hooks/usePluginOutputs'

interface PluginCardRouterProps {
  plugin: Plugin
  onAddToChain?: (chainId: number) => void
  showAddToChain?: boolean
  compact?: boolean
  /** Force use of a specific template (for testing) */
  forceTemplate?: PluginCardTemplate
  /** Chain ID for bypass toggle functionality */
  chainId?: number
  /** Chain position for duplicate-URI disambiguation */
  pluginPosition?: number
  /** Callback when bypass state changes */
  onBypassChange?: (pluginUri: string, bypassed: boolean) => void
}

/**
 * Routes to the appropriate plugin card based on URI and category.
 * Uses the registry to find custom cards or category templates.
 */
export function PluginCardRouter({
  plugin,
  onAddToChain,
  showAddToChain = true,
  compact = false,
  forceTemplate,
  chainId,
  pluginPosition,
  onBypassChange,
}: PluginCardRouterProps) {
  const queryClient = useQueryClient()
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = catConfig.color

  // Parameter values state
  const [parameterValues, setParameterValues] = useState<Record<number, number>>({})

  // Initialize parameter values from plugin
  useEffect(() => {
    if (!plugin.parameters || plugin.parameters.length === 0) return

    const values: Record<number, number> = {}
    plugin.parameters.forEach(param => {
      values[param.index] = param.value ?? param.default
    })
    setParameterValues(values)
  }, [plugin])

  // Set parameter mutation
  const setParameterMutation = useMutation({
    mutationFn: async ({ paramIndex, value }: { paramIndex: number; value: number }) => {
      return pluginsApi.setParameterBatched(
        plugin.uri,
        paramIndex,
        value,
        plugin.instance_id,
        pluginPosition,
      )
    },
  })

  // Handle parameter change
  const handleParameterChange = useCallback((paramIndex: number, value: number) => {
    setParameterValues(prev => ({ ...prev, [paramIndex]: value }))
    setParameterMutation.mutate({ paramIndex, value })
  }, [setParameterMutation])

  // Handle parameter change end (flush batched updates)
  const handleParameterChangeEnd = useCallback(() => {
    pluginsApi.flushParameterBatch()
  }, [])

  // Bypass toggle mutation
  const bypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      if (!chainId) throw new Error('No chain context for bypass toggle')
      return chainsApi.togglePluginBypass(chainId, plugin.uri, bypass, pluginPosition)
    },
    onSuccess: (_, bypass) => {
      // Invalidate chain queries to refresh state
      queryClient.invalidateQueries({ queryKey: ['chains', chainId] })
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      onBypassChange?.(plugin.uri, bypass)
    },
  })

  // Handle bypass toggle
  const handleBypassToggle = useCallback((bypassed: boolean) => {
    if (chainId) {
      bypassMutation.mutate(bypassed)
    } else {
      console.warn('Bypass toggle requires chain context')
    }
  }, [chainId, bypassMutation])

  // Get real-time output data for this plugin
  const pluginOutput = usePluginOutput({
    uri: plugin.uri,
    instanceId: plugin.instance_id,
    pluginPosition,
  })
  const pluginRuntimeKey = getPluginIdentityKeyFromParts(plugin.uri, pluginPosition, plugin.instance_id)

  // Build real-time data from output ports
  const realtimeData = useMemo<PluginRealtimeData>(() => {
    // Find gain reduction port if available
    const grPort = plugin.ui_info?.output_ports?.find(p => p.designation === 'gain_reduction')
    const gainReduction = grPort ? (pluginOutput.outputPorts[grPort.index] ?? 0) : undefined

    // Find meter ports for input/output levels
    const inputMeterPort = plugin.ui_info?.output_ports?.find(
      p => p.designation === 'meter' && (p.symbol.includes('input') || p.name.toLowerCase().includes('input'))
    )
    const outputMeterPort = plugin.ui_info?.output_ports?.find(
      p => p.designation === 'meter' && (p.symbol.includes('output') || p.name.toLowerCase().includes('output'))
    )

    return {
      gainReduction,
      inputLevel: inputMeterPort ? pluginOutput.outputPorts[inputMeterPort.index] : undefined,
      outputLevel: outputMeterPort ? pluginOutput.outputPorts[outputMeterPort.index] : undefined,
      outputPorts: pluginOutput.outputPorts,
      peaks: Object.fromEntries(
        Object.entries(pluginOutput.peaks).map(([symbol, data]) => [symbol, {
          peak: data.peak,
          rms: data.rms,
          holdPeak: data.hold_peak,
          isClipping: data.is_clipping,
        }])
      ),
      connected: pluginOutput.connected,
    }
  }, [plugin.uri, plugin.ui_info, pluginOutput])

  // Get the card component from registry
  const CardComponent = useMemo(() => {
    if (forceTemplate) {
      return getTemplateCardComponent(forceTemplate)
    }
    return getPluginCardComponent(plugin.uri, plugin.category)
  }, [forceTemplate, plugin.uri, plugin.category])

  // Build props for the card
  const cardProps: PluginCardProps = {
    plugin,
    pluginPosition,
    parameterValues,
    onParameterChange: handleParameterChange,
    onParameterChangeEnd: handleParameterChangeEnd,
    onBypassToggle: handleBypassToggle,
    accentColor,
    disabled: false,
    compact,
    realtimeData,
  }

  // Render the appropriate card (may be a React.lazy component)
  if (CardComponent) {
    return (
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><div style={{ width: 24, height: 24, border: '3px solid rgba(150,150,150,0.2)', borderTopColor: '#90caf9', borderRadius: '50%', animation: 'map2spin .8s linear infinite' }} /></div>}>
        <CardComponent key={pluginRuntimeKey} {...cardProps} />
      </Suspense>
    )
  }

  // Fallback: Import and use the original LV2PluginParameterEditor
  // This is a dynamic import to avoid circular dependencies
  const LV2PluginParameterEditor = require('../LV2PluginParameterEditor').default

  return (
    <LV2PluginParameterEditor
      key={pluginRuntimeKey}
      plugin={plugin}
      instanceId={plugin.instance_id}
      pluginPosition={pluginPosition}
      onAddToChain={onAddToChain}
      showAddToChain={showAddToChain}
    />
  )
}

export default PluginCardRouter
