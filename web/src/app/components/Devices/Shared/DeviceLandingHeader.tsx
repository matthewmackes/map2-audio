/**
 * T2485-1 — landing-view header for a unified device shell.
 *
 * Renders the device's title and 3-line purpose description from its
 * manifest. Per the Q4 decision recorded in PROJECT_WORKLIST.md T2485
 * entry, this header is shown on the device's landing view only;
 * subsequent views (editor, midi-map, flow, etc.) skip the description
 * block since the operator already knows what device they're on.
 */

import { Heading } from '@carbon/react'
import type { DeviceManifest } from './deviceManifest'
import './DeviceLandingHeader.css'

export interface DeviceLandingHeaderProps {
  manifest: DeviceManifest
}

export function DeviceLandingHeader({ manifest }: DeviceLandingHeaderProps) {
  return (
    <header className="device-landing-header" data-profile-key={manifest.profileKey}>
      <Heading className="device-landing-header__title">{manifest.title}</Heading>
      <ul className="device-landing-header__purpose" aria-label={`${manifest.title} purpose`}>
        {manifest.purposeLines.map((line, idx) => (
          <li key={idx} className="device-landing-header__purpose-line">
            {line}
          </li>
        ))}
      </ul>
    </header>
  )
}
