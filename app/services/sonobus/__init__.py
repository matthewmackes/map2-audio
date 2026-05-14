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
]
