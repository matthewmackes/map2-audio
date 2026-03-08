import React from 'react';
import { Box, CssBaseline, Typography } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AvbRoutingApp } from '../components/AvbRouting';

const avbRoutingTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0ea5e9',
    },
    secondary: {
      main: '#22d3ee',
    },
    background: {
      default: '#050607',
      paper: '#101418',
    },
    divider: 'rgba(255,255,255,0.12)',
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8',
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
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#0b0f14',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0d1117',
          backgroundImage: 'none',
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: '#121821',
          border: '1px solid rgba(255,255,255,0.12)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#121821',
          backgroundImage: 'none',
        },
      },
    },
  },
});

export function AvbRoutingPage() {
  return (
    <ThemeProvider theme={avbRoutingTheme}>
      <CssBaseline enableColorScheme />
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          bgcolor: 'background.default',
        }}
      >
        <Box
          sx={{
            px: { xs: 1.5, sm: 2 },
            py: { xs: 1, sm: 1.25 },
            borderBottom: '1px solid',
            borderColor: 'divider',
            background: 'linear-gradient(90deg, rgba(14,165,233,0.22) 0%, rgba(2,6,23,0.92) 100%)',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Unified Routing Studio
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}
          >
            Topology + matrix + signal-chain mapping with canonical AVB health diagnostics
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <AvbRoutingApp />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
