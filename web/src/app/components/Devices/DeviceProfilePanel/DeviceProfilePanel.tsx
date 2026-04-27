// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DeviceProfilePanel — auto-rendered Carbon device panel.
// Worklist: T2459-C1.
// Architecture: docs/architecture/CONTROLLER_LAYER.md §4.

import React, { Suspense, useMemo, lazy, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Layer,
  Tag,
  Button,
  Loading,
  InlineNotification,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
} from '@carbon/react'
import { Launch, Document, Help, MeterAlt } from '@carbon/icons-react'

import {
  getDeviceProfile,
  measureLatency,
  type DeviceProfileDetail,
  type MeasureLatencyResult,
} from '../../../../map2/clients/devices'
import { findOverride } from './overrideLoader'

export interface DeviceProfilePanelProps {
  packId: string
  model: string
  /** When provided, the panel renders the matching kind first. */
  initialKind?: 'audio' | 'midi' | 'hid'
  /** Explicit vendor-override slot rendered after the auto-rendered scaffold.
   *  If omitted, the panel auto-discovers an override TSX from
   *  `device-packs/<packId>/overrides/` or
   *  `device-packs/<packId>/shared/overrides/`.
   */
  vendorOverride?: React.ReactNode
  /** When true, suppress the auto-discovered override entirely (test hook). */
  disableAutoOverride?: boolean
}

/** Auto-rendered device panel.
 *
 *  Reads the profile YAML via `/api/devices/profiles/<pack>/<model>/<kind>`
 *  and renders a Carbon-conformant panel composed of:
 *    - hero card (model name, manufacturer, hardware ID, status tags,
 *      product image / datasheet / manual links from metadata)
 *    - port list
 *    - mixer surfaces
 *    - on-device DSP cards
 *    - use-case quick-actions
 *    - vendor-override slot (T2459-C2)
 */
export function DeviceProfilePanel({
  packId,
  model,
  initialKind = 'audio',
  vendorOverride,
  disableAutoOverride = false,
}: DeviceProfilePanelProps): React.JSX.Element {
  const audioQuery = useQuery({
    queryKey: ['device-profile', packId, model, 'audio'],
    queryFn: () => getDeviceProfile(packId, model, 'audio'),
    retry: 1,
  })

  const midiQuery = useQuery({
    queryKey: ['device-profile', packId, model, 'midi'],
    queryFn: () => getDeviceProfile(packId, model, 'midi'),
    retry: 1,
  })

  // Auto-discover a vendor override if no explicit slot was passed.
  const autoOverride = useMemo(() => {
    if (disableAutoOverride || vendorOverride) return null
    const importer = findOverride(packId, model)
    if (importer == null) return null
    const Lazy = lazy(importer)
    return <Lazy />
  }, [packId, model, vendorOverride, disableAutoOverride])

  const overrideToRender = vendorOverride ?? autoOverride

  if (audioQuery.isLoading) {
    return (
      <Layer level={0} aria-busy="true" data-testid="device-profile-panel-loading">
        <Loading description="Loading device profile" withOverlay={false} />
      </Layer>
    )
  }

  const audio = audioQuery.data?.profile
  const midi = midiQuery.data?.profile

  if (!audio) {
    return (
      <Layer level={0}>
        <InlineNotification
          kind="error"
          title="Profile not found"
          subtitle={`No audio profile registered for ${packId}/${model}.`}
          hideCloseButton
        />
      </Layer>
    )
  }

  return (
    <Layer level={0} data-testid="device-profile-panel">
      <DeviceHeroCard profile={audio} />
      <DevicePortsSection profile={audio} />
      <DeviceMixerSurfacesSection profile={audio} />
      <DeviceOnDeviceDspSection profile={audio} />
      <DeviceUseCasesSection profile={audio} />
      <DeviceLatencyMeasureSection
        packId={packId}
        model={model}
        profile={audio}
      />
      {midi && <DeviceMidiBindingsSection profile={midi} />}
      {overrideToRender && (
        <Layer level={1} data-testid="device-profile-panel-vendor-override">
          <Suspense fallback={<Loading description="Loading vendor extras" withOverlay={false} />}>
            {overrideToRender}
          </Suspense>
        </Layer>
      )}
    </Layer>
  )
}

