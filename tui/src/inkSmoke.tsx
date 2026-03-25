import assert from 'node:assert/strict'
import React from 'react'
import { render } from 'ink-testing-library'
import { App } from './App'
import { FilterableList } from './components/FilterableList'
import { ProgressBar } from './components/ProgressBar'
import { TabBar } from './components/TabBar'
import { configureNodeMap2Runtime } from './runtime/map2NodeRuntime'

async function main(): Promise<void> {
  configureNodeMap2Runtime({ apiBase: 'http://localhost:8080' })

  const progress = render(<ProgressBar label="CPU" value={0.42} />)
  assert.match(progress.lastFrame() ?? '', /CPU/)
  progress.unmount()

  const tabs = render(<TabBar tabs={[{ id: 'home', label: 'Home' }, { id: 'cpu', label: 'CPU' }]} activeId="home" />)
  assert.match(tabs.lastFrame() ?? '', /Home/)
  tabs.unmount()

  const list = render(<FilterableList filter="ho" items={['Home', 'CPU']} activeIndex={0} />)
  assert.match(list.lastFrame() ?? '', /Home/)
  list.unmount()

  const app = render(<App apiBase="http://localhost:8080/api" />)
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const frame = app.lastFrame() ?? ''
  assert.match(frame, /MAP2 \/ Home/)
  assert.match(frame, /System Summary|Loading home screen/)
  app.unmount()
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
