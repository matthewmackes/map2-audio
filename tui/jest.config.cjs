module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(ink|ink-testing-library)/)',
  ],
  moduleNameMapper: {
    '^@tui/(.*)$': '<rootDir>/src/$1',
    '^@map2/(.*)$': '<rootDir>/../web/src/map2/$1',
    '^react$': '<rootDir>/node_modules/react',
  },
}
