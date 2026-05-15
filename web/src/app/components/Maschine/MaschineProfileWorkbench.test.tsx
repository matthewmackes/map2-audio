import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { MaschineProfileWorkbench } from './MaschineProfileWorkbench'

// T2522-B cycle 12 — Profile Workbench v1 unit tests.

beforeEach(() => {
  localStorage.clear()
})

describe('MaschineProfileWorkbench', () => {
  it('mounts with the first starter profile selected (T1 CTRL)', () => {
    render(<MaschineProfileWorkbench />)
    expect(screen.getByRole('heading', { name: 'Profile Workbench' })).toBeInTheDocument()
    // Starter profile chip + active profile select.
    expect(screen.getByText('3 starter profiles')).toBeInTheDocument()
    expect(screen.getAllByText(/CTRL/)[0]).toBeInTheDocument()
  })

  it('switches profile + reloads JSON in the editor when the picker changes', () => {
    render(<MaschineProfileWorkbench />)
    const select = screen.getByLabelText('Active profile') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'T11' } })
    // The TUNER profile description should now be visible — both the
    // visible inspector copy and the JSON editor body include it, so
    // matching ≥ 1 occurrence is the right check.
    expect(screen.getAllByText(/Chromatic tuner/).length).toBeGreaterThan(0)
  })

  it('flags an invalid JSON edit on Validate', () => {
    render(<MaschineProfileWorkbench />)
    const editor = screen.getByLabelText('', { selector: 'textarea' }) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: '{ this is not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
    expect(screen.getByText('Profile validation failed')).toBeInTheDocument()
  })

  it('flags a schema-invalid profile on Validate', () => {
    render(<MaschineProfileWorkbench />)
    const editor = screen.getByLabelText('', { selector: 'textarea' }) as HTMLTextAreaElement
    fireEvent.change(editor, {
      target: {
        value: JSON.stringify(
          { id: 'T1', label: 'BAD', name: 'Bad', description: '', pads: [], encoders: [] },
        ),
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
    expect(screen.getByText('Profile validation failed')).toBeInTheDocument()
  })

  it('saves a valid edit as a draft in localStorage', () => {
    render(<MaschineProfileWorkbench />)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    // Draft chip in the header now reads "1 draft".
    expect(screen.getByText('1 draft')).toBeInTheDocument()
    // localStorage carries a draft entry.
    const raw = localStorage.getItem('map2_maschine_profile_drafts')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.length).toBe(1)
    expect(parsed[0].id).toBe('T1')
  })

  it('renders a per-LCD preview card (left + right) for the active profile', () => {
    render(<MaschineProfileWorkbench />)
    expect(screen.getByText('Left LCD')).toBeInTheDocument()
    expect(screen.getByText('Right LCD')).toBeInTheDocument()
    // T1 CTRL uses the param-list template on both sides.
    expect(screen.getAllByText('param-list').length).toBe(2)
  })

  it('cycle-13 — paints both LCD canvases at native 255×64 dimensions', () => {
    const { container } = render(<MaschineProfileWorkbench />)
    const canvases = container.querySelectorAll('canvas.maschine-workbench__lcd-canvas') as NodeListOf<HTMLCanvasElement>
    expect(canvases.length).toBe(2)
    canvases.forEach((c) => {
      expect(c.width).toBe(255)
      expect(c.height).toBe(64)
    })
  })
})
