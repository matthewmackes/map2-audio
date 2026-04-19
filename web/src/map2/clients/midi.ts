import type {
  ChainMIDIConfig,
  DFUInstructions,
  DFUStatus,
  ExpressionCalibration,
  MIDICommand,
  MIDICurveType,
  MIDIDevice,
  MIDIDeviceConfig,
  MIDIDeviceProfile,
  MIDILearnTarget,
  MIDIMapping,
  MIDIMappingGroup,
  MIDIMappingTestResult,
  MIDIMappingV2,
  MIDIExpressionCurve,
  MIDIPreset,
  MIDIRoutingRule,
  MIDIStatus,
  ProfileApplyResult,
} from '../types'
import { fetchJson } from '../http'
import { API_BASE } from '../transport'

export const midiApi = {
  getDevices: () => fetchJson<{ inputs: MIDIDevice[]; outputs: MIDIDevice[] }>(`${API_BASE}/midi/devices`),

  start: () => fetchJson<{ message: string }>(`${API_BASE}/midi/start`, { method: 'POST' }),

  stop: () => fetchJson<{ message: string }>(`${API_BASE}/midi/stop`, { method: 'POST' }),

  getMappings: () => fetchJson<{ mappings: MIDIMapping[]; count: number }>(`${API_BASE}/midi/mappings`),

  addMapping: (channel: number, cc: number, targetUri: string, paramIndex: number) =>
    fetchJson<{ status: string; channel: number; cc: number; target: string; param: number }>(
      `${API_BASE}/midi/mappings?channel=${channel}&cc=${cc}&target_uri=${encodeURIComponent(targetUri)}&param_index=${paramIndex}`,
      { method: 'POST' },
    ),

  startLearn: (targetUri: string, paramIndex: number) =>
    fetchJson<{ status: string; target: string; param: number }>(
      `${API_BASE}/midi/learn?target_uri=${encodeURIComponent(targetUri)}&param_index=${paramIndex}`,
      { method: 'POST' },
    ),

  deleteMapping: (mappingId: number) =>
    fetchJson<{ status: string; mapping_id: number }>(
      `${API_BASE}/midi/mappings/${mappingId}`,
      { method: 'DELETE' },
    ),
}

