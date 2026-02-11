/**
 * OutotuneCard - Outotune Auto-Tune Plugin
 *
 * Antares Auto-Tune inspired pitch correction interface with
 * professional tuner display, key/scale selection, and correction speed.
 *
 * LV2 URI: https://github.com/x42/fat1.lv2 (or outotune variant)
 */

import { useState, useMemo, useEffect } from 'react'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { TunerDisplay } from '../../Visualizations/TunerDisplay'
import { MusicNote, Lightning, WaveSine } from '@phosphor-icons/react'
import type { PluginCardProps } from '../../types'
import './OutotuneCard.css'

// Parameter indices (adjust based on actual plugin)
const PARAM_MAP = {
  correction: 0,    // Correction amount/speed (0-100%)
  detune: 1,        // Fine tune offset (-100 to +100 cents)
  formant: 2,       // Formant preservation (0-100%)
  mix: 3,           // Dry/Wet mix
  key: 4,           // Root note (0-11 = C to B)
  scale: 5,         // Scale type
  bypass: 6,
  // Note enables (chromatic notes)
  noteC: 7,
  noteCSharp: 8,
  noteD: 9,
  noteDSharp: 10,
  noteE: 11,
  noteF: 12,
  noteFSharp: 13,
  noteG: 14,
  noteGSharp: 15,
  noteA: 16,
  noteASharp: 17,
  noteB: 18,
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const SCALES = [
  { name: 'Chromatic', notes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { name: 'Major', notes: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1] },
  { name: 'Minor', notes: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0] },
  { name: 'Pentatonic', notes: [1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0] },
  { name: 'Blues', notes: [1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0] },
  { name: 'Dorian', notes: [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0] },
  { name: 'Mixolydian', notes: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0] },
]

const CORRECTION_PRESETS = [
  { name: 'Natural', speed: 15, formant: 100 },
  { name: 'Soft', speed: 35, formant: 80 },
  { name: 'Medium', speed: 60, formant: 60 },
  { name: 'Hard', speed: 85, formant: 40 },
  { name: 'T-Pain', speed: 100, formant: 0 },
]

