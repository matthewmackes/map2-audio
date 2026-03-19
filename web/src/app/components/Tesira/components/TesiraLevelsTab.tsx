import React, { useState, useCallback, useRef } from 'react'
import { VolumeUp } from '@carbon/icons-react'
import {
  Box, Typography, Slider, IconButton, Tooltip, TextField, MenuItem,
} from '@mui/material'
import { useTesiraDevice } from '../hooks/useTesiraApi'
import { useSetLevel, useSetMute } from '../hooks/useTesiraApi'
import { useTesiraMeters } from '../hooks/useTesiraWebSocket'

interface TesiraLevelsTabProps {
  deviceId: string
}

const MAX_VISIBLE_CHANNELS = 16

export function TesiraLevelsTab({ deviceId }: TesiraLevelsTabProps) {
  const { data: device } = useTesiraDevice(deviceId)
  const setLevel = useSetLevel()
  const setMute = useSetMute()

  // Meter levels keyed by instance_tag → channel index → dBu value
  const [meters, setMeters] = useState<Record<string, number[]>>({})

  // Use the first metering tag we can find on the device
  const instanceTag = device?.avb_streams?.[0]?.name ?? 'LevelControl1'

  useTesiraMeters(deviceId, instanceTag, useCallback((levels: number[]) => {
    setMeters((prev) => ({ ...prev, [instanceTag]: levels }))
  }, [instanceTag]))

  const [selectedTag, setSelectedTag] = useState('LevelControl1')

  // Show max 16 channels in this basic view
  const numChannels = Math.min(
    device?.avb_streams?.reduce((n, s) => Math.max(n, s.channels), 0) ?? 2,
    MAX_VISIBLE_CHANNELS
  )

  return (
    <Box sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          INSTANCE TAG
        </Typography>
        <TextField
          size="small"
          value={selectedTag}
          onChange={(e) => setSelectedTag(e.target.value)}
          sx={{ width: 200 }}
          inputProps={{ style: { fontSize: 12, padding: '4px 8px' } }}
          placeholder="e.g. LevelControl1"
        />
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {Array.from({ length: numChannels }, (_, ch) => {
          const meterLevel = meters[selectedTag]?.[ch] ?? -60
          const meterPct = Math.max(0, Math.min(100, ((meterLevel + 60) / 60) * 100))

          return (
            <Box
              key={ch}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 48,
                gap: 0.5,
              }}
            >
              {/* VU bar */}
              <Box
                sx={{
                  width: 8,
                  height: 80,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    height: `${meterPct}%`,
                    bgcolor: meterPct > 90 ? 'error.main' : meterPct > 70 ? 'warning.main' : '#E31837',
                    transition: 'height 0.05s ease-out',
                  }}
                />
              </Box>

              {/* Level slider (vertical) */}
              <Slider
                orientation="vertical"
                size="small"
                min={-60}
                max={12}
                step={0.5}
                defaultValue={0}
                sx={{ height: 80, color: '#E31837' }}
                onChange={(_e, val) =>
                  setLevel.mutate({
                    deviceId, tag: selectedTag, channel: ch, levelDb: val as number,
                  })
                }
              />

              {/* Mute button */}
              <IconButton
                size="small"
                onClick={() => setMute.mutate({ deviceId, tag: selectedTag, channel: ch, muted: true })}
                sx={{ p: 0.25 }}
              >
                <VolumeUp size={14} />
              </IconButton>

              <Typography variant="caption" sx={{ fontSize: 10 }}>
                Ch{ch + 1}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
