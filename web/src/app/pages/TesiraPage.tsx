import React from 'react'
import { Box } from '@mui/material'
import { TesiraApp } from '../components/Tesira/TesiraApp'

export function TesiraPage() {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TesiraApp />
    </Box>
  )
}
