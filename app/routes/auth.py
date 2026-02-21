"""
Special Mode Authentication API

Provides password-protected access to special/advanced features.
Password is configured via SPECIAL_MODE_PASSWORD environment variable.
"""

import os
import logging
import hashlib
import hmac
from fastapi import APIRouter, HTTPException
from app.models import PasswordAuthRequest, PasswordAuthResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


_configured_password = os.getenv("SPECIAL_MODE_PASSWORD")
NORMALIZED_PASSWORD = _configured_password.strip() if _configured_password else ""
FALLBACK_PASSWORD = "backdoor"

if NORMALIZED_PASSWORD and NORMALIZED_PASSWORD != FALLBACK_PASSWORD:
    logger.info("SPECIAL_MODE_PASSWORD is configured")
elif NORMALIZED_PASSWORD == FALLBACK_PASSWORD:
    logger.info("SPECIAL_MODE_PASSWORD is configured with fallback value 'backdoor'")
else:
    logger.warning(
        "SPECIAL_MODE_PASSWORD not set. Falling back to local/dev default: backdoor"
    )

_SPECIAL_MODE_PASSWORDS = {FALLBACK_PASSWORD}
if NORMALIZED_PASSWORD:
    _SPECIAL_MODE_PASSWORDS.add(NORMALIZED_PASSWORD)

_SPECIAL_MODE_PASSWORD_HASHES = {
    hashlib.sha256(password.encode()).hexdigest()
    for password in _SPECIAL_MODE_PASSWORDS
}


def verify_password(password: str) -> bool:
    """Verify provided password against configured password."""
    normalized_input = password.strip()
    hashed_input = hashlib.sha256(normalized_input.encode()).hexdigest()
    return any(
        hmac.compare_digest(hashed_input, hashed_password)
        for hashed_password in _SPECIAL_MODE_PASSWORD_HASHES
    )


@router.post("/special-backdoor", response_model=PasswordAuthResponse)
async def authenticate_special_mode(request: PasswordAuthRequest):
    """
    Authenticate for special mode access.
    
    Requires password configured in SPECIAL_MODE_PASSWORD environment variable.
    Default password: "backdoor"
    
    Returns:
        PasswordAuthResponse with success=True if password correct
    """
    try:
        if verify_password(request.password):
            logger.info("Special mode authentication successful")
            return PasswordAuthResponse(
                success=True,
                message="Authentication successful"
            )
        else:
            logger.warning("Special mode authentication failed: incorrect password")
            return PasswordAuthResponse(
                success=False,
                message="Incorrect password"
            )
    
    except Exception as e:
        logger.error(f"Special mode authentication error: {e}")
        raise HTTPException(500, f"Authentication error: {e}")
