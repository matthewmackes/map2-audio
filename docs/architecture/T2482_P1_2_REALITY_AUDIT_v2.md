# T2482-P1.2 — Reality audit v2 (iter 71, supersedes iter-61 audit on Gap B)

**Date:** 2026-05-01 (iter 71, SHIP loop 8 start).
**Supersedes:** [`T2482_P1_2_REALITY_AUDIT.md`](T2482_P1_2_REALITY_AUDIT.md) §§ "Gap B" + "Gap C".
**Pattern:** the iter-61 audit was wrong about Gap B. Gap B is **DONE**.

---

## What changed since iter 61

The iter-61 audit said:

> Gap B (libremidi → MappingEngine end-to-end): PARTIALLY WIRED — shm
> ring producer side done, no consumer pulls events through the
> mapping engine. Biggest remaining gap.

This was wrong. Iter 71 re-read `juce-engine/Source/ControllerHost/main.cpp` more carefully:

### Gap B is DONE — `drain_ring_and_dispatch` exists at line 532

The function at `main.cpp:532` does **exactly** what Gap B asked for:

1. Pops events from a shm ring (`ring.pop(&ts, buf, sizeof(buf), &slot_index)`)
2. Resolves `controller_key` from the slot's `controllerIndex` via the per-port table built when `midi_open_input_request` is dispatched
3. Calls `mapping_engine.planDispatch(controller_key, status, data1, channel)` — including the high-nibble + raw-status fallback for descriptors that don't split out the channel
4. Calls `mapping_engine.dispatch(controller_key, plan.callback_name, bytes)` to invoke the JS callback
5. Drains JS-side outbound queues:
   - `mapping_engine.js().drainEngineCommands()` → `engine_command` IPC frames
   - `mapping_engine.js().drainLogs()` → `log_event` IPC frames
   - `mapping_engine.drainShortMidi()` → `midi_send_request` IPC frames
   - `mapping_engine.drainSysExMidi()` → `midi_send_request` IPC frames

And it's called from the main loop at lines 732-751:

```cpp
if (rt_ok)
{
    drain_ring_and_dispatch (client_fd, rtRing, mapping_engine,
                              controller_keys_by_index,
                              active_controller_key, 64);
}
if (ctl_ok)
{
    drain_ring_and_dispatch (client_fd, controlRing, mapping_engine,
                              controller_keys_by_index,
                              active_controller_key, 16);
}
```

The 1 ms poll cadence ensures every shm-ring event flows through the mapping engine within ~1 ms of arriving. **End-to-end live dispatch was already shipped before SHIP loop 7 started.** The iter-61 audit missed it because the function name `drain_ring_and_dispatch` is generic; only reading the body shows it IS the Gap B implementation.

### Gap C is the actual remaining work

Iter-61 said "Gap C outbound back-loop: PARTIALLY WIRED". This part is correct. Lines 605-613 of `drain_ring_and_dispatch` route outbound MIDI to **Python IPC frames** (`midi_send_request`), not to libremidi output ports:

```cpp
for (auto& sm : mapping_engine.drainShortMidi())
{
    const std::vector<std::uint8_t> bytes { sm.status, sm.data1, sm.data2 };
    if (! send_frame (client_fd, build_midi_send_request_frame (sm.controller_key, bytes)))
        return false;
}
```

For Maschine MK1 (LED echoes from JS callbacks) this is wrong: the outbound bytes are supposed to land back on the controller's **own port** (or a virtual port the host published), not get round-tripped through Python. The Python-side then has to send them back via `MidiHostClient.send_short_message()` which is silly — it's a circular path.

**Fix**: the outbound drain should resolve the matching libremidi output port for `sm.controller_key` and send directly via `LibremidiAdapter::sendMessage()` (or whatever the equivalent surface is). Falls back to the Python IPC path only when no output port is registered for the controller_key.

---

## Revised SHIP loop 8 plan

The iter-70 closing log budgeted iters 71-74 for "Gap B + Gap C completion". With Gap B already done, those 4 iters now cover:

| Iter | Goal |
|---|---|
| 71 | THIS DOC. Re-audit. Gap B is done; Gap C is the real remainder. |
| 72 | Add `LibremidiAdapter::sendMessage(port_id, bytes)` if missing; verify the symbol surface |
| 73 | Wire the outbound drain in `drain_ring_and_dispatch` to prefer libremidi-direct send when a port is registered for the controller_key |
| 74 | B5 fixture that exercises a JS callback emitting outbound MIDI; assert it lands on a virtual port the test reads back (not on the IPC channel) |

That's **2 iters reclaimed** for other Loop 8 work (iters 75-79 stay as-is).

---

## Updated P1.2 status

After iter 71's audit:
- ✅ Gap A request dispatcher: DONE (loop 7)
- ✅ Gap B libremidi → MappingEngine: **DONE (was already done before loop 7; iter 61 missed it)**
- ⚠️ Gap C outbound back-loop: PARTIALLY WIRED — drains exist but route to Python IPC. Loop 8 iters 72-74 fix.
- ✅ Gap D B5 fixtures: DONE (loop 7)
- 🟡 Gap E namespace isolation: SEAM SHIPPED (loop 7); default OFF
- ✅ Gap F IPC schema: DONE (loop 7)
- ✅ Gap G XML reader retirement: ALREADY DONE per iter-39

So the **active remaining work** for P1.2 is just Gap C (3 iters) + Gap E flag-flip (1 iter probably). The rest of Loop 8 (iters 75-79) is the post-loop-6 rtmidi cleanup + Maschine virtual-port flip.

---

## Cross-references

- iter-61 audit: [`T2482_P1_2_REALITY_AUDIT.md`](T2482_P1_2_REALITY_AUDIT.md). The Gap B section there is now superseded by §1 of this doc.
- iter-39 design doc: [`T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md`](T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md). Gap B definition there is now closed.
- `juce-engine/Source/ControllerHost/main.cpp:532-616` — `drain_ring_and_dispatch` (the actual Gap B impl).
- `juce-engine/Source/ControllerHost/main.cpp:732-751` — main-loop callsite.
- `juce-engine/Source/ControllerHost/main.cpp:605-613` — the Gap C remainder (lines that route outbound to Python IPC instead of libremidi).
