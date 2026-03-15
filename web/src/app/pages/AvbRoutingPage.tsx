import React from 'react'
import { Layer } from '@carbon/react'
import { CssBaseline } from '@mui/material'
import { ThemeProvider, createTheme } from '@mui/material/styles'

import { AvbRoutingApp } from '../components/AvbRouting'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'
import './AvbRoutingPage.css'

const avbRoutingMuiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0f62fe',
      light: '#78a9ff',
      dark: '#002d9c',
      contrastText: '#f4f4f4',
    },
    secondary: {
      main: '#4589ff',
      contrastText: '#f4f4f4',
    },
    background: {
      default: '#161616',
      paper: '#262626',
    },
    text: {
      primary: '#f4f4f4',
      secondary: '#c6c6c6',
      disabled: '#8d8d8d',
    },
    divider: '#525252',
    info: { main: '#4589ff' },
    success: { main: '#24a148' },
    warning: { main: '#f1c21b' },
    error: { main: '#da1e28' },
  },
  shape: {
    borderRadius: 0,
  },
  typography: {
    fontFamily: 'var(--font-sans, "IBM Plex Sans", sans-serif)',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: 'dark',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text-primary)',
          boxShadow: 'none',
          borderBottom: '1px solid var(--border-strong)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text-primary)',
          boxShadow: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid var(--border)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text-primary)',
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text-primary)',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text-primary)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--surface)',
          color: 'var(--text-primary)',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--border-strong)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--text-secondary)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--interactive)',
          },
        },
        input: {
          color: 'var(--text-primary)',
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          color: 'var(--text-primary)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          textTransform: 'none',
          boxShadow: 'none',
        },
        contained: {
          backgroundColor: 'var(--interactive)',
          color: 'var(--text-primary)',
        },
        outlined: {
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: 'var(--text-primary)',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: 'var(--text-secondary)',
          '&.Mui-selected': {
            color: 'var(--text-primary)',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: 'var(--interactive)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
})

export function AvbRoutingPage() {
  return (
    <ThemeProvider theme={avbRoutingMuiTheme}>
      <CssBaseline enableColorScheme />
      <section className="avb-routing-page">
        <LandscapePrompt componentId="avb-routing" />
        <Layer className="avb-routing-page__hero">
          <h2 className="avb-routing-page__title">Unified routing studio</h2>
          <p className="avb-routing-page__subtitle">
            Topology + matrix + signal-chain mapping with canonical AVB health diagnostics
          </p>
        </Layer>
        <div className="avb-routing-page__content">
          <AvbRoutingApp />
        </div>
      </section>
    </ThemeProvider>
  )
}
