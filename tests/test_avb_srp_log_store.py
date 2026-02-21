import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import SrpAdmissionLog
from app.services.avb import srp_log_store as srp_log_store_module
from app.services.avb.srp_log_store import SrpAdmissionLogStore


@dataclass
class _StoreDbContext:
    store: SrpAdmissionLogStore
    session_maker: sessionmaker
    engine: any


@pytest.fixture
def srp_store_db(monkeypatch, tmp_path: Path):
    db_path = tmp_path / "srp-log-store.db"
    engine = create_engine(f"sqlite:///{db_path}")
    session_maker = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    SrpAdmissionLog.__table__.create(engine, checkfirst=True)

    class _AsyncSessionAdapter:
        def __init__(self, sync_session):
            self._sync_session = sync_session

        def add(self, row):
            self._sync_session.add(row)

        async def flush(self):
            self._sync_session.flush()

        async def execute(self, stmt):
            return self._sync_session.execute(stmt)

    @asynccontextmanager
    async def _test_get_session():
        sync_session = session_maker()
        adapter = _AsyncSessionAdapter(sync_session)
        try:
            yield adapter
            sync_session.commit()
        except Exception:
            sync_session.rollback()
            raise
        finally:
            sync_session.close()

    monkeypatch.setattr(srp_log_store_module, "get_session", _test_get_session)

    yield _StoreDbContext(
        store=SrpAdmissionLogStore(),
        session_maker=session_maker,
        engine=engine,
    )

    engine.dispose()


def _record_admission(
    store: SrpAdmissionLogStore,
    *,
    admission_id: str,
    decision: str,
    endpoint: str,
    created_at: datetime,
    reservation_id: str | None = None,
):
    asyncio.run(
        store.record(
            admission_id=admission_id,
            decision=decision,
            reason_code=f"RC_{decision.upper()}",
            reason=f"{decision} reason",
            remediation=["check daemon"],
            daemon_type="mrpd",
            daemon_socket="/var/run/mrp_socket",
            raw_response="ACK" if decision == "allowed" else "NACK",
            endpoint=endpoint,
            stream_id=f"stream-{admission_id}",
            talker_id=f"talker-{admission_id}",
            listener_id=f"listener-{admission_id}",
            reservation_id=reservation_id,
            request_metadata={"source": endpoint},
            created_at=created_at,
            completed_at=created_at + timedelta(milliseconds=10),
        )
    )


def test_list_admissions_applies_filters_and_sorting(srp_store_db):
    base = datetime(2026, 2, 16, 12, 0, 0)
    store = srp_store_db.store

    _record_admission(
        store,
        admission_id="adm-1",
        decision="denied",
        endpoint="router.connect",
        created_at=base - timedelta(minutes=10),
    )
    _record_admission(
        store,
        admission_id="adm-2",
        decision="denied",
        endpoint="avdecc.connections",
        created_at=base - timedelta(minutes=5),
    )
    _record_admission(
        store,
        admission_id="adm-3",
        decision="allowed",
        endpoint="router.connect",
        created_at=base - timedelta(minutes=1),
    )

    rows = asyncio.run(
        store.list_admissions(
            decision="denied",
            endpoint="router.connect",
            since=base - timedelta(hours=1),
            limit=100,
        )
    )
    assert [row["admission_id"] for row in rows] == ["adm-1"]

    recent_denied = asyncio.run(
        store.list_admissions(
            decision="denied",
            since=base - timedelta(minutes=7),
            limit=100,
        )
    )
    assert [row["admission_id"] for row in recent_denied] == ["adm-2"]

    all_rows = asyncio.run(store.list_admissions(limit=100))
    assert [row["admission_id"] for row in all_rows] == ["adm-3", "adm-2", "adm-1"]


