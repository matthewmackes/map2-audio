import { render, screen } from '@testing-library/react'

import { PluginType } from '../../utils/pluginLegacyCompat'
import { PluginAppearanceIcon } from './PluginAppearanceIcon'

describe('PluginAppearanceIcon', () => {
  it('renders the legacy glyph fallback for plugin-type icons', () => {
    render(<PluginAppearanceIcon fallbackPluginType={PluginType.DelayPlugin} decorative={false} label="Delay icon" />)

    expect(screen.getByRole('img', { name: 'Delay icon' })).toBeTruthy()
    expect(screen.getByText('DLY')).toBeTruthy()
  })
})
