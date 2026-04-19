import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { TesiraAvbTab } from './TesiraAvbTab'

const mockNavigate = jest.fn()
const mockUseTesiraAvbStreams = jest.fn()
const mockUseTesiraPTP = jest.fn()

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraAvbStreams: (...args: unknown[]) => mockUseTesiraAvbStreams(...args),
  useTesiraPTP: (...args: unknown[]) => mockUseTesiraPTP(...args),
}))

describe('TesiraAvbTab', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUseTesiraPTP.mockReturnValue({
      data: { state: 'SLAVE', offset_ns: 42, grandmaster_id: 'node-local' },
    })
    mockUseTesiraAvbStreams.mockReturnValue({
      data: [
        {
          stream_index: 1,
          direction: 'talker',
          name: 'Program Bus',
          channels: 2,
          entity_id: '0011aa22bb33cc44',
        },
      ],
    })
  })

  it('routes Tesira stream focus into the Platforms AVB workspace', () => {
    render(<TesiraAvbTab deviceId="tesira-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Route' }))

    expect(mockNavigate).toHaveBeenCalledWith('/platforms/avb-routing?focusTesiraDevice=tesira-1&focusEntity=0011aa22bb33cc44')
  })
})
