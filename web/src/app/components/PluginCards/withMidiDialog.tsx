/**
 * withMidiDialog HOC
 *
 * Higher-Order Component that wraps a plugin card component and adds
 * the MIDI CC Mapping Dialog functionality.
 *
 * Usage:
 * ```tsx
 * const PLUGIN_URI = 'map2://juce/dynamics/compressor'
 * const PLUGIN_PARAMS = [
 *   { index: 0, name: 'Threshold', symbol: 'threshold' },
 *   { index: 1, name: 'Ratio', symbol: 'ratio' },
 * ]
 * export default withMidiDialog(CompressorCard, PLUGIN_URI, PLUGIN_PARAMS)
 * ```
 */

import { useState, useMemo, useCallback, type ComponentType } from 'react'
import type { Plugin, PluginParameter } from '../../../map2/types'
import { MidiMappingDialog } from './Dialogs/MidiMappingDialog'

/** Simplified parameter definition for native JUCE cards */
export interface PluginParamDef {
  index: number
  name: string
  symbol: string
}

interface WithMidiDialogProps {
  plugin?: Plugin
  chainId?: number
}

export function withMidiDialog<P extends WithMidiDialogProps>(
  WrappedComponent: ComponentType<P & { onOpenMidiMappings?: () => void }>,
  pluginUri: string,
  parameterDefs?: PluginParamDef[]
) {
  // Pre-compute static plugin for cards with parameterDefs (outside component)
  const staticPlugin: Plugin | null = parameterDefs && parameterDefs.length > 0
    ? {
        uri: pluginUri,
        name: extractPluginName(pluginUri),
        author: 'MAP2',
        category: 'effect',
        class_label: 'Effect',
        version: '1.0',
        license: 'MIT',
        has_ui: false,
        in_ports: 2,
        out_ports: 2,
        parameters: parameterDefs.map((p) => ({
          index: p.index,
          name: p.name,
          symbol: p.symbol,
          min: 0,
          max: 1,
          default: 0,
          is_toggled: false,
          is_log: false,
        })),
      }
    : null

  function ComponentWithMidiDialog(props: P) {
    const [dialogOpen, setDialogOpen] = useState(false)

    // Use static plugin if available, otherwise fall back to props.plugin
    const pluginForDialog = useMemo<Plugin>(() => {
      if (props.plugin?.parameters?.length) {
        return props.plugin
      }

      if (staticPlugin) {
        return staticPlugin
      }

      if (props.plugin) {
        return props.plugin
      }

      // Return empty plugin as fallback
      return {
        uri: pluginUri,
        name: extractPluginName(pluginUri),
        author: 'MAP2',
        category: 'effect',
        class_label: 'Effect',
        version: '1.0',
        license: 'MIT',
        has_ui: false,
        in_ports: 2,
        out_ports: 2,
        parameters: [],
      }
    }, [props.plugin])

    // Memoize callbacks to prevent unnecessary re-renders
    const handleOpenDialog = useCallback(() => setDialogOpen(true), [])
    const handleCloseDialog = useCallback(() => setDialogOpen(false), [])

    return (
      <>
        <WrappedComponent
          {...props}
          onOpenMidiMappings={handleOpenDialog}
        />
        <MidiMappingDialog
          isOpen={dialogOpen}
          onClose={handleCloseDialog}
          plugin={pluginForDialog}
          pluginUri={pluginUri}
          chainId={props.chainId}
        />
      </>
    )
  }

  // Set display name for debugging
  const wrappedName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
  ComponentWithMidiDialog.displayName = `withMidiDialog(${wrappedName})`

  return ComponentWithMidiDialog
}

/** Extract a human-readable name from a plugin URI */
function extractPluginName(uri: string): string {
  // map2://juce/dynamics/compressor -> Compressor
  const parts = uri.split('/')
  const lastPart = parts[parts.length - 1] || 'Plugin'
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/-/g, ' ')
}

export default withMidiDialog
