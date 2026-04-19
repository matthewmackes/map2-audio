import { useEffect, useMemo, useState } from 'react'
import { Button, ComposedModal, ModalBody, ModalFooter, ModalHeader, Search, Tab, TabList, TabPanel, TabPanels, Tabs } from '@carbon/react'

import { PluginAppearanceIcon } from './PluginAppearanceIcon'
import { CARBON_ICON_OPTIONS, CATEGORY_ICON_OPTIONS, type PluginAppearanceIconOption, resolvePluginAppearanceIconOption } from '../../utils/pluginAppearanceIcons'
import './PluginAppearanceControls.css'

const MAX_CUSTOM_SVG_BYTES = 32 * 1024

interface CustomUploadResult {
  identifier: string
  customSvg?: string | null
}

interface IconPickerModalProps {
  open: boolean
  pluginName: string
  currentIdentifier?: string | null
  currentCustomSvg?: string | null
  fallbackCategory?: string
  onClose: () => void
  onSelect: (selection: { identifier: string; customSvg?: string | null }) => void | Promise<void>
  onUploadCustomIcon?: (file: File) => Promise<CustomUploadResult>
}

function filterOptions(options: PluginAppearanceIconOption[], query: string): PluginAppearanceIconOption[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return options
  }

  return options.filter((option) =>
    [option.label.toLowerCase(), option.identifier.toLowerCase(), ...option.keywords.map((keyword) => keyword.toLowerCase())].some((value) =>
      value.includes(normalizedQuery),
    ),
  )
}

async function readSvgFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read SVG file.'))
    reader.readAsText(file)
  })
}

