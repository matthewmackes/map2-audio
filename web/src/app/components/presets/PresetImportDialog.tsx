/**
 * PresetImportDialog - Universal preset import with drag-and-drop
 *
 * Supports:
 * - MAP2UPF (.map2preset) - Primary format
 * - FXP/FXB (.fxp, .fxb) - VST2 legacy
 * - VST3 (.vstpreset) - Modern VST3
 * - LV2 (.lv2preset, .ttl) - Linux native
 * - JUCE (.jucepreset) - JUCE state files
 */

import { useState, useCallback, DragEvent, ChangeEvent } from 'react'
import { Upload, FileUp, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react'

interface PresetImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess?: (presetId: number, name: string) => void
  targetPluginUri?: string
}

interface ImportResult {
  success: boolean
  preset_id?: number
  name: string
  plugin_identifier: string
  original_format: string
  parameters_imported: number
  message: string
  warnings: string[]
}

const SUPPORTED_FORMATS = [
  { ext: '.map2preset', name: 'MAP2 Universal', primary: true },
  { ext: '.fxp', name: 'VST2 Preset' },
  { ext: '.fxb', name: 'VST2 Bank' },
  { ext: '.vstpreset', name: 'VST3 Preset' },
  { ext: '.lv2preset', name: 'LV2 Preset' },
  { ext: '.ttl', name: 'LV2 Turtle' },
  { ext: '.jucepreset', name: 'JUCE State' },
]

const ACCEPTED_EXTENSIONS = SUPPORTED_FORMATS.map(f => f.ext).join(',')

export function PresetImportDialog({
  isOpen,
  onClose,
  onImportSuccess,
  targetPluginUri,
}: PresetImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      setFile(droppedFile)
      setResult(null)
      setError(null)
    }
  }, [])

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
      setError(null)
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (!file) return

    setImporting(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const params = new URLSearchParams()
      if (targetPluginUri) {
        params.set('plugin_uri', targetPluginUri)
      }
      params.set('save_to_library', 'true')

      const response = await fetch(`/api/preset-exchange/import?${params}`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Import failed')
      }

      setResult(data)

      if (data.success && onImportSuccess && data.preset_id) {
        onImportSuccess(data.preset_id, data.name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }, [file, targetPluginUri, onImportSuccess])

  const handleClose = useCallback(() => {
    setFile(null)
    setResult(null)
    setError(null)
    onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary, #1e1e2e)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Import Preset</h2>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              color: 'var(--text-secondary, #888)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Supported Formats */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)', marginBottom: '8px' }}>
            Supported formats:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {SUPPORTED_FORMATS.map((fmt) => (
              <span
                key={fmt.ext}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  background: fmt.primary ? 'var(--accent, #7c3aed)' : 'var(--bg-tertiary, #2a2a3e)',
                  color: fmt.primary ? 'white' : 'var(--text-secondary, #888)',
                }}
              >
                {fmt.ext}
              </span>
            ))}
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('preset-file-input')?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent, #7c3aed)' : 'var(--border, #444)'}`,
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'var(--bg-hover, rgba(124, 58, 237, 0.1))' : 'transparent',
            transition: 'all 0.2s ease',
          }}
        >
          {file ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <FileUp size={40} style={{ color: 'var(--accent, #7c3aed)' }} />
              <span style={{ fontWeight: 500 }}>{file.name}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)' }}>
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Upload size={40} style={{ color: 'var(--text-secondary, #888)' }} />
              <span>Drop preset file here or click to browse</span>
            </div>
          )}
          <input
            id="preset-file-input"
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={18} style={{ color: '#ef4444' }} />
            <span style={{ color: '#ef4444' }}>{error}</span>
          </div>
        )}

        {/* Success */}
        {result?.success && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <CheckCircle size={18} style={{ color: '#22c55e' }} />
              <span style={{ color: '#22c55e', fontWeight: 500 }}>Imported successfully!</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)' }}>
              <div><strong>Name:</strong> {result.name}</div>
              <div><strong>Format:</strong> {result.original_format}</div>
              <div><strong>Parameters:</strong> {result.parameters_imported}</div>
            </div>
            {result.warnings.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#f59e0b' }}>
                {result.warnings.map((w, i) => (
                  <div key={i}>⚠️ {w}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <button
            onClick={handleClose}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border, #444)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-primary, #fff)',
            }}
          >
            {result?.success ? 'Done' : 'Cancel'}
          </button>
          {!result?.success && (
            <button
              onClick={handleImport}
              disabled={!file || importing}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '6px',
                border: 'none',
                background: file && !importing ? 'var(--accent, #7c3aed)' : 'var(--bg-tertiary, #2a2a3e)',
                cursor: file && !importing ? 'pointer' : 'not-allowed',
                color: 'white',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {importing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Import
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PresetImportDialog
