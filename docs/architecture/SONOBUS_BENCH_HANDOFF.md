# SonoBus / AOO Bench-Gate Handoff — T2521-4 + T2521-10

**Filed:** 2026-05-15 (cycle 30 of the T2521 deploy run)
**Owner:** Operator (bench session required)
**Scope:** This document hands off the two remaining bench-gated
T2521 subtasks. Every other piece of T2521 (decision lock, authority,
schema, routes, WS, GUI, Q12 gate, snapshot picker, RPM/systemd/
firewall scaffolding, licensing notices, vendor skeleton) is already
**shipped code-side and exercised by 154 pytest + 13 jest cases** on
the current `master` branch.

This handoff is intentionally action-oriented: the operator can use
it as a runbook for the bench session, and a future contributor can
read the "Acceptance" sections to know exactly what closes each task.

---

## What's already in place (no operator action needed)

| Subtask | Status | Evidence |
|---|---|---|
| **T2521-1** Decisions Q1–Q21 | ✓ Done | `docs/architecture/SONOBUS_AOO_TRANSPORT.md` §0 |
| **T2521-2** Architecture doc | ✓ Done | `docs/architecture/SONOBUS_AOO_TRANSPORT.md` |
| **T2521-3** Authority + DB | ✓ Done | `app/services/sonobus/binding_*.py`; 45 pytest cases |
| **T2521-5** REST + WS | ✓ Done (cycles 26-28) | `app/services/sonobus/binding_routes.py` — 25 endpoints + `/api/sonobus/events` WS; 53 pytest cases |
| **T2521-6** Carbon workspace | ✓ Done (cycle 27) | `web/src/app/pages/sonobus/` — 9 region pages + shell + tabs; 14 jest cases; nav entry in `GlobalTreeNav` |
| **T2521-7** Snapshot + Q12 | ✓ Done (cycle 28) | `AudioInterfaceRegistry` SonoBus projection; `SnapshotInterfacePicker` SonoBus group; `recorder_service.assert_no_sonobus_interface_ids`; 18 regression tests |
| **T2521-8** Installer/RPM | ✓ Done (cycle 29) | `packaging/rpm/map2.spec` install + %preun + %postun; `systemd/map2-sonobus-transport.service`; `systemd/firewalld/map2-sonobus.xml`; `etc/map2/sonobus.env.example`; 17 pytest cases |
| **T2521-9** Licensing | ✓ Done | `docs/THIRD_PARTY_NOTICES.md` AOO BSD-3 + 3 fetched deps; `docs/architecture/LICENSE_COMPATIBILITY.md`; 8 pytest cases |

**Total T2521 test surface: 154 pytest + 13 jest cases, all green.**

---

## T2521-4 — `map2-sonobus-transport` C++ daemon