def test_list_admissions_limit_is_capped_and_floored(srp_store_db):
    session_maker = srp_store_db.session_maker
    store = srp_store_db.store
    base = datetime(2026, 2, 16, 0, 0, 0)

    rows = []
    for idx in range(520):
        created_at = base + timedelta(seconds=idx)
        rows.append(
            SrpAdmissionLog(
                admission_id=f"adm-{idx}",
                decision="allowed",
                reason_code="SRP_ADMITTED",
                reason="ok",
                endpoint="router.connect",
                created_at=created_at,
                completed_at=created_at,
            )
        )

    session = session_maker()
    session.add_all(rows)
    session.commit()
    session.close()

    capped = asyncio.run(store.list_admissions(limit=999))
    floored = asyncio.run(store.list_admissions(limit=0))

    assert len(capped) == 500
    assert len(floored) == 1
    assert capped[0]["admission_id"] == "adm-519"


def test_mark_release_updates_newest_row_for_reservation(srp_store_db):
    session_maker = srp_store_db.session_maker
    store = srp_store_db.store
    base = datetime(2026, 2, 16, 18, 0, 0)

    _record_admission(
        store,
        admission_id="adm-old",
        decision="allowed",
        endpoint="router.connect",
        created_at=base,
        reservation_id="res-1",
    )
    _record_admission(
        store,
        admission_id="adm-new",
        decision="allowed",
        endpoint="router.connect",
        created_at=base + timedelta(minutes=1),
        reservation_id="res-1",
    )

    updated = asyncio.run(
        store.mark_release(
            reservation_id="res-1",
            success=False,
            reason="release failed",
            raw_response="ERR",
            released_at=base + timedelta(minutes=2),
        )
    )
    assert updated is True

    session = session_maker()
    old_row = session.execute(
        select(SrpAdmissionLog).where(SrpAdmissionLog.admission_id == "adm-old")
    ).scalar_one_or_none()
    new_row = session.execute(
        select(SrpAdmissionLog).where(SrpAdmissionLog.admission_id == "adm-new")
    ).scalar_one_or_none()
    session.close()

    assert old_row is not None
    assert new_row is not None

    assert old_row.released is False
    assert old_row.release_status is None

    assert new_row.released is True
    assert new_row.release_status == "failed"
    assert new_row.release_reason == "release failed"
    assert new_row.release_response == "ERR"
    assert new_row.release_at == base + timedelta(minutes=2)


def test_mark_release_returns_false_for_empty_or_missing_reservation(srp_store_db):
    store = srp_store_db.store

    empty = asyncio.run(
        store.mark_release(
            reservation_id="",
            success=True,
            reason="noop",
        )
    )
    missing = asyncio.run(
        store.mark_release(
            reservation_id="res-missing",
            success=True,
            reason="noop",
        )
    )

    assert empty is False
    assert missing is False


def test_list_admissions_paginates_across_pages(srp_store_db):
    store = srp_store_db.store
    base = datetime(2026, 2, 17, 0, 0, 0)

    for idx in range(30):
        _record_admission(
            store,
            admission_id=f"adm-{idx}",
            decision="denied" if idx % 2 == 0 else "allowed",
            endpoint="router.connect" if idx % 3 == 0 else "streams.start",
            created_at=base + timedelta(seconds=idx),
        )

    page1 = asyncio.run(store.list_admissions(limit=10))
    page2 = asyncio.run(store.list_admissions(limit=10, offset=10))
    page3 = asyncio.run(store.list_admissions(limit=10, offset=20))

    assert len(page1) == 10
    assert len(page2) == 10
    assert len(page3) == 10
    assert page1[0]["admission_id"] == "adm-29"
    assert page3[-1]["admission_id"] == "adm-0"


def test_list_admissions_filters_and_paginates_combined(srp_store_db):
    store = srp_store_db.store
    base = datetime(2026, 2, 18, 0, 0, 0)

    for idx in range(15):
        _record_admission(
            store,
            admission_id=f"adm-filter-{idx}",
            decision="denied" if idx % 2 == 0 else "allowed",
            endpoint="router.connect" if idx % 2 == 0 else "streams.start",
            created_at=base + timedelta(seconds=idx),
        )

    rows = asyncio.run(
        store.list_admissions(
            decision="denied",
            endpoint="router.connect",
            since=base - timedelta(seconds=5),
            limit=3,
            offset=2,
        )
    )

    assert len(rows) == 3
    assert all(r["decision"] == "denied" for r in rows)
    assert all(r["endpoint"] == "router.connect" for r in rows)
