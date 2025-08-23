import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error('Unhandled error in renderer process:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#fff', backgroundColor: '#333', height: '100vh' }}>
          <h1>حدث خطأ غير متوقع</h1>
          <p>عفواً، حدث خطأ ما في التطبيق. الرجاء محاولة إعادة تشغيل البرنامج.</p>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px', color: '#ccc' }}>
            <summary>تفاصيل الخطأ</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.error && this.state.error.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
