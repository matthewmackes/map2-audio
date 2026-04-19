/**
 * OutotuneCard - Outotune Auto-Tune Plugin (Carbon-compliant)
 *
 * Antares Auto-Tune inspired pitch correction using PitchCategoryLayout.
 *
 * LV2 URI: https://github.com/x42/fat1.lv2 (or outotune variant)
 */

import { useState, useMemo } from 'react'
import { PitchCategoryLayout, type ParamSlot } from '../../Layouts/PitchCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { ParameterKnob } from '../../../ParameterControl'
import { TunerDisplay } from '../../Visualizations/TunerDisplay'
import { Flash, Music } from '@carbon/icons-react'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

const PARAM_MAP = {
  correction: 0,
  detune: 1,
  formant: 2,
  mix: 3,
  key: 4,
  scale: 5,
  bypass: 6,
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
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const [selectedKey, setSelectedKey] = useState(0)
  const [selectedScale, setSelectedScale] = useState(0)
  const [noteEnables, setNoteEnables] = useState<boolean[]>(Array(12).fill(true))

  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  const pitchData = useMemo(() => {
    if (realtimeData?.tuner) {
      return {
        detectedPitch: realtimeData.tuner.frequency || 0,
        targetPitch: 440,
        cents: realtimeData.tuner.cents || 0,
        noteName: `${realtimeData.tuner.note}${realtimeData.tuner.octave}` || '--',
        confidence: realtimeData.tuner.confidence || 0,
      }
    }
    return {
      detectedPitch: 442.3,
      targetPitch: 440,
      cents: Math.sin(Date.now() / 500) * 15,
      noteName: 'A4',
      confidence: 0.9,
    }
  }, [realtimeData])

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

    NOTES.forEach((_, i) => {
      const paramKey = `note${NOTES[i].replace('#', 'Sharp')}` as keyof typeof PARAM_MAP
      if (PARAM_MAP[paramKey] !== undefined) {
        onParameterChange(PARAM_MAP[paramKey], newEnables[i] ? 1 : 0)
      }
    })
  }

  const toggleNote = (noteIndex: number) => {
    const newEnables = [...noteEnables]
    newEnables[noteIndex] = !newEnables[noteIndex]
    setNoteEnables(newEnables)

    const paramKey = `note${NOTES[noteIndex].replace('#', 'Sharp')}` as keyof typeof PARAM_MAP
    if (PARAM_MAP[paramKey] !== undefined) {
      onParameterChange(PARAM_MAP[paramKey], newEnables[noteIndex] ? 1 : 0)
    }
  }

  const applyPreset = (preset: typeof CORRECTION_PRESETS[0]) => {
    setValue('correction', preset.speed)
    setValue('formant', preset.formant)
  }

  const visualization = (
    <div style={{ padding: '4px 0' }}>
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

  const presets = (
    <div className="carbon-preset-row">
      {CORRECTION_PRESETS.map((preset) => (
        <button
          key={preset.name}
          className={`carbon-preset-btn ${getValue('correction', 60) === preset.speed ? 'carbon-preset-btn--active' : ''}`}
          onClick={() => applyPreset(preset)}
        >
          {preset.name === 'T-Pain' ? <Flash size={10} /> : null}
          {preset.name}
        </button>
      ))}
    </div>
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'key-scale',
      title: 'Key & Scale',
      icon: <Music size={16} />,
      defaultOpen: true,
      children: (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Key</label>
              <select
                value={selectedKey}
                onChange={(e) => applyScale(selectedScale, parseInt(e.target.value))}
                style={{ width: '100%', padding: '6px 8px', background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
              >
                {NOTES.map((note, i) => (
                  <option key={note} value={i}>{note}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Scale</label>
              <select
                value={selectedScale}
                onChange={(e) => applyScale(parseInt(e.target.value), selectedKey)}
                style={{ width: '100%', padding: '6px 8px', background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
              >
                {SCALES.map((scale, i) => (
                  <option key={scale.name} value={i}>{scale.name}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Piano Roll Note Enable */}
          <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            {NOTES.map((note, i) => {
              const isBlack = note.includes('#')
              return (
                <button
                  key={note}
                  onClick={() => toggleNote(i)}
                  style={{
                    width: isBlack ? 20 : 26, height: isBlack ? 32 : 40,
                    border: noteEnables[i] ? `1px solid ${accentColor}` : '1px solid #374151',
                    borderRadius: 4, cursor: 'pointer', fontSize: 8,
                    background: noteEnables[i] ? (isBlack ? accentColor : `${accentColor}33`) : (isBlack ? '#1e293b' : '#111827'),
                    color: noteEnables[i] ? '#fff' : '#6b7280',
                  }}
                  title={note}
                >
                  {!isBlack && note}
                </button>
              )
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 6, fontSize: 10, color: '#6b7280' }}>
            {NOTES[selectedKey]} {SCALES[selectedScale].name}
          </div>
        </div>
      ),
    },
    {
      id: 'formant',
      title: 'Formant Preservation',
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Formant" value={getValue('formant', 80)}
            min={0} max={100} defaultValue={80} unit="%"
            onChange={(v) => setValue('formant', v)}
            accentColor={accentColor} size="small"
          />
        </div>
      ),
    },
  ]

  // Pitch section: correction speed as semitones slot
  const semitones: ParamSlot = {
    label: 'Speed', value: getValue('correction', 60),
    min: 0, max: 100, defaultValue: 60, unit: '%',
    onChange: (v) => setValue('correction', v),
    valueFormatter: (v) => {
      if (v < 20) return 'Slow'
      if (v < 50) return 'Medium'
      if (v < 80) return 'Fast'
      return 'Instant'
    },
  }

  const detune: ParamSlot = {
    label: 'Detune', value: getValue('detune', 0),
    min: -100, max: 100, defaultValue: 0, unit: '\u00a2',
    onChange: (v) => setValue('detune', v),
    valueFormatter: (v) => (v >= 0 ? '+' : '') + v.toFixed(0),
  }

  const mix: ParamSlot = {
    label: 'Mix', value: getValue('mix', 100),
    min: 0, max: 100, defaultValue: 100, unit: '%',
    onChange: (v) => setValue('mix', v),
  }

  return (
    <PitchCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      semitones={semitones}
      detune={detune}
      mix={mix}
      advancedSections={advancedSections}
      presets={presets}
    />
  )
}

export default OutotuneCard