function DeviceLatencyMeasureSection({
  packId,
  model,
  profile,
}: {
  packId: string
  model: string
  profile: DeviceProfileDetail
}): React.JSX.Element {
  const doc = profile.document as Record<string, any>
  const loopback = doc.loopback_ports as { playback?: string; capture?: string } | undefined
  const hasLoopback = !!(loopback?.playback && loopback?.capture)

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MeasureLatencyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleMeasure = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await measureLatency({ pack_id: packId, model, trials: 3 })
      setResult(r)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layer level={1} data-testid="device-latency-measure-section">
      <h4 style={{ padding: '1rem 1rem 0.5rem' }}>Measure latency</h4>
      <div style={{ padding: '0 1rem 1rem' }}>
        {!hasLoopback ? (
          <p style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>
            This profile does not declare <code>loopback_ports</code>.
            Latency measurement requires a physical loopback cable from
            the playback port back to the capture port plus matching
            JACK port names in the audio profile.
          </p>
        ) : (
          <>
            <Button
              kind="primary"
              renderIcon={MeterAlt}
              onClick={handleMeasure}
              disabled={busy}
            >
              Measure latency now
            </Button>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Loopback path:{' '}
              <code>{loopback!.playback}</code> →{' '}
              <code>{loopback!.capture}</code>
            </p>
            {busy && <Loading description="Running 3 IR trials..." withOverlay={false} />}
            {error && (
              <InlineNotification
                kind="error"
                title="Measurement failed"
                subtitle={error}
                hideCloseButton
              />
            )}
            {result && (
              <div data-testid="latency-measure-result" style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Tag type={result.method === 'jack' ? 'green' : 'warm-gray'}>
                    {result.method}
                  </Tag>
                  <Tag type="purple">
                    mean {result.mean_rtt_ms.toFixed(2)} ms
                  </Tag>
                  <Tag type="cool-gray">
                    p95 {result.p95_rtt_ms.toFixed(2)} ms
                  </Tag>
                  <Tag type="cool-gray">
                    jitter {result.jitter_p95_ms.toFixed(2)} ms
                  </Tag>
                </div>
                <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  Evidence written to <code>{result.evidence_path}</code>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Layer>
  )
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function DeviceHeroCard({ profile }: { profile: DeviceProfileDetail }): React.JSX.Element {
  const doc = profile.document as Record<string, any>
  const identity = (doc.identity ?? {}) as Record<string, string>
  const metadata = (doc.metadata ?? {}) as Record<string, any>
  const productImage: string | undefined = Array.isArray(metadata.product_image_urls)
    ? metadata.product_image_urls[0]
    : undefined

  return (
    <Layer level={0} data-testid="device-hero-card">
      <div style={{ display: 'flex', gap: '1rem', padding: '1rem' }}>
        {productImage && (
          <img
            src={productImage}
            alt={`${identity.manufacturer ?? 'Device'} ${identity.model ?? ''}`}
            style={{
              width: 200,
              height: 'auto',
              objectFit: 'contain',
              flexShrink: 0,
            }}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>
              {identity.manufacturer ? `${identity.manufacturer} ` : ''}
              {identity.model ?? profile.model}
            </h3>
            {identity.family && <Tag type="cool-gray">{identity.family}</Tag>}
            <Tag type="green">{profile.kind.toUpperCase()}</Tag>
          </div>
          {identity.hardware_id && (
            <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
              <code>{identity.hardware_id}</code>
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {metadata.datasheet_url && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Document}
                href={metadata.datasheet_url as string}
                target="_blank"
                rel="noopener noreferrer"
                as="a"
              >
                Datasheet
              </Button>
            )}
            {metadata.manual_url && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Document}
                href={metadata.manual_url as string}
                target="_blank"
                rel="noopener noreferrer"
                as="a"
              >
                Manual
              </Button>
            )}
            {metadata.vendor_support_url && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Help}
                href={metadata.vendor_support_url as string}
                target="_blank"
                rel="noopener noreferrer"
                as="a"
              >
                Manufacturer support
              </Button>
            )}
          </div>
        </div>
      </div>
    </Layer>
  )
}

function DevicePortsSection({ profile }: { profile: DeviceProfileDetail }): React.JSX.Element {
  const ports = useMemo(() => {
    const doc = profile.document as Record<string, any>
    return Array.isArray(doc.ports) ? doc.ports : []
  }, [profile])

  if (ports.length === 0) return <></>

  return (
    <Layer level={1} data-testid="device-ports-section">
      <h4 style={{ padding: '1rem 1rem 0.5rem' }}>Ports</h4>
      <StructuredListWrapper>
        <StructuredListHead>
          <StructuredListRow head>
            <StructuredListCell head>ID</StructuredListCell>
            <StructuredListCell head>Kind</StructuredListCell>
            <StructuredListCell head>Direction</StructuredListCell>
            <StructuredListCell head>Count</StructuredListCell>
            <StructuredListCell head>Connectors</StructuredListCell>
          </StructuredListRow>
        </StructuredListHead>
        <StructuredListBody>
          {ports.map((port: Record<string, any>) => (
            <StructuredListRow key={port.id}>
              <StructuredListCell>
                <code>{port.id}</code>
              </StructuredListCell>
              <StructuredListCell>{port.kind}</StructuredListCell>
              <StructuredListCell>{port.direction}</StructuredListCell>
              <StructuredListCell>{port.count ?? 1}</StructuredListCell>
              <StructuredListCell>
                {Array.isArray(port.connectors) ? port.connectors.join(', ') : '—'}
              </StructuredListCell>
            </StructuredListRow>
          ))}
        </StructuredListBody>
      </StructuredListWrapper>
    </Layer>
  )
}

function DeviceMixerSurfacesSection({
  profile,
}: {
  profile: DeviceProfileDetail
}): React.JSX.Element {
  const doc = profile.document as Record<string, any>
  const surfaces = Array.isArray(doc.mixer_surfaces) ? doc.mixer_surfaces : []
  if (surfaces.length === 0) return <></>

  return (
    <Layer level={1} data-testid="device-mixer-surfaces-section">
      <h4 style={{ padding: '1rem 1rem 0.5rem' }}>Mixer Surfaces</h4>
      {surfaces.map((s: Record<string, any>) => (
        <div key={s.id} style={{ padding: '0.5rem 1rem' }}>
          <strong>{s.id}</strong> <Tag type="cool-gray">{s.kind}</Tag>
          {s.description && (
            <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>{s.description}</p>
          )}
        </div>
      ))}
    </Layer>
  )
}

function DeviceOnDeviceDspSection({
  profile,
}: {
  profile: DeviceProfileDetail
}): React.JSX.Element {
  const doc = profile.document as Record<string, any>
  const blocks = Array.isArray(doc.on_device_dsp) ? doc.on_device_dsp : []
  if (blocks.length === 0) return <></>

  return (
    <Layer level={1} data-testid="device-on-device-dsp-section">
      <h4 style={{ padding: '1rem 1rem 0.5rem' }}>On-Device DSP</h4>
      {blocks.map((b: Record<string, any>) => (
        <div key={b.id} style={{ padding: '0.5rem 1rem' }}>
          <strong>{b.id}</strong> <Tag type="purple">{b.kind}</Tag>
          {Array.isArray(b.params) && (
            <ul style={{ margin: '0.25rem 0 0 1rem', fontSize: '0.875rem' }}>
              {b.params.map((p: Record<string, any>) => (
                <li key={p.name}>
                  {p.name} ({p.type})
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Layer>
  )
}

function DeviceUseCasesSection({
  profile,
}: {
  profile: DeviceProfileDetail
}): React.JSX.Element {
  const doc = profile.document as Record<string, any>
  const presets = Array.isArray(doc.use_case_presets) ? doc.use_case_presets : []
  if (presets.length === 0) return <></>

  return (
    <Layer level={1} data-testid="device-use-cases-section">
      <h4 style={{ padding: '1rem 1rem 0.5rem' }}>Use cases</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0 1rem 1rem' }}>
        {presets.map((p: Record<string, any>) => (
          <Button
            key={p.id}
            kind="tertiary"
            size="sm"
            renderIcon={Launch}
            // T2459-C1 wires the presets-applied API in a follow-up; for now
            // the buttons are inert, which is enough to show the surface
            // in the auto-rendered panel.
            disabled
            title={p.description ?? p.name}
          >
            {p.name}
          </Button>
        ))}
      </div>
    </Layer>
  )
}

function DeviceMidiBindingsSection({
  profile,
}: {
  profile: DeviceProfileDetail
}): React.JSX.Element {
  const doc = profile.document as Record<string, any>
  const controls = Array.isArray(doc.controls) ? doc.controls : []
  if (controls.length === 0) return <></>

  return (
    <Layer level={1} data-testid="device-midi-bindings-section">
      <h4 style={{ padding: '1rem 1rem 0.5rem' }}>MIDI bindings</h4>
      <StructuredListWrapper>
        <StructuredListHead>
          <StructuredListRow head>
            <StructuredListCell head>Status</StructuredListCell>
            <StructuredListCell head>CC/Note</StructuredListCell>
            <StructuredListCell head>Target / Script</StructuredListCell>
            <StructuredListCell head>Action</StructuredListCell>
            <StructuredListCell head>Path</StructuredListCell>
          </StructuredListRow>
        </StructuredListHead>
        <StructuredListBody>
          {controls.map((c: Record<string, any>, idx: number) => (
            <StructuredListRow key={idx}>
              <StructuredListCell>
                <code>0x{(c.status ?? 0).toString(16).toUpperCase().padStart(2, '0')}</code>
              </StructuredListCell>
              <StructuredListCell>{c.midino ?? '—'}</StructuredListCell>
              <StructuredListCell>
                {c.target && <code>{c.target}</code>}
                {c.script && <code style={{ color: 'var(--cds-purple-60)' }}>{c.script}</code>}
              </StructuredListCell>
              <StructuredListCell>{c.action ?? '—'}</StructuredListCell>
              <StructuredListCell>
                {c.fast_path ? (
                  <Tag type="green" size="sm">
                    fast-path
                  </Tag>
                ) : c.script ? (
                  <Tag type="purple" size="sm">
                    JS
                  </Tag>
                ) : (
                  <Tag type="cool-gray" size="sm">
                    direct
                  </Tag>
                )}
              </StructuredListCell>
            </StructuredListRow>
          ))}
        </StructuredListBody>
      </StructuredListWrapper>
    </Layer>
  )
}
