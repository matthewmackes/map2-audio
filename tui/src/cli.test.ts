import { buildHelpText, buildScreenListText, CliUsageError, parseArgs } from './cli'

describe('parseArgs', () => {
  it('defaults to the home screen with clean-canvas startup enabled', () => {
    expect(parseArgs([])).toEqual({
      help: false,
      listScreens: false,
      noColor: false,
      verbose: false,
      clearScreen: true,
      screen: 'home',
    })
  })

  it('supports screen selection via positional args and flags', () => {
    expect(parseArgs(['diagnostics']).screen).toBe('diagnostics')
    expect(parseArgs(['--screen', 'tesira']).screen).toBe('tesira')
    expect(parseArgs(['--screen=cluster']).screen).toBe('cluster')
  })

  it('supports the documented launcher flags', () => {
    expect(parseArgs(['--api-url', 'http://localhost:8080', '--no-color', '--verbose', '--no-clear'])).toEqual({
      help: false,
      listScreens: false,
      noColor: true,
      verbose: true,
      clearScreen: false,
      screen: 'home',
      apiUrl: 'http://localhost:8080',
    })
  })

  it('rejects unknown options and incomplete values', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(CliUsageError)
    expect(() => parseArgs(['--api-url'])).toThrow('Missing value for --api-url')
    expect(() => parseArgs(['--screen', 'bogus'])).toThrow('Unknown screen: bogus')
  })
})

describe('cli documentation builders', () => {
  it('renders help for map2-tui rather than the npm script', () => {
    const help = buildHelpText()
    expect(help).toContain('Usage: map2-tui [screen] [options]')
    expect(help).toContain('--list-screens')
    expect(help).toContain('--no-clear')
    expect(help).toContain('Press q or Ctrl+Q inside the TUI to exit immediately.')
    expect(help).not.toContain('npm --prefix tui start')
  })

  it('prints the available screen ids', () => {
    const output = buildScreenListText()
    expect(output).toContain('home')
    expect(output).toContain('diagnostics')
    expect(output).toContain('tesira')
  })
})
