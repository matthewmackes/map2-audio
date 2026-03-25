#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import { App } from './App'
import { configureNodeMap2Runtime } from './runtime/map2NodeRuntime'

interface CliOptions {
  help: boolean
  noColor: boolean
  verbose: boolean
  apiUrl?: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { help: false, noColor: false, verbose: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--no-color') {
      options.noColor = true
    } else if (arg === '--verbose') {
      options.verbose = true
    } else if (arg === '--api-url') {
      options.apiUrl = argv[index + 1]
      index += 1
    }
  }
  return options
}

const options = parseArgs(process.argv.slice(2))

if (options.help) {
  process.stdout.write(`MAP2 Ink TUI\n\nUsage: npm --prefix tui start -- [--api-url URL] [--no-color] [--verbose]\n`)
  process.exit(0)
}

if (options.noColor) {
  process.env.FORCE_COLOR = '0'
  process.env.NO_COLOR = '1'
}

if (options.verbose) {
  process.env.MAP2_TUI_VERBOSE = '1'
}

const runtime = configureNodeMap2Runtime({ apiBase: options.apiUrl })

render(<App apiBase={runtime.apiBase} />)
