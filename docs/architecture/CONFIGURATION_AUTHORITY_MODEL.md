# MAP2 Configuration Authority Model

## Decision

MAP2 uses a plane-based authority model for configuration and state.

Do not force one file or one database to own every kind of truth. Instead, assign one authority per plane and keep boundaries explicit.

## Authority Planes

### 1. `/etc/map2` = Host Desired Configuration

Use `/etc/map2` for machine-scoped desired configuration and generated host artifacts required before, during, or immediately after service startup.

Examples:

- deployment mode inputs
- systemd environment files
- TLS paths and host-local certificates
- system-level feature flags
- generated host config fragments consumed by services

Rules:

- If a value must exist before a user session starts, it belongs here.
- If a value affects systemd, boot, service launch, or host role, it belongs here.
- Files here may be generated, but the generating path must be explicit.
- Do not treat `/etc/map2` as a dump for mutable runtime telemetry.

### 2. `/var/lib/map2` = Durable Service And Cluster State

Use `/var/lib/map2` for service-managed durable state.

Examples:

- cluster registry databases
- event logs
- service-owned backups
- replicated inventories
- content repositories and staging trees

Rules:

- Data here is durable state, not operator-edited desired config.
- Services may migrate or compact it.
- Humans may inspect it, but new features should not require routine manual editing here.

### 3. `~/.map2` = User, Operator, And Session-Scoped State

Use `~/.map2` for per-user preferences, local operator state, user-owned content, and compatibility shims that are not cluster-wide authority.

Examples:

- UI preferences
- user-scoped local content
- cached state
- per-user feature settings

Rules:

- Treat this plane as user-scoped, not host-scoped.
- Do not promote `~/.map2` files into cluster or host authority unless there is an explicit migration.
- A value in `~/.map2` must not silently override host-critical behavior unless the contract says it can.

### 4. External Or Runtime Systems = Observed Live State

Some truths are not static config and should stay outside the file-based authority planes.

Examples:

- `/proc/cmdline`
- PipeWire graph, `pw-metadata`, `wpctl`, `pw-dump`
- realtime engine observations
- network discovery state
- etcd control-plane authority
- Raft leadership and log state

Rules:

- Treat these as observed or control-plane state, not static config.
- Do not copy them into `/etc/map2`, `/var/lib/map2`, or `~/.map2` and then pretend the copy is authoritative.
- If a projection is needed for UX or recovery, label it as a projection or cache.

## Core Rules

### One Concept, One Authority

A single concept must have one declared authority plane.

Allowed:

- one authority
- zero or more generated projections
- zero or more caches

Not allowed:

- parallel hand-edited stores with no declared owner
- route-local truth that competes with shared authority
- turning observed runtime state into fake static truth

### Generated Projections Must Be Explicit

If a concept appears in more than one place, future work must document:

- canonical owner
- generated or compatibility projections
- reconciliation path
- startup consumer path

Generated files should say they are generated where practical.

### New Work Must Declare Its Plane

When adding a new configuration or persistent state field, decide first:

1. Is this host desired config?
2. Is this durable service state?
3. Is this user-scoped state?
4. Is this observed live state or external authority?

If that answer is unclear, the design is not ready.

## Current Transitional Exception

### Deployment Mode

Deployment mode is currently mirrored across multiple stores for compatibility and boot/runtime integration:

- `/etc/guitarfx-mode.conf`
- `/etc/map2/environment`
- `~/.map2/deployment.json`
- active backend systemd mode drop-ins

Current rule:

- `map2-mode.sh` is the reconciliation entrypoint.
- Future work must not add a new deployment-mode store.
- If deployment-mode storage is refactored later, that work must reduce mirrors rather than increase them.

## Relationship To Control-Plane Authority

This plane model does not replace the dedicated live/control-plane authority model already used for audio state.

Use both rules together:

- static host config belongs in `/etc/map2`
- durable local state belongs in `/var/lib/map2`
- user/session state belongs in `~/.map2`
- live cluster authority belongs in the proper control plane, such as etcd or Raft-backed services

Do not collapse these into a single storage mechanism unless there is a strong operational reason and the affected plane boundaries are still preserved.

## Guidance For Future Changes

- Prefer reducing ambiguous mirrors over adding new ones.
- Prefer typed loaders over ad hoc file reads.
- Prefer generated compatibility artifacts over dual-write hand maintenance.
- Prefer explicit authority/projection language in docs, APIs, and code comments.
- If a change introduces a new dependency, service, installer path, or runtime assumption, update the corresponding installer and environment artifacts in the same task.
