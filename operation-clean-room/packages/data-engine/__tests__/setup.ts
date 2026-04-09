/**
 * Vitest test setup for @clean-room/data-engine.
 *
 * This file is loaded before all test suites.  Use it to configure global
 * test utilities, shared fixtures, and environment setup.
 */

import { beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// Ensure tests run with a predictable timezone
process.env.TZ = 'UTC';

// Suppress console output during tests unless DEBUG is set
if (!process.env.DEBUG) {
  beforeAll(() => {
    globalThis.__originalConsoleLog = console.log;
    globalThis.__originalConsoleWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};
  });

  afterAll(() => {
    if (globalThis.__originalConsoleLog) {
      console.log = globalThis.__originalConsoleLog;
    }
    if (globalThis.__originalConsoleWarn) {
      console.warn = globalThis.__originalConsoleWarn;
    }
  });
}

// ---------------------------------------------------------------------------
// Global type augmentation for suppressed console
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __originalConsoleLog: typeof console.log | undefined;
  // eslint-disable-next-line no-var
  var __originalConsoleWarn: typeof console.warn | undefined;
}
