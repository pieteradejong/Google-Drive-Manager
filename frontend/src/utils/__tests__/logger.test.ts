/**
 * Tests for the frontend logger utility.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger utility', () => {
  // Spy on console methods
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock console methods to prevent actual output during tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('basic logging', () => {
    it('should call console.info for info level', () => {
      logger.info('test', 'Test message');
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should call console.warn for warn level', () => {
      logger.warn('test', 'Warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should call console.error for error level', () => {
      logger.error('test', 'Error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should include category in log output', () => {
      logger.info('myCategory', 'Test message');
      // When no data, logger passes single string argument
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[myCategory]')
      );
    });

    it('should include message in log output', () => {
      logger.info('test', 'My specific message');
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('My specific message')
      );
    });
  });

  describe('logging with data', () => {
    it('should pass data object to console', () => {
      const testData = { key: 'value', count: 42 };
      logger.info('test', 'Message with data', testData);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.any(String),
        testData
      );
    });

    it('should handle undefined data', () => {
      logger.info('test', 'Message without data');
      // Should not throw
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should handle empty data object', () => {
      logger.info('test', 'Message with empty data', {});
      expect(consoleInfoSpy).toHaveBeenCalled();
    });
  });

  describe('debug mode', () => {
    it('should log debug messages when debug is enabled via localStorage', () => {
      localStorage.setItem('debug', 'true');
      logger.debug('test', 'Debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should include category in debug output', () => {
      localStorage.setItem('debug', 'true');
      logger.debug('debugCategory', 'Debug message');
      // When no data, logger passes single string argument
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[debugCategory]')
      );
    });
  });

  describe('log level configuration', () => {
    it('should allow setting log level via setLevel', () => {
      // This should not throw
      logger.setLevel('warn');
      expect(localStorage.getItem('logLevel')).toBe('warn');
    });

    it('should allow enabling debug mode via enableDebug', () => {
      logger.enableDebug();
      expect(localStorage.getItem('debug')).toBe('true');
    });

    it('should allow disabling debug mode via disableDebug', () => {
      localStorage.setItem('debug', 'true');
      logger.disableDebug();
      expect(localStorage.getItem('debug')).toBeNull();
    });
  });

  describe('timestamp formatting', () => {
    it('should include timestamp in log output', () => {
      logger.info('test', 'Message');
      // Timestamp format: HH:MM:SS.mmm - when no data, single argument
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/)
      );
    });
  });

  describe('error handling', () => {
    it('should not throw when logging with complex data', () => {
      const complexData = {
        nested: { deeply: { value: 123 } },
        array: [1, 2, 3],
        nullValue: null,
      };
      
      expect(() => {
        logger.info('test', 'Complex data', complexData);
      }).not.toThrow();
    });

    it('should handle circular references gracefully', () => {
      // Note: Our logger uses JSON.stringify which will fail on circular refs
      // but formatData has a try-catch, so it should not throw
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;
      
      // This should not throw, even with circular reference
      expect(() => {
        logger.info('test', 'Circular data', circular);
      }).not.toThrow();
    });
  });
});
