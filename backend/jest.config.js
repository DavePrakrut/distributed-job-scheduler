module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/scheduler/**/*.ts',
    '!src/worker/**/*.ts',
    '!src/services/websocket.service.ts',
    '!src/config/swagger.ts',
  ],
};
