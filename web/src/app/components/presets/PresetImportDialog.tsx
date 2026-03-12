import { useState, useCallback } from 'react'
import {
  FileUploaderDropContainer,
  FileUploaderItem,
  InlineLoading,
  InlineNotification,
  Modal,
  Tag,
} from '@carbon/react'
import './PresetImportDialog.css'

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

const ACCEPTED_EXTENSIONS = SUPPORTED_FORMATS.map((format) => format.ext)

export function PresetImportDialog({
  isOpen,
  onClose,
  onImportSuccess,
  targetPluginUri,
}: PresetImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resetState = useCallback(() => {
    setFile(null)
    setResult(null)
    setError(null)
    setImporting(false)
  }, [])

  const handleAddFiles = useCallback(
    (_event: React.SyntheticEvent<HTMLElement>, content: { addedFiles: Array<File & { invalidFileType?: boolean }> }) => {
      const selectedFile = content.addedFiles[0]
      if (selectedFile) {
        setFile(selectedFile)
        setResult(null)
        setError(null)
      }
    },
    [],
  )

  const handleImport = useCallback(async () => {
    if (!file) {
      return
    }

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

      const data = (await response.json()) as ImportResult | { detail?: string }

      if (!response.ok) {
        throw new Error((data as { detail?: string }).detail || 'Import failed')
      }

      const importResult = data as ImportResult
      setResult(importResult)

      if (importResult.success && onImportSuccess && importResult.preset_id) {
        onImportSuccess(importResult.preset_id, importResult.name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }, [file, onImportSuccess, targetPluginUri])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [onClose, resetState])

  return (
    <Modal
      open={isOpen}
      size="md"
      modalHeading="Import preset"
      modalLabel="Preset exchange"
      primaryButtonText={result?.success ? 'Done' : 'Import'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!result?.success && (!file || importing)}
      onRequestClose={handleClose}
      onSecondarySubmit={handleClose}
      onRequestSubmit={() => {
        if (result?.success) {
          handleClose()
          return
        }
        void handleImport()
      }}
      selectorPrimaryFocus="#preset-import-dropzone"
    >
      <div className="preset-import-dialog">
        <section className="preset-import-dialog__formats">
          <p>Supported formats</p>
          <div className="preset-import-dialog__format-tags">
            {SUPPORTED_FORMATS.map((format) => (
              <Tag key={format.ext} type={format.primary ? 'blue' : 'cool-gray'} size="sm">
                {format.ext}
              </Tag>
            ))}
          </div>
        </section>

        <FileUploaderDropContainer
          id="preset-import-dropzone"
          labelText="Drop preset file here or click to browse"
          accept={ACCEPTED_EXTENSIONS}
          multiple={false}
          onAddFiles={handleAddFiles}
          className="preset-import-dialog__dropzone"
        />

        {file && (
          <FileUploaderItem
            uuid={`preset-import-${file.name}`}
            name={file.name}
            status="edit"
            size="md"
            className="preset-import-dialog__file"
          />
        )}

        {importing && <InlineLoading description="Importing preset" status="active" />}

        {error && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Import failed"
            subtitle={error}
          />
        )}

        {result?.success && (
          <section className="preset-import-dialog__result">
            <InlineNotification
              kind="success"
              lowContrast
              hideCloseButton
              title="Imported successfully"
              subtitle={result.message || `${result.parameters_imported} parameters imported from ${result.original_format}`}
            />
            <div className="preset-import-dialog__result-details">
              <p>
                <strong>Name:</strong> {result.name}
              </p>
              <p>
                <strong>Format:</strong> {result.original_format}
              </p>
              <p>
                <strong>Parameters:</strong> {result.parameters_imported}
              </p>
            </div>
            {result.warnings.length > 0 && (
              <div className="preset-import-dialog__warnings">
                {result.warnings.map((warning) => (
                  <Tag key={warning} type="warm-gray" size="sm">
                    {warning}
                  </Tag>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}

export default PresetImportDialog
