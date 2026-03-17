/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts', '**/src/__tests__/**/*.test.ts'],
  collectCoverage: false,
  verbose: true,
  // Run tests in band so MSW server (listen/close) runs in a single process and teardown is clean.
  // Avoids "worker process has failed to exit gracefully" from server handle in worker teardown.
  maxWorkers: 1,
  // forceExit: true,
};