export const midiApiV2 = {
  getStatus: () => fetchJson<MIDIStatus>(`${API_BASE}/v2/midi/status`),

  getDevices: () => fetchJson<{
    input_devices: string[];
    output_devices: string[];
    current_input: string | null;
    current_output: string | null;
  }>(`${API_BASE}/v2/midi/devices`),

  openInputDevice: (deviceName: string) =>
    fetchJson<{ success: boolean; device: string }>(
      `${API_BASE}/v2/midi/devices/input`,
      { method: 'POST', body: JSON.stringify({ device_name: deviceName }) },
    ),

  openOutputDevice: (deviceName: string) =>
    fetchJson<{ success: boolean; device: string }>(
      `${API_BASE}/v2/midi/devices/output`,
      { method: 'POST', body: JSON.stringify({ device_name: deviceName }) },
    ),

  closeInputDevice: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/devices/input`, { method: 'DELETE' }),

  closeOutputDevice: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/devices/output`, { method: 'DELETE' }),

  getMappings: (options?: { chain_id?: number; plugin_uri?: string }) => {
    const params = new URLSearchParams()
    if (options?.chain_id !== undefined) params.append('chain_id', options.chain_id.toString())
    if (options?.plugin_uri) params.append('plugin_uri', options.plugin_uri)
    const query = params.toString()
    return fetchJson<{ mappings: MIDIMappingV2[]; count: number }>(
      `${API_BASE}/v2/midi/mappings${query ? `?${query}` : ''}`,
    )
  },

  createMapping: (mapping: Partial<MIDIMappingV2>) =>
    fetchJson<{ mapping: MIDIMappingV2; message: string }>(
      `${API_BASE}/v2/midi/mappings`,
      { method: 'POST', body: JSON.stringify(mapping) },
    ),

  updateMapping: (mappingId: number, updates: Partial<MIDIMappingV2>) =>
    fetchJson<{ mapping: MIDIMappingV2; message: string }>(
      `${API_BASE}/v2/midi/mappings/${mappingId}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
    ),

  deleteMapping: (mappingId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/mappings/${mappingId}`,
      { method: 'DELETE' },
    ),

  testMappingFeedback: (
    mappingId: number,
    options?: { normalized_value?: number; use_current_value?: boolean },
  ) =>
    fetchJson<MIDIMappingTestResult>(
      `${API_BASE}/v2/midi/mappings/${mappingId}/test`,
      { method: 'POST', body: JSON.stringify(options ?? {}) },
    ),

  getCommands: () =>
    fetchJson<{ commands: MIDICommand[]; count: number }>(`${API_BASE}/v2/midi/commands`),

  createCommand: (command: Partial<MIDICommand>) =>
    fetchJson<{ command: MIDICommand; message: string }>(
      `${API_BASE}/v2/midi/commands`,
      { method: 'POST', body: JSON.stringify(command) },
    ),

  updateCommand: (commandId: number, updates: Partial<MIDICommand>) =>
    fetchJson<{ command: MIDICommand; message: string }>(
      `${API_BASE}/v2/midi/commands/${commandId}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
    ),

  deleteCommand: (commandId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/commands/${commandId}`,
      { method: 'DELETE' },
    ),

  getRoutingRules: (chainId?: number) => {
    const query = chainId !== undefined ? `?chain_id=${chainId}` : ''
    return fetchJson<{ routing_rules: MIDIRoutingRule[]; count: number }>(
      `${API_BASE}/v2/midi/routing-rules${query}`,
    )
  },

  createRoutingRule: (rule: Partial<MIDIRoutingRule>) =>
    fetchJson<{ routing_rule: MIDIRoutingRule; message: string }>(
      `${API_BASE}/v2/midi/routing-rules`,
      { method: 'POST', body: JSON.stringify(rule) },
    ),

  deleteRoutingRule: (ruleId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/routing-rules/${ruleId}`,
      { method: 'DELETE' },
    ),

  startLearn: (params: {
    chain_id: number;
    plugin_uri: string;
    param_symbol: string;
    param_index: number;
    min_val?: number;
    max_val?: number;
    curve_type?: MIDICurveType;
  }) =>
    fetchJson<{ success: boolean; target: MIDILearnTarget }>(
      `${API_BASE}/v2/midi/learn/start`,
      { method: 'POST', body: JSON.stringify(params) },
    ),

  stopLearn: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/learn/stop`, { method: 'POST' }),

  getLearnStatus: () =>
    fetchJson<{ learning: boolean; target: MIDILearnTarget | null }>(`${API_BASE}/v2/midi/learn/status`),

  getPresets: () =>
    fetchJson<{ presets: MIDIPreset[]; count: number }>(`${API_BASE}/v2/midi/presets`),

  savePreset: (name: string, description?: string) =>
    fetchJson<{ preset: MIDIPreset; message: string }>(
      `${API_BASE}/v2/midi/presets`,
      { method: 'POST', body: JSON.stringify({ name, description }) },
    ),

  loadPreset: (presetId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/presets/${presetId}/load`,
      { method: 'POST' },
    ),

  deletePreset: (presetId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/presets/${presetId}`,
      { method: 'DELETE' },
    ),

  getGroups: () =>
    fetchJson<{ groups: MIDIMappingGroup[]; count: number }>(`${API_BASE}/v2/midi/groups`),

  createGroup: (name: string, color?: string) =>
    fetchJson<{ group: MIDIMappingGroup; message: string }>(
      `${API_BASE}/v2/midi/groups`,
      { method: 'POST', body: JSON.stringify({ name, color }) },
    ),

  updateGroup: (groupId: number, updates: { name?: string; color?: string; sort_order?: number }) =>
    fetchJson<{ group: MIDIMappingGroup; message: string }>(
      `${API_BASE}/v2/midi/groups/${groupId}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
    ),

  deleteGroup: (groupId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/groups/${groupId}`,
      { method: 'DELETE' },
    ),

  getChainConfigs: () =>
    fetchJson<{ configs: ChainMIDIConfig[]; count: number }>(`${API_BASE}/v2/midi/chain-configs`),

  setChainConfig: (chainId: number, programNumber: number, options?: {
    bank_msb?: number;
    bank_lsb?: number;
    send_pc_on_activate?: boolean;
  }) =>
    fetchJson<{ config: ChainMIDIConfig; message: string }>(
      `${API_BASE}/v2/midi/chain-configs/${chainId}`,
      { method: 'PUT', body: JSON.stringify({ program_number: programNumber, ...options }) },
    ),

  deleteChainConfig: (chainId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/chain-configs/${chainId}`,
      { method: 'DELETE' },
    ),

  getDeviceConfigs: () =>
    fetchJson<{ configs: MIDIDeviceConfig[]; count: number }>(`${API_BASE}/v2/midi/device-configs`),

  saveDeviceConfig: (config: Partial<MIDIDeviceConfig>) =>
    fetchJson<{ config: MIDIDeviceConfig; message: string }>(
      `${API_BASE}/v2/midi/device-configs`,
      { method: 'POST', body: JSON.stringify(config) },
    ),

  sendCC: (channel: number, cc: number, value: number) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/cc`,
      { method: 'POST', body: JSON.stringify({ channel, cc, value }) },
    ),

  sendProgramChange: (channel: number, program: number) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/program-change`,
      { method: 'POST', body: JSON.stringify({ channel, program }) },
    ),

  sendNote: (channel: number, note: number, velocity: number, on: boolean) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/note`,
      { method: 'POST', body: JSON.stringify({ channel, note, velocity, on }) },
    ),

  syncToController: () =>
    fetchJson<{ success: boolean; mappings_synced: number }>(
      `${API_BASE}/v2/midi/sync`,
      { method: 'POST' },
    ),

  getDeviceProfiles: () =>
    fetchJson<{ profiles: MIDIDeviceProfile[]; count: number; active_profile_id: string | null }>(
      `${API_BASE}/v2/midi/device-profiles`,
    ),

  getDeviceProfile: (profileId: string) =>
    fetchJson<MIDIDeviceProfile>(`${API_BASE}/v2/midi/device-profiles/${profileId}`),

  applyDeviceProfile: (profileId: string, clearExisting = true) =>
    fetchJson<ProfileApplyResult>(
      `${API_BASE}/v2/midi/device-profiles/apply`,
      { method: 'POST', body: JSON.stringify({ profile_id: profileId, clear_existing: clearExisting }) },
    ),

  detectDeviceProfile: (deviceName: string) =>
    fetchJson<{ detected: boolean; profile_id: string | null; profile?: MIDIDeviceProfile; suggestion?: string }>(
      `${API_BASE}/v2/midi/device-profiles/detect?device_name=${encodeURIComponent(deviceName)}`,
    ),

  getActiveProfile: () =>
    fetchJson<{ active: boolean; profile: MIDIDeviceProfile | null }>(
      `${API_BASE}/v2/midi/device-profiles/active`,
    ),

  getCurrentBank: () =>
    fetchJson<{ current_bank: number; max_banks: number; items_per_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/current`,
    ),

  bankUp: () =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/up`,
      { method: 'POST' },
    ),

  bankDown: () =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/down`,
      { method: 'POST' },
    ),

  setBank: (bank: number) =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/set?bank=${bank}`,
      { method: 'POST' },
    ),

  getExpressionCalibrations: () =>
    fetchJson<{ calibrations: Record<string, ExpressionCalibration> }>(
      `${API_BASE}/v2/midi/expression/calibration`,
    ),

  getExpressionCalibration: (pedalId: string) =>
    fetchJson<ExpressionCalibration>(
      `${API_BASE}/v2/midi/expression/calibration/${pedalId}`,
    ),

  updateExpressionCalibration: (params: {
    pedal_id: string;
    min_raw?: number;
    max_raw?: number;
    deadzone_low?: number;
    deadzone_high?: number;
    curve?: MIDIExpressionCurve;
    invert?: boolean;
  }) =>
    fetchJson<{ status: string; calibration: ExpressionCalibration }>(
      `${API_BASE}/v2/midi/expression/calibration`,
      { method: 'POST', body: JSON.stringify(params) },
    ),

  getDFUStatus: () =>
    fetchJson<DFUStatus>(`${API_BASE}/v2/midi/firmware/dfu-status`),

  getDFUInstructions: (profileId: string) =>
    fetchJson<DFUInstructions>(`${API_BASE}/v2/midi/firmware/dfu-instructions/${profileId}`),

  flashFirmware: (profileId: string, firmwarePath: string) =>
    fetchJson<{ success: boolean; message?: string; error?: string; output?: string }>(
      `${API_BASE}/v2/midi/firmware/flash`,
      { method: 'POST', body: JSON.stringify({ profile_id: profileId, firmware_path: firmwarePath }) },
    ),
}
