import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen } from '@testing-library/react'

import { LicenseTab } from './LicenseTab'
import type { PackSourceRow } from '../../../../../map2/clients/devices'

function shippedPack(pack_id = 'edirol-ua'): PackSourceRow {
  return {
    pack_id, vendor: 'EDIROL / Roland', source: 'shipped',
    path: `/repo/device-packs/${pack_id}`,
    is_degraded: false, degraded_files: [], model_count: 6, profile_count: 12,
  }
}

function importedPack(): PackSourceRow {
  return {
    pack_id: '_mixx-imports', vendor: 'Mixxx (upstream)', source: 'imported',
    path: '/repo/device-packs/_mixx-imports',
    is_degraded: false, degraded_files: [], model_count: 0, profile_count: 0,
  }
}

test('LicenseTab: shipped pack renders source + path + AGPLv3 footer', () => {
  render(<LicenseTab packId="edirol-ua" packSource={shippedPack()} />)
  expect(screen.getByText('Shipped')).toBeInTheDocument()
  expect(screen.getByText('/repo/device-packs/edirol-ua')).toBeInTheDocument()
  expect(screen.getByText(/AGPL-3\.0-only/)).toBeInTheDocument()
})

test('LicenseTab: imported pack surfaces the GPLv2-or-later attribution notice', () => {
  render(
    <LicenseTab
      packId="_mixx-imports"
      packSource={importedPack()}
      manifest={{
        license: 'GPL-2.0-or-later',
        upstream_commit: '9d5df54b',
        imported_at: '2026-04-27',
        upstream_url: 'https://github.com/mixxxdj/mixxx',
        vendor: { name: 'Mixxx contributors' },
      }}
    />,
  )
  // Notice title.
  expect(screen.getByText('Imported from Mixxx upstream')).toBeInTheDocument()
  // Manifest fields surface as rows.
  expect(screen.getByText('GPL-2.0-or-later')).toBeInTheDocument()
  expect(screen.getByText('9d5df54b')).toBeInTheDocument()
  expect(screen.getByText('2026-04-27')).toBeInTheDocument()
  expect(screen.getByText('Mixxx contributors')).toBeInTheDocument()
})

test('LicenseTab: degraded pack shows the warning notification', () => {
  render(
    <LicenseTab
      packId="brokenco"
      packSource={{ ...shippedPack('brokenco'), is_degraded: true, degraded_files: ['/x.yaml'] }}
      isDegraded
      degradedFiles={['/x.yaml']}
    />,
  )
  expect(screen.getByText('Pack is degraded')).toBeInTheDocument()
  expect(screen.getByText(/1 file\(s\) failed to load/)).toBeInTheDocument()
})

test('LicenseTab: works without packSource or manifest (defensive)', () => {
  render(<LicenseTab packId="anything" />)
  // Renders the card; AGPLv3 footer still appears.
  expect(screen.getByText('anything')).toBeInTheDocument()
  expect(screen.getByText(/AGPL-3\.0-only/)).toBeInTheDocument()
})
