import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  title?: string
  message?: string
  actionLabel?: string
  onAction?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage?: string
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected render error',
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep stack details available in browser console for diagnosis.
    console.error('[UI] Render error captured by ErrorBoundary:', error, info)
  }

  private handleAction = () => {
    this.setState({ hasError: false, errorMessage: undefined })
    this.props.onAction?.()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const {
      title = 'Something went wrong',
      message = 'A rendering error occurred. You can retry this view or reload the page.',
      actionLabel = 'Retry',
    } = this.props

    return (
      <div
        role="alert"
        style={{
          minHeight: 260,
          width: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: 20,
        }}
      >
        <div
          style={{
            width: 'min(640px, 100%)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            borderRadius: 12,
            background: 'rgba(15, 23, 42, 0.92)',
            padding: 20,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
          }}
        >
          <h2 style={{ margin: 0, color: '#fecaca', fontSize: 20 }}>{title}</h2>
          <p style={{ margin: '10px 0 0 0', color: '#cbd5e1', lineHeight: 1.5 }}>{message}</p>
          {this.state.errorMessage && (
            <p style={{ margin: '8px 0 0 0', color: '#fca5a5', fontSize: 13, fontFamily: 'monospace' }}>
              {this.state.errorMessage}
            </p>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={this.handleAction}
              style={{
                border: '1px solid rgba(147, 197, 253, 0.5)',
                background: 'rgba(59, 130, 246, 0.16)',
                color: '#dbeafe',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              {actionLabel}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'rgba(30, 41, 59, 0.6)',
                color: '#e2e8f0',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
