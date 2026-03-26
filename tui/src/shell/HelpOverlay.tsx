import React from 'react'
import { Box } from 'ink'
import { BoxPanel } from '../components/BoxPanel'
import { KeyHint } from '../components/KeyHint'

export function HelpOverlay() {
  return (
    <BoxPanel title="Global Keys">
      <Box flexDirection="column">
        <KeyHint keys="Ctrl+P" description="Open screen palette" />
        <KeyHint keys="[ / ]" description="Cycle through all screens" />
        <KeyHint keys="q / Ctrl+Q" description="Exit map2-tui" />
        <KeyHint keys="Ctrl+L" description="Clear the terminal canvas" />
        <KeyHint keys="1-8" description="On Signal Chains Live, toggle slot bypass" />
        <KeyHint keys="Esc" description="Close overlay or go back" />
        <KeyHint keys="1-9" description="Outside the live screen, jump to pinned screens" />
        <KeyHint keys="j / k" description="Move within lists and menus" />
        <KeyHint keys="?" description="Toggle help" />
      </Box>
    </BoxPanel>
  )
}
