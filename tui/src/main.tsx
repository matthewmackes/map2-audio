#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import { App } from './App'
import {
  buildHelpText,
  buildScreenListText,
  clearTerminalCanvas,
  CliUsageError,
  hasInteractiveTerminal,
  parseArgs,
} from './cli'
import { configureNodeMap2Runtime } from './runtime/map2NodeRuntime'

let options
try {
  options = parseArgs(process.argv.slice(2))
} catch (error) {
  if (error instanceof CliUsageError) {
    process.stderr.write(`${error.message}\n\n${buildHelpText()}`)
    process.exit(error.exitCode)
  }
  throw error
}

if (options.help) {
  process.stdout.write(buildHelpText())
  process.exit(0)
}

if (options.listScreens) {
  process.stdout.write(buildScreenListText())
  process.exit(0)
}

if (options.noColor) {
  process.env.FORCE_COLOR = '0'
  process.env.NO_COLOR = '1'
}

if (options.verbose) {
  process.env.MAP2_TUI_VERBOSE = '1'
}

if (!hasInteractiveTerminal()) {
  process.stderr.write('map2-tui requires an interactive terminal with raw-mode input support. Use --help or --list-screens for non-interactive output.\n')
  process.exit(1)
}

const runtime = configureNodeMap2Runtime({ apiBase: options.apiUrl })

if (options.clearScreen) {
  clearTerminalCanvas()
}

render(<App apiBase={runtime.apiBase} initialScreen={options.screen} />)
