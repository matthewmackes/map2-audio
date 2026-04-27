// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DevicePage — route at /devices/:packId/:model that renders the
// auto-generated DeviceProfilePanel for one device profile.
//
// Worklist: T2459-C1.

import React from 'react'
import { useParams } from 'react-router-dom'

import { DeviceProfilePanel } from '../components/Devices/DeviceProfilePanel'

export function DevicePage(): React.JSX.Element {
  const { packId, model } = useParams<{ packId: string; model: string }>()

  if (!packId || !model) {
    return <div>Invalid device URL — expected /devices/:packId/:model</div>
  }

  return (
    <div data-testid="device-page" style={{ padding: '1rem' }}>
      <DeviceProfilePanel packId={packId} model={model} />
    </div>
  )
}

export default DevicePage
