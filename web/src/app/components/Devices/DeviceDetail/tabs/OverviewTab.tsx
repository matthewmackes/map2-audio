// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// OverviewTab — T2459-G5. Read-only summary of a device profile:
// description, declared capabilities, port map, identifier rules.
// Drawn entirely from the profile YAML — no extra backend calls.

import * as React from 'react'
import { Tag, StructuredListWrapper, StructuredListBody, StructuredListRow, StructuredListCell } from '@carbon/react'

import type { DeviceProfileDetail } from '../../../../../map2/clients/devices'
import './OverviewTab.css'

export interface OverviewTabProps {
  profile: DeviceProfileDetail
}

interface PortDescriptor {
  name?: string
  kind?: string
  channel?: string | number
  description?: string
}

function readPorts(doc: Record<string, unknown>, key: 'inputs' | 'outputs'): PortDescriptor[] {
  const raw = doc[key]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      name: typeof row.name === 'string' ? row.name : undefined,
      kind: typeof row.kind === 'string' ? row.kind : undefined,
      channel: (typeof row.channel === 'string' || typeof row.channel === 'number')
        ? row.channel as string | number : undefined,
      description: typeof row.description === 'string' ? row.description : undefined,
    }))
}

function readCapabilities(doc: Record<string, unknown>): string[] {
  const raw = doc.capabilities
  if (!Array.isArray(raw)) return []
  return raw.filter((s): s is string => typeof s === 'string')
}

function readIdentity(doc: Record<string, unknown>): {
  hardwareId?: string
  alsaCardRegex?: string
  alsaClientPattern?: string
  pipewireNodeName?: string
} {
  const identity = (doc.identity ?? {}) as Record<string, unknown>
  const pipewire = (doc.pipewire ?? {}) as Record<string, unknown>
  return {
    hardwareId: typeof identity.hardware_id === 'string' ? identity.hardware_id : undefined,
    alsaCardRegex: typeof identity.alsa_card_regex === 'string' ? identity.alsa_card_regex : undefined,
    alsaClientPattern: typeof identity.alsa_client_pattern === 'string' ? identity.alsa_client_pattern : undefined,
    pipewireNodeName: typeof pipewire.node_name === 'string' ? pipewire.node_name : undefined,
  }
}

export function OverviewTab({ profile }: OverviewTabProps): React.JSX.Element {
  const doc = profile.document
  const description = typeof doc.description === 'string' ? doc.description : undefined
  const inputs = readPorts(doc, 'inputs')
  const outputs = readPorts(doc, 'outputs')
  const capabilities = readCapabilities(doc)
  const identity = readIdentity(doc)
  const sampleRates = Array.isArray(doc.sample_rates)
    ? doc.sample_rates.filter((s): s is number => typeof s === 'number')
    : []

  return (
    <div className="device-overview-tab">
      {description ? (
        <p className="device-overview-tab__desc">{description}</p>
      ) : null}

      <section className="device-overview-tab__section">
        <h3>Identity</h3>
        <StructuredListWrapper aria-label="Device identity">
          <StructuredListBody>
            {identity.hardwareId ? (
              <StructuredListRow>
                <StructuredListCell>Hardware ID</StructuredListCell>
                <StructuredListCell><code>{identity.hardwareId}</code></StructuredListCell>
              </StructuredListRow>
            ) : null}
            {identity.alsaCardRegex ? (
              <StructuredListRow>
                <StructuredListCell>ALSA card regex</StructuredListCell>
                <StructuredListCell><code>{identity.alsaCardRegex}</code></StructuredListCell>
              </StructuredListRow>
            ) : null}
            {identity.alsaClientPattern ? (
              <StructuredListRow>
                <StructuredListCell>ALSA seq client</StructuredListCell>
                <StructuredListCell><code>{identity.alsaClientPattern}</code></StructuredListCell>
              </StructuredListRow>
            ) : null}
            {identity.pipewireNodeName ? (
              <StructuredListRow>
                <StructuredListCell>PipeWire node</StructuredListCell>
                <StructuredListCell><code>{identity.pipewireNodeName}</code></StructuredListCell>
              </StructuredListRow>
            ) : null}
            <StructuredListRow>
              <StructuredListCell>Profile path</StructuredListCell>
              <StructuredListCell><code>{profile.path}</code></StructuredListCell>
            </StructuredListRow>
          </StructuredListBody>
        </StructuredListWrapper>
      </section>

      {capabilities.length > 0 ? (
        <section className="device-overview-tab__section">
          <h3>Capabilities</h3>
          <div className="device-overview-tab__tags">
            {capabilities.map((cap) => (
              <Tag key={cap} type="cool-gray" size="sm">{cap}</Tag>
            ))}
          </div>
        </section>
      ) : null}

      {sampleRates.length > 0 ? (
        <section className="device-overview-tab__section">
          <h3>Supported sample rates</h3>
          <div className="device-overview-tab__tags">
            {sampleRates.map((sr) => (
              <Tag key={sr} type="green" size="sm">{sr.toLocaleString()} Hz</Tag>
            ))}
          </div>
        </section>
      ) : null}

      {inputs.length > 0 ? (
        <section className="device-overview-tab__section">
          <h3>Inputs ({inputs.length})</h3>
          <StructuredListWrapper aria-label="Inputs">
            <StructuredListBody>
              {inputs.map((p, i) => (
                <StructuredListRow key={`${p.name ?? p.channel ?? i}`}>
                  <StructuredListCell>{p.name ?? p.channel ?? `Input ${i + 1}`}</StructuredListCell>
                  <StructuredListCell>{p.kind ?? '—'}</StructuredListCell>
                  <StructuredListCell>{p.description ?? ''}</StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </section>
      ) : null}

      {outputs.length > 0 ? (
        <section className="device-overview-tab__section">
          <h3>Outputs ({outputs.length})</h3>
          <StructuredListWrapper aria-label="Outputs">
            <StructuredListBody>
              {outputs.map((p, i) => (
                <StructuredListRow key={`${p.name ?? p.channel ?? i}`}>
                  <StructuredListCell>{p.name ?? p.channel ?? `Output ${i + 1}`}</StructuredListCell>
                  <StructuredListCell>{p.kind ?? '—'}</StructuredListCell>
                  <StructuredListCell>{p.description ?? ''}</StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </section>
      ) : null}
    </div>
  )
}
