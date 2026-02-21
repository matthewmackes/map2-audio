---
name: map2-gemini-instructions
description: MAP2 Audio core engineering guidance and memory protocol. Use when working in this repository on architecture, coding standards, build/test/deploy commands, server management, performance and latency constraints, and when asked to remember new fixes or patterns.
---

# MAP2 Gemini Instructions

Use `references/gemini-instructions.md` as the canonical MAP2 guidance document.

## Workflow

1. Open `references/gemini-instructions.md` and locate only the sections needed for the current task.
2. Apply repository rules for build/test/deploy commands, architecture, code quality, and performance constraints.
3. If the user asks to "remember" a fix/pattern, update `.gemini/instructions.md` (the source document), not this skill.

## Fast Section Lookup

Use targeted search instead of loading the entire document when possible.

```bash
rg -n "Tech Stack|Build & Test Commands|Essential Files to Read First|Style & Architecture Rules|Critical System Rules|Performance & Latency|Gotchas & Learned Fixes|Quick Reference Commands|Common Pitfalls" .gemini/instructions.md
```

## Source of Truth

- Canonical file: `.gemini/instructions.md`
- Keep this skill concise and procedural; keep long-form domain content in the source file.
