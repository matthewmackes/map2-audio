/**
 * T2499-B — route mount for the Maschine MK1 onboarding wizard.
 *
 * Hosts `MaschineOnboardingWizard` at `/maschine/onboarding` — the route the
 * Sequencer Setup "Calibrate Maschine MK1" card deep-links to.
 */
import { MaschineOnboardingWizard } from './MaschineOnboardingWizard'

export function MaschineOnboardingWizardPage() {
  return <MaschineOnboardingWizard />
}