**Why bench-gated:** This is the RT audio path. The daemon hands
PCM samples between the JACK/PipeWire client thread (RT scheduled
FF/80) and the AOO source/sink runtime over UDP. Wire-up requires:

  - A real audio interface bound to JACK/PipeWire at 48 kHz / 64 samples
  - Two MAP2 nodes on the same LAN so peer discovery + AOO transport
    can be exercised end-to-end
  - RT priority elevation (`LimitRTPRIO=40` in the systemd unit,
    backed by `rtkit-daemon`)
  - An audible test source (the operator's guitar / signal generator)
    so latency + dropouts can be measured

None of those are reproducible in an autonomous run.

### What still needs to land

1. **Vendor the AOO source tree** into `vendor/aoo/`:
   - Clone `https://git.iem.at/cm/aoo` at a release tag (latest
     stable at handoff time: `v2.0-pre`)
   - Verify the BSD-3-Clause `LICENSE` lands at `vendor/aoo/LICENSE`
   - Update `vendor/aoo/VERSION` with the upstream commit and the
     vendor-pull ISO timestamp
   - **Do NOT manually create `vendor/aoo/CMakeLists.txt`** — that
     file ships with the AOO source. The pytest gate
     `test_vendor_aoo_has_no_cmakelists_yet` enforces absence until
     the source pull lands.

2. **Daemon binary** at `juce-engine/SonoBusDaemon/`:
   - New CMake target `map2-sonobus-transport` (standalone executable)
   - Links AOO + libuv (UDS bridge) + JACK or PipeWire client
   - Reads UDS messages from the backend's `SonoBusBindingAuthority`
     and updates AOO sources/sinks accordingly
   - Publishes per-binding metrics (RTT, loss, jitter, resends,
     observed_latency) back through the same UDS to feed
     `GET /api/sonobus/diagnostics`
   - Pushes peer-up/peer-down + session-start/session-stop +
     metric-snapshot events into the existing `/api/sonobus/events`
     WS surface so the GUI Diagnostics page populates live

3. **Supervisor** at `app/services/sonobus/daemon_supervisor.py`:
   - Lifecycle: start / stop / restart on systemd-unit failure
   - Health probe: feeds `daemon_running` + `daemon_endpoint` fields
     into `GET /api/sonobus/status` (currently `False` / `None`)
   - Mirrors the controller-host supervisor pattern from
     `app/services/maschine/maschine_mk1_daemon.py`

4. **Engine binding** in `juce-engine/Source/Map2AudioEngine.cpp`:
   - SonoBus stream taps: `setSonoBusInputId(stream_id)` and
     `setSonoBusOutputId(stream_id)` invoked from the snapshot
     publish path when `AudioStateDesiredIO.requested_*_interface_id`
     carries a `sonobus:` ID
   - RT-safe: bind in `prepareToPlay`, swap atomic flag references,
     never call `malloc` from `processBlock`

5. **Wire-up follow-ups already filed software-side:**
   - `app/services/sonobus/__init__.py` exports `assert_not_sonobus_id`
     — Recorder side already gates it; if other services pick up
     interface IDs later they call the same helper
   - `_sonobus_records_from_bindings` projects bindings into the
     `AudioInterfaceRegistry` — daemon-side discovery results will
     additionally land via the registry's existing capability merge
     point

### Acceptance criteria (closes T2521-4)

- [ ] `map2-sonobus-transport` daemon binary builds clean with
      `cmake --build juce-engine/build --target map2-sonobus-transport`
- [ ] Daemon starts via `systemctl start map2-sonobus-transport.service`
      with the shipped systemd unit and reaches the
      `/api/sonobus/status` daemon_running=True check within 5s
- [ ] Daemon-side metrics (RTT, loss%, jitter) populate
      `/api/sonobus/diagnostics` for every enabled binding
- [ ] WS events (peer-up/peer-down/session-start/session-stop/metric-
      snapshot) reach the GUI Diagnostics page in real time
- [ ] Engine `setSonoBusInputId` / `setSonoBusOutputId` bind streams
      without RT regressions (paired ON-vs-OFF 5-min soak shows no
      delta on the JUCE callback jitter percentile)

---

## T2521-10 — Bench validation matrix

**Why bench-gated:** Requires two physical MAP2 nodes on the same LAN
with synchronized clocks and an impairment emulator (`tc netem` or a
managed switch with policy shaping). Each soak runs ≥10 minutes per
profile and produces evidence artifacts under
`docs/fit-for-purpose-evidence/<YYYYMMDD>/sonobus-validation/`.

### Profile matrix (per the Q19 lock — same-LAN + impairment)

| Profile | Latency target | Jitter cap | Loss tolerance | Expected outcome |
|---|---|---|---|---|
| `pcm_lowest_latency` (default) | ≤ 12 ms p99 | ≤ 0.5 ms | < 0.1% | 0 xruns, 0 audible glitches |
| `pcm_resilient` | ≤ 25 ms p99 | ≤ 1.5 ms | < 1.5% | 0 audible glitches; up to 4 resend events / minute |
| `pcm_studio` | ≤ 40 ms p99 | ≤ 4 ms | < 4% | Reliable for asynchronous tracking; not for live performance |

### Required evidence artifacts (one per profile per impairment level)

1. `xrun_count.txt` — total xrun count across the soak (target: 0)
2. `peak_jitter_ms.txt` — peak JUCE-callback jitter (target: ≤ 0.35 ms)
3. `audio_rtt_ms.txt` — measured loopback RTT (target: ≤ profile cap)
4. `cpu_load.txt` — daemon + engine CPU% (target: ≤ 30% on isolated cores)
5. `resend_rate.txt` — AOO resend events per minute (target: profile-defined)
6. `screenshot_diagnostics.png` — `/sonobus/diagnostics` page at end of soak
7. `screenshot_overview.png` — `/sonobus` overview page at end of soak
8. `bench_runbook.md` — operator narrative + observed-vs-expected delta

### Impairment matrix (tc netem, applied on the receiver-side NIC)

| Impairment | Command | Soak length |
|---|---|---|
| Clean | (none) | 30 min |
| Light jitter | `tc qdisc add dev <nic> root netem delay 5ms 2ms 25%` | 15 min |
| Moderate loss | `tc qdisc add dev <nic> root netem loss 1%` | 15 min |
| Burst loss | `tc qdisc add dev <nic> root netem loss 5% 25%` | 15 min |
| Reorder | `tc qdisc add dev <nic> root netem delay 5ms reorder 25% 50%` | 15 min |

Each (profile × impairment) combination produces the 8 artifacts above.

### Acceptance criteria (closes T2521-10)

- [ ] Three profiles × five impairment levels = 15 soak runs complete
- [ ] All artifacts populated under
      `docs/fit-for-purpose-evidence/<YYYYMMDD>/sonobus-validation/`
- [ ] Each profile meets its latency / jitter / xrun targets in the
      "Clean" impairment column at minimum
- [ ] At least the default `pcm_lowest_latency` profile passes all
      five impairment columns with 0 audible glitches (or the
      observed degradation is documented + filed as a follow-up)
- [ ] UI smoke: SonoBus Overview + Diagnostics pages stay
      responsive throughout the soak (no React re-mount storms,
      no WS handshake regressions)
- [ ] Installer smoke: `rpm -e map2 && rpm -i map2-...rpm`
      cycles cleanly — `%preun` stops the daemon, `%postun` drops
      the firewalld fragment, a follow-on `rpm -i` restores both

---

## Bench-session runbook (operator-facing)

When the operator runs the bench session, the following order
minimizes setup churn:

1. **Pre-flight (10 min)**
   - Reboot the primary MAP2 node so the GRUB `isolcpus=4,5`
     kernel cmdline takes effect (see `docs/PROJECT_WORKLIST.md` §5
     RT/latency)
   - Confirm `systemctl is-enabled map2-sonobus-transport.service`
     returns "enabled" (T2521-8 systemd unit)
   - Confirm `firewall-cmd --list-services` includes `map2-sonobus`
     on the chosen zone

2. **T2521-4 daemon bring-up (60-90 min)**
   - Vendor AOO source → `vendor/aoo/`
   - Build the daemon target
   - Wire the supervisor
   - First-light test: a single binding between the two nodes plays
     pink noise without audible artifacts

3. **T2521-10 soak runs (~4 hours wall clock for the full matrix)**
   - Execute the 15 (profile × impairment) soak runs from the matrix
   - Capture the 8 artifacts per run
   - Write the closeout `bench_runbook.md` per profile

4. **Closeout**
   - Flip T2521-4 + T2521-10 worklist entries to `[✓] Done`
   - Cross-link this handoff doc + the evidence dir
   - Flip parent T2521 epic to `[✓] Done` — full SonoBus deploy
     complete

---

## How to validate the code-side T2521 surface today

Without the daemon, the operator can still exercise the wire contract
end-to-end:

```bash
# Backend running on :8080
curl http://127.0.0.1:8080/api/sonobus/status      # → daemon_running:false, authority_ok:true
curl http://127.0.0.1:8080/api/sonobus/network     # → bind interface list, UDP 10000-10100
curl http://127.0.0.1:8080/api/sonobus/diagnostics # → empty bindings list, daemon_running:false
curl http://127.0.0.1:8080/api/sonobus/profiles    # → 3 built-in presets

# Front-end on :3000 — every region page renders against the
# stubbed daemon state without errors:
xdg-open http://127.0.0.1:3000/sonobus
xdg-open http://127.0.0.1:3000/sonobus/connections
xdg-open http://127.0.0.1:3000/sonobus/peers
xdg-open http://127.0.0.1:3000/sonobus/groups
xdg-open http://127.0.0.1:3000/sonobus/routing
xdg-open http://127.0.0.1:3000/sonobus/network
xdg-open http://127.0.0.1:3000/sonobus/profiles
xdg-open http://127.0.0.1:3000/sonobus/diagnostics
```

The Snapshot Publish picker also surfaces a "SonoBus peers" group
once the binding authority has any rows; manually seed one with:

```bash
curl -X POST http://127.0.0.1:8080/api/sonobus/bindings \
  -H 'Content-Type: application/json' \
  -d '{
    "consumer_type": "sonobus_stream",
    "consumer_id": "manual-test-1",
    "consumer_label": "manual test",
    "binding_kind": "stream",
    "source_type": "aoo_source",
    "source_descriptor": {"aoo_source_id": 1001, "channel_count": 2},
    "target_type": "aoo_sink",
    "target_descriptor": {"listener_peer_endpoint": "10.0.0.10:10001"},
    "group_id": "manual-test",
    "talker_node_id": "this-node",
    "listener_node_id": "peer-node",
    "scope": "global"
  }'
```

The Routing matrix at `/sonobus/routing` will immediately show
the talker × listener cell light up — confirming every layer above
the daemon is reachable.

---

## References

- `docs/architecture/SONOBUS_AOO_TRANSPORT.md` — full architecture
- `docs/architecture/LICENSE_COMPATIBILITY.md` — BSD-3 ↔ AGPLv3 matrix
- `docs/THIRD_PARTY_NOTICES.md` — AOO + dep license rows
- `docs/PROJECT_WORKLIST.md` — T2521 epic entry
- `vendor/aoo/README.md` — vendor skeleton + landing posture
- `systemd/map2-sonobus-transport.service` — RT/non-RT systemd unit
- `systemd/firewalld/map2-sonobus.xml` — firewalld zone fragment
- `packaging/rpm/map2.spec` — RPM install + uninstall hooks
- `etc/map2/sonobus.env.example` — operator-override environment
