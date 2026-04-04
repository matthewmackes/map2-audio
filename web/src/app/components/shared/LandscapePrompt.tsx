interface LandscapePromptProps {
  componentId: string
  title?: string
  description?: string
  continueLabel?: string
}

export function LandscapePrompt({
  componentId,
  title = 'Rotate for full editor',
  description = 'This workspace is optimized for landscape orientation.',
  continueLabel = 'Continue anyway',
}: LandscapePromptProps) {
  void componentId
  void title
  void description
  void continueLabel
  return null
}
