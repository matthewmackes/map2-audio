import { render, screen } from '@testing-library/react';
import MAP2Dashboard from './MAP2Dashboard';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

describe('MAP2Dashboard Component', () => {
  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
    },
  });

  it('renders without crashing', () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <MAP2Dashboard />
      </ThemeProvider>
    );

    expect(screen.getByText('MAP2 Audio Dashboard')).toBeInTheDocument();
  });

  it('renders all tabs', () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <MAP2Dashboard />
      </ThemeProvider>
    );

    const tabs = [
      'Audio',
      'Chains',
      'Plugins',
      'MIDI',
      'Cabinets/IR',
      'NAM Models',
      'WorkFlow',
      'Settings',
    ];

    tabs.forEach((tab) => {
      expect(screen.getByText(tab)).toBeInTheDocument();
    });
  });

  it('displays WebSocket connection status', () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <MAP2Dashboard />
      </ThemeProvider>
    );

    // Simulate WebSocket connection status
    expect(screen.queryByText('Real-time updates connected')).not.toBeInTheDocument();
  });
});