export function OutotuneCard({
  plugin,
  parameterValues,
  onParameterChange,
  realtimeData,
  accentColor = '#00d4aa', // Teal for pitch
  compact = false,
}: PluginCardProps) {
  const [selectedKey, setSelectedKey] = useState(0) // C
  const [selectedScale, setSelectedScale] = useState(0) // Chromatic
  const [noteEnables, setNoteEnables] = useState<boolean[]>(Array(12).fill(true))

  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  // Get realtime tuner data
  const pitchData = useMemo(() => {
    if (realtimeData?.tuner) {
      return {
        detectedPitch: realtimeData.tuner.frequency || 0,
        targetPitch: 440, // A4 reference
        cents: realtimeData.tuner.cents || 0,
        noteName: `${realtimeData.tuner.note}${realtimeData.tuner.octave}` || '--',
        confidence: realtimeData.tuner.confidence || 0,
      }
    }
    // Demo values when no realtime data
    return {
      detectedPitch: 442.3,
      targetPitch: 440,
      cents: Math.sin(Date.now() / 500) * 15,
      noteName: 'A4',
      confidence: 0.9,
    }
  }, [realtimeData])

  // Apply scale to note enables
  const applyScale = (scaleIndex: number, keyIndex: number) => {
    const scale = SCALES[scaleIndex]
    const newEnables = Array(12).fill(false)
    for (let i = 0; i < 12; i++) {
      const noteIndex = (i + keyIndex) % 12
      newEnables[noteIndex] = scale.notes[i] === 1
    }
    setNoteEnables(newEnables)
    setSelectedScale(scaleIndex)
    setSelectedKey(keyIndex)

    // Update plugin parameters
    NOTES.forEach((_, i) => {
      const paramKey = `note${NOTES[i].replace('#', 'Sharp')}` as keyof typeof PARAM_MAP
      if (PARAM_MAP[paramKey] !== undefined) {
        onParameterChange(PARAM_MAP[paramKey], newEnables[i] ? 1 : 0)
      }
    })
  }

  // Toggle individual note
  const toggleNote = (noteIndex: number) => {
    const newEnables = [...noteEnables]
    newEnables[noteIndex] = !newEnables[noteIndex]
    setNoteEnables(newEnables)

    const paramKey = `note${NOTES[noteIndex].replace('#', 'Sharp')}` as keyof typeof PARAM_MAP
    if (PARAM_MAP[paramKey] !== undefined) {
      onParameterChange(PARAM_MAP[paramKey], newEnables[noteIndex] ? 1 : 0)
    }
  }

  // Apply correction preset
  const applyPreset = (preset: typeof CORRECTION_PRESETS[0]) => {
    setValue('correction', preset.speed)
    setValue('formant', preset.formant)
  }

  // Visualization
  const visualization = (
    <div className="outotune-visualization">
      <TunerDisplay
        detectedPitch={pitchData.detectedPitch}
        targetPitch={pitchData.targetPitch}
        cents={pitchData.cents}
        noteName={pitchData.noteName}
        confidence={pitchData.confidence}
        width={compact ? 308 : 392}
        height={compact ? 140 : 168}
        accentColor={accentColor}
      />
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      {/* Correction Speed Presets */}
      <div className="outotune-presets">
        {CORRECTION_PRESETS.map((preset) => (
          <button
            key={preset.name}
            className={`outotune-preset-chip ${getValue('correction', 60) === preset.speed ? 'active' : ''}`}
            onClick={() => applyPreset(preset)}
            style={{ '--accent': accentColor } as React.CSSProperties}
          >
            {preset.name === 'T-Pain' ? <Lightning size={10} weight="duotone" /> : null}
            {preset.name}
          </button>
        ))}
      </div>

      {/* Key & Scale Selection */}
      <ParameterSection title="Key & Scale" accentColor={accentColor}>
        <div className="outotune-key-scale">
          <div className="outotune-select-group">
            <label>Key</label>
            <select
              value={selectedKey}
              onChange={(e) => applyScale(selectedScale, parseInt(e.target.value))}
            >
              {NOTES.map((note, i) => (
                <option key={note} value={i}>{note}</option>
              ))}
            </select>
          </div>

          <div className="outotune-select-group">
            <label>Scale</label>
            <select
              value={selectedScale}
              onChange={(e) => applyScale(parseInt(e.target.value), selectedKey)}
            >
              {SCALES.map((scale, i) => (
                <option key={scale.name} value={i}>{scale.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Piano Roll Note Enable */}
        <div className="outotune-piano-roll">
          {NOTES.map((note, i) => {
            const isBlack = note.includes('#')
            return (
              <button
                key={note}
                className={`outotune-piano-key ${isBlack ? 'black' : 'white'} ${noteEnables[i] ? 'active' : ''}`}
                onClick={() => toggleNote(i)}
                style={{ '--accent': accentColor } as React.CSSProperties}
                title={note}
              >
                {!isBlack && <span>{note}</span>}
              </button>
            )
          })}
        </div>
      </ParameterSection>

      {/* Correction Controls */}
      <ParameterSection title="Correction" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Speed"
            value={getValue('correction', 60)}
            min={0}
            max={100}
            defaultValue={60}
            unit="%"
            onChange={(v) => setValue('correction', v)}
            accentColor={accentColor}
            size="large"
            valueFormatter={(v) => {
              if (v < 20) return 'Slow'
              if (v < 50) return 'Medium'
              if (v < 80) return 'Fast'
              return 'Instant'
            }}
          />
          <ParameterKnob
            label="Formant"
            value={getValue('formant', 80)}
            min={0}
            max={100}
            defaultValue={80}
            unit="%"
            onChange={(v) => setValue('formant', v)}
            accentColor="#f59e0b"
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Fine Tune & Mix */}
      <ParameterSection title="Output" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Detune"
            value={getValue('detune', 0)}
            min={-100}
            max={100}
            defaultValue={0}
            unit="¢"
            onChange={(v) => setValue('detune', v)}
            accentColor="#6b7280"
            size="medium"
            valueFormatter={(v) => (v >= 0 ? '+' : '') + v.toFixed(0)}
          />
          <ParameterKnob
            label="Mix"
            value={getValue('mix', 100)}
            min={0}
            max={100}
            defaultValue={100}
            unit="%"
            onChange={(v) => setValue('mix', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Footer info */}
      <div className="outotune-footer">
        <div className="outotune-footer-item">
          <MusicNote size={10} weight="duotone" />
          <span>{NOTES[selectedKey]} {SCALES[selectedScale].name}</span>
        </div>
        <div className="outotune-footer-item">
          <WaveSine size={10} weight="duotone" />
          <span>Latency: 23ms</span>
        </div>
      </div>
    </PluginCardShell>
  )
}

export default OutotuneCard
