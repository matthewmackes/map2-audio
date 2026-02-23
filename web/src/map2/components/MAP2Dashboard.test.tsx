import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

jest.mock('./IRManager', () => () => <div>IRManager</div>);
jest.mock('./NAMManager', () => () => <div>NAMManager</div>);
jest.mock('./MetricsDashboard', () => () => <div>MetricsDashboard</div>);
jest.mock('./SettingsPanel', () => () => <div>SettingsPanel</div>);
jest.mock('./ChainBuilder', () => () => <div>ChainBuilder</div>);
jest.mock('./PluginBrowser', () => () => <div>PluginBrowser</div>);
jest.mock('./MIDIMapper', () => () => <div>MIDIMapper</div>);
jest.mock('./AudioEngine', () => () => <div>AudioEngine</div>);
jest.mock('./WorkFlow', () => () => <div>WorkFlow</div>);
jest.mock('./NetworkPanel', () => () => <div>NetworkPanel</div>);
jest.mock('./WWWPanel', () => () => <div>WWWPanel</div>);
jest.mock('./FeaturesPanel', () => ({
  __esModule: true,
  default: () => <div>FeaturesPanel</div>,
  FeatureStatusBar: () => <div>FeatureStatusBar</div>,
}));
jest.mock('../hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({ status: 'disconnected' }),
  useWebSocketStatus: () => ({ status: 'disconnected' }),
}));

import MAP2Dashboard from './MAP2Dashboard';

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
