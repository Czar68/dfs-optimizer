/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts'],
  /** Playwright specs live under tests/playwright/ (Phase 25 — not Jest). */
  testPathIgnorePatterns: ['/node_modules/', '/tests/playwright/'],
  collectCoverage: false,
  verbose: true,
};
