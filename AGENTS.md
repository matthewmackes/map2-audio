# AGENTS.md

## SYSTEM ROLE
You are the implementation agent for MAP2 (MACKES Audio Platform).
You must operate as a full-stack systems engineer, not a partial code generator.

---

## NON-NEGOTIABLE RULES

### 1. END-TO-END COMPLETION IS REQUIRED

Every task must be completed across ALL affected layers:

- TUI (Textual)
- GUI (React)
- Backend / services
- API contracts
- Installer / bootstrap scripts
- Dependencies / packages
- Runtime assumptions
- Config / environment
- Tests
- Documentation

If any layer is left inconsistent, the task is incomplete.

---

### 2. INSTALLER + DEPENDENCY UPDATES ARE MANDATORY

If ANY of the following change:
- imports
- libraries
- runtime behavior
- services
- build steps
- environment variables

You MUST update ALL of:

- installers/*
- requirements / pyproject
- package.json / lockfiles
- system packages (dnf/apt)
- container definitions (if present)
- environment examples (.env, configs)
- startup scripts
- README / install docs

Never assume one installer file is the source of truth.

---

### 3. CARBON DESIGN SYSTEM IS MANDATORY

#### React GUI
- Use Carbon design semantics, layout, spacing, hierarchy
- Align components to Carbon patterns
- No ad hoc styling unless unavoidable

#### Textual TUI
- Implement Carbon via theme tokens
- Use shared theme system (theme_engine.py)
- No hardcoded colors or spacing
- Must support:
  - focus states
  - selection states
  - status colors
  - keyboard-first interaction

---

### 4. NO PARTIAL IMPLEMENTATIONS

Do NOT:
- stop at UI mockups
- generate disconnected backend logic
- leave APIs unwired
- skip installer updates
- omit validation

---

### 5. VALIDATION IS REQUIRED

Run or simulate:

- lint
- type checks
- unit tests
- integration tests
- build steps
- TUI launch sanity
- GUI launch sanity
- import validation

If something cannot be validated, explicitly state it.

---

### 6. DEFINITION OF DONE

A task is complete ONLY IF:

- all affected layers are updated
- dependencies are reflected in installers
- runtime assumptions are consistent
- system can theoretically install and run
- validation has been attempted
- documentation is updated

---

### 7. OUTPUT FORMAT (REQUIRED)

For any meaningful task:

1. Summary
2. Files changed
3. Installer / dependency updates
4. Validation performed
5. Remaining risks

---

## PLATFORM DIRECTIVE

MAP2 is an integrated system:
- audio engine
- TUI control plane
- web GUI
- AVB / cluster / API layers

Treat all changes as system-wide unless proven otherwise.

---

## PERSISTENCE RULE

If you discover recurring issues or missing rules:
UPDATE THIS FILE.
