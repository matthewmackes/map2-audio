from app.services.midi_hub.ring_buffer import MidiRingBuffer


def test_ring_buffer_push_pop_fifo():
    rb = MidiRingBuffer[int](4)
    assert rb.push(1)
    assert rb.push(2)
    assert rb.push(3)
    assert len(rb) == 3
    assert rb.pop() == 1
    assert rb.pop() == 2
    assert rb.pop() == 3
    assert rb.pop() is None


def test_ring_buffer_drop_on_full():
    rb = MidiRingBuffer[int](2, overwrite_on_full=False)
    assert rb.push(10)
    assert rb.push(20)
    assert rb.push(30) is False
    stats = rb.stats()
    assert stats.dropped_writes == 1
    assert stats.overwritten_writes == 0


def test_ring_buffer_overwrite_on_full():
    rb = MidiRingBuffer[int](2, overwrite_on_full=True)
    assert rb.push(10)
    assert rb.push(20)
    assert rb.push(30)
    assert rb.drain() == [20, 30]
    stats = rb.stats()
    assert stats.overwritten_writes == 1


def test_ring_buffer_overwrite_mode_replaces_oldest_entry_across_wraparound():
    rb = MidiRingBuffer[int](3, overwrite_on_full=True)
    assert rb.extend([1, 2, 3]) == 3
    assert rb.pop() == 1
    assert rb.push(4)
    assert rb.push(5)

    assert list(rb.iter_snapshot()) == [3, 4, 5]
    assert rb.drain() == [3, 4, 5]


def test_ring_buffer_drain_preserves_none_payloads():
    rb = MidiRingBuffer[object | None](3, overwrite_on_full=True)
    assert rb.push(None)
    assert rb.push("note-on")

    assert rb.drain() == [None, "note-on"]
