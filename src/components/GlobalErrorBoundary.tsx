// @ts-nocheck
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { recoverStaleDeployment } from '../utils/deploymentRecovery';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
          <section className="w-full max-w-lg rounded-3xl border border-brand-border bg-brand-surface p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 mb-2">
              <AlertCircle size={32} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-brand-text">Component Display Error</h2>
              <p className="text-sm font-medium text-brand-text-secondary">
                We encountered an unexpected layout rendering issue.
              </p>
            </div>
            
            {this.state.error?.message && (
              <div className="bg-black/20 w-full p-4 rounded-xl border border-white/5 text-left overflow-x-auto">
                <code className="text-[10px] sm:text-xs text-red-400 font-mono">
                  {this.state.error.message}
                </code>
              </div>
            )}
            
            <button
              onClick={async () => {
                this.setState({ hasError: false, error: null });
                if (!await recoverStaleDeployment("boundary")) window.location.reload();
              }}
              className="mx-auto mt-6 flex items-center gap-2 rounded-full bg-brand-accent px-6 py-3 text-white"
            >
              <RotateCcw size={16} />
              <span className="uppercase text-xs tracking-widest font-bold">Reset Interface</span>
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
