import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

import { useDeviceLocation, useHardwareMenuLocations } from '../useDeviceLocation'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makeJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('useDeviceLocation', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = fetchMock
    fetchMock.mockReset()
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('finds the node hosting the Edirol UA-1000 from cluster inventory', async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        nodes: {
          'node-a': {
            hostname: 'audio-a',
            status: 'online',
            usb_audio_devices: [],
            midi_devices: [],
            audio_interfaces: [],
            pipewire_devices: [],
          },
          'node-b': {
            hostname: 'audio-b',
            status: 'online',
            usb_audio_devices: [{ name: 'Edirol UA-1000', vid_pid: '0582:0074' }],
            midi_devices: [],
            audio_interfaces: ['Edirol UA-1000'],
            pipewire_devices: [],
          },
        },
      }),
    )

    const { result } = renderHook(() => useDeviceLocation('edirol-ua1000'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.location).not.toBeNull())

    expect(fetchMock).toHaveBeenCalledWith('/api/cluster/health/extended/devices')
    expect(result.current.location).toEqual(
      expect.objectContaining({
        nodeId: 'node-b',
        hostname: 'audio-b',
      }),
    )
  })

  it('maps hardware menu routes to detected node locations', async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        nodes: {
          'node-mpx': {
            hostname: 'rack-a',
            status: 'online',
            usb_audio_devices: [],
            midi_devices: [{ name: 'Lexicon MPX1', direction: 'input', type: 'midi_hub' }],
            audio_interfaces: [],
            pipewire_devices: [],
          },
          'node-usb': {
            hostname: 'rack-b',
            status: 'online',
            usb_audio_devices: [{ name: 'Hotone Jogg USB Audio', vid_pid: '84ef:0014' }],
            midi_devices: [],
            audio_interfaces: ['Hotone Jogg USB Audio'],
            pipewire_devices: [],
          },
        },
      }),
    )

    const { result } = renderHook(
      () =>
        useHardwareMenuLocations([
          { to: '/mpx1', deviceType: 'lexicon-mpx1' },
          { to: '/hotone-jogg', deviceType: 'hotone-jogg' },
        ]),
      {
        wrapper: makeWrapper(),
      },
    )

    await waitFor(() =>
      expect(result.current.locationsByRoute['/mpx1']).toEqual(
        expect.objectContaining({ nodeId: 'node-mpx', hostname: 'rack-a' }),
      ),
    )

    expect(result.current.locationsByRoute['/hotone-jogg']).toEqual(
      expect.objectContaining({ nodeId: 'node-usb', hostname: 'rack-b' }),
    )
  })

  it('matches standalone controller routes using the dedicated search terms', async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        nodes: {
          'node-mcu': {
            hostname: 'mix-a',
            status: 'online',
            usb_audio_devices: [],
            midi_devices: [{ name: 'Mackie Control Universal Pro', direction: 'input', type: 'midi_hub' }],
            audio_interfaces: [],
            pipewire_devices: [],
          },
          'node-launch': {
            hostname: 'mix-b',
            status: 'online',
            usb_audio_devices: [],
            midi_devices: [{ name: 'Novation Launch Control XL', direction: 'input', type: 'midi_hub' }],
            audio_interfaces: [],
            pipewire_devices: [],
          },
          'node-commander': {
            hostname: 'mix-c',
            status: 'online',
            usb_audio_devices: [],
            midi_devices: [{ name: 'MeloAudio MIDI Commander', direction: 'input', type: 'midi_hub' }],
            audio_interfaces: [],
            pipewire_devices: [],
          },
        },
      }),
    )

    const { result } = renderHook(
      () =>
        useHardwareMenuLocations([
          { to: '/mcu', deviceType: 'mackie-mcu-pro' },
          { to: '/launch-control', deviceType: 'novation-launch-control' },
          { to: '/midi-commander', deviceType: 'meloaudio-midi-commander' },
        ]),
      {
        wrapper: makeWrapper(),
      },
    )

    await waitFor(() =>
      expect(result.current.locationsByRoute['/mcu']).toEqual(
        expect.objectContaining({ nodeId: 'node-mcu', hostname: 'mix-a' }),
      ),
    )

    expect(result.current.locationsByRoute['/launch-control']).toEqual(
      expect.objectContaining({ nodeId: 'node-launch', hostname: 'mix-b' }),
    )
    expect(result.current.locationsByRoute['/midi-commander']).toEqual(
      expect.objectContaining({ nodeId: 'node-commander', hostname: 'mix-c' }),
    )
  })
})
