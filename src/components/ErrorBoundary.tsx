import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('💥 ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-red-950 border border-red-500 rounded-2xl p-6 max-w-lg w-full">
            <h2 className="text-red-300 font-bold text-lg mb-2">Erreur dans l'éditeur</h2>
            <pre className="text-red-200 text-xs whitespace-pre-wrap break-words">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}