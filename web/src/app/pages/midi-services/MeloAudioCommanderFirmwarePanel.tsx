/**
 * T2459-H3-CFG Phase 5 slice 4 — Custom Firmware install flow panel.
 *
 * What's shipped here (slice 4 — read-only firmware listing + operator
 * runbook):
 *   - GET /api/devices/.../firmware/bundled — list bundled .dfu binaries
 *     and surface "no firmware bundled" / "N firmwares available" states.
 *   - Numbered install runbook so operators can follow it without leaving
 *     the page.
 *   - Restore-to-stock runbook (links to MeloAudio support) — the stock
 *     binary is not redistributable, so MAP2 cannot bundle it.
 *
 * Deferred to a follow-up backend slice:
 *   - "Install custom firmware" interactive button → POST /flash with the
 *     selected firmware path, streaming dfu-util progress (the backend
 *     dfu_flash module exists but no streaming route is wired yet). Today
 *     the panel directs operators to the CLI command.
 */

import { useQuery } from '@tanstack/react-query'
import {
  Heading,
  InlineLoading,
  InlineNotification,
  Layer,
  Link as CarbonLink,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  Tile,
} from '@carbon/react'

import meloaudioCommanderApi, {
  type CommanderFirmwareKind,
} from '../../../map2/clients/meloaudioCommander'

interface FirmwarePanelProps {
  firmwareKind: CommanderFirmwareKind
  isPresent: boolean
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`
}

export function MeloAudioCommanderFirmwarePanel({
  firmwareKind,
  isPresent,
}: FirmwarePanelProps) {
  const firmwareQuery = useQuery({
    queryKey: ['meloaudio-commander', 'firmware', 'bundled'],
    queryFn: () => meloaudioCommanderApi.getBundledFirmware(),
    refetchOnWindowFocus: false,
  })

  const data = firmwareQuery.data
  const inDfuMode = firmwareKind === 'dfu_bootloader'
  const onCustom = firmwareKind === 'custom'

  return (
    <Tile className="meloaudio-commander-configurator__firmware">
      <header className="meloaudio-commander-configurator__firmware-header">
        <Heading className="meloaudio-commander-configurator__firmware-title">
          Custom firmware (harvie256)
        </Heading>
        {onCustom ? (
          <Tag type="green" size="sm" data-testid="firmware-panel-tag">
            Custom firmware active
          </Tag>
        ) : inDfuMode ? (
          <Tag type="magenta" size="sm" data-testid="firmware-panel-tag">
            DFU bootloader on bus
          </Tag>
        ) : (
          <Tag type="cool-gray" size="sm" data-testid="firmware-panel-tag">
            Stock firmware
          </Tag>
        )}
      </header>

      <p className="meloaudio-commander-configurator__firmware-copy">
        harvie256’s community firmware replaces stock and exposes a SysEx
        protocol so MAP2 can push a canonical configuration. Source + license
        live in <code>device-packs/meloaudio/firmware/</code>; the binary is
        flashed via STM32 DFU. The stock MeloAudio firmware is{' '}
        <strong>not</strong> bundled — see the restore-to-stock runbook below
        if you need to revert.
      </p>

      {firmwareQuery.isLoading ? (
        <InlineLoading description="Listing bundled firmware…" />
      ) : null}

      {firmwareQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not list bundled firmware"
          subtitle="The /api/devices/meloaudio/commander/firmware/bundled endpoint returned an error."
        />
      ) : null}

      {data && !data.has_bundled_firmware ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="No bundled firmware in this MAP2 install"
          subtitle={`Drop a harvie256 .dfu binary into ${data.bundle_dir} and reload — see the README in that directory for licensing requirements.`}
        />
      ) : null}

      {data?.has_bundled_firmware ? (
        <Layer level={2}>
          <StructuredListWrapper
            aria-label="Bundled firmware binaries"
            className="meloaudio-commander-configurator__firmware-list"
          >
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>File</StructuredListCell>
                <StructuredListCell head>Size</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {data.firmwares.map((entry) => (
                <StructuredListRow key={entry.path}>
                  <StructuredListCell>
                    <code>{entry.name}</code>
                  </StructuredListCell>
                  <StructuredListCell>
                    {formatBytes(entry.size_bytes)}
                  </StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </Layer>
      ) : null}

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Interactive flash UI ships in a follow-up backend slice"
        subtitle="The dfu_flash backend module is wired but the streaming route is not. For now, follow the CLI runbook below."
      />

      <section className="meloaudio-commander-configurator__firmware-runbook">
        <Heading className="meloaudio-commander-configurator__firmware-runbook-title">
          Install runbook (CLI, while interactive UI is pending)
        </Heading>
        <ol className="meloaudio-commander-configurator__firmware-runbook-list">
          <li>
            Hold <kbd>Bottom A</kbd> + <kbd>Bottom C</kbd> while plugging the
            Commander in to enter DFU mode. The status card above will read{' '}
            <strong>DFU bootloader</strong> when ready.
          </li>
          <li>
            Pick a firmware from the list above. Note its absolute path.
          </li>
          <li>
            Run from a terminal:{' '}
            <code>
              dfu-util -a 0 -s 0x08000000:leave -D &lt;firmware-path&gt;
            </code>
          </li>
          <li>
            Wait for <code>State: dfuMANIFEST-WAIT-RESET</code> and the device
            to reboot. The status card will flip to <strong>Custom firmware</strong>.
          </li>
          <li>
            Push the MAP2 canonical SysEx config when the canonical-config-push
            UI lands (slice 5+).
          </li>
        </ol>
      </section>

      <section className="meloaudio-commander-configurator__firmware-restore">
        <Heading className="meloaudio-commander-configurator__firmware-runbook-title">
          Restore to stock firmware
        </Heading>
        <p>
          The stock MeloAudio firmware is not redistributable, so MAP2 cannot
          bundle it. To revert, request the latest stock <code>.dfu</code>{' '}
          directly from MeloAudio support and flash it the same way (step 3
          above).
        </p>
        <p>
          Contact:{' '}
          <CarbonLink
            href="https://www.meloaudio.com/contact"
            target="_blank"
            rel="noreferrer noopener"
          >
            meloaudio.com/contact
          </CarbonLink>
        </p>
      </section>

      {!isPresent ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="No Commander on the bus"
          subtitle="Plug the device in (or hold the DFU button combo while connecting) before flashing."
        />
      ) : null}
    </Tile>
  )
}

export default MeloAudioCommanderFirmwarePanel
