"""SonoBus / AOO remote-audio transport — T2521.

This package owns the canonical `SonoBusBinding` table that all
operator-visible peer/group/stream intents collapse into. See
`docs/architecture/SONOBUS_AOO_TRANSPORT.md` for the AVB-template
architecture and the locked Q1-Q21 decisions.

The runtime daemon (`map2-sonobus-transport`, T2521-4) and the
`/api/sonobus/*` routes (T2521-5) consume this authority — they never
mutate independent state.
"""

from app.services.sonobus.binding_authority import (
    SonoBusBindingAuthority,
    SonoBusBindingNotFound,
)
from app.services.sonobus.binding_models import SonoBusBinding
from app.services.sonobus.binding_schemas import (
    SonoBusBindingConsumerType,
    SonoBusBindingCreate,
    SonoBusBindingKind,
    SonoBusBindingRead,
    SonoBusBindingScope,
    SonoBusBindingUpdate,
    SonoBusCodecProfile,
    SonoBusListenerCapability,
    SonoBusResendPolicy,
    SonoBusTransportPriority,
    SonoBusTransportProtocol,
)
from app.services.sonobus.daemon_client import (
    DaemonCallTimeout,
    DaemonCapabilities,
    DaemonClientError,
    DaemonCommandError,
    DaemonHandshakeError,
    DaemonNotConnected,
    DaemonProtocolError,
    SonoBusDaemonClient,
)
from app.services.sonobus.daemon_supervisor import (
    SonoBusDaemonStatus,
    SonoBusDaemonSupervisor,
    get_sonobus_daemon_supervisor,
    reset_sonobus_daemon_supervisor_for_tests,
)
from app.services.sonobus.interface_ids import (
    SONOBUS_ID_PREFIX,
    SonoBusInterfaceForbiddenError,
    assert_not_sonobus_id,
    is_sonobus_interface_id,
    make_sonobus_interface_id,
    parse_sonobus_interface_id,
)

__all__ = [
    # T2521-3 canonical SonoBusBinding surface
    "SonoBusBinding",
    "SonoBusBindingAuthority",
    "SonoBusBindingNotFound",
    "SonoBusBindingConsumerType",
    "SonoBusBindingKind",
    "SonoBusBindingScope",
    "SonoBusCodecProfile",
    "SonoBusListenerCapability",
    "SonoBusResendPolicy",
    "SonoBusTransportPriority",
    "SonoBusTransportProtocol",
    "SonoBusBindingCreate",
    "SonoBusBindingRead",
    "SonoBusBindingUpdate",
    # T2521-7 interface ID + Q12 exclusion helpers
    "SONOBUS_ID_PREFIX",
    "SonoBusInterfaceForbiddenError",
    "assert_not_sonobus_id",
    "is_sonobus_interface_id",
    "make_sonobus_interface_id",
    "parse_sonobus_interface_id",
    # T2521-4 cycle 5 — daemon client + supervisor
    "DaemonCallTimeout",
    "DaemonCapabilities",
    "DaemonClientError",
    "DaemonCommandError",
    "DaemonHandshakeError",
    "DaemonNotConnected",
    "DaemonProtocolError",
    "SonoBusDaemonClient",
    "SonoBusDaemonStatus",
    "SonoBusDaemonSupervisor",
    "get_sonobus_daemon_supervisor",
    "reset_sonobus_daemon_supervisor_for_tests",
]
