# T072 HIL Precheck (2026-03-15T22:37:46Z)

## Summary

- Tesira device scope: `5` selected / `0` connected
- AVB discovered-device count: `0`
- AVB active stream count: `0`
- AVB PTP state: `INITIALIZING`
- Overall status: `BLOCKED`

## Gates

| Gate | Status | Reason |
|---|---|---|
| tesira_control_ready | BLOCKED | Need at least 2 connected Tesira devices; found 0 in scope. |
| avb_discovery_ready | BLOCKED | Need at least 1 discovered AVB device(s); found 0. |
| avb_stream_ready | BLOCKED | Need at least 1 active AVB stream(s); found 0. |
| ptp_lock_ready | BLOCKED | Host AVB PTP state is INITIALIZING; expected one of MASTER, SLAVE. |

## Selected Tesira Devices

| Device ID | Connected | Transport | Faults | AVB streams | PTP state |
|---|---|---|---:|---:|---|
| tesira_172_20_146_238 | False | ssh | 0 | 0 |  |
| tesira_172_20_146_241 | False | ssh | 0 | 0 |  |
| tesira_172_20_146_240 | False | ssh | 0 | 0 |  |
| tesira_172_20_146_236 | False | ssh | 0 | 0 |  |
| tesira_172_20_146_237 | False | ssh | 0 | 0 |  |

## Conclusion

- Blocked: Tesira control, AVB entity/stream presence, or PTP lock prerequisites are still incomplete for T072.

