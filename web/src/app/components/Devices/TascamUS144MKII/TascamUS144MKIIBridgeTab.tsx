// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 — S/PDIF Bridge tab. Surfaces the S/PDIF ports as
// hardware-fx-bridge-capable (the T2517 effects-block binds to this). For
// the T2515 ship the tab is informational; the per-instance config + the
// MPX-1 calibration wizard land in T2517-6.

import { InlineNotification, Link, Tag } from '@carbon/react'

import type { TascamCapabilitiesPayload } from './TascamUS144MKIIView'

export interface TascamUS144MKIIBridgeTabProps {
  capabilities?: TascamCapabilitiesPayload
}

export function TascamUS144MKIIBridgeTab({ capabilities }: TascamUS144MKIIBridgeTabProps) {
  return (
    <div className="stack">
      <InlineNotification
        kind="info"
        lowContrast
        title="S/PDIF channels are reserved for hardware-FX bridging"
        subtitle="Channels 3-4 carry the T2517 effects-block send/return path (e.g., Lexicon MPX-1). When an MPX-1 block is inserted in any chain, this pair is owned by the bridge."
        hideCloseButton
      />
      <section>
        <h4>S/PDIF send (output)</h4>
        <ul className="cds--list--unordered">
          {(capabilities?.spdif_send_channels ?? []).map((idx, i) => (
            <li key={`sb-out-${idx}`}>
              <Tag type="magenta">ch&nbsp;{idx}</Tag> S/PDIF OUT {i === 0 ? 'L' : 'R'}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>S/PDIF return (input)</h4>
        <ul className="cds--list--unordered">
          {(capabilities?.spdif_return_channels ?? []).map((idx, i) => (
            <li key={`sb-in-${idx}`}>
              <Tag type="magenta">ch&nbsp;{idx}</Tag> S/PDIF IN {i === 0 ? 'L' : 'R'}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Active hardware-FX bridges</h4>
        <p>
          Manage MPX-1 and other hardware-FX bridges from the snapshot editor's effects chooser.
          {' '}
          <Link href="/midi/devices/lexicon-mpx1">Open Lexicon MPX-1 control surface →</Link>
        </p>
      </section>
    </div>
  )
}
