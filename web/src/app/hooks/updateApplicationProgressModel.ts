import type { HybridApplicationUpdateStepInfo } from './useNodeOperations'

type UpdateApplicationStepBlueprint = Pick<HybridApplicationUpdateStepInfo, 'key' | 'question' | 'detail'>

export const UPDATE_APPLICATION_PROGRESS_BLUEPRINT: UpdateApplicationStepBlueprint[] = [
  {
    key: 'detect-mode',
    question: 'Which update path should MAP2 use?',
    detail: 'Determine whether this node should update through Git or RPM.',
  },
  {
    key: 'identify-current-build',
    question: 'What build is currently installed?',
    detail: 'Read the currently installed commit or package version before changing anything.',
  },
  {
    key: 'validate-source',
    question: 'Is the update source healthy?',
    detail: 'Validate that the selected repository or package source is usable.',
  },
  {
    key: 'prepare-local-state',
    question: 'Can the node prepare its local state safely?',
    detail: 'Prepare the working tree or mark why that step is not needed for this mode.',
  },
  {
    key: 'fetch-update-payload',
    question: 'Can MAP2 fetch the requested update payload?',
    detail: 'Reach the remote branch or package metadata needed for the update.',
  },
  {
    key: 'apply-target-version',
    question: 'Can the target application version be applied?',
    detail: 'Checkout the requested branch or install the requested package.',
  },
  {
    key: 'refresh-runtime-dependencies',
    question: 'Can runtime dependencies be refreshed?',
    detail: 'Refresh Python or packaged runtime dependencies required by the updated build.',
  },
  {
    key: 'refresh-frontend-dependencies',
    question: 'Can frontend dependencies be refreshed?',
    detail: 'Refresh frontend dependencies when the update mode requires a rebuild.',
  },
  {
    key: 'rebuild-frontend-assets',
    question: 'Can the frontend bundle be rebuilt cleanly?',
    detail: 'Rebuild the production frontend assets if they are not shipped prebuilt.',
  },
  {
    key: 'validate-and-finalize',
    question: 'Does validation confirm the update is safe to keep?',
    detail: 'Run post-update validation and publish the final result back to the operator.',
  },
]

export function makePendingUpdateApplicationSteps(): HybridApplicationUpdateStepInfo[] {
  return UPDATE_APPLICATION_PROGRESS_BLUEPRINT.map((step) => ({
    ...step,
    status: 'pending',
  }))
}
