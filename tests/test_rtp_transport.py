import asyncio
import time

from app.services.midi_hub.rtp_transport import MidiRtpTransport


class _FakeHub:
    def __init__(self, *, send_returns: bool = False):
        self.send_returns = send_returns
        self.sent = []
        self.injected = []

    def list_ports(self):
        return []

    def send(self, *, source_port, destination_port, data, metadata=None):
        self.sent.append(
            {
                "source_port": source_port,
                "destination_port": destination_port,
                "data": bytes(data),
                "metadata": dict(metadata or {}),
            }
        )
        return self.send_returns

    def inject(self, message):
        self.injected.append(message)
        return True


async def _wait_for(predicate, *, timeout_s: float = 1.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if predicate():
            return True
        await asyncio.sleep(0.01)
    return predicate()


def test_rtp_transport_invite_send_and_receive_round_trip():
    async def _run():
        sender_hub = _FakeHub()
        receiver_hub = _FakeHub(send_returns=False)
        sender = MidiRtpTransport(sender_hub, bind_host="127.0.0.1", port=0)
        receiver = MidiRtpTransport(receiver_hub, bind_host="127.0.0.1", port=0)

        await sender.start()
        await receiver.start()

        session = await sender.invite(
            "127.0.0.1",
            receiver.local_port,
            remote_node_id="node-b",
            source_port="Keys Out",
            destination_port="Rack In",
            source_node_id="node-a",
        )

        ok = await sender.send_midi(
            session.session_id,
            bytes([0x90, 60, 100]),
            time.time_ns(),
            metadata={"test_marker": "rtp"},
        )
        assert ok is True
        assert await _wait_for(lambda: len(receiver_hub.injected) == 1)

        received = receiver_hub.injected[0]
        assert received.data == bytes([0x90, 60, 100])
        assert received.source_port == "Keys Out"
        assert received.metadata["cluster_transport"] == "rtp-midi"
        assert received.metadata["test_marker"] == "rtp"
        assert received.metadata["cluster_remote_node_id"] == "node-a"

        await sender.stop()
        await receiver.stop()

    asyncio.run(_run())


def test_rtp_transport_gap_triggers_journal_recovery():
    async def _run():
        sender_hub = _FakeHub()
        receiver_hub = _FakeHub(send_returns=False)
        sender = MidiRtpTransport(sender_hub, bind_host="127.0.0.1", port=0)
        receiver = MidiRtpTransport(receiver_hub, bind_host="127.0.0.1", port=0)

        await sender.start()
        await receiver.start()

        session = await sender.invite(
            "127.0.0.1",
            receiver.local_port,
            remote_node_id="node-b",
            source_port="Keys Out",
            destination_port="Rack In",
            source_node_id="node-a",
        )

        assert await sender.send_midi(session.session_id, bytes([0x90, 60, 100]), time.time_ns())
        assert await _wait_for(lambda: len(receiver_hub.injected) >= 1)

        sender_session = sender.get_sessions()[0]
        sender_session.sequence_number = (sender_session.sequence_number + 2) & 0xFFFF

        assert await sender.send_midi(session.session_id, bytes([0xB0, 10, 127]), time.time_ns())
        assert await _wait_for(
            lambda: any(getattr(message, "metadata", {}).get("journal_recovery") for message in receiver_hub.injected),
            timeout_s=1.5,
        )

        receiver_session = receiver.get_sessions()[0]
        assert receiver_session.packets_lost >= 2
        assert any(message.metadata.get("journal_recovery") for message in receiver_hub.injected)

        await sender.stop()
        await receiver.stop()

    asyncio.run(_run())


def test_rtp_transport_invite_timeout_raises():
    async def _run():
        hub = _FakeHub()
        transport = MidiRtpTransport(hub, bind_host="127.0.0.1", port=0)
        await transport.start()

        try:
            await transport.invite(
                "127.0.0.1",
                transport.local_port + 1000,
                remote_node_id="missing-node",
                source_port="Keys Out",
                destination_port="Rack In",
            )
        except TimeoutError:
            pass
        else:
            raise AssertionError("expected RTP invitation timeout")
        finally:
            await transport.stop()

    asyncio.run(_run())
