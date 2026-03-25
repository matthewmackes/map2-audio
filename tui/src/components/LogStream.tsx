import React from 'react'
import { Box, Text } from 'ink'

export function LogStream({ lines }: { lines: string[] }) {
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={`${line}-${index}`} color="gray">
          {line}
        </Text>
      ))}
    </Box>
  )
}
