import { Modal, Tag } from '@carbon/react'
import type { Plugin } from '../../map2/types'
import { useToasts } from './Toasts'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'

interface PluginDetailsModalProps {
  plugin: Plugin | null
  open: boolean
  onClose: () => void
  onAdd?: (uri: string) => void
}

export function PluginDetailsModal({ plugin, open, onClose, onAdd }: PluginDetailsModalProps) {
  const { pushToast } = useToasts()

  const copyUri = () => {
    if (!plugin) {
      return
    }

    if (!navigator.clipboard?.writeText) {
      pushToast('Clipboard access is not available in this browser context.', 'warn')
      return
    }

    void navigator.clipboard.writeText(plugin.uri)
      .then(() => {
        pushToast('URI copied to clipboard', 'info')
      })
      .catch(() => {
        pushToast('Unable to copy plugin URI.', 'error')
      })
  }

  if (!plugin) return null
  const displayName = getDisplayPluginName(plugin.name, plugin.uri)
  const displayAuthor = sanitizeRestrictedDisplayText(plugin.author)

  return (
    <Modal
      open={open}
      size="sm"
      modalHeading={displayName}
      modalLabel={displayAuthor}
      primaryButtonText={onAdd ? 'Add to chain' : 'Close'}
      secondaryButtonText="Copy URI"
      onRequestClose={onClose}
      onSecondarySubmit={copyUri}
      onRequestSubmit={() => {
        if (onAdd) {
          onAdd(plugin.uri)
          return
        }
        onClose()
      }}
      selectorPrimaryFocus="#plugin-details-modal-content"
    >
      <div id="plugin-details-modal-content">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <span className="muted">{displayAuthor}</span>
          <Tag type="cool-gray" size="sm">
            {plugin.category}
          </Tag>
        </div>

        <div className="disclosure-section">
          <div className="disclosure-row">
            <span className="disclosure-label">URI</span>
            <code className="disclosure-value uri">{plugin.uri}</code>
          </div>
          <div className="disclosure-row">
            <span className="disclosure-label">Version</span>
            <span className="disclosure-value">{plugin.version || 'N/A'}</span>
          </div>
          <div className="disclosure-row">
            <span className="disclosure-label">License</span>
            <span className="disclosure-value">{plugin.license || 'Unknown'}</span>
          </div>
          <div className="disclosure-row">
            <span className="disclosure-label">Class</span>
            <span className="disclosure-value">{plugin.class_label}</span>
          </div>
          <div className="disclosure-row">
            <span className="disclosure-label">Ports</span>
            <span className="disclosure-value">{plugin.in_ports} in / {plugin.out_ports} out</span>
          </div>
          <div className="disclosure-row">
            <span className="disclosure-label">Has UI</span>
            <span className="disclosure-value">{plugin.has_ui ? 'Yes' : 'No'}</span>
          </div>

          {plugin.parameters.length > 0 && (
            <div className="disclosure-params">
              <span className="disclosure-label">Parameters ({plugin.parameters.length})</span>
              <ul className="param-list">
                {plugin.parameters.slice(0, 5).map((param, idx) => (
                  <li key={idx} className="param-item">
                    <span className="param-name">{param.name}</span>
                    <span className="param-range">{param.min} - {param.max} (default: {param.default})</span>
                  </li>
                ))}
                {plugin.parameters.length > 5 && (
                  <li className="param-item muted">...and {plugin.parameters.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
