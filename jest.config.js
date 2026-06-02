module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,
  setupFiles: ["./tests/env.setup.js"],
  testMatch: ["**/tests/**/*.test.js"],
  // Run test files serially to avoid port conflicts and simplify DB teardown
  maxWorkers: 1,
};
