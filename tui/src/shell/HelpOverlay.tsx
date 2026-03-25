import React from 'react'
import { Box } from 'ink'
import { BoxPanel } from '../components/BoxPanel'
import { KeyHint } from '../components/KeyHint'

export function HelpOverlay() {
  return (
    <BoxPanel title="Global Keys">
      <Box flexDirection="column">
        <KeyHint keys="Ctrl+P" description="Open screen palette" />
        <KeyHint keys="Esc" description="Close overlay or go back" />
        <KeyHint keys="1-9" description="Jump to pinned screens" />
        <KeyHint keys="j / k" description="Move within lists and menus" />
        <KeyHint keys="?" description="Toggle help" />
      </Box>
    </BoxPanel>
  )
}