export function IconPickerModal({
  open,
  pluginName,
  currentIdentifier,
  currentCustomSvg,
  fallbackCategory,
  onClose,
  onSelect,
  onUploadCustomIcon,
}: IconPickerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(currentIdentifier ?? null)
  const [customFile, setCustomFile] = useState<File | null>(null)
  const [customSvgPreview, setCustomSvgPreview] = useState(currentCustomSvg ?? '')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedIndex(0)
    setSearchQuery('')
    setSelectedIdentifier(currentIdentifier ?? null)
    setCustomFile(null)
    setCustomSvgPreview(currentCustomSvg ?? '')
    setUploadError(null)
  }, [currentCustomSvg, currentIdentifier, open])

  const filteredCategoryOptions = useMemo(() => filterOptions(CATEGORY_ICON_OPTIONS, searchQuery), [searchQuery])
  const filteredCarbonOptions = useMemo(() => filterOptions(CARBON_ICON_OPTIONS, searchQuery), [searchQuery])
  const resolvedSelection = resolvePluginAppearanceIconOption(selectedIdentifier)

  const handleFileChange = async (fileList: FileList | null) => {
    const nextFile = fileList?.[0] ?? null
    setCustomFile(nextFile)
    setUploadError(null)

    if (!nextFile) {
      setCustomSvgPreview(currentCustomSvg ?? '')
      return
    }

    if (nextFile.size > MAX_CUSTOM_SVG_BYTES) {
      setUploadError('Custom SVG uploads must stay below 32KB.')
      setCustomSvgPreview('')
      return
    }

    const nextText = await readSvgFile(nextFile)
    if (!nextText.trim().startsWith('<svg')) {
      setUploadError('Only SVG uploads are supported.')
      setCustomSvgPreview('')
      return
    }

    setCustomSvgPreview(nextText)
  }

  const handleConfirm = async () => {
    setUploadError(null)
    setIsSubmitting(true)

    try {
      if (customFile && onUploadCustomIcon) {
        const uploaded = await onUploadCustomIcon(customFile)
        await onSelect({ identifier: uploaded.identifier, customSvg: uploaded.customSvg ?? customSvgPreview })
        onClose()
        return
      }

      if (selectedIdentifier) {
        await onSelect({ identifier: selectedIdentifier, customSvg: currentIdentifier === selectedIdentifier ? currentCustomSvg : undefined })
      }
      onClose()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to save icon override.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ComposedModal open={open} size="lg" onClose={onClose}>
      <ModalHeader
        title="Pick plugin icon"
        label={pluginName}
        closeModal={onClose}
      />
      <ModalBody hasScrollingContent>
        <div className="plugin-appearance__icon-modal">
          <div className="plugin-appearance__preview-card plugin-appearance__preview-card--icon">
            <div className="plugin-appearance__preview-icon">
              <PluginAppearanceIcon
                identifier={selectedIndex === 2 ? (customSvgPreview ? 'custom:preview' : currentIdentifier) : selectedIdentifier}
                customSvg={selectedIndex === 2 ? customSvgPreview : currentCustomSvg}
                fallbackCategory={fallbackCategory}
                size={36}
              />
            </div>
            <div>
              <strong>{resolvedSelection?.label ?? 'Current plugin icon'}</strong>
              <p>{selectedIdentifier ?? 'Using the category fallback icon.'}</p>
            </div>
          </div>

          <Tabs selectedIndex={selectedIndex} onChange={({ selectedIndex: nextIndex }) => setSelectedIndex(nextIndex)}>
            <TabList aria-label="Plugin icon sources" contained>
              <Tab>Category SVGs</Tab>
              <Tab>Carbon icons</Tab>
              <Tab>Custom SVG</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <Search
                  id="plugin-icon-category-search"
                  labelText="Search category SVG icons"
                  placeholder="Search category icons"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                />
                <div className="plugin-appearance__icon-grid">
                  {filteredCategoryOptions.map((option) => (
                    <button
                      key={option.identifier}
                      type="button"
                      className={`plugin-appearance__icon-option${selectedIdentifier === option.identifier ? ' plugin-appearance__icon-option--selected' : ''}`}
                      onClick={() => setSelectedIdentifier(option.identifier)}
                    >
                      <option.Icon size={28} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </TabPanel>
              <TabPanel>
                <Search
                  id="plugin-icon-carbon-search"
                  labelText="Search Carbon icons"
                  placeholder="Search Carbon icons"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                />
                <div className="plugin-appearance__icon-grid">
                  {filteredCarbonOptions.map((option) => (
                    <button
                      key={option.identifier}
                      type="button"
                      className={`plugin-appearance__icon-option${selectedIdentifier === option.identifier ? ' plugin-appearance__icon-option--selected' : ''}`}
                      onClick={() => setSelectedIdentifier(option.identifier)}
                    >
                      <option.Icon size={28} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </TabPanel>
              <TabPanel>
                <div className="plugin-appearance__upload-stack">
                  <label className="plugin-appearance__color-field" htmlFor="plugin-icon-upload">
                    <span>Upload SVG icon</span>
                    <input
                      id="plugin-icon-upload"
                      type="file"
                      accept=".svg,image/svg+xml"
                      onChange={(event) => void handleFileChange(event.currentTarget.files)}
                    />
                  </label>
                  <p className="plugin-appearance__helper-copy">Custom uploads are stored as <code>custom:&lt;hash&gt;</code> identifiers after validation.</p>
                  <div className="plugin-appearance__preview-card plugin-appearance__preview-card--upload">
                    <PluginAppearanceIcon
                      identifier={customSvgPreview ? 'custom:preview' : null}
                      customSvg={customSvgPreview}
                      fallbackCategory={fallbackCategory}
                      size={40}
                    />
                    <div>
                      <strong>{customFile?.name ?? 'No SVG selected'}</strong>
                      <p>{customFile ? `${Math.round(customFile.size / 1024)} KB` : 'Choose a small SVG to preview it before confirming.'}</p>
                    </div>
                  </div>
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>

          {uploadError ? <p className="plugin-appearance__error-copy">{uploadError}</p> : null}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleConfirm()}
          disabled={!selectedIdentifier && !customSvgPreview && !customFile}
        >
          {isSubmitting ? 'Saving…' : 'Use icon'}
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}
