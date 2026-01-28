"""
Error Handling
==============
User-friendly error messages and logging.
"""

import logging
from typing import Optional, Callable, Any
from textual.app import App

logger = logging.getLogger(__name__)


class ErrorHandler:
    """Centralized error handling."""
    
    def __init__(self, app: Optional[App] = None):
        """Initialize error handler."""
        self.app = app
    
    def handle_api_error(self, error: Exception, context: str = "") -> str:
        """Convert API errors to user-friendly messages."""
        error_str = str(error).lower()
        
        if "connection" in error_str or "timeout" in error_str:
            msg = "⚠️ Connection failed: Unable to reach API server"
        elif "404" in error_str or "not found" in error_str:
            msg = "❌ Resource not found"
        elif "500" in error_str or "server error" in error_str:
            msg = "❌ Server error: Please try again later"
        elif "permission" in error_str or "unauthorized" in error_str:
            msg = "🔒 Permission denied"
        else:
            msg = f"❌ Error: {str(error)[:50]}"
        
        if context:
            msg = f"{context}: {msg}"
        
        logger.error(f"{context}: {error}", exc_info=True)
        return msg
    
    def handle_ui_error(self, error: Exception, context: str = "") -> str:
        """Convert UI errors to user-friendly messages."""
        msg = f"UI Error: {str(error)[:50]}"
        if context:
            msg = f"{context}: {msg}"
        
        logger.error(f"{context}: {error}", exc_info=True)
        return msg
    
    def show_error(self, message: str, severity: str = "error", timeout: int = 5) -> None:
        """Show error to user via app notification."""
        if self.app:
            self.app.notify(message, severity=severity, timeout=timeout)
    
    def log_error(self, message: str, error: Optional[Exception] = None) -> None:
        """Log error with optional exception."""
        if error:
            logger.error(f"{message}: {error}", exc_info=True)
        else:
            logger.error(message)


# Global instance
def setup_error_handler(app: Optional[App] = None) -> ErrorHandler:
    """Set up global error handler."""
    return ErrorHandler(app)
