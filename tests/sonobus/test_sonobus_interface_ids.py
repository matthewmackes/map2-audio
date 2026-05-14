"""T2521-7: SonoBus interface-ID helpers + Q12 recorder/artifact exclusion.

Covers `make_sonobus_interface_id`, `is_sonobus_interface_id`,
`parse_sonobus_interface_id`, and the Q12 enforcement helper
`assert_not_sonobus_id` that the Recorder + Audio Artifacts services
will gate every entry point with.
"""

from __future__ import annotations

import pytest

from app.services.sonobus import (
    SONOBUS_ID_PREFIX,
    SonoBusInterfaceForbiddenError,
    assert_not_sonobus_id,
    is_sonobus_interface_id,
    make_sonobus_interface_id,
    parse_sonobus_interface_id,
)


def test_prefix_is_canonical():
    assert SONOBUS_ID_PREFIX == "sonobus:"


def test_make_and_parse_round_trip():
    interface_id = make_sonobus_interface_id(
        peer_id="peer-alpha",
        group_id="group-default",
        stream_id="stream-0001",
    )
    assert interface_id == "sonobus:peer-alpha:group-default:stream-0001"
    parsed = parse_sonobus_interface_id(interface_id)
    assert parsed == ("peer-alpha", "group-default", "stream-0001")


def test_make_rejects_empty_components():
    with pytest.raises(ValueError):
        make_sonobus_interface_id(peer_id="", group_id="g", stream_id="s")
    with pytest.raises(ValueError):
        make_sonobus_interface_id(peer_id="p", group_id="", stream_id="s")
    with pytest.raises(ValueError):
        make_sonobus_interface_id(peer_id="p", group_id="g", stream_id="")


def test_make_rejects_colon_in_components():
    with pytest.raises(ValueError):
        make_sonobus_interface_id(
            peer_id="bad:peer", group_id="g", stream_id="s"
        )
    with pytest.raises(ValueError):
        make_sonobus_interface_id(
            peer_id="p", group_id="bad:group", stream_id="s"
        )
    with pytest.raises(ValueError):
        make_sonobus_interface_id(
            peer_id="p", group_id="g", stream_id="bad:stream"
        )


def test_is_sonobus_interface_id_recognises_prefix():
    assert is_sonobus_interface_id("sonobus:p:g:s") is True
    assert is_sonobus_interface_id("avb:abc") is False
    assert is_sonobus_interface_id("pipewire:edirol:ua1000:1234") is False
    assert is_sonobus_interface_id("") is False
    assert is_sonobus_interface_id(None) is False


def test_parse_rejects_non_sonobus_id():
    with pytest.raises(ValueError):
        parse_sonobus_interface_id("avb:abc")


def test_parse_rejects_malformed_sonobus_id():
    with pytest.raises(ValueError):
        parse_sonobus_interface_id("sonobus:peer:group")  # missing stream
    with pytest.raises(ValueError):
        parse_sonobus_interface_id("sonobus:p::s")  # empty group
    with pytest.raises(ValueError):
        parse_sonobus_interface_id("sonobus:")  # empty body


def test_assert_not_sonobus_id_passes_non_sonobus():
    """Recorder/Artifacts paths accept non-SonoBus IDs as before."""
    assert_not_sonobus_id("avb:abc", service_name="Recorder")
    assert_not_sonobus_id(
        "pipewire:edirol:ua1000:1234", service_name="Audio Artifacts"
    )
    assert_not_sonobus_id(None, service_name="Recorder")
    assert_not_sonobus_id("", service_name="Recorder")


def test_assert_not_sonobus_id_raises_for_sonobus_id():
    """Q12 exclusion — SonoBus IDs reach Recorder, get rejected."""
    with pytest.raises(SonoBusInterfaceForbiddenError) as ctx:
        assert_not_sonobus_id(
            "sonobus:peer-alpha:group-default:stream-0001",
            service_name="Recorder",
        )
    err = ctx.value
    assert err.interface_id == "sonobus:peer-alpha:group-default:stream-0001"
    assert err.service_name == "Recorder"
    # Locked-decision context appears in the error message.
    assert "T2521 Q12" in str(err)
    assert "no recorder/artifact integration" in str(err)


def test_assert_not_sonobus_id_uses_service_name_in_message():
    with pytest.raises(SonoBusInterfaceForbiddenError) as ctx:
        assert_not_sonobus_id(
            "sonobus:p:g:s", service_name="Audio Artifacts"
        )
    assert "Audio Artifacts" in str(ctx.value)
