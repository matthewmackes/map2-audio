// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DeviceDetailRoute — T2459-G5. Hardware-Store-style hero card +
// Carbon `Tabs` strip for one device profile. Reachable via
// `/devices/profile/<packId>/<model>/v2` while the legacy
// auto-rendered DeviceProfilePanel keeps `/devices/profile/.../`
// intact until G11 cleanup.

import * as React from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Tabs, TabList, Tab, TabPanels, TabPanel,
  Tag, InlineNotification, SkeletonText,
} from '@carbon/react'
import { useQuery } from '@tanstack/react-query'
import { useSetShellWindow } from '../../../layout/useSetShellWindow'

import {
  getDeviceProfile,
  type DeviceProfileDetail,
  type PackSourceRow,
} from '../../../../map2/clients/devices'
import { usePackSources } from '../hooks/useDeviceProfiles'
import { OverviewTab } from './tabs/OverviewTab'
import { LicenseTab } from './tabs/LicenseTab'
import { AudioIoTab } from './tabs/AudioIoTab'
import { BindingsTab } from './tabs/BindingsTab'
import { DiagnosticsTab } from './tabs/DiagnosticsTab'

import './DeviceDetailRoute.css'

const KIND_FALLBACKS: Array<'audio' | 'midi' | 'hid'> = ['audio', 'midi', 'hid']

interface ResolveResult {
  profile: DeviceProfileDetail | null
  attemptedKinds: Array<'audio' | 'midi' | 'hid'>
  resolvedKind: 'audio' | 'midi' | 'hid' | null
  error: Error | null
}

async function resolveProfile(packId: string, model: string): Promise<ResolveResult> {
  const attempted: Array<'audio' | 'midi' | 'hid'> = []
  for (const kind of KIND_FALLBACKS) {
    attempted.push(kind)
    try {
      const r = await getDeviceProfile(packId, model, kind)
      return { profile: r.profile, attemptedKinds: attempted, resolvedKind: kind, error: null }
    } catch {
      // try next
    }
  }
  return {
    profile: null,
    attemptedKinds: attempted,
    resolvedKind: null,
    error: new Error(`No profile resolved for ${packId}/${model}`),
  }
}

export function DeviceDetailRoute(): React.JSX.Element {
  const { packId = '', model = '' } = useParams<{ packId: string; model: string }>()
  const profileQuery = useQuery<ResolveResult>({
    queryKey: ['devices', 'profile-resolve', packId, model],
    queryFn: () => resolveProfile(packId, model),
    enabled: Boolean(packId && model),
    staleTime: 30_000,
  })
  const packSourcesQuery = usePackSources()

  const profile = profileQuery.data?.profile ?? null
  const packSource: PackSourceRow | undefined =
    (packSourcesQuery.data?.sources ?? []).find((s) => s.pack_id === packId)
  const shellTitle = profile ? `${profile.model}` : 'Device Detail'
  const shellCrumbs = React.useMemo(() => {
    const vendorLabel = packSource?.vendor ?? packId
    if (!profile) {
      return [
        { label: 'Devices', to: '/devices' },
        { label: 'Device Detail' },
      ]
    }
    return [
      { label: 'Devices', to: '/devices' },
      { label: vendorLabel, to: '/devices' },
      { label: profile.model },
    ]
  }, [packId, packSource?.vendor, profile])

  useSetShellWindow({
    title: shellTitle,
    crumbs: shellCrumbs,
  }, [shellTitle, shellCrumbs])

  if (!packId || !model) {
    return (
      <div className="device-detail-route">
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Invalid URL"
          subtitle="Expected /devices/profile/:packId/:model/v2"
        />
      </div>
    )
  }

  if (profileQuery.isLoading) {
    return (
      <div className="device-detail-route">
        <SkeletonText paragraph lineCount={4} />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="device-detail-route">
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Profile not found"
          subtitle={`No audio/midi/hid profile resolved for ${packId}/${model}.`}
        />
        <p>
          <RouterLink to="/devices">← Back to Hardware Store</RouterLink>
        </p>
      </div>
    )
  }

  const sourceLabel: Record<NonNullable<PackSourceRow['source']>, string> = {
    shipped: 'Shipped',
    user: 'User',
    imported: 'Imported',
  }
  const sourceTone: Record<NonNullable<PackSourceRow['source']>, string> = {
    shipped: 'green',
    user: 'cyan',
    imported: 'magenta',
  }

  return (
    <div className="device-detail-route">
      <header className="device-detail-route__hero">
        <div className="device-detail-route__hero-text">
          <p className="device-detail-route__crumb">
            <RouterLink to="/devices">Hardware Store</RouterLink>
            {' / '}
            <span>{packSource?.vendor ?? packId}</span>
          </p>
          <h1>{profile.model}</h1>
          <p className="device-detail-route__hero-sub">
            Profile <code>{profile.pack_id}/{profile.model}.{profile.kind}</code>
          </p>
          <div className="device-detail-route__hero-tags">
            <Tag size="sm" type="cool-gray">{profile.kind}</Tag>
            {packSource ? (
              <Tag size="sm" type={sourceTone[packSource.source] as never}>
                {sourceLabel[packSource.source]}
              </Tag>
            ) : null}
            {packSource?.is_degraded ? (
              <Tag size="sm" type="warm-gray">Pack degraded</Tag>
            ) : null}
          </div>
        </div>
      </header>

      <Tabs>
        <TabList aria-label="Device detail tabs" contained>
          <Tab>Overview</Tab>
          <Tab>Audio I/O</Tab>
          <Tab>Bindings</Tab>
          <Tab>Diagnostics</Tab>
          <Tab>License</Tab>
        </TabList>
        <TabPanels>
          <TabPanel><OverviewTab profile={profile} /></TabPanel>
          <TabPanel><AudioIoTab profile={profile} /></TabPanel>
          <TabPanel><BindingsTab profile={profile} /></TabPanel>
          <TabPanel><DiagnosticsTab packId={profile.pack_id} /></TabPanel>
          <TabPanel>
            <LicenseTab
              packId={profile.pack_id}
              packSource={packSource}
              manifest={(profile.document.manifest as Record<string, unknown>) ?? undefined}
              isDegraded={packSource?.is_degraded}
              degradedFiles={packSource?.degraded_files}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  )
}
