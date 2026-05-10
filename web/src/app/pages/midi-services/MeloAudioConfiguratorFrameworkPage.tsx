/**
 * T2499-A UI swap (2026-05-10) — framework-canonical entry for the
 * MeloAudio Commander.
 *
 * Mounts `DeviceConfiguratorShell` with `meloaudioCommanderPack` so
 * the bespoke Configurator UI body now lives inside a tab on the
 * generic framework shell. This is the canonical operator surface;
 * the legacy direct route at `/midi/devices/meloaudio-midi-commander/
 * configurator` redirects here for back-compat.
 */
import { DeviceConfiguratorShell } from '../../components/DeviceConfigurator/DeviceConfiguratorShell'
import { meloaudioCommanderPack } from '../../components/DeviceConfigurator/packs/meloaudioCommander'

export function MeloAudioConfiguratorFrameworkPage() {
  return <DeviceConfiguratorShell pack={meloaudioCommanderPack} />
}

export default MeloAudioConfiguratorFrameworkPage
