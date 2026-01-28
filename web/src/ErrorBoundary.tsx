import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          minHeight: '100vh'
        }}>
          <h1 style={{ color: '#ff6060' }}>Something went wrong</h1>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px' }}>
            <summary style={{ cursor: 'pointer', marginBottom: '10px' }}>
              Error Details
            </summary>
            <div style={{
              backgroundColor: '#2a2a2a',
              padding: '15px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '14px'
            }}>
              <p><strong>Error:</strong></p>
              <p>{this.state.error?.toString()}</p>
              <p style={{ marginTop: '15px' }}><strong>Stack Trace:</strong></p>
              <p>{this.state.error?.stack}</p>
              {this.state.errorInfo && (
                <>
                  <p style={{ marginTop: '15px' }}><strong>Component Stack:</strong></p>
                  <p>{this.state.errorInfo.componentStack}</p>
                </>
              )}
            </div>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
