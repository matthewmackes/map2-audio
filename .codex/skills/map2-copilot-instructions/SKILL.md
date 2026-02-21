---
name: map2-copilot-instructions
description: MAP2 Copilot-specific collaboration rules and user preferences, especially git workflow requirements. Use when handling commit/push/sync requests, applying user workflow preferences, or following .github/copilot-instructions.md behavior in this repository.
---

# MAP2 Copilot Instructions

Use `references/copilot-instructions.md` as the canonical Copilot guidance document.

## Workflow

1. Open `references/copilot-instructions.md` and pull the sections relevant to the task.
2. Apply MAP2 collaboration preferences, especially the git workflow requirements.
3. For general MAP2 technical standards, pair this with `map2-gemini-instructions`.

## Git Preference Enforcement

When the user asks to push or sync changes, keep GitHub and GitLab synchronized per the source document:

```bash
git push origin master && git push gitlab master
```

If the user explicitly names another branch, mirror that branch to both remotes.

## Source of Truth

- Canonical file: `.github/copilot-instructions.md`
- Keep this skill focused on preference enforcement; keep detailed project standards in the source docs.
