import {
  Button,
  InlineLoading,
  Select,
  SelectItem,
  Tag,
  Tile,
} from '@carbon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import {
  maschineApi,
  type MaschineLedChoreography,
  type MaschineLedChoreographyEntry,
  type MaschineLedColorName,
} from '../../../map2/clients/maschine'

// T2522-D cycle 10 — Per-pad LED choreography editor.
//
// Lets the operator pick an idle and press color for each of the 16
// pads. The cabl protocol's color enum is sparse and string-typed
// (mirrored from the daemon side); we expose all 9 named colors
// through a Select for each pad. Persistence flows through the
// calibration_facade — same store + same FUTURE_DEVICES_DIR contract
// as cycle-6 pressure curves and cycle-7 performance patterns.

const COLOR_OPTIONS: MaschineLedColorName[] = [
  'empty',
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'magenta',
  'white',
]

const COLOR_SWATCH_HEX: Record<MaschineLedColorName, string> = {
  empty: '#1c2030',
  red: '#fa4d56',
  orange: '#ff832b',
  yellow: '#f1c21b',
  green: '#42be65',
  cyan: '#33b1ff',
  blue: '#4589ff',
  magenta: '#ff7eb6',
  white: '#f4f4f4',
}

function emptyEntry(): MaschineLedChoreographyEntry {
  return { idle_color: 'empty', press_color: 'white' }
}

export function MaschinePadLedChoreography() {
  const queryClient = useQueryClient()
  const choreographyQuery = useQuery({
    queryKey: ['maschine', 'led-choreography'],
    queryFn: () => maschineApi.getLedChoreography(),
    staleTime: 5_000,
  })

  const remote = choreographyQuery.data?.led_choreography ?? null
  const [working, setWorking] = useState<MaschineLedChoreographyEntry[] | null>(null)

  useEffect(() => {
    if (remote && working === null) {
      setWorking(remote.per_pad.map((entry) => ({ ...entry })))
    }
  }, [remote, working])

  const isDirty = useMemo(() => {
    if (!working || !remote) return false
    if (working.length !== remote.per_pad.length) return true
    for (let i = 0; i < working.length; i += 1) {
      const a = working[i]
      const b = remote.per_pad[i]
      if (a.idle_color !== b.idle_color || a.press_color !== b.press_color) return true
    }
    return false
  }, [working, remote])

  const saveMutation = useMutation({
    mutationFn: (next: MaschineLedChoreography) => maschineApi.updateLedChoreography(next),
    onSuccess: (response) => {
      setWorking(response.led_choreography.per_pad.map((e) => ({ ...e })))
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'led-choreography'] })
    },
  })

  const updatePad = (padIdx: number, field: 'idle_color' | 'press_color', value: MaschineLedColorName) => {
    setWorking((prev) => {
      if (!prev) return prev
      const next = prev.map((entry) => ({ ...entry }))
      while (next.length <= padIdx) next.push(emptyEntry())
      next[padIdx] = { ...next[padIdx], [field]: value }
      return next
    })
  }

  const handleResetAll = () => {
    setWorking(Array.from({ length: 16 }, () => emptyEntry()))
  }

  const handleSave = () => {
    if (!working) return
    saveMutation.mutate({ per_pad: working })
  }

  const isLoading = choreographyQuery.isLoading
  const errorMsg = choreographyQuery.isError
    ? (choreographyQuery.error as Error)?.message ?? 'Failed to load LED choreography'
    : saveMutation.isError
      ? (saveMutation.error as Error)?.message ?? 'Failed to save LED choreography'
      : null

  return (
    <Tile className="maschine-led-cho">
      <header className="maschine-mapping__header" style={{ padding: 0 }}>
        <div>
          <h4 className="maschine-mapping__pane-title">Pad LED choreography</h4>
          <p className="maschine-mapping__sub" style={{ marginTop: '0.25rem' }}>
            Per-pad idle + press colors. Daemon picks them up on the next reconnect; the existing LED
            preview panel in Diagnostics reflects the saved values immediately on connected hardware.
          </p>
        </div>
        <div className="maschine-mapping__header-actions">
          {isDirty ? <Tag size="sm" type="magenta">Unsaved</Tag> : null}
          <Button kind="ghost" size="sm" onClick={handleResetAll}>Reset all to empty/white</Button>
          {saveMutation.isPending ? (
            <InlineLoading description="Saving…" />
          ) : (
            <Button kind="primary" size="sm" onClick={handleSave} disabled={!isDirty || !working}>
              Save choreography
            </Button>
          )}
        </div>
      </header>

      {errorMsg ? <p className="maschine-curve-editor__error">{errorMsg}</p> : null}

      {isLoading || !working ? (
        <InlineLoading description="Loading choreography…" />
      ) : (
        <div className="maschine-led-cho__grid">
          {working.map((entry, padIdx) => (
            <div key={`led-cho-${padIdx}`} className="maschine-led-cho__row" data-pad-index={padIdx}>
              <div className="maschine-led-cho__label">
                <span className="maschine-led-cho__pad-num">Pad {padIdx + 1}</span>
                <span className="maschine-led-cho__pad-note">N{36 + padIdx}</span>
              </div>
              <div className="maschine-led-cho__field">
                <span
                  className="maschine-led-cho__swatch"
                  style={{ background: COLOR_SWATCH_HEX[entry.idle_color] }}
                  aria-hidden
                />
                <Select
                  id={`led-cho-${padIdx}-idle`}
                  labelText="Idle"
                  size="sm"
                  value={entry.idle_color}
                  onChange={(e) => updatePad(padIdx, 'idle_color', e.target.value as MaschineLedColorName)}
                >
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c} text={c} />
                  ))}
                </Select>
              </div>
              <div className="maschine-led-cho__field">
                <span
                  className="maschine-led-cho__swatch"
                  style={{ background: COLOR_SWATCH_HEX[entry.press_color] }}
                  aria-hidden
                />
                <Select
                  id={`led-cho-${padIdx}-press`}
                  labelText="Press"
                  size="sm"
                  value={entry.press_color}
                  onChange={(e) => updatePad(padIdx, 'press_color', e.target.value as MaschineLedColorName)}
                >
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c} text={c} />
                  ))}
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </Tile>
  )
}
