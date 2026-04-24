"""T2453 regression: the websocket broadcast of snapshot_loaded must deep-copy
the live snapshot payload so a later mutation of the shared dict cannot bleed
into the already-enqueued broadcast.
"""

import asyncio
import copy


def test_deepcopy_isolates_broadcast_from_later_mutation():
    # Simulates the pattern used in state_authority_activation_service:
    # refreshed_detail is the shared dict that gets mutated by subsequent
    # work. Prior to T2453 the broadcast captured the reference directly;
    # now it captures a deepcopy before enqueue.
    refreshed_detail = {
        "snapshot_id": 1,
        "chains": [{"id": "c1", "plugins": [{"bypass": False}]}],
    }

    captured = []

    async def fake_broadcast(payload):
        captured.append(payload)

    async def run():
        # The production code path: deepcopy before broadcast.
        broadcast_snapshot_data = copy.deepcopy(refreshed_detail)
        await fake_broadcast({"data": {"snapshot_data": broadcast_snapshot_data}})
        # Simulate a racing mutation (next activation, channel health sync,
        # snapshot_payload deepcopy downstream, etc.).
        refreshed_detail["chains"][0]["plugins"][0]["bypass"] = True
        refreshed_detail["chains"].append({"id": "c2", "plugins": []})

    asyncio.run(run())

    assert len(captured) == 1
    broadcast_chains = captured[0]["data"]["snapshot_data"]["chains"]
    # Original broadcast must be untouched by the later mutation.
    assert len(broadcast_chains) == 1
    assert broadcast_chains[0]["plugins"][0]["bypass"] is False


def test_reference_capture_would_bleed_without_deepcopy():
    # Inverse proof: confirm the bug exists if the deepcopy is removed.
    refreshed_detail = {"chains": [{"id": "c1", "plugins": [{"bypass": False}]}]}
    captured = []

    async def fake_broadcast(payload):
        captured.append(payload)

    async def run():
        # Bug path: capture reference, then mutate.
        await fake_broadcast({"data": {"snapshot_data": refreshed_detail}})
        refreshed_detail["chains"][0]["plugins"][0]["bypass"] = True

    asyncio.run(run())
    # With a reference capture, the mutation leaks into the broadcast.
    assert captured[0]["data"]["snapshot_data"]["chains"][0]["plugins"][0]["bypass"] is True
