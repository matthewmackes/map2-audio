import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { VolumeMute, VolumeUp } from '@carbon/icons-react'
import { Button, Tag, TextInput, Tile } from '@carbon/react'
import { useTesiraDevice, useSetLevel, useSetMute } from '../hooks/useTesiraApi'
import { useTesiraMeters } from '../hooks/useTesiraWebSocket'
import './TesiraCarbonChrome.css'

interface TesiraLevelsTabProps {
  deviceId: string
}

const MAX_VISIBLE_CHANNELS = 16
const LEVEL_MIN_DB = -60
const LEVEL_MAX_DB = 12
const DEFAULT_LEVEL_DB = '0'

function clampLevel(value: number): number {
  return Math.max(LEVEL_MIN_DB, Math.min(LEVEL_MAX_DB, value))
}

function normalizeLevelInput(value: string): string {
  return value.replace(/[^0-9.\-]/g, '')
}

function parseLevel(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? clampLevel(parsed) : fallback
}

function meterPercent(level: number): number {
  return Math.max(0, Math.min(100, ((level + 60) / 60) * 100))
}

function meterTone(level: number): string {
  if (level >= -6) return 'var(--cds-support-error)'
  if (level >= -18) return 'var(--cds-support-warning)'
  return 'var(--cds-support-success)'
}

export function TesiraLevelsTab({ deviceId }: TesiraLevelsTabProps) {
  const { data: device } = useTesiraDevice(deviceId)
  const setLevel = useSetLevel()
  const setMute = useSetMute()

  const [meters, setMeters] = useState<Record<string, number[]>>({})
  const [selectedTag, setSelectedTag] = useState('LevelControl1')
  const [tagTouched, setTagTouched] = useState(false)
  const [levelDrafts, setLevelDrafts] = useState<Record<number, string>>({})

  const defaultTag = useMemo(
    () => device?.avb_streams?.[0]?.name ?? 'LevelControl1',
    [device?.avb_streams],
  )

  useEffect(() => {
    if (!tagTouched) {
      setSelectedTag(defaultTag)
    }
  }, [defaultTag, tagTouched])

  useTesiraMeters(deviceId, selectedTag, useCallback((levels: number[]) => {
    setMeters((prev) => ({ ...prev, [selectedTag]: levels }))
  }, [selectedTag]))

  const streamTagOptions = useMemo(() => {
    const options = new Set<string>()
    ;(device?.avb_streams ?? []).forEach((stream) => {
      if (stream.name) {
        options.add(stream.name)
      }
    })
    options.add(defaultTag)
    return Array.from(options)
  }, [defaultTag, device?.avb_streams])

  const numChannels = Math.min(
    device?.avb_streams?.reduce((count, stream) => Math.max(count, stream.channels), 0) ?? 2,
    MAX_VISIBLE_CHANNELS,
  )

  useEffect(() => {
    setLevelDrafts((prev) => {
      const next = { ...prev }
      for (let channel = 0; channel < numChannels; channel += 1) {
        if (next[channel] == null) {
          next[channel] = DEFAULT_LEVEL_DB
        }
      }
      return next
    })
  }, [numChannels])

  const handleApplyLevel = (channel: number) => {
    const levelDb = parseLevel(levelDrafts[channel] ?? DEFAULT_LEVEL_DB, 0)
    setLevel.mutate({ deviceId, tag: selectedTag, channel, levelDb })
    setLevelDrafts((prev) => ({ ...prev, [channel]: String(levelDb) }))
  }

  const handleMute = (channel: number, muted: boolean) => {
    setMute.mutate({ deviceId, tag: selectedTag, channel, muted })
  }

  return (
    <div className="tesira-levels-tab">
      <Tile className="tesira-levels-tab__tile">
        <div className="tesira-levels-tab__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Live level control</p>
            <h3 className="tesira-dashboard__title">Trim, mute, and meter a Tesira level block</h3>
            <p className="tesira-dashboard__summary">
              This view now follows the selected instance tag for live metering instead of staying pinned to the first discovered stream.
            </p>
          </div>
          <div className="tesira-levels-tab__tags">
            <Tag type="cool-gray" size="sm">{selectedTag}</Tag>
            <Tag type="warm-gray" size="sm">{numChannels} channels</Tag>
          </div>
        </div>

        <TextInput
          id={`tesira-levels-tag-${deviceId}`}
          labelText="Instance tag"
          placeholder="LevelControl1"
          value={selectedTag}
          onChange={(event) => {
            setSelectedTag(event.target.value)
            setTagTouched(true)
          }}
          list={`tesira-levels-tags-${deviceId}`}
        />
        <datalist id={`tesira-levels-tags-${deviceId}`}>
          {streamTagOptions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </Tile>

      <div className="tesira-levels-tab__grid">
        {Array.from({ length: numChannels }, (_, channel) => {
          const meterLevel = meters[selectedTag]?.[channel] ?? LEVEL_MIN_DB
          const draft = levelDrafts[channel] ?? DEFAULT_LEVEL_DB
          const draftNumber = parseLevel(draft, 0)

          return (
            <Tile key={channel} className="tesira-levels-tab__channel">
              <div className="tesira-levels-tab__channel-header">
                <div>
                  <h4 className="tesira-levels-tab__channel-title">{`Channel ${channel + 1}`}</h4>
                  <p className="tesira-levels-tab__channel-meta">{`Meter ${meterLevel.toFixed(1)} dBu`}</p>
                </div>
                <Tag type="blue" size="sm">{`${draftNumber.toFixed(1)} dB`}</Tag>
              </div>

              <div className="tesira-levels-tab__meter-shell" aria-hidden="true">
                <div
                  className="tesira-levels-tab__meter-fill"
                  style={{
                    height: `${meterPercent(meterLevel)}%`,
                    background: meterTone(meterLevel),
                  }}
                />
              </div>

              <TextInput
                id={`tesira-level-${deviceId}-${channel}`}
                labelText={`Level dB channel ${channel + 1}`}
                value={draft}
                onChange={(event) => {
                  setLevelDrafts((prev) => ({
                    ...prev,
                    [channel]: normalizeLevelInput(event.target.value),
                  }))
                }}
                inputMode="decimal"
              />

              <input
                className="tesira-levels-tab__range"
                type="range"
                min={LEVEL_MIN_DB}
                max={LEVEL_MAX_DB}
                step={0.5}
                value={draftNumber}
                onChange={(event) => {
                  setLevelDrafts((prev) => ({
                    ...prev,
                    [channel]: event.currentTarget.value,
                  }))
                }}
                aria-label={`Level slider channel ${channel + 1}`}
              />

              <div className="tesira-levels-tab__actions">
                <Button
                  size="sm"
                  kind="secondary"
                  renderIcon={VolumeUp}
                  onClick={() => handleApplyLevel(channel)}
                  disabled={setLevel.isPending}
                  aria-label={`Set level for channel ${channel + 1}`}
                >
                  Set level
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={VolumeMute}
                  onClick={() => handleMute(channel, true)}
                  disabled={setMute.isPending}
                  aria-label={`Mute channel ${channel + 1}`}
                >
                  Mute
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={VolumeUp}
                  onClick={() => handleMute(channel, false)}
                  disabled={setMute.isPending}
                  aria-label={`Unmute channel ${channel + 1}`}
                >
                  Unmute
                </Button>
              </div>
            </Tile>
          )
        })}
      </div>
    </div>
  )
}
