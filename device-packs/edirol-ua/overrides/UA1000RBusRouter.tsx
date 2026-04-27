// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// UA-1000 R-BUS Router — vendor-override panel for the UA-1000's
// 8-channel R-BUS digital I/O. Composed into DeviceProfilePanel after
// the auto-rendered scaffold (T2459-C2 contract). Surfaces the R-BUS
// patching operators are most likely to want at the device page —
// where to source channel pairs from, where to send them.
//
// Worklist: T2459-C2.

import React from 'react'
import { Tag, Layer } from '@carbon/react'

export default function UA1000RBusRouter(): JSX.Element {
  return (
    <div data-testid="ua1000-rbus-router" style={{ padding: '1rem' }}>
      <h4 style={{ marginTop: 0 }}>R-BUS Digital I/O</h4>
      <p style={{ fontSize: '0.875rem' }}>
        The UA-1000's R-BUS port carries 8 channels of 24-bit/96 kHz digital
        audio over a DB-25 cable. Use this section to route R-BUS pairs to
        and from MAP2 chains. The full 8-channel routing matrix lands in a
        T2459-E1 follow-up alongside the rest of the Edirol UA range; this
        scaffold confirms the override slot mounts correctly.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Tag type="cool-gray">RBUS_IN_1</Tag>
        <Tag type="cool-gray">RBUS_IN_2</Tag>
        <Tag type="cool-gray">RBUS_IN_3</Tag>
        <Tag type="cool-gray">RBUS_IN_4</Tag>
        <Tag type="cool-gray">RBUS_IN_5</Tag>
        <Tag type="cool-gray">RBUS_IN_6</Tag>
        <Tag type="cool-gray">RBUS_IN_7</Tag>
        <Tag type="cool-gray">RBUS_IN_8</Tag>
      </div>
      <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
        Front-panel hardware mixer is not addressable via USB on the UA-1000;
        the on-device monitor mix is operated entirely by the front-panel
        knobs.
      </p>
    </div>
  )
}
