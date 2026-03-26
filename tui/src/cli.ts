import { screenRegistry, screenRegistryById } from './navigation/screenRegistry'
import type { ScreenId } from './navigation/types'

const DEFAULT_SCREEN: ScreenId = 'home'

export interface CliOptions {
  help: boolean
  listScreens: boolean
  noColor: boolean
  verbose: boolean
  clearScreen: boolean
  screen: ScreenId
  apiUrl?: string
}

export class CliUsageError extends Error {
  readonly exitCode = 2

  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

interface CliIo {
  stdin: Pick<NodeJS.ReadStream, 'isTTY' | 'setRawMode'>
  stdout: Pick<NodeJS.WriteStream, 'isTTY' | 'write'>
}

function isScreenId(value: string): value is ScreenId {
  return value in screenRegistryById
}

function resolveScreenId(rawValue: string | undefined): ScreenId | null {
  const normalized = rawValue?.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return isScreenId(normalized) ? normalized : null
}

function readRequiredValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('-')) {
    throw new CliUsageError(`Missing value for ${option}`)
  }
  return value
}

function readScreenId(rawValue: string | undefined, option: string): ScreenId {
  const screenId = resolveScreenId(rawValue)
  if (!screenId) {
    throw new CliUsageError(`Unknown screen: ${rawValue ?? option}`)
  }
  return screenId
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    listScreens: false,
    noColor: false,
    verbose: false,
    clearScreen: true,
    screen: DEFAULT_SCREEN,
  }

  let positionalScreen: ScreenId | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--list-screens') {
      options.listScreens = true
      continue
    }

    if (arg === '--no-color') {
      options.noColor = true
      continue
    }

    if (arg === '--verbose') {
      options.verbose = true
      continue
    }

    if (arg === '--no-clear') {
      options.clearScreen = false
      continue
    }

    if (arg === '--api-url') {
      options.apiUrl = readRequiredValue(argv, index, '--api-url')
      index += 1
      continue
    }

    if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.slice('--api-url='.length)
      if (!options.apiUrl) {
        throw new CliUsageError('Missing value for --api-url')
      }
      continue
    }

    if (arg === '--screen') {
      const screenId = readScreenId(readRequiredValue(argv, index, '--screen'), '--screen')
      options.screen = screenId
      positionalScreen = screenId
      index += 1
      continue
    }

    if (arg.startsWith('--screen=')) {
      const screenId = readScreenId(arg.slice('--screen='.length), '--screen')
      options.screen = screenId
      positionalScreen = screenId
      continue
    }

    if (arg.startsWith('-')) {
      throw new CliUsageError(`Unknown option: ${arg}`)
    }

    const screenId = resolveScreenId(arg)
    if (!screenId) {
      throw new CliUsageError(`Unknown screen or option: ${arg}`)
    }
    if (positionalScreen && positionalScreen !== screenId) {
      throw new CliUsageError('Only one starting screen may be provided')
    }
    positionalScreen = screenId
    options.screen = screenId
  }

  return options
}

export function buildHelpText(): string {
  return [
    'MAP2 Ink TUI',
    '',
    'Usage: map2-tui [screen] [options]',
    '',
    'Options:',
    '  -h, --help           Show this help',
    '      --list-screens   Print available screen ids and exit',
    '      --screen SCREEN  Open a specific screen on launch',
    '      --api-url URL    Use a specific MAP2 API base URL',
    '      --no-color       Disable ANSI color output',
    '      --no-clear       Keep existing terminal contents on launch',
    '      --verbose        Enable verbose diagnostics',
    '',
    'Examples:',
    '  map2-tui',
    '  map2-tui diagnostics',
    '  map2-tui --screen tesira',
    '  map2-tui --api-url http://localhost:8080',
    '  map2-tui --list-screens',
    '',
    'Signal Chains Live is the default home screen. Keys 1-8 toggle bypass for the first 8 plugins in the active chain.',
    'Press q or Ctrl+Q inside the TUI to exit immediately.',
    '',
    'The interactive TUI clears the terminal canvas by default before rendering.',
  ].join('\n') + '\n'
}

export function buildScreenListText(): string {
  const width = screenRegistry.reduce((max, screen) => Math.max(max, screen.id.length), 0)
  const rows = screenRegistry.map((screen) => `${screen.id.padEnd(width)}  ${screen.description}`)
  return ['MAP2 Ink TUI Screens', '', ...rows].join('\n') + '\n'
}

export function hasInteractiveTerminal(io: CliIo = { stdin: process.stdin, stdout: process.stdout }): boolean {
  return Boolean(io.stdin.isTTY && io.stdout.isTTY && typeof io.stdin.setRawMode === 'function')
}

export function clearTerminalCanvas(stream: Pick<NodeJS.WriteStream, 'isTTY' | 'write'> = process.stdout): void {
  if (!stream.isTTY) {
    return
  }
  stream.write('\u001bc')
}
