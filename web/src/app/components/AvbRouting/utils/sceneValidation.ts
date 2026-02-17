export const SCENE_NAME_MAX_LENGTH = 64;
export const SCENE_DESCRIPTION_MAX_LENGTH = 280;
export const SCENE_MAX_TAGS = 8;
export const SCENE_TAG_MAX_LENGTH = 24;

const CONTROL_CHARS_PATTERN = /[\u0000-\u001F\u007F]/g;
const RESERVED_CHARS_PATTERN = /[<>`|\\]/g;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeCommon(value: string): string {
  return collapseWhitespace(
    value
      .replace(CONTROL_CHARS_PATTERN, '')
      .replace(RESERVED_CHARS_PATTERN, ' ')
  );
}

export function normalizeSceneName(raw: string): string {
  return normalizeCommon(raw);
}

export function normalizeSceneDescription(raw: string): string {
  return normalizeCommon(raw);
}

export function normalizeSceneTags(rawTags: string[]): string[] {
  const deduped = new Set<string>();
  const normalized: string[] = [];

  rawTags.forEach((tag) => {
    const cleaned = normalizeCommon(tag)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!cleaned || deduped.has(cleaned)) {
      return;
    }
    deduped.add(cleaned);
    normalized.push(cleaned);
  });

  return normalized;
}

export type SceneMetadataInput = {
  name: string;
  description: string;
  tags: string[];
};

export type SceneValidationResult = {
  normalized: SceneMetadataInput;
  errors: string[];
  warnings: string[];
};

export function normalizeAndValidateSceneMetadata(
  input: SceneMetadataInput,
  options?: { requireName?: boolean }
): SceneValidationResult {
  const requireName = options?.requireName ?? true;
  const normalizedName = normalizeSceneName(input.name);
  const normalizedDescription = normalizeSceneDescription(input.description);
  const normalizedTags = normalizeSceneTags(input.tags);

  const warnings: string[] = [];
  if (input.name !== normalizedName || input.description !== normalizedDescription || input.tags.join('|') !== normalizedTags.join('|')) {
    warnings.push('Scene metadata was normalized to remove reserved characters and whitespace.')
  }

  const errors: string[] = [];
  if (requireName && !normalizedName) {
    errors.push('Scene name is required.')
  }
  if (normalizedName.length > SCENE_NAME_MAX_LENGTH) {
    errors.push(`Scene name cannot exceed ${SCENE_NAME_MAX_LENGTH} characters.`)
  }
  if (normalizedDescription.length > SCENE_DESCRIPTION_MAX_LENGTH) {
    errors.push(`Scene description cannot exceed ${SCENE_DESCRIPTION_MAX_LENGTH} characters.`)
  }
  if (normalizedTags.length > SCENE_MAX_TAGS) {
    errors.push(`Scene tags cannot exceed ${SCENE_MAX_TAGS} entries.`)
  }
  const overlongTag = normalizedTags.find((tag) => tag.length > SCENE_TAG_MAX_LENGTH);
  if (overlongTag) {
    errors.push(`Scene tags cannot exceed ${SCENE_TAG_MAX_LENGTH} characters each.`)
  }

  return {
    normalized: {
      name: normalizedName,
      description: normalizedDescription,
      tags: normalizedTags,
    },
    errors,
    warnings,
  };
}

export function hasDuplicateSceneName(
  sceneName: string,
  scenes: Array<{ id: string; name: string }>,
  options?: { excludeSceneId?: string }
): boolean {
  const normalizedName = normalizeSceneName(sceneName).toLowerCase();
  const excludeSceneId = options?.excludeSceneId || null;
  return scenes.some((scene) => (
    scene.id !== excludeSceneId &&
    normalizeSceneName(scene.name).toLowerCase() === normalizedName
  ));
}
