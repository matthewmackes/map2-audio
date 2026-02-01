/**
 * GridMidiMappingsPanel Component
 * Grid-styled side panel for viewing/editing MIDI CC mappings
 */

import { memo } from 'react'
import { Music, X, Trash2, Settings2 } from 'lucide-react'

export interface MidiMapping {
  id: string
  parameterName: string
  pluginName: string
  pluginUri: string
  ccNumber: number
  channel: number
  min: number
  max: number
  inverted: boolean
}

export interface GridMidiMappingsPanelProps {
  mappings: MidiMapping[]
  onClose: () => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<MidiMapping>) => void
}

export const GridMidiMappingsPanel = memo(function GridMidiMappingsPanel({
  mappings,
  onClose,
  onDelete,
  onUpdate,
}: GridMidiMappingsPanelProps) {
  return (
    <div className="grid-midi-panel">
      {/* Header */}
      <div className="grid-midi-panel-header">
        <Music size={20} style={{ color: 'var(--primary)' }} />
        <h3>MIDI Mappings</h3>
        <button className="grid-midi-panel-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {/* Mappings List */}
      <div className="grid-midi-panel-content">
        {mappings.length === 0 ? (
          <div className="grid-midi-panel-empty">
            <Music size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
            <p>No MIDI mappings</p>
            <span>Use MIDI Learn mode to create mappings</span>
          </div>
        ) : (
          <div className="grid-midi-panel-list">
            {mappings.map((mapping) => (
              <div key={mapping.id} className="grid-midi-mapping-item">
                <div className="grid-midi-mapping-info">
                  <div className="grid-midi-mapping-param">{mapping.parameterName}</div>
                  <div className="grid-midi-mapping-plugin">{mapping.pluginName}</div>
                </div>
                <div className="grid-midi-mapping-cc">
                  <span className="grid-midi-cc-label">CC</span>
                  <span className="grid-midi-cc-value">{mapping.ccNumber}</span>
                  <span className="grid-midi-channel">Ch {mapping.channel}</span>
                </div>
                <div className="grid-midi-mapping-range">
                  <input
                    type="number"
                    className="grid-midi-range-input"
                    value={mapping.min}
                    onChange={(e) => onUpdate(mapping.id, { min: Number(e.target.value) })}
                    title="Min value"
                    min={0}
                    max={127}
                  />
                  <span>→</span>
                  <input
                    type="number"
                    className="grid-midi-range-input"
                    value={mapping.max}
                    onChange={(e) => onUpdate(mapping.id, { max: Number(e.target.value) })}
                    title="Max value"
                    min={0}
                    max={127}
                  />
                </div>
                <div className="grid-midi-mapping-actions">
                  <button
                    className={`grid-midi-btn ${mapping.inverted ? 'active' : ''}`}
                    onClick={() => onUpdate(mapping.id, { inverted: !mapping.inverted })}
                    title="Invert"
                  >
                    <Settings2 size={14} />
                  </button>
                  <button
                    className="grid-midi-btn delete"
                    onClick={() => onDelete(mapping.id)}
                    title="Delete mapping"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="grid-midi-panel-footer">
        <span>{mappings.length} mapping{mappings.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
})
