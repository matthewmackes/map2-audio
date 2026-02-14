"""
Email notification endpoints for host machine monitoring alerts.
Handles sending emails for critical and warning conditions.
"""

from typing import List
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import os
import re
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# Email configuration
EMAIL_SENDER = os.getenv('EMAIL_SENDER', 'monitoring@map2-audio.local')
SMTP_SERVER = os.getenv('SMTP_SERVER', 'localhost')
SMTP_PORT = int(os.getenv('SMTP_PORT', '25'))
SMTP_USERNAME = os.getenv('SMTP_USERNAME')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')

# Use TLS if credentials provided
USE_TLS = SMTP_USERNAME is not None and SMTP_PASSWORD is not None
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EmailAlertRequest(BaseModel):
    """Model for email alert request"""
    recipients: List[str]
    type: str  # 'temperature' | 'cpu' | 'memory' | 'disk'
    severity: str  # 'warning' | 'critical'
    value: float
    threshold: float
    timestamp: str


class TestEmailRequest(BaseModel):
    """Model for test email request"""
    recipients: List[str]


class EmailVerificationRequest(BaseModel):
    """Model for email verification request"""
    recipients: List[str]


def _validate_recipients(recipients: List[str]) -> None:
    """Validate recipient list with lightweight email pattern."""
    invalid = [email for email in recipients if not EMAIL_REGEX.match(email)]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid recipient email(s): {', '.join(invalid)}",
        )


def send_email(
    recipients: List[str],
    subject: str,
    html_body: str,
    text_body: str = None
) -> bool:
    """
    Send email via SMTP
    """
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = EMAIL_SENDER
        msg['To'] = ', '.join(recipients)

        # Add text and HTML parts
        if text_body:
            msg.attach(MIMEText(text_body, 'plain'))
        msg.attach(MIMEText(html_body, 'html'))

        # Send email
        if USE_TLS:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.send_message(msg)

        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def get_alert_email_template(
    alert_type: str,
    severity: str,
    value: float,
    threshold: float,
    timestamp: str,
    hostname: str = "Host Machine"
) -> tuple[str, str]:
    """
    Generate email template for alert
    """
    severity_emoji = "🚨" if severity == "critical" else "⚠️"
    type_label = {
        'temperature': '🌡️ Temperature',
        'cpu': '⚙️ CPU Usage',
        'memory': '💾 Memory Usage',
        'disk': '💿 Disk Usage',
    }.get(alert_type, alert_type)

    severity_color = "#ef4444" if severity == "critical" else "#f59e0b"
    subject = f"{severity_emoji} {severity.upper()}: {type_label} on {hostname}"

    html_body = f"""
<html>
  <head>
    <style>
      body {{ font-family: Arial, sans-serif; color: #333; }}
      .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
      .header {{ background-color: {severity_color}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
      .content {{ background-color: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }}
      .alert-box {{ background-color: white; padding: 15px; border-left: 4px solid {severity_color}; margin: 15px 0; }}
      .metric {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }}
      .metric-label {{ font-weight: 600; }}
      .metric-value {{ font-size: 18px; font-weight: 700; color: {severity_color}; }}
      .footer {{ font-size: 12px; color: #999; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }}
      .action-btn {{ display: inline-block; background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-top: 15px; }}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>{severity_emoji} {severity.upper()}</h1>
        <p>{type_label} threshold exceeded on {hostname}</p>
      </div>
      <div class="content">
        <div class="alert-box">
          <div class="metric">
            <span class="metric-label">Type:</span>
            <span>{type_label}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Current Value:</span>
            <span class="metric-value">{value:.1f}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Threshold:</span>
            <span>{threshold:.1f}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Timestamp:</span>
            <span>{timestamp}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Severity:</span>
            <span style="color: {severity_color}; font-weight: 700;">{severity.upper()}</span>
          </div>
        </div>

        <p>This is an automated alert from your Host Machine Monitoring System.</p>
        <p>Please review your system metrics and take appropriate action if needed.</p>

        <a href="http://localhost:3000/host-machine" class="action-btn">View Dashboard</a>

        <div class="footer">
          <p>You are receiving this email because you are configured to receive alerts for this system.</p>
          <p>To manage your notification preferences, visit the settings page.</p>
        </div>
      </div>
    </div>
  </body>
</html>
    """

    text_body = f"""
{type_label} Alert on {hostname}
{severity.upper()}

Current Value: {value:.1f}
Threshold: {threshold:.1f}
Timestamp: {timestamp}

This is an automated alert from your Host Machine Monitoring System.
Please review your system metrics and take appropriate action if needed.

View your dashboard: http://localhost:3000/host-machine
    """

    return subject, html_body


@router.post("/email")
async def send_alert_email(request: EmailAlertRequest):
    """
    Send email alert for system condition
    """
    try:
        _validate_recipients(request.recipients)

        subject, html_body = get_alert_email_template(
            request.type,
            request.severity,
            request.value,
            request.threshold,
            request.timestamp
        )

        success = send_email(
            request.recipients,
            subject,
            html_body
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send email"
            )

        return {
            "status": "sent",
            "recipients": request.recipients,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/email/test")
async def send_test_email(request: TestEmailRequest):
    """
    Send test email to verify configuration
    """
    try:
        _validate_recipients(request.recipients)

        subject = "🧪 Test Email - Host Machine Monitoring"
        html_body = """
<html>
  <body style="font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>🧪 Test Email</h2>
      <p>This is a test email from your Host Machine Monitoring system.</p>
      <p>If you received this, your email configuration is working correctly!</p>
      <p>Timestamp: {}</p>
    </div>
  </body>
</html>
        """.format(datetime.utcnow().isoformat())

        success = send_email(request.recipients, subject, html_body)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send test email"
            )

        return {
            "status": "sent",
            "recipients": request.recipients,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/email/verify")
async def verify_emails(request: EmailVerificationRequest):
    """
    Verify email addresses format
    """
    _validate_recipients(request.recipients)
    results = {}
    for email in request.recipients:
        # Basic validation was already performed by _validate_recipients.
        results[email] = True

    return results


@router.get("/email/status")
async def get_email_status():
    """
    Get email notification service status
    """
    try:
        # Test SMTP connection
        if USE_TLS:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
        else:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.noop()

        return {
            "status": "ok",
            "smtp_server": SMTP_SERVER,
            "smtp_port": SMTP_PORT,
            "tls_enabled": USE_TLS,
            "sender": EMAIL_SENDER,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
