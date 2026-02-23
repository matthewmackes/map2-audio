# AVDECC Mock Harness Runbook

Date: 2026-02-22  
Worklist tasks: `T015`, `T016`

## Purpose

Provide deterministic AVDECC workflow validation in CI/hardware-light environments for:
- ADP discovery
- AECP READ_DESCRIPTOR
- AECP GET/SET stream format
- ACMP CONNECT/DISCONNECT

The harness uses an in-memory packet transport by default and includes an optional raw-socket responder for local privileged testing.

## Mock PDU Framing

The mock codec now uses IEEE 1722.1-inspired binary PDUs (no JSON body framing):

- Header layout: `subtype (0x7A)` + `version` + `message_type` + `status` + `payload_length`
- Message families covered: ADP, AECP, ACMP, and error frames
- Payloads use fixed-width binary fields (`uint16/uint64`) plus bounded length-prefixed UTF-8 strings where needed
- In-memory transport remains default/CI-safe; raw-socket path continues to wrap the same binary PDUs in Ethernet frames

## Files

- Mock harness: `tests/mock_avdecc_device.py`
- Integration tests: `tests/test_avdecc_mock_integration.py`
- Cache lifecycle tests: `tests/test_avdecc_aem_cache.py`

## CI-safe invocation (recommended)

```bash
pytest tests/test_avdecc_mock_integration.py -m avdecc_mock -q
pytest tests/test_avdecc_aem_cache.py -q
pytest tests/test_avdecc_mock_packet_codec.py -m avdecc_mock -q
```

These commands do not require AVB hardware and should pass in regular CI runners.

## Optional raw-socket validation

Raw responder checks are permission-gated. When CAP_NET_RAW/root is unavailable, raw-socket tests skip with explicit reason.

```bash
MAP2_AVDECC_MOCK_INTERFACE=lo pytest tests/test_avdecc_mock_integration.py -k raw_socket -q
```

If permission is available, the test starts/stops `RawSocketAvdeccResponder`.  
If unavailable, skip behavior is expected and not a failure.

## Troubleshooting

- `CAP_NET_RAW or root privileges are required`
  - Run raw-socket checks with elevated privileges or keep using CI-safe in-memory mode.
- `No such device` for interface
  - Set `MAP2_AVDECC_MOCK_INTERFACE` to a valid local interface (for example `lo` or a test NIC).
- `unsupported descriptor_type`
  - Use supported descriptor families in tests: `entity`, `configuration`, `stream_input`, `stream_output`.

## Notes

- Profiles are deterministic (`8x8` and `16x16`) for repeatable stream-index coverage.
- Route-level integration test (`test_mock_harness_routes_cover_discovery_model_format_and_acmp`) validates that mock workflows drive backend AVDECC endpoints without hardware.
