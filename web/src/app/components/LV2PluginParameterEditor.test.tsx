import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LV2PluginParameterEditor from './LV2PluginParameterEditor';

jest.mock('../../map2/api', () => ({
  getWsBaseUrl: jest.fn(() => 'ws://localhost:8080'),
  pluginsApi: {
    setParameterBatched: jest.fn().mockResolvedValue(undefined),
    flushParameterBatch: jest.fn(),
  },
  pluginPresetsApi: {
    getByPluginUri: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Test Preset' }),
    load: jest.fn().mockResolvedValue(undefined),
    toggleFavorite: jest.fn().mockResolvedValue(undefined),
  },
  chainsApi: {
    list: jest.fn().mockResolvedValue([]),
    addPlugin: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../hooks/usePluginOutputs', () => ({
  usePluginOutput: () => ({ outputPorts: {} }),
}));

describe('LV2PluginParameterEditor', () => {
  const queryClient = new QueryClient();
  const mockPlugin = {
    uri: 'test-lv2-plugin',
    name: 'Test LV2 Plugin',
    parameters: [
      {
        index: 0,
        symbol: 'gain',
        name: 'gain',
        value: 0.5,
        default: 0.5,
        min: 0,
        max: 1,
        is_toggled: false,
        is_log: false,
      },
      {
        index: 1,
        symbol: 'frequency',
        name: 'frequency',
        value: 440,
        default: 440,
        min: 20,
        max: 20000,
        is_toggled: false,
        is_log: true,
      },
    ],
  };

  test('should initialize parameters correctly', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LV2PluginParameterEditor plugin={mockPlugin} />
      </QueryClientProvider>
    );

    expect(screen.getByText('gain')).toBeInTheDocument();
    expect(screen.getByText('frequency')).toBeInTheDocument();
  });

  test('should save preset successfully', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LV2PluginParameterEditor plugin={mockPlugin} />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getAllByText('Save')[0]);
    fireEvent.change(screen.getByPlaceholderText('Preset name...'), {
      target: { value: 'Test Preset' },
    });
    fireEvent.click(screen.getAllByText('Save')[1]);

    expect(await screen.findByText('Preset saved successfully!')).toBeInTheDocument();
  });

  test('should handle missing parameters gracefully', () => {
    const incompletePlugin = { ...mockPlugin, parameters: [] };

    render(
      <QueryClientProvider client={queryClient}>
        <LV2PluginParameterEditor plugin={incompletePlugin} />
      </QueryClientProvider>
    );

    expect(
      screen.getByText('Plugin parameters could not be loaded. Ensure the LV2 plugin is compatible.')
    ).toBeInTheDocument();
  });
});
