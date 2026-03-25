import React from 'react'
import { Box, Text } from 'ink'

export function ConfirmDialog({ title, body }: { title: string; body: string }) {
  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1}>
      <Text color="yellow">{title}</Text>
      <Text>{body}</Text>
      <Text color="gray">Press y to confirm or n to cancel.</Text>
    </Box>
  )
}
