/**
 * Plugin tooltip showing technical details on hover
 */

import type { ChainPlugin, Plugin } from '../../../map2/types'
import { getIconForCategory } from './icons'
import { getDisplayPluginName } from '../../../map2/displayNames'

interface PluginTooltipContentProps {
  plugin: ChainPlugin
  meta?: Plugin
}

/**
 * Format latency in samples and milliseconds
 */
function formatLatency(samples: number | undefined, sampleRate = 48000): string {
  if (!samples) return 'N/A'
  const ms = (samples / sampleRate) * 1000
  return `${samples} smp (${ms.toFixed(1)}ms)`
}

/**
 * Format CPU percentage
 */
function formatCpu(cpu: number | undefined): string {
  if (cpu === undefined || cpu === null) return 'N/A'
  return `${cpu.toFixed(1)}%`
}

/**
 * Get port configuration string
 */
function formatPorts(inPorts?: number, outPorts?: number): string {
  const input = inPorts ?? 0
  const output = outPorts ?? 0
  if (input === output) return `${input}×${output}`
  return `${input}→${output}`
}

/**
 * Tooltip content component - renders the technical details
 */
export function PluginTooltipContent({ plugin, meta }: PluginTooltipContentProps) {
  const Icon = getIconForCategory(meta?.category || meta?.class_label)
  const name = getDisplayPluginName(meta?.name || plugin.name || plugin.uri.split('/').pop() || 'Unknown', plugin.uri)
  const category = meta?.category || meta?.class_label || 'Effect'
  const format = plugin.format || meta?.format || 'LV2'
  const paramCount = meta?.parameters?.length || Object.keys(plugin.parameters || {}).length

  return (
    <div className="plugin-tooltip">
      {/* Header */}
      <div className="plugin-tooltip-header">
        <Icon className="plugin-tooltip-icon" />
        <div className="plugin-tooltip-title">
          <div className="plugin-tooltip-name">{name}</div>
          <div className="plugin-tooltip-category">{category}</div>
        </div>
      </div>

      {/* Technical Details Grid */}
      <div className="plugin-tooltip-grid">
        <div className="plugin-tooltip-row">
          <span className="plugin-tooltip-label">Format</span>
          <span className="plugin-tooltip-value">{format}</span>
        </div>
        <div className="plugin-tooltip-row">
          <span className="plugin-tooltip-label">Ports</span>
          <span className="plugin-tooltip-value">
            {formatPorts(plugin.in_ports ?? meta?.in_ports, plugin.out_ports ?? meta?.out_ports)}
          </span>
        </div>
        <div className="plugin-tooltip-row">
          <span className="plugin-tooltip-label">CPU</span>
          <span className="plugin-tooltip-value">{formatCpu(plugin.cpu_percent)}</span>
        </div>
        <div className="plugin-tooltip-row">
          <span className="plugin-tooltip-label">Latency</span>
          <span className="plugin-tooltip-value">{formatLatency(plugin.latency_samples)}</span>
        </div>
        <div className="plugin-tooltip-row">
          <span className="plugin-tooltip-label">Status</span>
          <span className={`plugin-tooltip-value ${plugin.bypassed ? 'bypassed' : 'active'}`}>
            {plugin.bypassed ? 'BYPASSED' : 'ACTIVE'}
          </span>
        </div>
        <div className="plugin-tooltip-row">
          <span className="plugin-tooltip-label">Params</span>
          <span className="plugin-tooltip-value">{paramCount}</span>
        </div>
      </div>

      {/* Badges for special features */}
      {(plugin.latency_compensated || plugin.sidechain_source) && (
        <div className="plugin-tooltip-badges">
          {plugin.latency_compensated && (
            <span className="plugin-tooltip-badge pdc">PDC</span>
          )}
          {plugin.sidechain_source && (
            <span className="plugin-tooltip-badge sidechain">
              SC: {plugin.sidechain_source}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
