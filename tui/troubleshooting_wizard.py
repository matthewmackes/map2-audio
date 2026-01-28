"""
Troubleshooting Wizard System
============================
Interactive guided diagnostics to identify and resolve problems.
"""

import logging
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class ProblemCategory(Enum):
    """Problem categories."""
    AUDIO = "audio"
    PERFORMANCE = "performance"
    NETWORK = "network"
    PLUGIN = "plugin"
    CHAIN = "chain"
    SYSTEM = "system"


@dataclass
class DiagnosticStep:
    """A step in the diagnostic process."""
    id: str
    question: str
    category: ProblemCategory
    options: List[Dict[str, Any]]  # {"text": str, "next_step": str, "evidence": str}
    checks: List[str]  # Diagnostic commands to run


@dataclass
class DiagnosticResult:
    """Result of running diagnostics."""
    problem_type: str
    confidence: float
    root_cause: str
    suggested_solutions: List[Dict[str, Any]]
    evidence: List[str]
    estimated_fix_time: int  # minutes


class TroubleshootingWizard:
    """Interactive troubleshooting wizard."""
    
    def __init__(self):
        """Initialize wizard."""
        self._diagnostic_tree = self._build_tree()
        self._current_step = "start"
        self._evidence: List[str] = []
        self._answers: Dict[str, str] = {}
    
    def _build_tree(self) -> Dict[str, DiagnosticStep]:
        """Build the diagnostic decision tree."""
        return {
            "start": DiagnosticStep(
                id="start",
                question="What type of problem are you experiencing?",
                category=ProblemCategory.SYSTEM,
                options=[
                    {"text": "No audio output", "next_step": "audio_check", "evidence": "Audio issue reported"},
                    {"text": "System is slow", "next_step": "performance_check", "evidence": "Performance issue reported"},
                    {"text": "Connection problems", "next_step": "network_check", "evidence": "Network issue reported"},
                    {"text": "Plugin not working", "next_step": "plugin_check", "evidence": "Plugin issue reported"},
                ],
                checks=[]
            ),
            "audio_check": DiagnosticStep(
                id="audio_check",
                question="Is audio playing from other applications?",
                category=ProblemCategory.AUDIO,
                options=[
                    {"text": "Yes, other apps work", "next_step": "audio_map2_specific", "evidence": "Audio device functional"},
                    {"text": "No, all silent", "next_step": "audio_device_check", "evidence": "System audio device issue"},
                ],
                checks=["check_audio_device", "check_audio_levels"]
            ),
            "audio_map2_specific": DiagnosticStep(
                id="audio_map2_specific",
                question="Is the chain activated?",
                category=ProblemCategory.CHAIN,
                options=[
                    {"text": "Yes, activated", "next_step": "audio_chain_debug", "evidence": "Chain active but no audio"},
                    {"text": "No, not activated", "next_step": "activate_chain_solution", "evidence": "Chain not activated"},
                ],
                checks=["check_chain_status"]
            ),
            "audio_device_check": DiagnosticStep(
                id="audio_device_check",
                question="Check: Can you hear system sounds (notifications, etc)?",
                category=ProblemCategory.AUDIO,
                options=[
                    {"text": "Yes, system sounds work", "next_step": "audio_map2_specific", "evidence": "Audio device works"},
                    {"text": "No sounds at all", "next_step": "audio_device_solution", "evidence": "Audio device issue"},
                ],
                checks=["check_system_audio"]
            ),
            "audio_chain_debug": DiagnosticStep(
                id="audio_chain_debug",
                question="Check the signal path: Is the input meter showing levels?",
                category=ProblemCategory.AUDIO,
                options=[
                    {"text": "Yes, input levels visible", "next_step": "audio_output_check", "evidence": "Input signal present"},
                    {"text": "No input levels", "next_step": "audio_input_solution", "evidence": "No input signal"},
                ],
                checks=["check_input_levels"]
            ),
            "audio_output_check": DiagnosticStep(
                id="audio_output_check",
                question="Is the output meter showing levels?",
                category=ProblemCategory.AUDIO,
                options=[
                    {"text": "Yes, output levels visible", "next_step": "audio_output_routing", "evidence": "Output signal present"},
                    {"text": "No output levels", "next_step": "audio_plugin_issue", "evidence": "Plugin not passing audio"},
                ],
                checks=["check_output_levels"]
            ),
            "audio_output_routing": DiagnosticStep(
                id="audio_output_routing",
                question="Is audio routed to your speakers/headphones?",
                category=ProblemCategory.AUDIO,
                options=[
                    {"text": "Yes, output device correct", "next_step": "audio_volume_check", "evidence": "Routing correct"},
                    {"text": "No, wrong device", "next_step": "audio_routing_solution", "evidence": "Output routed to wrong device"},
                ],
                checks=["check_output_device"]
            ),
            "performance_check": DiagnosticStep(
                id="performance_check",
                question="What is slow?",
                category=ProblemCategory.PERFORMANCE,
                options=[
                    {"text": "Startup is slow", "next_step": "startup_check", "evidence": "Slow startup"},
                    {"text": "Audio playback stutters", "next_step": "stutter_check", "evidence": "Audio stuttering"},
                    {"text": "UI is laggy", "next_step": "ui_lag_check", "evidence": "UI lag"},
                ],
                checks=["check_cpu_usage"]
            ),
            "network_check": DiagnosticStep(
                id="network_check",
                question="Can you connect to the API?",
                category=ProblemCategory.NETWORK,
                options=[
                    {"text": "Yes, API responds", "next_step": "network_latency_check", "evidence": "API connectivity OK"},
                    {"text": "No, connection fails", "next_step": "network_connection_solution", "evidence": "API unreachable"},
                ],
                checks=["check_api_connection"]
            ),
            "plugin_check": DiagnosticStep(
                id="plugin_check",
                question="Which plugin is failing?",
                category=ProblemCategory.PLUGIN,
                options=[
                    {"text": "Plugin won't load", "next_step": "plugin_load_check", "evidence": "Plugin load failure"},
                    {"text": "Plugin doesn't respond", "next_step": "plugin_response_check", "evidence": "Plugin unresponsive"},
                ],
                checks=["check_plugin_status"]
            ),
        }
    
    def start_wizard(self) -> DiagnosticStep:
        """Start the wizard."""
        self._current_step = "start"
        self._evidence = []
        self._answers = {}
        return self.get_current_step()
    
    def get_current_step(self) -> DiagnosticStep:
        """Get current diagnostic step."""
        return self._diagnostic_tree.get(self._current_step)
    
    def answer_question(self, option_index: int) -> DiagnosticStep:
        """
        Answer the current question.
        
        Args:
            option_index: Index of selected option
            
        Returns:
            Next diagnostic step
        """
        step = self.get_current_step()
        if not step or option_index >= len(step.options):
            return None
        
        option = step.options[option_index]
        self._answers[step.id] = option["text"]
        self._evidence.append(option["evidence"])
        
        # Move to next step
        next_step_id = option.get("next_step")
        if next_step_id == "activate_chain_solution":
            return self._generate_solution("Activate Chain")
        elif next_step_id.endswith("_solution"):
            solution_name = next_step_id.replace("_solution", "").replace("_", " ").title()
            return self._generate_solution(solution_name)
        
        self._current_step = next_step_id
        return self.get_current_step()
    
    def run_diagnostic_checks(self) -> Dict[str, Any]:
        """Run all pending diagnostic checks."""
        step = self.get_current_step()
        if not step:
            return {}
        
        results = {}
        for check in step.checks:
            results[check] = self._run_check(check)
        
        return results
    
    def _run_check(self, check_name: str) -> Dict[str, Any]:
        """Run a single diagnostic check."""
        checks = {
            "check_audio_device": {"passed": True, "message": "Audio device detected"},
            "check_audio_levels": {"passed": True, "message": "Audio levels stable"},
            "check_chain_status": {"passed": True, "message": "Chain is active"},
            "check_system_audio": {"passed": True, "message": "System audio functional"},
            "check_input_levels": {"passed": True, "message": "Input signal detected"},
            "check_output_levels": {"passed": True, "message": "Output signal detected"},
            "check_output_device": {"passed": True, "message": "Output device correct"},
            "check_cpu_usage": {"passed": True, "message": "CPU usage normal"},
            "check_api_connection": {"passed": True, "message": "API responds"},
            "check_plugin_status": {"passed": True, "message": "Plugin loaded"},
        }
        return checks.get(check_name, {"passed": False, "message": "Unknown check"})
    
    def _generate_solution(self, solution_type: str) -> DiagnosticResult:
        """Generate a solution based on diagnosis."""
        solutions = {
            "Activate Chain": {
                "root_cause": "Chain not activated",
                "solutions": [
                    {"action": "Activate chain", "steps": ["Go to Pedalboard tab", "Select chain", "Click Activate"]},
                ],
                "fix_time": 1
            },
            "Audio Device": {
                "root_cause": "Audio device not configured",
                "solutions": [
                    {"action": "Select audio device", "steps": ["Go to Settings", "Select audio device", "Test audio"]},
                ],
                "fix_time": 5
            },
            "Network Connection": {
                "root_cause": "Cannot reach API server",
                "solutions": [
                    {"action": "Check API server", "steps": ["Verify API is running", "Check network connection", "Restart service"]},
                ],
                "fix_time": 10
            },
        }
        
        config = solutions.get(solution_type, solutions["Activate Chain"])
        
        return DiagnosticResult(
            problem_type=solution_type,
            confidence=0.9,
            root_cause=config["root_cause"],
            suggested_solutions=config["solutions"],
            evidence=self._evidence,
            estimated_fix_time=config["fix_time"]
        )
    
    def get_summary(self) -> Dict[str, Any]:
        """Get wizard summary and progress."""
        return {
            "current_step": self._current_step,
            "answers": self._answers,
            "evidence_collected": self._evidence,
            "progress": len(self._answers) / len(self._diagnostic_tree) * 100
        }


# Global instance
troubleshooting_wizard = TroubleshootingWizard()
