# MAP2 RPM Packaging and Repo Plan (Run Output)

## Package Split
- `map2-core`: runtime binaries/libs.
- `map2-config`: default config under `/etc/map2` as `%config(noreplace)`.
- `map2-services`: systemd units, sysusers/tmpfiles, health scripts, logrotate.
- `map2-web`: built UI assets and runtime service glue.
- `map2-avb`: linuxptp defaults, AVB helper scripts, tc/qdisc validation tooling.
- `map2-plugins` (optional): MAP2-distributed plugin bundle.

## Spec Skeletons Generated
- Full skeleton: `rpm/map2-core.spec`
- Stubs: `rpm/map2-config.spec.stub`, `rpm/map2-services.spec.stub`, `rpm/map2-web.spec.stub`, `rpm/map2-avb.spec.stub`, `rpm/map2-plugins.spec.stub`

## Fedora Packaging Requirements to Enforce
- Use `BuildRequires`/`Requires` from measured runtime/build dependencies.
- Use `%config(noreplace)` for admin-editable config.
- Use systemd scriptlet macros in service package:
  - `%systemd_post`
  - `%systemd_preun`
  - `%systemd_postun`
- Include file ownership/permissions and explicit `%files` coverage.

## Local Repository Workflow
- Helper script: `repo/map2-create-local-repo.sh`
- Pipeline:
  1. Build RPMs with `rpmbuild`.
  2. Optional sign (`rpm --addsign`).
  3. Run `createrepo_c`.
  4. Generate `/etc/yum.repos.d/map2-local.repo`.

## CI Recommendations
- `mock` build per target Fedora release.
- `rpmlint` on all generated RPMs and SPEC files.
- Reproducibility checks using deterministic source archive and pinned build inputs.
