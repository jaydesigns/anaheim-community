import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Something went wrong.'
    }
  }

  componentDidCatch(error) {
    console.error('ErrorBoundary caught an error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="event-card event-form event-form-error-state" role="alert">
          <p className="form-error">Unable to add event: {this.state.errorMessage}</p>
          <button type="button" className="submit-button" onClick={() => this.setState({ hasError: false, errorMessage: '' })}>
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
