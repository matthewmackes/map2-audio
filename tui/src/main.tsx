#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import { App } from './App'
import { configureNodeMap2Runtime } from './runtime/map2NodeRuntime'

const runtime = configureNodeMap2Runtime()

render(<App apiBase={runtime.apiBase} />)
