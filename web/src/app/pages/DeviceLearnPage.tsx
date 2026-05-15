// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DeviceLearnPage — route at /devices/profile/:packId/:model/learn
// rendering the MIDI Learn Wizard for a device.
//
// Resolves the hardware `controllerKey` argument that MidiLearnWizard
// needs in priority order:
//   1. `?controller=<key>` query param (explicit override).
//   2. The MIDI sibling profile's `identity.hardware_id`, which holds
//      the canonical `alsa-seq:<client>:<port>` for any device pack
//      that ships a MIDI profile (e.g. `alsa-seq:UA-1000 MIDI:0`).
//   3. An existing active mapping for this pack+model, if one is
//      bound — covers re-learn against a custom controller_key.
// When none of these resolve, the page surfaces a notice instead of
// silently starting a learn session against an unknown source.

import React from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { InlineNotification, Loading } from '@carbon/react'
import { useQuery } from '@tanstack/react-query'

import { MidiLearnWizard } from '../components/Devices/MidiLearnWizard'
import { getDeviceProfile, listActiveMappings } from '../../map2/clients/devices'

export function DeviceLearnPage(): React.JSX.Element {
  const { packId, model } = useParams<{ packId: string; model: string }>()
  const [searchParams] = useSearchParams()
  const controllerParam = searchParams.get('controller')

  const midiProfileQuery = useQuery({
    queryKey: ['device-profile', packId, model, 'midi'],
    queryFn: () => getDeviceProfile(packId!, model!, 'midi'),
    enabled: !controllerParam && Boolean(packId && model),
    staleTime: 60_000,
    retry: false,
  })

  const profileHardwareId =
    !controllerParam && midiProfileQuery.data?.profile.hardware_id
      ? midiProfileQuery.data.profile.hardware_id
      : null

  const mappingsQuery = useQuery({
    queryKey: ['active-mappings'],
    queryFn: listActiveMappings,
    enabled:
      !controllerParam &&
      !profileHardwareId &&
      midiProfileQuery.isFetched &&
      Boolean(packId && model),
    staleTime: 10_000,
  })

  if (!packId || !model) {
    return (
      <div style={{ padding: '1rem' }}>
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Invalid learn URL"
          subtitle="Expected /devices/profile/:packId/:model/learn."
        />
      </div>
    )
  }

  let controllerKey: string | null = controllerParam ?? profileHardwareId
  if (!controllerKey && mappingsQuery.data) {
    const match = mappingsQuery.data.active_mappings.find(
      (m) => m.pack_id === packId && m.model === model,
    )
    controllerKey = match?.controller_key ?? null
  }

  const isResolving =
    !controllerParam &&
    (midiProfileQuery.isLoading ||
      (!profileHardwareId && mappingsQuery.isFetching))

  return (
    <div data-testid="device-learn-page" style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>
        {packId} / {model} — MIDI Learn
      </h2>
      {isResolving ? (
        <Loading withOverlay={false} description="Looking up controller…" small />
      ) : controllerKey ? (
        <MidiLearnWizard packId={packId} model={model} controllerKey={controllerKey} />
      ) : (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="No MIDI controller declared for this pack"
          subtitle={
            'This device pack does not ship a MIDI profile with a canonical ' +
            'hardware_id, and no mapping is bound yet. Override with ' +
            '?controller=<alsa-seq-key> on the URL, or add a MIDI profile to ' +
            'the device pack.'
          }
        />
      )}
    </div>
  )
}

export default DeviceLearnPage
