"""
Special Mode Authentication API

Provides password-protected access to special/advanced features.
Password is configured via SPECIAL_MODE_PASSWORD environment variable.
"""

import os
import logging
import hashlib
from fastapi import APIRouter, HTTPException
from app.models import PasswordAuthRequest, PasswordAuthResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# Get password from environment (default: "backdoor")
SPECIAL_MODE_PASSWORD = os.getenv("SPECIAL_MODE_PASSWORD", "backdoor")

# Store hashed password for comparison (simple SHA-256 for now)
HASHED_PASSWORD = hashlib.sha256(SPECIAL_MODE_PASSWORD.encode()).hexdigest()


def verify_password(password: str) -> bool:
    """Verify provided password against configured password."""
    hashed_input = hashlib.sha256(password.encode()).hexdigest()
    return hashed_input == HASHED_PASSWORD


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
