import { Dialog, DialogDismiss, DialogHeading, DialogProvider, useDialogStore } from '@ariakit/react'
import { Copy, X } from '@phosphor-icons/react'
import type { Plugin } from '../../map2/types'
import { useToasts } from './Toasts'

interface PluginDetailsModalProps {
  plugin: Plugin | null
  open: boolean
  onClose: () => void
  onAdd?: (uri: string) => void
}

export function PluginDetailsModal({ plugin, open, onClose, onAdd }: PluginDetailsModalProps) {
  const dialog = useDialogStore({ open, setOpen: (open) => !open && onClose() })
  const { pushToast } = useToasts()

  const copyUri = () => {
    if (plugin) {
      navigator.clipboard.writeText(plugin.uri)
      pushToast('URI copied to clipboard', 'info')
    }
  }

  if (!plugin) return null

  return (
    <DialogProvider store={dialog}>
      <Dialog store={dialog} className="modal" backdrop={<div className="modal-backdrop" />}>
        <div className="modal-header">
          <DialogHeading className="modal-title">{plugin.name}</DialogHeading>
          <DialogDismiss className="btn btn-ghost btn-sm">
            <X size={16} weight="bold" />
          </DialogDismiss>
        </div>

        <div className="modal-body">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <span className="muted">{plugin.author}</span>
            <span className="pill">{plugin.category}</span>
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
                      <span className="param-range">{param.min} – {param.max} (default: {param.default})</span>
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

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={copyUri}>
            <Copy size={14} weight="duotone" /> Copy URI
          </button>
          {onAdd && (
            <button className="btn btn-primary" onClick={() => onAdd(plugin.uri)}>
              Add to Chain
            </button>
          )}
        </div>
      </Dialog>
    </DialogProvider>
  )
}
