import type { TestLoggingLibrary } from 'loglayer';
import { expect } from 'vitest';

/**
 * A matcher that allows defining expected log messages using a callback syntax
 *
 * @example
 * expect(testLogger).toHaveLogged((l) => {
 *   l.error('Error message', 'details');
 *   l.info('Info message');
 * });
 */
interface LogRecorder {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
}

interface LogEntry {
  level: string;
  data: unknown[];
}

type LogCallback = (logger: LogRecorder) => void;

expect.extend({
  toHaveLogged(received: TestLoggingLibrary, callback: LogCallback) {
    // Create a recorder to capture expected log calls
    const expectedLogs: LogEntry[] = [];

    // Create a logger proxy that records expected calls
    const recorder: LogRecorder = {
      error: (...args) => expectedLogs.push({ level: 'error', data: args }),
      warn: (...args) => expectedLogs.push({ level: 'warn', data: args }),
      info: (...args) => expectedLogs.push({ level: 'info', data: args }),
      debug: (...args) => expectedLogs.push({ level: 'debug', data: args }),
      log: (...args) => expectedLogs.push({ level: 'log', data: args }),
    };

    // Invoke the callback to record expected logs
    callback(recorder);

    // Get the actual logs from the TestLoggingLibrary
    const actualLogs = received.lines;

    return {
      pass: false,
      expected: expectedLogs.map((log) => [log.level, ...log.data]),
      actual: actualLogs.map((log) => [log.level, ...(log.data as unknown[])]),
      message: () => `Expected logs to include the specified messages.`,
    };
  },
});

// Augment the Vitest types using ES2015 module syntax
// Use module declaration merging instead of namespace
declare module 'vitest' {
  interface Assertion {
    toHaveLogged(callback: LogCallback): void;
  }

  interface AsymmetricMatchersContaining {
    toHaveLogged(callback: LogCallback): void;
  }
}
