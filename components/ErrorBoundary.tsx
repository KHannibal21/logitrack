import React, { Component, ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import ErrorFallback from './ErrorFallback';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Uncaught error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Render a functional fallback that can use hooks safely
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children as ReactNode;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  message: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
