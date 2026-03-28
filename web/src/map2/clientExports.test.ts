import {
  API_BASE,
  audioApi,
  automationApi,
  avbApi,
  chainsApi,
  diagnosticsApi,
  drumsApi,
  effectsLoopsApi,
  engineApi,
  flowSnapshotsApi,
  foldersApi,
  getNodeHealth,
  getNodeIdentity,
  getNodeTopology,
  healthApi,
  historyApi,
  irApi,
  irLibraryApi,
  latencyV2Api,
  metricsApi,
  midiApi,
  midiApiV2,
  midiClusterApi,
  midiHubApi,
  namApi,
  networkApi,
  nodeApi,
  patchNodeLabel,
  pipewireApi,
  pluginAppearancesApi,
  pluginsApi,
  servicesApi,
  sessionsApi,
  snapshotsApi,
  soundfontApi,
  synthforgeApi,
  systemApi,
  uploadApi,
  usbApi,
  wwwApi,
} from './api'
import { audioApi as splitAudioApi, diagnosticsApi as splitDiagnosticsApi, usbApi as splitUsbApi } from './clients/audio'
import { avbApi as splitAvbApi } from './clients/avb'
import {
  foldersApi as splitFoldersApi,
  irApi as splitIrApi,
  irLibraryApi as splitIrLibraryApi,
  namApi as splitNamApi,
  soundfontApi as splitSoundfontApi,
  uploadApi as splitUploadApi,
} from './clients/assets'
import { chainsApi as splitChainsApi } from './clients/chains'
import { drumsApi as splitDrumsApi } from './clients/drums'
import { midiApi as splitMidiApi, midiApiV2 as splitMidiApiV2 } from './clients/midi'
import { midiClusterApi as splitMidiClusterApi, midiHubApi as splitMidiHubApi } from './clients/midiHub'
import {
  getNodeHealth as splitGetNodeHealth,
  getNodeIdentity as splitGetNodeIdentity,
  getNodeTopology as splitGetNodeTopology,
  metricsApi as splitMetricsApi,
  networkApi as splitNetworkApi,
  nodeApi as splitNodeApi,
  patchNodeLabel as splitPatchNodeLabel,
  servicesApi as splitServicesApi,
  systemApi as splitSystemApi,
} from './clients/platform'
import { healthApi as splitHealthApi, wwwApi as splitWwwApi } from './clients/status'
import {
  automationApi as splitAutomationApi,
  engineApi as splitEngineApi,
  latencyV2Api as splitLatencyV2Api,
  pipewireApi as splitPipewireApi,
  synthforgeApi as splitSynthforgeApi,
} from './clients/utilities'
import {
  effectsLoopsApi as splitEffectsLoopsApi,
  flowSnapshotsApi as splitFlowSnapshotsApi,
  historyApi as splitHistoryApi,
  sessionsApi as splitSessionsApi,
  snapshotsApi as splitSnapshotsApi,
} from './clients/workflows'
import {
  PLUGIN_INVENTORY_CHANGED_EVENT,
  pluginAppearancesApi as splitPluginAppearancesApi,
  pluginsApi as splitPluginsApi,
} from './clients/plugins'
import { API_BASE as splitApiBase } from './transport'

describe('map2 api compatibility barrel', () => {
  it('re-exports the split client modules and transport base intact', () => {
    expect(API_BASE).toBe(splitApiBase)
    expect(chainsApi).toBe(splitChainsApi)
    expect(pluginsApi).toBe(splitPluginsApi)
    expect(pluginAppearancesApi).toBe(splitPluginAppearancesApi)
    expect(drumsApi).toBe(splitDrumsApi)
    expect(audioApi).toBe(splitAudioApi)
    expect(diagnosticsApi).toBe(splitDiagnosticsApi)
    expect(usbApi).toBe(splitUsbApi)
    expect(avbApi).toBe(splitAvbApi)
    expect(foldersApi).toBe(splitFoldersApi)
    expect(irApi).toBe(splitIrApi)
    expect(irLibraryApi).toBe(splitIrLibraryApi)
    expect(latencyV2Api).toBe(splitLatencyV2Api)
    expect(namApi).toBe(splitNamApi)
    expect(soundfontApi).toBe(splitSoundfontApi)
    expect(uploadApi).toBe(splitUploadApi)
    expect(metricsApi).toBe(splitMetricsApi)
    expect(systemApi).toBe(splitSystemApi)
    expect(nodeApi).toBe(splitNodeApi)
    expect(networkApi).toBe(splitNetworkApi)
    expect(servicesApi).toBe(splitServicesApi)
    expect(getNodeIdentity).toBe(splitGetNodeIdentity)
    expect(getNodeHealth).toBe(splitGetNodeHealth)
    expect(getNodeTopology).toBe(splitGetNodeTopology)
    expect(patchNodeLabel).toBe(splitPatchNodeLabel)
    expect(automationApi).toBe(splitAutomationApi)
    expect(engineApi).toBe(splitEngineApi)
    expect(pipewireApi).toBe(splitPipewireApi)
    expect(synthforgeApi).toBe(splitSynthforgeApi)
    expect(effectsLoopsApi).toBe(splitEffectsLoopsApi)
    expect(flowSnapshotsApi).toBe(splitFlowSnapshotsApi)
    expect(historyApi).toBe(splitHistoryApi)
    expect(sessionsApi).toBe(splitSessionsApi)
    expect(snapshotsApi).toBe(splitSnapshotsApi)
    expect(midiApi).toBe(splitMidiApi)
    expect(midiApiV2).toBe(splitMidiApiV2)
    expect(midiClusterApi).toBe(splitMidiClusterApi)
    expect(midiHubApi).toBe(splitMidiHubApi)
    expect(healthApi).toBe(splitHealthApi)
    expect(wwwApi).toBe(splitWwwApi)
    expect(PLUGIN_INVENTORY_CHANGED_EVENT).toBe('map2:plugins-changed')
  })
})
