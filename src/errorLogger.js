/**
 * Error Logging Service
 * خدمة توثيق الأخطاء للإنتاج
 */

class ErrorLogger {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
  }

  log(error, errorInfo, context = {}) {
    const errorEntry = {
      message: error?.message || 'Unknown error',
      stack: error?.stack || '',
      timestamp: new Date().toISOString(),
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
      errorInfo: errorInfo || {},
    };

    this.errors.push(errorEntry);

    // كل الأخطاء الزائدة
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // إرسال للخادم في الإنتاج
    if (process.env.NODE_ENV === 'production') {
      this.sendToServer(errorEntry);
    }

    // طباعة في التطوير
    if (process.env.NODE_ENV === 'development') {
      console.group('🔴 Error Logged');
      console.error('Error:', errorEntry);
      console.groupEnd();
    }
  }

  async sendToServer(errorEntry) {
    try {
      // يمكن تغيير العنوان إلى خادم خاص بك
      await fetch('/api/logs/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorEntry),
      });
    } catch (err) {
      console.error('Failed to send error log:', err);
    }
  }

  getErrors() {
    return this.errors;
  }

  clearErrors() {
    this.errors = [];
  }

  exportErrors() {
    return JSON.stringify(this.errors, null, 2);
  }
}

export const errorLogger = new ErrorLogger();
