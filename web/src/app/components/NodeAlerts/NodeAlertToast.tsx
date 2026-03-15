import './NodeAlerts.css'

import { ToastNotification } from '@carbon/react'

import { useNodeAlertStore } from '../../stores/nodeAlertStore'

export function NodeAlertToast() {
  const toasts = useNodeAlertStore((state) => state.toasts)
  const removeToast = useNodeAlertStore((state) => state.removeToast)

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="node-alert-toast-stack" aria-live="assertive">
      {toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          kind="error"
          lowContrast
          timeout={8000}
          title="Node Critical"
          subtitle={`${toast.hostname}: ${toast.message}`}
          caption={new Date(toast.timestamp).toLocaleTimeString()}
          onClose={() => removeToast(toast.id)}
          onCloseButtonClick={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}

