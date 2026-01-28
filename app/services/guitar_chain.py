"""
Guitar Processing Chain
Combines NAM amp modeling with IR cabinet simulation.
"""

import logging
import numpy as np
from typing import Optional
from .nam_processor import NAMProcessor
from .ir_processor import IRProcessor
from .plugin_profiler import get_profiler

logger = logging.getLogger(__name__)


class GuitarChain:
    """
    Complete guitar processing chain:
    Input → NAM Amp/Pedal → IR Cabinet → IR Reverb → Output
    """
    
    def __init__(self):
        self.nam = NAMProcessor()
        self.ir = IRProcessor()
        self.bypass_nam = False
        self.bypass_cabinet = False
        self.bypass_reverb = False
        
        # Wet/dry mix controls
        self.nam_mix = 1.0  # 0.0 = dry, 1.0 = wet
        self.cabinet_mix = 1.0
        self.reverb_mix = 0.3  # Common reverb mix
        
        # Register components with profiler
        profiler = get_profiler()
        if profiler:
            profiler.register_plugin("NAM_Amp", "NAM Amp Model")
            profiler.register_plugin("IR_Cabinet", "IR Cabinet Sim")
            profiler.register_plugin("IR_Reverb", "IR Reverb")
    
    def process(self, input_buffer: np.ndarray) -> np.ndarray:
        """
        Process guitar signal through full chain (RT-safe).
        
        Signal flow:
        1. NAM amp/pedal modeling
        2. Cabinet IR convolution
        3. Reverb IR convolution
        """
        output = input_buffer.copy()
        profiler = get_profiler()
        
        # Stage 1: NAM Amp/Pedal
        if not self.bypass_nam:
            start_ts = profiler.measure_start("NAM_Amp") if profiler else 0
            nam_output = self.nam.process_audio(output)
            if profiler:
                profiler.measure_end("NAM_Amp", start_ts)
            output = (1.0 - self.nam_mix) * output + self.nam_mix * nam_output
        
        # Stage 2: Cabinet IR
        if not self.bypass_cabinet:
            start_ts = profiler.measure_start("IR_Cabinet") if profiler else 0
            cabinet_output = self.ir.process_cabinet(output)
            if profiler:
                profiler.measure_end("IR_Cabinet", start_ts)
            output = (1.0 - self.cabinet_mix) * output + self.cabinet_mix * cabinet_output
        
        # Stage 3: Reverb IR
        if not self.bypass_reverb:
            start_ts = profiler.measure_start("IR_Reverb") if profiler else 0
            reverb_output = self.ir.process_reverb(output)
            if profiler:
                profiler.measure_end("IR_Reverb", start_ts)
            output = (1.0 - self.reverb_mix) * output + self.reverb_mix * reverb_output
        
        return output
    
    def set_nam_model(self, model_name: str) -> bool:
        """Set active NAM model."""
        return self.nam.set_active_model(model_name)
    
    def set_cabinet_ir(self, ir_name: str) -> bool:
        """Set active cabinet IR."""
        return self.ir.load_ir(ir_name, "cabinet")
    
    def set_reverb_ir(self, ir_name: str) -> bool:
        """Set active reverb IR."""
        return self.ir.load_ir(ir_name, "reverb")
    
    def get_status(self) -> dict:
        """Get complete chain status."""
        return {
            "nam": self.nam.get_status(),
            "ir": self.ir.get_status(),
            "bypass": {
                "nam": self.bypass_nam,
                "cabinet": self.bypass_cabinet,
                "reverb": self.bypass_reverb
            },
            "mix": {
                "nam": self.nam_mix,
                "cabinet": self.cabinet_mix,
                "reverb": self.reverb_mix
            }
        }
