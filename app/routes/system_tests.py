"""
System Test API Routes
Provides access to system test results including JUCE audio engine tests.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
import json
import os
from pathlib import Path
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/system-tests", tags=["system-tests"])


class SystemTestService:
    """Service for managing system test results."""

    def __init__(self):
        self.logs_dir = Path.cwd() / "logs"
        self.logs_dir.mkdir(exist_ok=True)

    def get_latest_engine_test(self) -> Optional[Dict[str, Any]]:
        """Get the latest JUCE audio engine test results."""
        try:
            # Try JUCE engine test result first
            juce_file = self.logs_dir / "juce_engine_test_latest.json"
            if juce_file.exists():
                with open(juce_file, 'r') as f:
                    return json.load(f)

            # Fallback to legacy PiPedal test result for backward compatibility
            latest_file = self.logs_dir / "pipedal_test_latest.json"
            if latest_file.exists():
                with open(latest_file, 'r') as f:
                    return json.load(f)

            # Fallback to boot test result
            boot_result = self.logs_dir / "juce_engine_boot_test_result.json"
            if boot_result.exists():
                with open(boot_result, 'r') as f:
                    return json.load(f)

            # Legacy boot test result
            boot_result = self.logs_dir / "pipedal_boot_test_result.json"
            if boot_result.exists():
                with open(boot_result, 'r') as f:
                    return json.load(f)

            return None

        except Exception as e:
            logger.error(f"Error reading JUCE engine test results: {e}")
            return None

    # Backward compatibility alias
    def get_latest_pipedal_test(self) -> Optional[Dict[str, Any]]:
        """Alias for get_latest_engine_test for backward compatibility."""
        return self.get_latest_engine_test()

    def get_test_summary(self) -> Dict[str, Any]:
        """Get a summary of all system tests."""
        summary = {
            "timestamp": datetime.now().isoformat(),
            "tests": {},
            "overall_status": "unknown",
            "recommendations": []
        }
        
        # JUCE audio engine test summary
        engine_test = self.get_latest_engine_test()
        if engine_test:
            summary["tests"]["juce_engine"] = {
                "name": "JUCE Audio Engine Test",
                "status": engine_test.get("overall_status", "unknown"),
                "score": engine_test.get("score", 0),
                "passed_tests": engine_test.get("passed_tests", 0),
                "total_tests": engine_test.get("total_tests", 0),
                "last_run": engine_test.get("timestamp"),
                "duration_seconds": engine_test.get("duration_seconds", 0)
            }

            # Add engine recommendations
            engine_recommendations = engine_test.get("recommendations", [])
            summary["recommendations"].extend(engine_recommendations)

        # Startup status
        try:
            startup_file = self.logs_dir / "startup_status.json"
            if startup_file.exists():
                with open(startup_file, 'r') as f:
                    startup_data = json.load(f)
                    summary["tests"]["system_startup"] = {
                        "name": "System Startup",
                        "status": "passed" if startup_data.get("boot_completed") else "failed",
                        "engine_test_status": startup_data.get("engine_test_status", startup_data.get("pipedal_test_status", "unknown")),
                        "services": startup_data.get("services", {}),
                        "last_run": startup_data.get("timestamp")
                    }
        except Exception as e:
            logger.warning(f"Could not read startup status: {e}")

        # Determine overall status
        test_statuses = [test.get("status") for test in summary["tests"].values()]
        if all(status == "passed" or status == "excellent" or status == "good" for status in test_statuses):
            summary["overall_status"] = "passed"
        elif any(status == "failed" or status == "error" for status in test_statuses):
            summary["overall_status"] = "failed"
        else:
            summary["overall_status"] = "partial"

        return summary

    def get_test_history(self, test_type: str = "pipedal", days: int = 7) -> Dict[str, Any]:
        """Get historical test results."""
        history = {
            "test_type": test_type,
            "period_days": days,
            "results": [],
            "trend_analysis": {}
        }
        
        try:
            # Find all test result files
            pattern = f"{test_type}_test_*.json"
            test_files = list(self.logs_dir.glob(pattern))
            
            # Sort by modification time (newest first)
            test_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
            
            # Process recent files
            cutoff_time = datetime.now() - timedelta(days=days)
            
            scores = []
            for test_file in test_files[:20]:  # Limit to 20 most recent
                try:
                    with open(test_file, 'r') as f:
                        test_data = json.load(f)
                    
                    # Check if within time range
                    test_time = datetime.fromisoformat(test_data.get("timestamp", ""))
                    if test_time < cutoff_time:
                        continue
                    
                    result_summary = {
                        "timestamp": test_data.get("timestamp"),
                        "score": test_data.get("score", 0),
                        "status": test_data.get("overall_status", "unknown"),
                        "passed_tests": test_data.get("passed_tests", 0),
                        "total_tests": test_data.get("total_tests", 0),
                        "duration_seconds": test_data.get("duration_seconds", 0)
                    }
                    
                    history["results"].append(result_summary)
                    scores.append(test_data.get("score", 0))
                    
                except Exception as e:
                    logger.warning(f"Error processing test file {test_file}: {e}")
                    continue
            
            # Trend analysis
            if scores:
                history["trend_analysis"] = {
                    "average_score": round(sum(scores) / len(scores), 1),
                    "min_score": min(scores),
                    "max_score": max(scores),
                    "trend": "improving" if len(scores) > 1 and scores[0] > scores[-1] else "stable",
                    "total_runs": len(scores)
                }
                
        except Exception as e:
            logger.error(f"Error getting test history: {e}")
        
        return history


# Service instance
test_service = SystemTestService()


@router.get("/test/juce-engine/latest")
async def get_latest_juce_engine_test() -> Dict[str, Any]:
    """Get the latest JUCE audio engine test results."""
    result = test_service.get_latest_engine_test()
    if not result:
        raise HTTPException(status_code=404, detail="No JUCE engine test results found")
    return result


# Backward compatibility route
@router.get("/test/pipedal/latest")
async def get_latest_pipedal_test() -> Dict[str, Any]:
    """Get the latest engine test results (backward compatibility)."""
    result = test_service.get_latest_engine_test()
    if not result:
        raise HTTPException(status_code=404, detail="No engine test results found")
    return result


@router.get("/test/summary")
async def get_test_summary() -> Dict[str, Any]:
    """Get a summary of all system tests."""
    return test_service.get_test_summary()


@router.get("/test/{test_type}/history")
async def get_test_history(test_type: str = "pipedal", days: int = 7) -> Dict[str, Any]:
    """Get historical test results for a specific test type."""
    return test_service.get_test_history(test_type, days)


@router.post("/test/juce-engine/run")
async def run_juce_engine_test() -> Dict[str, Any]:
    """Trigger a new JUCE audio engine test."""
    import asyncio

    try:
        # Try JUCE engine test script first, fall back to PiPedal script
        test_script = "test_juce_engine.py"
        if not (Path.cwd() / test_script).exists():
            test_script = "test_pipedal_engine.py"

        # Run the test in the background
        process = await asyncio.create_subprocess_exec(
            "python3", test_script,
            cwd=Path.cwd(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode == 0:
            # Try to read the latest results
            result = test_service.get_latest_engine_test()
            if result:
                return {
                    "status": "completed",
                    "message": "Test completed successfully",
                    "results": result
                }
            else:
                return {
                    "status": "completed",
                    "message": "Test completed but results not found",
                    "stdout": stdout.decode() if stdout else ""
                }
        else:
            return {
                "status": "failed",
                "message": "Test execution failed",
                "error": stderr.decode() if stderr else "Unknown error",
                "return_code": process.returncode
            }

    except Exception as e:
        logger.error(f"Error running JUCE engine test: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to run test: {str(e)}")


# Backward compatibility route
@router.post("/test/pipedal/run")
async def run_pipedal_test() -> Dict[str, Any]:
    """Trigger a new engine test (backward compatibility)."""
    return await run_juce_engine_test()


@router.get("/test/status")
async def get_test_status() -> Dict[str, Any]:
    """Get the current testing system status."""

    # Check if tests are available (try JUCE first, fall back to PiPedal)
    juce_script = Path.cwd() / "test_juce_engine.py"
    legacy_script = Path.cwd() / "test_pipedal_engine.py"
    juce_boot_script = Path.cwd() / "run_juce_engine_boot_test.sh"
    legacy_boot_script = Path.cwd() / "run_pipedal_boot_test.sh"

    status = {
        "timestamp": datetime.now().isoformat(),
        "testing_available": juce_script.exists() or legacy_script.exists(),
        "boot_testing_configured": juce_boot_script.exists() or legacy_boot_script.exists(),
        "last_engine_test": None,
        "system_status": "unknown"
    }

    # Get latest test info
    latest_test = test_service.get_latest_engine_test()
    if latest_test:
        status["last_engine_test"] = {
            "timestamp": latest_test.get("timestamp"),
            "score": latest_test.get("score", 0),
            "status": latest_test.get("overall_status", "unknown")
        }

        # Determine system status
        score = latest_test.get("score", 0)
        if score >= 90:
            status["system_status"] = "excellent"
        elif score >= 75:
            status["system_status"] = "good"
        elif score >= 50:
            status["system_status"] = "fair"
        else:
            status["system_status"] = "poor"

    return status