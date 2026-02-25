import React from 'react'
import { Box } from '@mui/material'
import { TesiraProvider } from './context/TesiraContext'
import { TesiraTopBar } from './components/TesiraTopBar'
import { TesiraFleetPanel } from './components/TesiraFleetPanel'
import { TesiraControlPanel } from './components/TesiraControlPanel'

/**
 * TesiraApp — main container for Biamp Tesira Forte AVB fleet management.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │  TesiraTopBar (breadcrumb, PTP badge)  │
 *   ├──────────┬─────────────────────────────┤
 *   │  Fleet   │  ControlPanel (6 tabs)      │
 *   │  Panel   │  Levels / Mixer / EQ /      │
 *   │  (≤5 U)  │  Presets / AVB / Faults     │
 *   └──────────┴─────────────────────────────┘
 */
export function TesiraApp() {
  return (
    <TesiraProvider>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          bgcolor: 'background.default',
        }}
      >
        <TesiraTopBar />

        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left: fleet panel (fixed width) */}
          <Box
            sx={{
              width: 220,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'auto',
            }}
          >
            <TesiraFleetPanel />
          </Box>

          {/* Right: device control panel */}
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <TesiraControlPanel />
          </Box>
        </Box>
      </Box>
    </TesiraProvider>
  )
}
