// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DeviceMappingsPage — route at /devices/profile/:packId/:model/mappings
// rendering the Carbon node-graph mapping editor.
//
// Worklist: T2459-C4.

import React from 'react'
import { useParams } from 'react-router-dom'

import { MappingNodeGraphEditor } from '../components/Devices/MappingNodeGraphEditor'

export function DeviceMappingsPage(): React.JSX.Element {
  const { packId, model } = useParams<{ packId: string; model: string }>()

  if (!packId || !model) {
    return (
      <div>
        Invalid mappings URL — expected /devices/profile/:packId/:model/mappings.
      </div>
    )
  }

  return (
    <div data-testid="device-mappings-page" style={{ padding: '1rem' }}>
      <h2>{packId} / {model} — Mapping editor</h2>
      <MappingNodeGraphEditor packId={packId} model={model} />
    </div>
  )
}

export default DeviceMappingsPage
