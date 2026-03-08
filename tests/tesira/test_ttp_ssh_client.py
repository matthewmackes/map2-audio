from app.services.tesira.ttp_ssh_client import TTPSSHClient


def test_parse_ok_response():
    resp = TTPSSHClient._parse_response("+OK value=12.5")
    assert resp.ok is True
    assert float(resp.value) == 12.5


def test_parse_error_response():
    resp = TTPSSHClient._parse_response("-ERR INSTANCE_TAG_NOT_FOUND")
    assert resp.ok is False
    assert resp.error_code == "INSTANCE_TAG_NOT_FOUND"
