import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { PluginColorPicker } from './PluginColorPicker'

describe('PluginColorPicker', () => {
  it('emits accent color and variant override changes', () => {
    const onChange = jest.fn()

    render(
      <PluginColorPicker
        accentColor="#112233"
        darkVariant={null}
        lightVariant={null}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Plugin accent color'), {
      target: { value: '#223344' },
    })

    expect(onChange).toHaveBeenCalledWith({ accent_color: '#223344' })

    fireEvent.click(screen.getByRole('switch', { name: /override dark variant/i }))
    expect(onChange).toHaveBeenLastCalledWith({ dark_variant: '#000617' })
  })
})
