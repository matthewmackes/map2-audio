/**
 * MidiMappingDialog Component
 *
 * Table-based dialog for statically assigning MIDI CC numbers and channels
 * to all controllable parameters of a Native Effect Card.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, Sliders, FloppyDisk, Trash, WarningCircle } from '@phosphor-icons/react'
import type { Plugin, PluginParameter, MIDIMappingV2, MIDICurveType } from '../../../../map2/types'
import { midiApiV2 } from '../../../../map2/api'

interface MidiMappingDialogProps {
  isOpen: boolean
  onClose: () => void
  plugin: Plugin
  pluginUri: string
  chainId?: number
}

interface MappingRow {
  paramIndex: number
  paramName: string
  paramSymbol: string
  cc: number | null
  channel: number // 0 = omni, 1-16
  scope: 'global' | 'chain'
  isEnabled: boolean
  mappingId?: number
  isDirty: boolean
  isNew: boolean
}

const CHANNEL_OPTIONS = [
  { value: 0, label: 'Omni' },
  ...Array.from({ length: 16 }, (_, i) => ({ value: i + 1, label: `Ch ${i + 1}` })),
]

export function MidiMappingDialog({
  isOpen,
  onClose,
  plugin,
  pluginUri,
  chainId,
}: MidiMappingDialogProps) {
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Track if we've already fetched for this dialog session
  const hasFetchedRef = useRef(false)
  const lastPluginUriRef = useRef<string>('')

  // Memoize parameters to prevent unnecessary re-renders
  const parameters = useMemo(() => plugin.parameters, [plugin.parameters])

  // Initialize mapping rows from plugin parameters
  const initializeMappings = useCallback(
    (existingMappings: MIDIMappingV2[]) => {
      const rows: MappingRow[] = parameters.map((param) => {
        // Find existing mapping for this parameter
        const existing = existingMappings.find(
          (m) => m.target_param_index === param.index
        )

        if (existing) {
          return {
            paramIndex: param.index,
            paramName: param.name,
            paramSymbol: param.symbol,
            cc: existing.cc,
            channel: existing.channel,
            scope: existing.chain_id === null ? 'global' : 'chain',
            isEnabled: existing.is_enabled,
            mappingId: existing.id,
            isDirty: false,
            isNew: false,
          }
        }

        return {
          paramIndex: param.index,
          paramName: param.name,
          paramSymbol: param.symbol,
          cc: null,
          channel: 0,
          scope: 'global',
          isEnabled: true,
          isDirty: false,
          isNew: true,
        }
      })

      setMappings(rows)
    },
    [parameters]
  )

  // Fetch existing mappings when dialog opens
  useEffect(() => {
    if (!isOpen) {
      // Reset fetch tracking when dialog closes
      hasFetchedRef.current = false
      return
    }

    // Skip if already fetched for this pluginUri in this dialog session
    if (hasFetchedRef.current && lastPluginUriRef.current === pluginUri) {
      return
    }

    const fetchMappings = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await midiApiV2.getMappings({ plugin_uri: pluginUri })
        initializeMappings(response.mappings)
        hasFetchedRef.current = true
        lastPluginUriRef.current = pluginUri
      } catch (err) {
        setError('Failed to load MIDI mappings')
        console.error('Error fetching MIDI mappings:', err)
        initializeMappings([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchMappings()
  }, [isOpen, pluginUri, initializeMappings])

  // Track unsaved changes
  useEffect(() => {
    const hasDirty = mappings.some((m) => m.isDirty)
    setHasUnsavedChanges(hasDirty)
  }, [mappings])

  // Update a mapping row
  const updateMapping = useCallback(
    (paramIndex: number, updates: Partial<MappingRow>) => {
      setMappings((prev) =>
        prev.map((row) =>
          row.paramIndex === paramIndex
            ? { ...row, ...updates, isDirty: true }
            : row
        )
      )
    },
    []
  )

  // Clear a mapping
  const clearMapping = useCallback((paramIndex: number) => {
    setMappings((prev) =>
      prev.map((row) =>
        row.paramIndex === paramIndex
          ? { ...row, cc: null, isDirty: true }
          : row
      )
    )
  }, [])

  // Save all changes
  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const dirtyRows = mappings.filter((m) => m.isDirty)

      for (const row of dirtyRows) {
        if (row.cc === null) {
          // Delete mapping if CC is cleared and mapping exists
          if (row.mappingId) {
            await midiApiV2.deleteMapping(row.mappingId)
          }
        } else if (row.mappingId && !row.isNew) {
          // Update existing mapping
          await midiApiV2.updateMapping(row.mappingId, {
            cc: row.cc,
            channel: row.channel,
            chain_id: row.scope === 'global' ? null : chainId ?? null,
            is_enabled: row.isEnabled,
          })
        } else {
          // Create new mapping
          await midiApiV2.createMapping({
            cc: row.cc,
            channel: row.channel,
            target_plugin_uri: pluginUri,
            target_param_index: row.paramIndex,
            target_param_symbol: row.paramSymbol,
            chain_id: row.scope === 'global' ? null : chainId ?? null,
            min_val: 0,
            max_val: 1,
            curve_type: 'linear' as MIDICurveType,
            invert: false,
            feedback_enabled: false,
            is_learned: false,
            is_enabled: row.isEnabled,
            name: `${plugin.name} - ${row.paramName}`,
          })
        }
      }

      // Refresh mappings after save
      const response = await midiApiV2.getMappings({ plugin_uri: pluginUri })
      initializeMappings(response.mappings)
      setHasUnsavedChanges(false)
    } catch (err) {
      setError('Failed to save MIDI mappings')
      console.error('Error saving MIDI mappings:', err)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle close with unsaved changes warning
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Discard them?')) {
        return
      }
    }
    onClose()
  }, [hasUnsavedChanges, onClose])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  if (!isOpen) return null

  return (
    <div className="midi-mapping-dialog-overlay" onClick={handleClose}>
      <div
        className="midi-mapping-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="midi-mapping-dialog-header">
          <div className="midi-mapping-dialog-title">
            <Sliders size={18} weight="duotone" />
            <span>MIDI Mappings - {plugin.name}</span>
          </div>
          <button
            className="midi-mapping-dialog-close"
            onClick={handleClose}
            title="Close"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="midi-mapping-dialog-error">
            <WarningCircle size={14} weight="duotone" />
            <span>{error}</span>
          </div>
        )}

        {/* Content */}
        <div className="midi-mapping-dialog-content">
          {isLoading ? (
            <div className="midi-mapping-dialog-loading">
              Loading mappings...
            </div>
          ) : mappings.length === 0 ? (
            <div className="midi-mapping-dialog-empty">
              This plugin has no mappable parameters.
            </div>
          ) : (
            <table className="midi-mapping-table">
              <thead>
                <tr>
                  <th className="col-param">Parameter</th>
                  <th className="col-cc">CC#</th>
                  <th className="col-channel">Channel</th>
                  <th className="col-scope">Scope</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((row) => (
                  <tr
                    key={row.paramIndex}
                    className={`${row.isDirty ? 'dirty' : ''} ${row.cc !== null ? 'mapped' : ''}`}
                  >
                    <td className="col-param">
                      <span className="param-name">{row.paramName}</span>
                    </td>
                    <td className="col-cc">
                      <input
                        type="number"
                        min={0}
                        max={127}
                        value={row.cc ?? ''}
                        placeholder="--"
                        onChange={(e) => {
                          const val = e.target.value
                          const cc = val === '' ? null : Math.max(0, Math.min(127, parseInt(val, 10)))
                          updateMapping(row.paramIndex, { cc: isNaN(cc as number) ? null : cc })
                        }}
                        className="cc-input"
                      />
                    </td>
                    <td className="col-channel">
                      <select
                        value={row.channel}
                        onChange={(e) =>
                          updateMapping(row.paramIndex, {
                            channel: parseInt(e.target.value, 10),
                          })
                        }
                        className="channel-select"
                        disabled={row.cc === null}
                      >
                        {CHANNEL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="col-scope">
                      <select
                        value={row.scope}
                        onChange={(e) =>
                          updateMapping(row.paramIndex, {
                            scope: e.target.value as 'global' | 'chain',
                          })
                        }
                        className="scope-select"
                        disabled={row.cc === null}
                      >
                        <option value="global">Global</option>
                        <option value="chain">Per-Chain</option>
                      </select>
                    </td>
                    <td className="col-actions">
                      {row.cc !== null && (
                        <button
                          className="clear-btn"
                          onClick={() => clearMapping(row.paramIndex)}
                          title="Clear mapping"
                        >
                          <Trash size={14} weight="duotone" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="midi-mapping-dialog-footer">
          <div className="footer-left">
            {hasUnsavedChanges && (
              <span className="unsaved-indicator">Unsaved changes</span>
            )}
          </div>
          <div className="footer-right">
            <button
              className="btn-cancel"
              onClick={handleClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className="btn-save"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving ? 'Saving...' : 'Save'}
              {!isSaving && <FloppyDisk size={14} weight="duotone" />}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .midi-mapping-dialog-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .midi-mapping-dialog {
          background: #0a0a0a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          width: 90%;
          max-width: 700px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .midi-mapping-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
        }

        .midi-mapping-dialog-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
          color: #f2f6ff;
        }

        .midi-mapping-dialog-title svg {
          color: var(--primary, #2563eb);
        }

        .midi-mapping-dialog-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .midi-mapping-dialog-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f2f6ff;
        }

        .midi-mapping-dialog-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: rgba(255, 51, 51, 0.15);
          border-bottom: 1px solid rgba(255, 51, 51, 0.3);
          color: #ff6b6b;
          font-size: 13px;
        }

        .midi-mapping-dialog-content {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }

        .midi-mapping-dialog-loading,
        .midi-mapping-dialog-empty {
          padding: 40px 20px;
          text-align: center;
          color: #6b7280;
          font-size: 14px;
        }

        .midi-mapping-table {
          width: 100%;
          border-collapse: collapse;
        }

        .midi-mapping-table thead {
          position: sticky;
          top: 0;
          background: #0a0a0a;
          z-index: 1;
        }

        .midi-mapping-table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #6b7280;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .midi-mapping-table td {
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          vertical-align: middle;
        }

        .midi-mapping-table tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .midi-mapping-table tr.mapped {
          background: rgba(37, 99, 235, 0.03);
        }

        .midi-mapping-table tr.dirty .param-name::after {
          content: '*';
          color: var(--warning, #ffaa00);
          margin-left: 4px;
        }

        .col-param {
          width: 40%;
        }

        .col-cc {
          width: 15%;
        }

        .col-channel {
          width: 18%;
        }

        .col-scope {
          width: 18%;
        }

        .col-actions {
          width: 9%;
          text-align: center;
        }

        .param-name {
          font-size: 13px;
          color: #e0e0e0;
        }

        .cc-input {
          width: 60px;
          padding: 6px 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.3);
          color: #f2f6ff;
          font-size: 13px;
          text-align: center;
        }

        .cc-input:focus {
          outline: none;
          border-color: var(--primary, #2563eb);
        }

        .cc-input::placeholder {
          color: #555;
        }

        .channel-select,
        .scope-select {
          padding: 6px 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.3);
          color: #f2f6ff;
          font-size: 12px;
          cursor: pointer;
        }

        .channel-select:disabled,
        .scope-select:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .channel-select:focus,
        .scope-select:focus {
          outline: none;
          border-color: var(--primary, #2563eb);
        }

        .clear-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: #666;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .clear-btn:hover {
          background: rgba(255, 51, 51, 0.15);
          color: #ff6b6b;
        }

        .midi-mapping-dialog-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
        }

        .footer-left {
          display: flex;
          align-items: center;
        }

        .unsaved-indicator {
          font-size: 12px;
          color: var(--warning, #ffaa00);
        }

        .footer-right {
          display: flex;
          gap: 10px;
        }

        .btn-cancel,
        .btn-save {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-cancel {
          background: rgba(255, 255, 255, 0.08);
          color: #9ca3af;
        }

        .btn-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
          color: #f2f6ff;
        }

        .btn-save {
          background: var(--primary, #2563eb);
          color: #000;
        }

        .btn-save:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .btn-save:disabled,
        .btn-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}

export default MidiMappingDialog
