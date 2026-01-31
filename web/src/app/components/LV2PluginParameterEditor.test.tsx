import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import LV2PluginParameterEditor from './LV2PluginParameterEditor';

describe('LV2PluginParameterEditor', () => {
  const queryClient = new QueryClient();
  const mockPlugin = {
    uri: 'test-lv2-plugin',
    name: 'Test LV2 Plugin',
    parameters: [
      { index: 0, symbol: 'gain', value: 0.5, default: 0.5 },
      { index: 1, symbol: 'frequency', value: 440, default: 440 },
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

    fireEvent.change(screen.getByPlaceholderText('Preset Name'), {
      target: { value: 'Test Preset' },
    });
    fireEvent.click(screen.getByText('Save Preset'));

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