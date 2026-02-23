# AVB Router Flow Trace Fields

This document defines the connect/disconnect flow trace payload and log fields used by router orchestration.

## Response Fields

Router endpoints that call `connect(..., return_details=True)` or `disconnect(..., return_details=True)` return:

- `trace_id`: Correlation ID for one router flow. Format:
  - connect: `connect-<12-hex>`
  - disconnect: `disconnect-<12-hex>`
- `stages`: Ordered stage outcomes for the flow.
  - Each stage record includes:
    - `stage`: Stage name (for example `connect.srp_admit`, `disconnect.complete`)
    - `status`: One of `ok`, `warning`, `error`, `retry`, or `skipped`
    - `detail` (optional): Context detail string

## Log Fields

Stage logging emits one line per stage with this structure:

- `avb-flow trace=<trace_id> stage=<stage> status=<status> detail=<optional-detail>`

Retry logging for bounded backoff emits:

- `avb-flow trace=<trace_id> stage=<operation> status=retry attempt=<n>/<max> detail=<error>`

## Retry Controls

Bounded retry/backoff behavior for MAP2 provisioning/deprovisioning is controlled by:

- `avb.router.retry.max_attempts` (default `3`)
- `avb.router.retry.base_delay_ms` (default `100`)
- `avb.router.retry.max_delay_ms` (default `1000`)

