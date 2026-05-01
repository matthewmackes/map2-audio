/**
 * T2482 loop 10 / iter 92 — MidiServicesShell.
 *
 * Per the iter-91 design doc decision D1, MidiServicesShell is a thin
 * re-export of the existing MidiHubShell content, mounted at the new
 * /midi canonical path (the iter-92 mount). No frontend code is
 * rewritten in loop 10 — the change is routing + labels + 1 new
 * overview page (iter 95) + 1 new devices page (iter 98).
 *
 * The existing MidiHubShell (web/src/app/pages/MidiHubShell.tsx) +
 * its supporting pages (web/src/app/pages/midi-hub/) + components
 * (web/src/app/components/MidiHub/) all continue to work unchanged.
 * Iter 93's redirect map handles the /midi-hub/* → /midi/* aliasing
 * so legacy bookmarks + any inline navigation that hardcodes the old
 * URL keeps working.
 *
 * Iter 94 will rename the operator-visible labels ("MIDI Hub" →
 * "MIDI Services") in the GlobalTreeNav + AppShell + WorkspaceBar.
 * The shell internals (tab labels, page titles) follow in a future
 * iter.
 */

export { MidiHubShell as MidiServicesShell } from './MidiHubShell'
