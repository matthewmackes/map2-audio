import React from 'react'
import { Button, InlineNotification, Layer, Tile } from '@carbon/react'

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
          }}
        >
          <Layer>
            <Tile style={{ padding: 20 }}>
              <InlineNotification
                kind="error"
                lowContrast
                title={title}
                subtitle={message}
                hideCloseButton
              />
              {this.state.errorMessage && (
                <p
                  style={{
                    margin: 'var(--cds-spacing-04) 0 0 0',
                    color: 'var(--cds-text-secondary)',
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {this.state.errorMessage}
                </p>
              )}
              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button type="button" kind="primary" size="sm" onClick={this.handleAction}>
                  {actionLabel}
                </Button>
                <Button type="button" kind="secondary" size="sm" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              </div>
            </Tile>
          </Layer>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
