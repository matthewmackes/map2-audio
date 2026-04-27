// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// LicenseTab — T2459-G5 / Q15. Renders pack provenance + license
// attribution prominently. For `_mixx-imports/` packs this surface
// satisfies the GPLv2-or-later attribution requirement (operators
// can see upstream commit + import date + license SPDX without
// hunting through filesystems).

import * as React from 'react'
import { InlineNotification, Tag, StructuredListWrapper, StructuredListBody, StructuredListRow, StructuredListCell } from '@carbon/react'

import type { PackSourceRow } from '../../../../../map2/clients/devices'

export interface LicenseTabProps {
  packId: string
  packSource?: PackSourceRow
  manifest?: Record<string, unknown>
  isDegraded?: boolean
  degradedFiles?: string[]
}

const SOURCE_LABEL: Record<PackSourceRow['source'], string> = {
  shipped: 'Shipped',
  user: 'User',
  imported: 'Imported (Mixxx)',
}

const SOURCE_TONE: Record<PackSourceRow['source'], string> = {
  shipped: 'green',
  user: 'cyan',
  imported: 'magenta',
}

function readManifestValue(manifest: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!manifest) return undefined
  const v = manifest[key]
  if (typeof v === 'string') return v
  return undefined
}

function readVendorBlock(manifest: Record<string, unknown> | undefined): {
  name?: string
  url?: string
  contact?: string
} {
  if (!manifest) return {}
  const vendor = manifest.vendor
  if (!vendor || typeof vendor !== 'object') return {}
  const v = vendor as Record<string, unknown>
  return {
    name: typeof v.name === 'string' ? v.name : undefined,
    url: typeof v.url === 'string' ? v.url : undefined,
    contact: typeof v.contact === 'string' ? v.contact : undefined,
  }
}

export function LicenseTab({
  packId, packSource, manifest, isDegraded, degradedFiles,
}: LicenseTabProps): React.JSX.Element {
  const license = readManifestValue(manifest, 'license') ?? readManifestValue(manifest, 'spdx_license')
  const upstreamCommit = readManifestValue(manifest, 'upstream_commit')
  const importedAt = readManifestValue(manifest, 'imported_at')
  const upstreamUrl = readManifestValue(manifest, 'upstream_url')
  const vendor = readVendorBlock(manifest)

  return (
    <div className="device-license-tab" style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {isDegraded ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Pack is degraded"
          subtitle={`${(degradedFiles ?? []).length} file(s) failed to load. Diagnostics tab has details.`}
        />
      ) : null}

      {packSource?.source === 'imported' ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Imported from Mixxx upstream"
          subtitle="MAP2 imports Mixxx mappings under their original GPLv2-or-later license. AGPLv3 ↔ GPLv2-or-later is upward-compatible via the GPLv3 chain — attribution is preserved verbatim below."
        />
      ) : null}

      <StructuredListWrapper aria-label={`License attribution for pack ${packId}`}>
        <StructuredListBody>
          <StructuredListRow>
            <StructuredListCell>Pack ID</StructuredListCell>
            <StructuredListCell><code>{packId}</code></StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Source</StructuredListCell>
            <StructuredListCell>
              {packSource ? (
                <Tag size="sm" type={SOURCE_TONE[packSource.source] as never}>
                  {SOURCE_LABEL[packSource.source]}
                </Tag>
              ) : <span>—</span>}
            </StructuredListCell>
          </StructuredListRow>
          {packSource?.path ? (
            <StructuredListRow>
              <StructuredListCell>Path</StructuredListCell>
              <StructuredListCell><code>{packSource.path}</code></StructuredListCell>
            </StructuredListRow>
          ) : null}
          {license ? (
            <StructuredListRow>
              <StructuredListCell>License</StructuredListCell>
              <StructuredListCell><code>{license}</code></StructuredListCell>
            </StructuredListRow>
          ) : null}
          {upstreamCommit ? (
            <StructuredListRow>
              <StructuredListCell>Upstream commit</StructuredListCell>
              <StructuredListCell><code>{upstreamCommit}</code></StructuredListCell>
            </StructuredListRow>
          ) : null}
          {importedAt ? (
            <StructuredListRow>
              <StructuredListCell>Imported on</StructuredListCell>
              <StructuredListCell>{importedAt}</StructuredListCell>
            </StructuredListRow>
          ) : null}
          {upstreamUrl ? (
            <StructuredListRow>
              <StructuredListCell>Upstream URL</StructuredListCell>
              <StructuredListCell>
                <a href={upstreamUrl} target="_blank" rel="noopener noreferrer">{upstreamUrl}</a>
              </StructuredListCell>
            </StructuredListRow>
          ) : null}
          {vendor.name ? (
            <StructuredListRow>
              <StructuredListCell>Vendor</StructuredListCell>
              <StructuredListCell>{vendor.name}</StructuredListCell>
            </StructuredListRow>
          ) : null}
          {vendor.url ? (
            <StructuredListRow>
              <StructuredListCell>Vendor URL</StructuredListCell>
              <StructuredListCell>
                <a href={vendor.url} target="_blank" rel="noopener noreferrer">{vendor.url}</a>
              </StructuredListCell>
            </StructuredListRow>
          ) : null}
          {vendor.contact ? (
            <StructuredListRow>
              <StructuredListCell>Vendor contact</StructuredListCell>
              <StructuredListCell>{vendor.contact}</StructuredListCell>
            </StructuredListRow>
          ) : null}
        </StructuredListBody>
      </StructuredListWrapper>

      <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-helper)', margin: 0 }}>
        MAP2 itself is licensed under <code>AGPL-3.0-only</code>. Pack-specific licenses
        listed above govern the contents of the named pack only. See <code>LICENSE</code>
        and <code>docs/THIRD_PARTY_NOTICES.md</code> at the repository root for the full
        attribution chain.
      </p>
    </div>
  )
}
