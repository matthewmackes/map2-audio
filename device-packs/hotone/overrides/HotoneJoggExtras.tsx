// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Hotone Jogg extras — vendor-override panel surfacing the onboard
// amp/cab model selectors and headphone-mode operator hints. Composed
// into DeviceProfilePanel after the auto-rendered scaffold (T2459-C2
// contract). Full visual model picker with rotary-knob control lands
// in T2459-E2; this scaffold confirms the override slot mounts and
// renders Carbon-conformant content.
//
// Worklist: T2459-C2.

import React from 'react'
import { Tag } from '@carbon/react'

const AMP_MODELS = ['Twin', 'Plexi', 'Recto', 'JCM800', 'AC30']
const CABS = ['1x12', '2x12', '4x12 V30', '4x12 G12T', 'Bypass']

export default function HotoneJoggExtras(): JSX.Element {
  return (
    <div data-testid="hotone-jogg-extras" style={{ padding: '1rem' }}>
      <h4 style={{ marginTop: 0 }}>Onboard amp + cab models</h4>
      <p style={{ fontSize: '0.875rem' }}>
        The Jogg has hardware amp + cabinet modeling between the
        instrument input and the line/headphone outputs. CC 50 selects
        the amp model, CC 51 selects the cabinet sim. The full visual
        picker lands in T2459-E2 alongside the rest of the Hotone range.
      </p>
      <div style={{ marginBottom: '0.75rem' }}>
        <strong>Amp models:</strong>{' '}
        {AMP_MODELS.map((m) => (
          <Tag key={m} type="cool-gray" style={{ margin: '0.125rem' }}>
            {m}
          </Tag>
        ))}
      </div>
      <div>
        <strong>Cabinets:</strong>{' '}
        {CABS.map((c) => (
          <Tag key={c} type="cool-gray" style={{ margin: '0.125rem' }}>
            {c}
          </Tag>
        ))}
      </div>
    </div>
  )
}
