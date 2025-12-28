/**
 * Structured logging utility for frontend.
 * Provides consistent logging with categories, log levels, and optional data.
 * Logs are only shown in development mode or when debug is enabled.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get the current log level from localStorage or default to 'info' in dev, 'warn' in prod
 */
function getLogLevel(): LogLevel {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('logLevel');
    if (stored && stored in LOG_LEVELS) {
      return stored as LogLevel;
    }
  }
  // In development, default to 'info'; in production, default to 'warn'
  return import.meta.env.DEV ? 'info' : 'warn';
}

/**
 * Check if debug mode is enabled via localStorage or URL param
 */
function isDebugEnabled(): boolean {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('debug')) {
    return true;
  }
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'true') {
      return true;
    }
  }
  return false;
}

/**
 * Format log data for console output
 */
function formatData(data?: LogData): string {
  if (!data || Object.keys(data).length === 0) {
    return '';
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * Core logging function
 */
function log(level: LogLevel, category: string, message: string, data?: LogData): void {
  const currentLevel = getLogLevel();
  const debugEnabled = isDebugEnabled();
  
  // In production, only log if level >= current level OR debug is enabled
  if (!import.meta.env.DEV && !debugEnabled) {
    if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
      return;
    }
  }
  
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `[${timestamp}] [${category}]`;
  const dataStr = formatData(data);
  
  const consoleMethod = level === 'debug' ? 'log' : level;
  
  if (dataStr) {
    console[consoleMethod](`${prefix} ${message}`, data);
  } else {
    console[consoleMethod](`${prefix} ${message}`);
  }
}

/**
 * Structured logger for frontend application
 */
export const logger = {
  /**
   * Debug level - verbose output for development
   */
  debug: (category: string, message: string, data?: LogData): void => {
    log('debug', category, message, data);
  },

  /**
   * Info level - normal operational messages
   */
  info: (category: string, message: string, data?: LogData): void => {
    log('info', category, message, data);
  },

  /**
   * Warn level - potential issues or degraded functionality
   */
  warn: (category: string, message: string, data?: LogData): void => {
    log('warn', category, message, data);
  },

  /**
   * Error level - errors that need attention
   */
  error: (category: string, message: string, data?: LogData): void => {
    log('error', category, message, data);
  },

  /**
   * Enable debug mode programmatically
   */
  enableDebug: (): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('debug', 'true');
      console.log('[logger] Debug mode enabled. Refresh to see all logs.');
    }
  },

  /**
   * Disable debug mode
   */
  disableDebug: (): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('debug');
      console.log('[logger] Debug mode disabled.');
    }
  },

  /**
   * Set log level
   */
  setLevel: (level: LogLevel): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('logLevel', level);
      console.log(`[logger] Log level set to: ${level}`);
    }
  },
};

// Export for convenience
export type { LogLevel, LogData };
