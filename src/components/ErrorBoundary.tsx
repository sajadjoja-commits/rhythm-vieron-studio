import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleTryRecover = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleResetApp = async () => {
    if (confirm("هل أنت متأكد من رغبتك في إعادة تعيين التطبيق؟ سيتم مسح بيانات المسودات المحلية لإصلاح الأعطال المستعصية.")) {
      try {
        // Clear local storage
        localStorage.clear();
        
        // Clear all IndexedDB databases
        const dbs = await window.indexedDB.databases();
        for (const db of dbs) {
          if (db.name) window.indexedDB.deleteDatabase(db.name);
        }

        // Unregister service workers
        if (navigator.serviceWorker) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        }

        // Clear cache storage
        if (window.caches) {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
          }
        }

        alert("تمت إعادة تعيين التطبيق بنجاح. سيتم الآن إعادة التشغيل.");
        window.location.reload();
      } catch (err) {
        alert("حدث خطأ أثناء مسح البيانات، سيتم إعادة تحميل الصفحة على أي حال.");
        window.location.reload();
      }
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-6 selection:bg-primary selection:text-white" dir="rtl">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl animate-in fade-in duration-300">
            {/* Warning Icon */}
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Error Messages */}
            <h1 className="text-2xl font-extrabold tracking-tight text-center mb-3 text-white">
              حدث خطأ غير متوقع في النظام
            </h1>
            <p className="text-sm text-zinc-400 text-center mb-6 leading-relaxed">
              نعتذر عن ذلك! لقد واجه التطبيق مشكلة تقنية مفاجئة تمنعه من العمل بشكل طبيعي. يمكنك محاولة الحلول التالية لإصلاح المشكلة فوراً.
            </p>

            {/* Collapsible Error Code */}
            {this.state.error && (
              <div className="mb-6">
                <div className="text-xs text-zinc-500 font-mono mb-2 flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                  <span className="text-destructive font-semibold">Error Log:</span>
                  <span className="truncate max-w-[250px]">{this.state.error.message}</span>
                </div>
                <pre className="text-[11px] font-mono p-4 bg-zinc-950 rounded-xl overflow-x-auto text-zinc-400 border border-zinc-800 max-h-40 overflow-y-auto leading-normal">
                  {this.state.error.stack || this.state.error.toString()}
                  {this.state.errorInfo && `\nComponent Stack:\n${this.state.errorInfo.componentStack}`}
                </pre>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleTryRecover}
                className="w-full py-3.5 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold hover:bg-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                متابعة وإصلاح الخطأ فوراً (بدون إعادة التحميل)
              </button>

              <button
                onClick={this.handleReload}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                </svg>
                إعادة تحميل التطبيق
              </button>
              
              <button
                onClick={this.handleResetApp}
                className="w-full py-3.5 rounded-2xl bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer border border-zinc-700/50"
              >
                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                إعادة تعيين كاملة للتطبيق (حل جذري)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
