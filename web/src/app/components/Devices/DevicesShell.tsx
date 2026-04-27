// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DevicesShell — minimal route shell for /devices/* nested routes.
//
// T2459-G11b: this shell no longer references the deprecated
// `deviceRegistry`. Per the Unified Node Pill Directive, node-identity
// UI lives in the global nav pill (NodeNavChip); the shell renders
// only the outlet for the active child route.
import { Outlet } from 'react-router-dom'

import './DevicesShell.css'

export function DevicesShell() {
  return (
    <div className="devices-shell">
      <div className="devices-shell__main">
        <div className="devices-shell__content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
