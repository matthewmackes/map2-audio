# T053 Reboot + Performance Qualification (PASS)

Date: 2026-03-07
Task: T053 - Reboot MAP2 platform services and execute post-reboot performance qualification

## Platform Reboot Command

```bash
sudo systemctl restart \
  map2-boot-manager.service \
  map2-ptp4l.service \
  map2-phc2sys.service \
  map2-srpd.service \
  map2-backend.service \
  map2-web-prod.service \
  map2-web-dev.service \
  map2-port80-proxy.service
```

## Reboot Verification

- `map2-backend.service`: `active (running)` with new PID after restart
- `map2-web-prod.service`: `active (running)` after restart
- `map2-ptp4l.service`, `map2-srpd.service`, `map2-phc2sys.service`: `active`
- API health after reboot: reachable on `http://localhost:8080/api/health`
- Backend uptime reset observed (`~26s` immediately after reboot check)

## Post-Reboot Performance Commands

```bash
# Smoke gate
MAP2_LOCUST_WS_CLIENTS=100 \
MAP2_LOCUST_SOAK_SECONDS=65 \
MAP2_LOCUST_MIDI_BURST_UPDATES=500 \
python3 -m locust -f tests/load_test.py --headless -u 10 -r 2 -t 70s \
  --host http://localhost:8080 \
  --csv docs/fit-for-purpose-evidence/20260307/t053/locust-smoke-65s \
  --csv-full-history

# Full gate
MAP2_LOCUST_WS_CLIENTS=100 \
MAP2_LOCUST_SOAK_SECONDS=300 \
MAP2_LOCUST_MIDI_BURST_UPDATES=500 \
python3 -m locust -f tests/load_test.py --headless -u 10 -r 2 -t 310s \
  --host http://localhost:8080 \
  --csv docs/fit-for-purpose-evidence/20260307/t053/locust-final-310s \
  --csv-full-history
```

## Gate Results

- Smoke: PASS (`REST p95=21.00 ms`, `WS drops=0`, `WS spread p95=0.218013 ms`)
- Full: PASS (`REST p95=18.00 ms`, `WS drops=0`, `WS spread p95=0.208489 ms`)
- Full run request failures: `0` (`locust-final-310s_failures.csv` empty data rows)
- Full run exceptions: `0` (`locust-final-310s_exceptions.csv` empty data rows)

## Artifacts

- `locust-smoke-65s.log`
- `locust-smoke-65s_stats.csv`
- `locust-smoke-65s_stats_history.csv`
- `locust-smoke-65s_failures.csv`
- `locust-smoke-65s_exceptions.csv`
- `locust-final-310s.log`
- `locust-final-310s_stats.csv`
- `locust-final-310s_stats_history.csv`
- `locust-final-310s_failures.csv`
- `locust-final-310s_exceptions.csv`
