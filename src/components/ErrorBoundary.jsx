import React from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from "../common/SafeIcon";

const { FiAlertTriangle, FiRefreshCw } = FiIcons;

/**
 * Error Boundary Component
 * معالجة أخطاء React في شجرة المكونات
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState((prevState) => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    console.error('Error Boundary caught an error:', error, errorInfo);

    // يمكن إرسال الخطأ إلى خدمة تتبع الأخطاء هنا
    // logErrorToService(error, errorInfo);
  }

  resetError() {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center px-4" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 border border-red-100">
            {/* Header */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <SafeIcon icon={FiAlertTriangle} className="text-4xl text-red-600" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">حدث خطأ ما</h1>
            <p className="text-gray-600 text-center mb-6">
              عذراً، حدث خطأ غير متوقع. الرجاء محاولة تحديث الصفحة.
            </p>

            {/* Error Details (Development) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-gray-100 rounded-lg p-4 mb-6 overflow-auto max-h-32">
                <p className="text-xs font-mono text-red-600 break-words">
                  <strong>الخطأ:</strong> {this.state.error.toString()}
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => this.resetError()}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <SafeIcon icon={FiRefreshCw} className="text-lg" />
                إعادة المحاولة
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors"
              >
                العودة للصفحة الرئيسية
              </button>
            </div>

            {/* Error Count Warning */}
            {this.state.errorCount > 3 && (
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ تكرر الخطأ عدة مرات. يرجى التواصل مع فريق الدعم إذا استمرت المشكلة.
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
