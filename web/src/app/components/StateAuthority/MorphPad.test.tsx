import { render, screen, act, fireEvent } from '@testing-library/react'
import { MorphPad } from './MorphPad'

jest.mock('../../../map2/clients/stateAuthority', () => ({
  stateAuthorityApi: {
    getMorphState: jest.fn(async () => ({ x: 0.5, y: 0.5, configured_corners: [] })),
    setMorphPosition: jest.fn(async (x: number, y: number) => ({
      x,
      y,
      configured_corners: ['A', 'B', 'C', 'D'],
    })),
  },
}))

const { stateAuthorityApi } = jest.requireMock('../../../map2/clients/stateAuthority') as {
  stateAuthorityApi: {
    getMorphState: jest.Mock
    setMorphPosition: jest.Mock
  }
}

describe('MorphPad', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Stub rAF so the coalesced position update fires synchronously in test.
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0 as any
    })
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders A/B/C/D corner labels', () => {
    render(<MorphPad initial={{ x: 0.5, y: 0.5, configured_corners: ['A', 'B'] }} readonly />)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    expect(screen.getByText('C')).toBeTruthy()
    expect(screen.getByText('D')).toBeTruthy()
  })

  it('marks corners that are not yet configured', () => {
    render(<MorphPad initial={{ x: 0.5, y: 0.5, configured_corners: ['A'] }} readonly />)
    const aCorner = screen.getByLabelText('Corner A')
    const bCorner = screen.getByLabelText('Corner B (not configured)')
    expect(aCorner.className).not.toContain('morph-pad__corner--empty')
    expect(bCorner.className).toContain('morph-pad__corner--empty')
  })

  it('displays initial position in the status tags', () => {
    render(<MorphPad initial={{ x: 0.25, y: 0.75, configured_corners: ['A', 'B', 'C', 'D'] }} readonly />)
    expect(screen.getByText('X 0.250')).toBeTruthy()
    expect(screen.getByText('Y 0.750')).toBeTruthy()
    expect(screen.getByText('4/4 corners')).toBeTruthy()
  })

  it('fetches initial state from the API when no `initial` prop provided', async () => {
    await act(async () => {
      render(<MorphPad />)
    })
    expect(stateAuthorityApi.getMorphState).toHaveBeenCalledTimes(1)
  })

  it('does not fetch when `readonly` is set', () => {
    render(<MorphPad readonly />)
    expect(stateAuthorityApi.getMorphState).not.toHaveBeenCalled()
  })

  it('POSTs new morph position on pad click', async () => {
    await act(async () => {
      render(<MorphPad initial={{ x: 0.5, y: 0.5, configured_corners: [] }} />)
    })
    const surface = screen.getByLabelText('Morph position')
    // Mock the bounding rect so the fractional coordinates are deterministic.
    Object.defineProperty(surface, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON: () => ({}) }),
    })
    await act(async () => {
      fireEvent.mouseDown(surface, { clientX: 50, clientY: 150 })
    })
    expect(stateAuthorityApi.setMorphPosition).toHaveBeenCalledWith(0.25, 0.75)
  })

  it('invokes onPositionChange after a successful mutation', async () => {
    const onChange = jest.fn()
    await act(async () => {
      render(
        <MorphPad
          initial={{ x: 0.5, y: 0.5, configured_corners: [] }}
          onPositionChange={onChange}
        />,
      )
    })
    const surface = screen.getByLabelText('Morph position')
    Object.defineProperty(surface, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON: () => ({}) }),
    })
    await act(async () => {
      fireEvent.mouseDown(surface, { clientX: 100, clientY: 100 })
    })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[0][0]).toEqual({
      x: 0.5,
      y: 0.5,
      configured_corners: ['A', 'B', 'C', 'D'],
    })
  })
})
