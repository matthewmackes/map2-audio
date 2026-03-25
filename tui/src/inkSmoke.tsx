import assert from 'node:assert/strict'
import React from 'react'
import { render } from 'ink-testing-library'
import { App } from './App'
import { FilterableList } from './components/FilterableList'
import { ProgressBar } from './components/ProgressBar'
import { TabBar } from './components/TabBar'
import { configureNodeMap2Runtime } from './runtime/map2NodeRuntime'
import { AudioGridScreen } from './screens/AudioGridScreen'
import { ArtifactsScreen } from './screens/ArtifactsScreen'
import { ClusterScreen } from './screens/ClusterScreen'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { MeteringScreen } from './screens/MeteringScreen'
import { MidiHubScreen } from './screens/MidiHubScreen'
import { Mpx1Screen } from './screens/Mpx1Screen'
import { SettingsScreen } from './screens/SettingsScreen'

async function assertScreenFrame(label: string, element: React.ReactElement, pattern: RegExp): Promise<void> {
  const screen = render(element)
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.match(screen.lastFrame() ?? '', pattern, `${label} did not render expected content`)
  screen.unmount()
}

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

  await assertScreenFrame('Metering', <MeteringScreen />, /Input \/ Output Meters|Loading meters/)
  await assertScreenFrame('Audio Grid', <AudioGridScreen />, /Signal Flow|Loading chains/)
  await assertScreenFrame('MIDI Hub', <MidiHubScreen />, /Hub Status|Loading MIDI hub/)
  await assertScreenFrame('MPX1', <Mpx1Screen />, /MPX1|Loading MPX1/)
  await assertScreenFrame('Cluster', <ClusterScreen />, /Cluster \/ Services|Loading cluster view/)
  await assertScreenFrame('Artifacts', <ArtifactsScreen />, /Snapshots|Loading artifacts/)
  await assertScreenFrame('Settings', <SettingsScreen />, /Realtime|Loading settings/)
  await assertScreenFrame('Diagnostics', <DiagnosticsScreen />, /History \/ Metrics|Loading diagnostics/)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
