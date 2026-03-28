import { fetchBlob, fetchJson } from '../http'
import { API_BASE } from '../transport'

export const drumsApi = {
  /** Get drum machine state */
  getState: () =>
    fetchJson<import('../types').DrumMachineState>(`${API_BASE}/engine/drums/state`),

  /** Update drum machine state */
  updateState: (state: import('../types').DrumMachineStateUpdate) =>
    fetchJson<{ status: string; state: import('../types').DrumMachineState }>(`${API_BASE}/engine/drums/state`, {
      method: 'POST', body: JSON.stringify(state),
    }),

  /** Get transport state */
  getTransport: () =>
    fetchJson<import('../types').DrumTransportState>(`${API_BASE}/engine/drums/transport`),

  /** Update transport state */
  setTransport: (state: import('../types').DrumTransportUpdate) =>
    fetchJson<import('../types').DrumTransportState>(`${API_BASE}/engine/drums/transport`, {
      method: 'POST', body: JSON.stringify(state),
    }),

  /** Get drum sequencer MIDI output configuration */
  getMidiOutputConfig: () =>
    fetchJson<import('../types').DrumMidiOutputConfig>(`${API_BASE}/engine/drums/midi/output`),

  /** Update drum sequencer MIDI output configuration */
  setMidiOutputConfig: (state: import('../types').DrumMidiOutputConfig) =>
    fetchJson<import('../types').DrumMidiOutputConfig>(`${API_BASE}/engine/drums/midi/output`, {
      method: 'POST', body: JSON.stringify(state),
    }),

  /** Get drum CC mappings */
  getCcMappings: () =>
    fetchJson<import('../types').DrumCcMapping>(`${API_BASE}/engine/drums/midi/cc-mappings`),

  /** Update drum CC mappings */
  setCcMappings: (state: import('../types').DrumCcMapping) =>
    fetchJson<import('../types').DrumCcMapping>(`${API_BASE}/engine/drums/midi/cc-mappings`, {
      method: 'POST', body: JSON.stringify(state),
    }),

  /** Start drum CC learn */
  startCcLearn: (slot: number, timeoutSeconds = 10) =>
    fetchJson<import('../types').DrumCcLearnStatus>(`${API_BASE}/engine/drums/midi/cc-learn/start`, {
      method: 'POST',
      body: JSON.stringify({ slot, timeout_seconds: timeoutSeconds }),
    }),

  /** Stop drum CC learn */
  stopCcLearn: () =>
    fetchJson<import('../types').DrumCcLearnStatus>(`${API_BASE}/engine/drums/midi/cc-learn/stop`, {
      method: 'POST',
    }),

  /** Get drum CC learn status */
  getCcLearnStatus: () =>
    fetchJson<import('../types').DrumCcLearnStatus>(`${API_BASE}/engine/drums/midi/cc-learn/status`),

  /** Get a pad sound source */
  getPadSoundSource: (padId: number) =>
    fetchJson<{ pad: number; source: import('../types').DrumPadSoundSource }>(`${API_BASE}/engine/drums/pad/${padId}/source`),

  /** Set a pad sound source */
  setPadSoundSource: (padId: number, source: import('../types').DrumPadSoundSource) =>
    fetchJson<{ pad: number; source: import('../types').DrumPadSoundSource }>(`${API_BASE}/engine/drums/pad/${padId}/source`, {
      method: 'POST',
      body: JSON.stringify({ source }),
    }),

  /** Get synth parameters for one pad */
  getPadSynthParams: (padId: number) =>
    fetchJson<{ pad: number; params: import('../types').DrumSynthParams }>(`${API_BASE}/engine/drums/pad/${padId}/synth`),

  /** Set synth parameters for one pad */
  setPadSynthParams: (padId: number, params: import('../types').DrumSynthParams) =>
    fetchJson<{ pad: number; params: import('../types').DrumSynthParams }>(`${API_BASE}/engine/drums/pad/${padId}/synth`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  /** Get filter parameters for one pad */
  getPadFilter: (padId: number) =>
    fetchJson<{ pad: number; filter: import('../types').DrumPadFilter }>(`${API_BASE}/engine/drums/pad/${padId}/filter`),

  /** Set filter parameters for one pad */
  setPadFilter: (padId: number, filter: import('../types').DrumPadFilter) =>
    fetchJson<{ pad: number; filter: import('../types').DrumPadFilter }>(`${API_BASE}/engine/drums/pad/${padId}/filter`, {
      method: 'POST',
      body: JSON.stringify(filter),
    }),

  /** Get CV/Gate parameters for one pad */
  getPadCvGateConfig: (padId: number) =>
    fetchJson<{ pad: number; config: import('../types').DrumCvGateConfig }>(`${API_BASE}/engine/drums/pad/${padId}/cv-gate`),

  /** Set CV/Gate parameters for one pad */
  setPadCvGateConfig: (padId: number, config: import('../types').DrumCvGateConfig) =>
    fetchJson<{ pad: number; config: import('../types').DrumCvGateConfig }>(`${API_BASE}/engine/drums/pad/${padId}/cv-gate`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  /** Get waveform analysis for one pad sample */
  getPadSampleWaveform: (padId: number, points = 256) =>
    fetchJson<import('../types').DrumPadSampleWaveform>(`${API_BASE}/engine/drums/pad/${padId}/sample/waveform?points=${points}`),

  /** Export the current WAV asset for one pad sample */
  getPadSampleFile: (padId: number) =>
    fetchBlob(`${API_BASE}/engine/drums/pad/${padId}/sample/file`),

  /** Upload a new sample into one pad */
  uploadPadSample: async (padId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return fetchJson<import('../types').DrumPadSampleWaveform>(`${API_BASE}/engine/drums/pad/${padId}/sample/upload`, {
      method: 'POST',
      body: form,
    })
  },

  /** Start recording hardware input into one pad */
  startPadRecording: (padId: number) =>
    fetchJson<import('../types').DrumPadRecordingState>(`${API_BASE}/engine/drums/pad/${padId}/record/start`, {
      method: 'POST',
    }),

  /** Stop recording hardware input into one pad */
  stopPadRecording: (padId: number) =>
    fetchJson<import('../types').DrumPadSampleWaveform>(`${API_BASE}/engine/drums/pad/${padId}/record/stop`, {
      method: 'POST',
    }),

  /** Trim one pad sample to the selected range */
  trimPadSample: (padId: number, startSample: number, endSample: number) =>
    fetchJson<import('../types').DrumPadSampleWaveform>(`${API_BASE}/engine/drums/pad/${padId}/sample/trim`, {
      method: 'POST',
      body: JSON.stringify({ start_sample: startSample, end_sample: endSample }),
    }),

  /** Normalize one pad sample to the requested peak */
  normalizePadSample: (padId: number, targetPeak = 0.99) =>
    fetchJson<import('../types').DrumPadSampleWaveform>(`${API_BASE}/engine/drums/pad/${padId}/sample/normalize`, {
      method: 'POST',
      body: JSON.stringify({ target_peak: targetPeak }),
    }),

  /** Reverse one pad sample */
  reversePadSample: (padId: number) =>
    fetchJson<import('../types').DrumPadSampleWaveform>(`${API_BASE}/engine/drums/pad/${padId}/sample/reverse`, {
      method: 'POST',
    }),

  /** Apply fades to one pad sample */
  fadePadSample: (padId: number, fadeInMs: number, fadeOutMs: number) =>
    fetchJson<import('../types').DrumPadSampleWaveform>(`${API_BASE}/engine/drums/pad/${padId}/sample/fade`, {
      method: 'POST',
      body: JSON.stringify({ fade_in_ms: fadeInMs, fade_out_ms: fadeOutMs }),
    }),

  /** Get per-track swing state */
  getTrackSwing: (instrument: number) =>
    fetchJson<{ instrument: number; swing: number; track_swing: number[] }>(`${API_BASE}/engine/drums/track/${instrument}/swing`),

  /** Set per-track swing */
  setTrackSwing: (instrument: number, swing: number) =>
    fetchJson<{ instrument: number; swing: number; track_swing: number[] }>(`${API_BASE}/engine/drums/track/${instrument}/swing`, {
      method: 'POST',
      body: JSON.stringify({ swing }),
    }),

  /** Set per-track loop length */
  setTrackLength: (patternId: number, instrument: number, length: number) =>
    fetchJson<import('../types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}/track/${instrument}/length`, {
      method: 'POST',
      body: JSON.stringify({ length }),
    }),

  /** Record a tap-tempo event */
  tapTempo: (timestamp?: number) =>
    fetchJson<{ tempo: number | null; taps: number }>(`${API_BASE}/engine/drums/transport/tap-tempo`, {
      method: 'POST',
      body: JSON.stringify(timestamp == null ? {} : { timestamp }),
    }),

  /** Get a pattern by id */
  getPattern: (patternId: number) =>
    fetchJson<import('../types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}`),

  /** Get the current sequencer position */
  getPosition: () =>
    fetchJson<import('../types').DrumSequencerPosition>(`${API_BASE}/engine/drums/position`),

  /** Trigger a sequencer fill */
  triggerFill: () =>
    fetchJson<{ status: string; pattern: number; variation: number }>(`${API_BASE}/engine/drums/fill/trigger`, {
      method: 'POST',
    }),

  /** Replace a pattern */
  setPattern: (patternId: number, pattern: import('../types').DrumPattern) =>
    fetchJson<import('../types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}`, {
      method: 'POST',
      body: JSON.stringify(pattern),
    }),

  /** Update a single step in a pattern */
  setStep: (
    patternId: number,
    instrument: number,
    step: number,
    velocity: number,
    accent = false,
    details?: Partial<Pick<import('../types').DrumPatternStep, 'micro_timing' | 'probability' | 'ratchet_count' | 'ratchet_decay' | 'lock_pitch' | 'lock_filter_cutoff' | 'lock_decay' | 'lock_pan' | 'lock_volume'>>,
  ) =>
    fetchJson<import('../types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}/step`, {
      method: 'POST',
      body: JSON.stringify({ instrument, step, velocity, accent, ...(details ?? {}) }),
    }),

  /** Clear a pattern */
  clearPattern: (patternId: number) =>
    fetchJson<import('../types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}/clear`, {
      method: 'POST',
    }),

  /** Copy a pattern */
  copyPattern: (sourcePatternId: number, destinationPatternId: number) =>
    fetchJson<import('../types').DrumPattern>(`${API_BASE}/engine/drums/pattern/copy`, {
      method: 'POST',
      body: JSON.stringify({ source_pattern_id: sourcePatternId, destination_pattern_id: destinationPatternId }),
    }),

  /** Get the drum song arrangement */
  getSong: async () => {
    const response = await fetchJson<{ song?: import('../types').DrumSongEntry[]; song_loop?: boolean; entries?: import('../types').DrumSongEntry[]; loop?: boolean }>(
      `${API_BASE}/engine/drums/song`,
    )
    return {
      entries: (response.entries ?? response.song ?? []).map((item) => ({
        pattern_id: item.pattern_id ?? (item as unknown as { pattern: number }).pattern,
        repeat_count: item.repeat_count,
      })),
      loop: response.loop ?? response.song_loop ?? false,
    } satisfies import('../types').DrumSong
  },

  /** Replace the drum song arrangement */
  setSong: async (song: import('../types').DrumSong) => {
    const response = await fetchJson<{ song?: import('../types').DrumSongEntry[]; song_loop?: boolean }>(`${API_BASE}/engine/drums/song`, {
      method: 'POST',
      body: JSON.stringify({ song: song.entries, song_loop: song.loop }),
    })
    return {
      entries: (response.song ?? []).map((item) => ({
        pattern_id: item.pattern_id ?? (item as unknown as { pattern: number }).pattern,
        repeat_count: item.repeat_count,
      })),
      loop: response.song_loop ?? false,
    } satisfies import('../types').DrumSong
  },

  /** Append a song entry */
  addSongEntry: async (entry: import('../types').DrumSongEntry) => {
    const response = await fetchJson<{ song?: import('../types').DrumSongEntry[]; song_loop?: boolean }>(`${API_BASE}/engine/drums/song/entries`, {
      method: 'POST',
      body: JSON.stringify({ pattern: entry.pattern_id, repeat_count: entry.repeat_count }),
    })
    return {
      entries: (response.song ?? []).map((item) => ({
        pattern_id: item.pattern_id ?? (item as unknown as { pattern: number }).pattern,
        repeat_count: item.repeat_count,
      })),
      loop: response.song_loop ?? false,
    } satisfies import('../types').DrumSong
  },

  /** Remove a song entry by position */
  removeSongEntry: async (position: number) => {
    const response = await fetchJson<{ song?: import('../types').DrumSongEntry[]; song_loop?: boolean }>(`${API_BASE}/engine/drums/song/entries/${position}`, {
      method: 'DELETE',
    })
    return {
      entries: (response.song ?? []).map((item) => ({
        pattern_id: item.pattern_id ?? (item as unknown as { pattern: number }).pattern,
        repeat_count: item.repeat_count,
      })),
      loop: response.song_loop ?? false,
    } satisfies import('../types').DrumSong
  },

  /** Get drum song transport state */
  getSongTransport: () =>
    fetchJson<import('../types').DrumSongTransportState>(`${API_BASE}/engine/drums/song/transport`),

  /** Start drum song playback */
  playSongTransport: () =>
    fetchJson<import('../types').DrumSongTransportState>(`${API_BASE}/engine/drums/song/transport/play`, {
      method: 'POST',
    }),

  /** Stop drum song playback */
  stopSongTransport: () =>
    fetchJson<import('../types').DrumSongTransportState>(`${API_BASE}/engine/drums/song/transport/stop`, {
      method: 'POST',
    }),

  /** List available drum kits */
  getKits: () =>
    fetchJson<import('../types').DrumKit[]>(`${API_BASE}/engine/drums/kits`),

  /** Get a drum kit by id */
  getKit: (kitId: string) =>
    fetchJson<import('../types').DrumKit>(`${API_BASE}/engine/drums/kits/${encodeURIComponent(kitId)}`),

  /** Load a drum kit */
  loadKit: (kitId: string) =>
    fetchJson<{ status: string; active_kit: import('../types').DrumKit }>(`${API_BASE}/engine/drums/kits/load`, {
      method: 'POST',
      body: JSON.stringify({ kit_id: kitId }),
    }),

  /** Get the active drum kit */
  getActiveKit: () =>
    fetchJson<import('../types').DrumKit | null>(`${API_BASE}/engine/drums/kits/active`),

  /** Import a user drum kit archive */
  importKit: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchJson<{ status: string; kit: import('../types').DrumKit }>(`${API_BASE}/engine/drums/kits/import`, {
      method: 'POST',
      body: formData,
    })
  },

  /** Create a user drum kit from a template */
  createKit: (template: Record<string, unknown>) =>
    fetchJson<import('../types').DrumKit>(`${API_BASE}/engine/drums/kits/create`, {
      method: 'POST',
      body: JSON.stringify(template),
    }),

  /** Patch a single instrument inside a drum kit */
  patchKitInstrument: (kitId: string, padId: number, patch: import('../types').DrumKitInstrumentPatch) =>
    fetchJson<import('../types').DrumKit>(
      `${API_BASE}/engine/drums/kits/${encodeURIComponent(kitId)}/instruments/${padId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    ),

  /** Get per-pad mixer controls */
  getPadControls: () =>
    fetchJson<import('../types').DrumPadControl[]>(`${API_BASE}/engine/drums/mixer/pads`),

  /** Update a per-pad mixer control block */
  setPadControl: (padId: number, params: import('../types').DrumPadControlUpdate) =>
    fetchJson<import('../types').DrumPadControl>(`${API_BASE}/engine/drums/mixer/pads/${padId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    }),

  /** Get bus mixer state */
  getBusMixer: () =>
    fetchJson<import('../types').DrumBusMixer[]>(`${API_BASE}/engine/drums/mixer/buses`),

  /** Update a single drum bus */
  setBusMixer: (busId: number, params: import('../types').DrumBusMixerUpdate) =>
    fetchJson<import('../types').DrumBusMixer>(`${API_BASE}/engine/drums/mixer/buses/${busId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    }),

  /** Get master volume */
  getMasterVolume: () =>
    fetchJson<import('../types').DrumMasterVolumeState>(`${API_BASE}/engine/drums/mixer/master`),

  /** Set master volume */
  setMasterVolume: (volume: number) =>
    fetchJson<import('../types').DrumMasterVolumeState>(`${API_BASE}/engine/drums/mixer/master`, {
      method: 'POST',
      body: JSON.stringify({ volume }),
    }),

  /** Get drum master FX */
  getMasterFx: () =>
    fetchJson<import('../types').DrumMasterFxState>(`${API_BASE}/engine/drums/master-fx`),

  /** Set drum master FX */
  setMasterFx: (state: import('../types').DrumMasterFxState) =>
    fetchJson<import('../types').DrumMasterFxState>(`${API_BASE}/engine/drums/master-fx`, {
      method: 'POST',
      body: JSON.stringify(state),
    }),

  /** Set a bus reverb send */
  setBusReverbSend: (busId: number, level: number) =>
    fetchJson<import('../types').DrumBusMixer>(`${API_BASE}/engine/drums/bus/${busId}/reverb-send`, {
      method: 'POST',
      body: JSON.stringify({ level }),
    }),

  /** Get MIDI note mapping */
  getMidiMapping: () =>
    fetchJson<import('../types').DrumMidiMapping>(`${API_BASE}/engine/drums/midi/mapping`),

  /** Replace MIDI note mapping */
  setMidiMapping: (mapping: import('../types').DrumMidiMapping) =>
    fetchJson<import('../types').DrumMidiMapping>(`${API_BASE}/engine/drums/midi/mapping`, {
      method: 'POST',
      body: JSON.stringify(mapping),
    }),

  /** Get all velocity curves */
  getVelocityCurves: () =>
    fetchJson<import('../types').DrumMidiVelocityCurves>(`${API_BASE}/engine/drums/midi/velocity-curves`),

  /** Update a single velocity curve */
  setVelocityCurve: (padId: number, curve: import('../types').DrumVelocityCurve) =>
    fetchJson<import('../types').DrumMidiVelocityCurves>(`${API_BASE}/engine/drums/midi/velocity-curves`, {
      method: 'POST',
      body: JSON.stringify({
        pads: [{ ...curve, pad: padId }],
      }),
    }),

  /** Get per-pad MIDI zones */
  getMidiZones: () =>
    fetchJson<import('../types').DrumMidiZones>(`${API_BASE}/engine/drums/midi/zones`),

  /** Replace per-pad MIDI zones */
  setMidiZones: (zones: import('../types').DrumMidiZones) =>
    fetchJson<import('../types').DrumMidiZones>(`${API_BASE}/engine/drums/midi/zones`, {
      method: 'POST',
      body: JSON.stringify(zones),
    }),

  /** Start MIDI learn mode */
  startMidiLearn: (padId?: number) =>
    fetchJson<import('../types').DrumMidiLearnStatus>(`${API_BASE}/engine/drums/midi/learn/start`, {
      method: 'POST',
      body: JSON.stringify(padId == null ? { pad: 0, learn_all: true } : { pad: padId }),
    }),

  /** Stop MIDI learn mode */
  stopMidiLearn: () =>
    fetchJson<import('../types').DrumMidiLearnStatus>(`${API_BASE}/engine/drums/midi/learn/stop`, {
      method: 'POST',
    }),

  /** Get MIDI learn status */
  getMidiLearnStatus: () =>
    fetchJson<import('../types').DrumMidiLearnStatus>(`${API_BASE}/engine/drums/midi/learn/status`),

  /** List bundled hardware MIDI presets */
  getMidiPresets: () =>
    fetchJson<import('../types').DrumMidiPresetList>(`${API_BASE}/engine/drums/midi/presets`),

  /** Load a hardware MIDI preset */
  loadMidiPreset: (presetName: string) =>
    fetchJson<{ status: string; preset_name: string; mapping: import('../types').DrumMidiMapping; zones: import('../types').DrumMidiZones }>(`${API_BASE}/engine/drums/midi/presets/load`, {
      method: 'POST',
      body: JSON.stringify({ preset_name: presetName }),
    }),

  /** Get factory drum packs */
  getFactoryPacks: () =>
    fetchJson<import('../types').DrumPack[]>(`${API_BASE}/engine/drums/packs/factory`),

  /** Get generated drum packs */
  getGeneratedPacks: () =>
    fetchJson<import('../types').DrumPack[]>(`${API_BASE}/engine/drums/packs/generated`),

  /** Get factory pack details */
  getFactoryPackDetails: (packId: string) =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/engine/drums/packs/factory/${packId}`),

  /** Get generated pack details */
  getGeneratedPackDetails: (packId: string) =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/engine/drums/packs/generated/${packId}`),

  /** Get a metering snapshot */
  getMetering: () =>
    fetchJson<import('../types').DrumMetering>(`${API_BASE}/engine/drums/metering`),
}
