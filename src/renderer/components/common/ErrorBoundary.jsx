import React from 'react';
import { Alert, Button, Container } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

/**
 * Catches render-time errors so a crashing component shows a message and the error
 * details instead of an empty window.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logError('Unhandled rendering error:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <Container className="p-4">
        <Alert variant="danger">
          <Alert.Heading>حدث خطأ غير متوقع في الواجهة</Alert.Heading>
          <p className="mb-3">{error.message}</p>
          <Button variant="outline-danger" onClick={this.handleReload}>
            إعادة تحميل التطبيق
          </Button>
        </Alert>
      </Container>
    );
  }
}

export default ErrorBoundary;
