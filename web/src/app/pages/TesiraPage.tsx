import React from 'react'
import { Box, CssBaseline } from '@mui/material'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { TesiraApp } from '../components/Tesira/TesiraApp'

const tesiraTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#E31837',
    },
    secondary: {
      main: '#ff6b6b',
    },
    background: {
      default: '#0a0a0a',
      paper: '#111111',
    },
    divider: 'rgba(255,255,255,0.08)',
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8',
      disabled: '#4b5563',
    },
    success: {
      main: '#22c55e',
      dark: '#14532d',
    },
    warning: {
      main: '#f59e0b',
      dark: '#78350f',
    },
    error: {
      main: '#ef4444',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#111111',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#161616',
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.08)',
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: '#161616',
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.08)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: '#94a3b8',
          '&.Mui-selected': {
            color: '#f1f5f9',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.15)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.3)',
          },
        },
      },
    },
  },
})

export function TesiraPage() {
  return (
    <ThemeProvider theme={tesiraTheme}>
      <CssBaseline enableColorScheme />
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TesiraApp />
      </Box>
    </ThemeProvider>
  )
}
