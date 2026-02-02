/**
 * PluginCardRouter Component
 *
 * Routes plugin editing to the appropriate card component based on
 * the plugin registry. Falls back to the generic editor if no
 * custom card or template is available.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pluginsApi } from '../../../map2/api'
import type { Plugin } from '../../../map2/types'
import { getPluginCardComponent } from './registry'
import { getCategoryConfig, type PluginCardProps } from './types'

interface PluginCardRouterProps {
  plugin: Plugin
  onAddToChain?: (chainId: number) => void
  showAddToChain?: boolean
  compact?: boolean
  /** Force use of a specific template (for testing) */
  forceTemplate?: string
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
      return pluginsApi.setParameterBatched(plugin.uri, paramIndex, value)
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

  // Handle bypass toggle
  const handleBypassToggle = useCallback((bypassed: boolean) => {
    // TODO: Implement bypass toggle via API
    console.log('Bypass toggle:', bypassed)
  }, [])

  // Get the card component from registry
  const CardComponent = useMemo(() => {
    return getPluginCardComponent(plugin.uri, plugin.category)
  }, [plugin.uri, plugin.category])

  // Build props for the card
  const cardProps: PluginCardProps = {
    plugin,
    parameterValues,
    onParameterChange: handleParameterChange,
    onParameterChangeEnd: handleParameterChangeEnd,
    onBypassToggle: handleBypassToggle,
    accentColor,
    disabled: false,
    compact,
  }

  // Render the appropriate card
  if (CardComponent) {
    return <CardComponent {...cardProps} />
  }

  // Fallback: Import and use the original LV2PluginParameterEditor
  // This is a dynamic import to avoid circular dependencies
  const LV2PluginParameterEditor = require('../LV2PluginParameterEditor').default

  return (
    <LV2PluginParameterEditor
      plugin={plugin}
      onAddToChain={onAddToChain}
      showAddToChain={showAddToChain}
    />
  )
}

export default PluginCardRouter
