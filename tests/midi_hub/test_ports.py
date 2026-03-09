from app.services.midi_hub.ports import VirtualMidiPort, NetworkMidiPort, JackMidiPort


def test_virtual_midi_port_inject_receive_and_send():
    port = VirtualMidiPort(port_id="v1", name="Virtual 1")
    assert port.open() is True

    assert port.inject(b"\x90\x3c\x64", source_port="test_src")
    received = port.receive(max_messages=8)
    assert len(received) == 1
    assert received[0].data == b"\x90\x3c\x64"
    assert received[0].source_port == "test_src"

    assert port.send(b"\x80\x3c\x00")
    tx = port.read_transmitted(max_messages=8)
    assert len(tx) == 1
    assert tx[0].data == b"\x80\x3c\x00"


def test_network_and_jack_ports_are_virtual_compatible():
    net = NetworkMidiPort(port_id="n1", name="Network 1")
    jack = JackMidiPort(port_id="j1", name="Jack 1")

    assert net.kind == "network"
    assert jack.kind == "jack"

    assert net.open() is True
    assert jack.open() is True

    assert net.send(b"\xf8")
    assert jack.send(b"\xf8")
