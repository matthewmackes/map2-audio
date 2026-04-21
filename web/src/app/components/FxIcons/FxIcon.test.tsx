import React from 'react'
import '@testing-library/jest-dom'
import { render } from '@testing-library/react'

import { FxIcon } from './FxIcon'

describe('FxIcon', () => {
  it('renders a reverb icon at default size', () => {
    const { container } = render(<FxIcon name="reverb" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('width', '20')
    expect(svg).toHaveAttribute('height', '20')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders a compressor icon at explicit size 24', () => {
    const { container } = render(<FxIcon name="compressor" size={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
  })

  it('renders a delay icon with a title and role=img', () => {
    const { container } = render(<FxIcon name="delay" size={16} title="Delay effect" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(container.querySelector('title')?.textContent).toBe('Delay effect')
  })
})
