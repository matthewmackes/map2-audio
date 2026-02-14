"""
Request Queue Management REST API Endpoints

Provides monitoring and management endpoints for request queuing.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.services.request_queue import (
    get_request_queue, RequestStatus, RequestPriority
)

router = APIRouter(prefix="/api/request-queue", tags=["request-queue"])


# ============================================================================
# QUEUE STATUS AND METRICS
# ============================================================================

@router.get("/status")
async def get_queue_status() -> Dict[str, Any]:
    """Get overall request queue status."""
    queue = get_request_queue()
    metrics = queue.get_metrics()
    
    return {
        "timestamp": datetime.now().isoformat(),
        "queue_status": {
            "total_queued": metrics.total_queued,
            "pending": metrics.pending,
            "in_progress": metrics.in_progress,
            "successful": metrics.successful,
            "failed": metrics.failed,
            "dead_letter": metrics.dead_letter
        },
        "metrics": {
            "success_rate": f"{metrics.success_rate:.1f}%",
            "failure_rate": f"{metrics.failure_rate:.1f}%",
            "avg_attempts": f"{metrics.avg_attempts_per_request:.2f}",
            "total_errors": metrics.total_errors
        }
    }


@router.get("/metrics")
async def get_metrics() -> Dict[str, Any]:
    """Get detailed queue metrics."""
    queue = get_request_queue()
    metrics = queue.get_metrics()
    
    return {
        "timestamp": datetime.now().isoformat(),
        "queue_metrics": {
            "total_queued": metrics.total_queued,
            "pending": metrics.pending,
            "in_progress": metrics.in_progress,
            "successful": metrics.successful,
            "failed": metrics.failed,
            "dead_letter": metrics.dead_letter
        },
        "performance": {
            "success_rate": metrics.success_rate,
            "failure_rate": metrics.failure_rate,
            "avg_attempts_per_request": metrics.avg_attempts_per_request,
            "total_errors": metrics.total_errors
        },
        "timestamps": {
            "created_at": metrics.created_at.isoformat(),
            "last_update": metrics.last_update.isoformat()
        }
    }


@router.get("/requests/{request_id}")
async def get_request_status(request_id: str) -> Dict[str, Any]:
    """Get status of specific request."""
    queue = get_request_queue()
    request = queue.get_request_status(request_id)
    
    if not request:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")
    
    return {
        "request_id": request.request_id,
        "service_name": request.service_name,
        "status": request.status.value,
        "priority": request.priority.name,
        "details": {
            "method": request.method,
            "endpoint": request.endpoint,
            "attempt_count": request.attempt_count,
            "max_attempts": request.max_attempts
        },
        "timing": {
            "created_at": request.created_at.isoformat(),
            "first_attempt_at": request.first_attempt_at.isoformat() if request.first_attempt_at else None,
            "last_attempt_at": request.last_attempt_at.isoformat() if request.last_attempt_at else None,
            "next_retry_at": request.next_retry_at.isoformat() if request.next_retry_at else None
        },
        "error": request.last_error,
        "response": request.response_data
    }


# ============================================================================
# QUEUE STATISTICS AND ANALYSIS
# ============================================================================

@router.get("/statistics")
async def get_statistics() -> Dict[str, Any]:
    """Get queue statistics and trends."""
    queue = get_request_queue()
    metrics = queue.get_metrics()
    
    return {
        "timestamp": datetime.now().isoformat(),
        "statistics": {
            "total_processed": metrics.successful + metrics.failed + metrics.dead_letter,
            "successful_requests": metrics.successful,
            "failed_requests": metrics.failed,
            "dead_letter_requests": metrics.dead_letter,
            "pending_requests": metrics.pending,
            "in_progress_requests": metrics.in_progress
        },
        "rates": {
            "success_rate": f"{metrics.success_rate:.1f}%",
            "failure_rate": f"{metrics.failure_rate:.1f}%"
        },
        "efficiency": {
            "avg_attempts_per_request": f"{metrics.avg_attempts_per_request:.2f}",
            "total_retry_attempts": metrics.total_attempts,
            "total_errors": metrics.total_errors
        }
    }


@router.get("/queue/summary")
async def get_queue_summary() -> Dict[str, Any]:
    """Get concise queue summary."""
    queue = get_request_queue()
    metrics = queue.get_metrics()
    
    return {
        "queued": metrics.pending,
        "processing": metrics.in_progress,
        "completed": metrics.successful,
        "failed": metrics.dead_letter,
        "success_rate": f"{metrics.success_rate:.1f}%",
        "total_errors": metrics.total_errors,
        "timestamp": datetime.now().isoformat()
    }


# ============================================================================
# DEAD LETTER QUEUE
# ============================================================================

@router.get("/dead-letter")
async def get_dead_letter_queue() -> Dict[str, Any]:
    """Get dead letter queue contents."""
    queue = get_request_queue()
    
    dead_letter_requests = [
        {
            "request_id": req.request_id,
            "service_name": req.service_name,
            "endpoint": req.endpoint,
            "attempt_count": req.attempt_count,
            "max_attempts": req.max_attempts,
            "last_error": req.last_error,
            "created_at": req.created_at.isoformat(),
            "last_attempt_at": req.last_attempt_at.isoformat() if req.last_attempt_at else None
        }
        for req in queue.dead_letter
    ]
    
    return {
        "dead_letter_count": len(queue.dead_letter),
        "requests": dead_letter_requests,
        "timestamp": datetime.now().isoformat()
    }


@router.get("/dead-letter/{request_id}")
async def get_dead_letter_request(request_id: str) -> Dict[str, Any]:
    """Get specific dead letter request details."""
    queue = get_request_queue()
    
    request = None
    for req in queue.dead_letter:
        if req.request_id == request_id:
            request = req
            break
    
    if not request:
        raise HTTPException(status_code=404, detail=f"Dead letter request {request_id} not found")
    
    return {
        "request_id": request.request_id,
        "service_name": request.service_name,
        "method": request.method,
        "endpoint": request.endpoint,
        "priority": request.priority.name,
        "attempts": {
            "count": request.attempt_count,
            "max": request.max_attempts
        },
        "payload": request.payload,
        "error": request.last_error,
        "timing": {
            "created_at": request.created_at.isoformat(),
            "first_attempt_at": request.first_attempt_at.isoformat() if request.first_attempt_at else None,
            "last_attempt_at": request.last_attempt_at.isoformat() if request.last_attempt_at else None
        }
    }


# ============================================================================
# QUEUE HEALTH AND DIAGNOSTICS
# ============================================================================

@router.get("/health")
async def get_queue_health() -> Dict[str, Any]:
    """Get queue health status."""
    queue = get_request_queue()
    metrics = queue.get_metrics()
    
    # Determine health status
    if metrics.success_rate > 95 and metrics.failure_rate < 5:
        status = "HEALTHY"
    elif metrics.success_rate > 80 and metrics.failure_rate < 20:
        status = "DEGRADED"
    else:
        status = "CRITICAL"
    
    return {
        "status": status,
        "timestamp": datetime.now().isoformat(),
        "metrics": {
            "success_rate": f"{metrics.success_rate:.1f}%",
            "failure_rate": f"{metrics.failure_rate:.1f}%",
            "queue_size": metrics.pending,
            "processing": metrics.in_progress,
            "dead_letter": metrics.dead_letter
        },
        "recommendations": _get_health_recommendations(status, metrics)
    }


def _get_health_recommendations(status: str, metrics: Any) -> List[str]:
    """Get recommendations based on health status."""
    recommendations = []
    
    if status == "CRITICAL":
        recommendations.append("Queue failure rate is critical - check service health")
        recommendations.append("Review dead letter queue for patterns")
        recommendations.append("Consider increasing max retry attempts")
    
    elif status == "DEGRADED":
        recommendations.append("Monitor failure rate for improvement")
        recommendations.append("Check if backoff strategy needs adjustment")
    
    if metrics.pending > 1000:
        recommendations.append("Queue is building up - check processing speed")
    
    if metrics.dead_letter > 100:
        recommendations.append("Large dead letter queue - review failed requests")
    
    if not recommendations:
        recommendations.append("Queue is operating normally")
    
    return recommendations


# ============================================================================
# QUEUE OPERATIONS
# ============================================================================

@router.post("/requeue/{request_id}")
async def requeue_request(request_id: str) -> Dict[str, Any]:
    """Requeue a dead letter request."""
    queue = get_request_queue()
    
    # Find and remove from dead letter
    request = None
    for req in queue.dead_letter:
        if req.request_id == request_id:
            request = req
            queue.dead_letter.remove(req)
            break
    
    if not request:
        raise HTTPException(status_code=404, detail=f"Dead letter request {request_id} not found")
    
    # Reset and requeue
    request.attempt_count = 0
    request.next_retry_at = None
    new_id = await queue.enqueue(request)
    
    return {
        "status": "requeued",
        "request_id": new_id,
        "message": f"Request requeued with new ID {new_id}",
        "timestamp": datetime.now().isoformat()
    }


@router.post("/clear-dead-letter")
async def clear_dead_letter_queue() -> Dict[str, Any]:
    """Clear all dead letter queue requests."""
    queue = get_request_queue()
    count = len(queue.dead_letter)
    queue.dead_letter.clear()
    
    return {
        "status": "cleared",
        "cleared_count": count,
        "message": f"Cleared {count} dead letter requests",
        "timestamp": datetime.now().isoformat()
    }


@router.get("/performance-analysis")
async def get_performance_analysis() -> Dict[str, Any]:
    """Get detailed performance analysis."""
    queue = get_request_queue()
    metrics = queue.get_metrics()
    
    return {
        "timestamp": datetime.now().isoformat(),
        "overall_performance": {
            "success_rate": f"{metrics.success_rate:.1f}%",
            "failure_rate": f"{metrics.failure_rate:.1f}%",
            "average_attempts": f"{metrics.avg_attempts_per_request:.2f}"
        },
        "queue_health": {
            "pending": metrics.pending,
            "in_progress": metrics.in_progress,
            "successful": metrics.successful,
            "dead_letter": metrics.dead_letter
        },
        "error_analysis": {
            "total_errors": metrics.total_errors,
            "error_rate": f"{(metrics.total_errors / max(1, metrics.total_queued)) * 100:.1f}%"
        },
        "trends": {
            "queue_size_trend": "increasing" if metrics.pending > 100 else "normal",
            "error_trend": "improving" if metrics.failure_rate < 10 else "concerning"
        }
    }
