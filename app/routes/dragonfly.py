"""
Dragonfly Reverb API Routes

Based on Dragonfly Reverb by Michael Willis.
Suite of 4 high-quality algorithmic reverb plugins: Hall, Room, Plate, and Early Reflections.
https://github.com/michaelwillis/dragonfly-reverb
"""

try:
    from fastapi import APIRouter, HTTPException

    router = APIRouter(prefix="/api/dragonfly", tags=["dragonfly"])

    # State storage for Dragonfly Reverb suite
    _dragonfly_state = {
        "available": True,
        "bypass": False,
        "inputLevel": -60,
        "outputLevel": -60,
        "peakInput": -60,
        "peakOutput": -60,
        "latency": 0,

        # Variant selection (hall, room, plate, early)
        "variant": "hall",

        # Common parameters (all variants)
        "dryLevel": 0,            # dB (-80 to 0)
        "wetLevel": -12,          # dB (-80 to 0)
        "width": 100,             # % (50-150)
        "predelay": 0,            # ms (0-100)
        "decay": 1.5,             # seconds (0.1-10)
        "lowCut": 0,              # Hz (0-200)
        "highCut": 16000,         # Hz (1000-16000)

        # Hall-specific parameters
        "size": 32,               # meters (10-60 for Hall, 8-32 for Room, 10-60 for Early)
        "diffuse": 100,           # % (0-100)
        "earlyLevel": -22,        # dB (-80 to 0)
        "earlySend": 20,          # % (0-100)
        "lateLevel": 0,           # dB (-80 to 0)
        "lowXover": 200,          # Hz (50-1000)
        "highXover": 6000,        # Hz (1000-16000)
        "lowMult": 1.0,           # multiplier (0.5-2.5)
        "highMult": 0.4,          # multiplier (0.2-1.2)
        "spin": 0.5,              # Hz (0-5 for Room, 0-10 for Hall)
        "wander": 40,             # % (0-100)
        "modulation": 0,          # % (0-100) - Hall only

        # Plate-specific parameters
        "algorithm": "tank",      # 'simple' | 'nested' | 'tank'
        "dampen": 50,             # % (0-100)

        # Room-specific parameters
        "bassBoost": 0,           # % (0-100)
        "boostFreq": 150,         # Hz (50-1050)
        "earlyDamp": 8000,        # Hz (1000-16000)
        "lateDamp": 8000,         # Hz (1000-16000)

        # Early Reflections-specific
        "program": 0,             # Program index (0-7)

        # Preset info
        "currentPreset": None,
        "currentBank": None,
    }

    # Valid variants
    VARIANTS = ['hall', 'room', 'plate', 'early']

    # Plate algorithms
    ALGORITHMS = ['simple', 'nested', 'tank']

    # Early Reflections programs
    EARLY_PROGRAMS = [
        "Abrupt Echo",
        "Backstage Pass",
        "Concert Venue",
        "Damaged Goods",
        "Elevator Pitch",
        "Floor Thirteen",
        "Garage Band",
        "Home Studio"
    ]

    # Factory presets organized by variant and bank
    FACTORY_PRESETS = {
        "hall": {
            "Small Halls": [
                {"name": "Small Clear Hall", "size": 18, "decay": 1.2, "diffuse": 90, "wetLevel": -15},
                {"name": "Small Dark Hall", "size": 18, "decay": 1.4, "diffuse": 85, "wetLevel": -12, "highCut": 8000},
                {"name": "Small Bright Hall", "size": 16, "decay": 1.0, "diffuse": 95, "wetLevel": -18, "highCut": 16000},
                {"name": "Small Vocal Hall", "size": 20, "decay": 1.3, "diffuse": 80, "wetLevel": -14},
                {"name": "Small Drum Hall", "size": 22, "decay": 0.8, "diffuse": 100, "wetLevel": -10},
            ],
            "Medium Halls": [
                {"name": "Medium Clear Hall", "size": 32, "decay": 1.8, "diffuse": 90, "wetLevel": -12},
                {"name": "Medium Dark Hall", "size": 32, "decay": 2.2, "diffuse": 85, "wetLevel": -10, "highCut": 6000},
                {"name": "Medium Bright Hall", "size": 30, "decay": 1.5, "diffuse": 95, "wetLevel": -15},
                {"name": "Medium Concert Hall", "size": 35, "decay": 2.0, "diffuse": 88, "wetLevel": -11},
                {"name": "Medium Ambient Hall", "size": 38, "decay": 2.5, "diffuse": 75, "wetLevel": -8},
            ],
            "Large Halls": [
                {"name": "Large Clear Hall", "size": 50, "decay": 2.5, "diffuse": 90, "wetLevel": -10},
                {"name": "Large Dark Hall", "size": 52, "decay": 3.5, "diffuse": 80, "wetLevel": -8, "highCut": 5000},
                {"name": "Large Cathedral", "size": 60, "decay": 4.5, "diffuse": 70, "wetLevel": -6},
                {"name": "Large Ambient", "size": 55, "decay": 5.0, "diffuse": 65, "wetLevel": -5},
                {"name": "Massive Hall", "size": 60, "decay": 6.0, "diffuse": 60, "wetLevel": -4},
            ],
            "Studios": [
                {"name": "Tight Studio", "size": 12, "decay": 0.6, "diffuse": 100, "wetLevel": -20},
                {"name": "Live Room", "size": 18, "decay": 0.9, "diffuse": 95, "wetLevel": -16},
                {"name": "Drum Room", "size": 20, "decay": 0.7, "diffuse": 100, "wetLevel": -14},
                {"name": "Vocal Booth", "size": 14, "decay": 0.5, "diffuse": 90, "wetLevel": -22},
                {"name": "String Room", "size": 28, "decay": 1.4, "diffuse": 85, "wetLevel": -12},
            ],
            "Effects": [
                {"name": "Shimmer", "size": 45, "decay": 4.0, "diffuse": 50, "wetLevel": -8, "modulation": 30},
                {"name": "Dream", "size": 55, "decay": 6.0, "diffuse": 40, "wetLevel": -6, "modulation": 50},
                {"name": "Ethereal", "size": 60, "decay": 8.0, "diffuse": 30, "wetLevel": -4, "modulation": 70},
                {"name": "Infinite", "size": 60, "decay": 10.0, "diffuse": 20, "wetLevel": -3},
                {"name": "Ghostly", "size": 50, "decay": 5.0, "diffuse": 45, "wetLevel": -7, "highCut": 4000},
            ],
        },
        "room": {
            "Small Rooms": [
                {"name": "Tiny Room", "size": 8, "decay": 0.3, "diffuse": 100, "wetLevel": -18},
                {"name": "Small Bedroom", "size": 10, "decay": 0.4, "diffuse": 95, "wetLevel": -16},
                {"name": "Closet", "size": 8, "decay": 0.2, "diffuse": 100, "wetLevel": -20},
                {"name": "Bathroom", "size": 10, "decay": 0.5, "diffuse": 90, "wetLevel": -14, "highCut": 12000},
                {"name": "Kitchen", "size": 12, "decay": 0.4, "diffuse": 85, "wetLevel": -15},
            ],
            "Medium Rooms": [
                {"name": "Living Room", "size": 18, "decay": 0.6, "diffuse": 90, "wetLevel": -14},
                {"name": "Office", "size": 16, "decay": 0.5, "diffuse": 85, "wetLevel": -16},
                {"name": "Classroom", "size": 22, "decay": 0.8, "diffuse": 80, "wetLevel": -12},
                {"name": "Conference Room", "size": 24, "decay": 0.7, "diffuse": 85, "wetLevel": -13},
                {"name": "Small Theater", "size": 26, "decay": 0.9, "diffuse": 75, "wetLevel": -11},
            ],
            "Large Rooms": [
                {"name": "Warehouse", "size": 32, "decay": 1.2, "diffuse": 70, "wetLevel": -10},
                {"name": "Gymnasium", "size": 30, "decay": 1.5, "diffuse": 65, "wetLevel": -8},
                {"name": "Auditorium", "size": 32, "decay": 1.8, "diffuse": 75, "wetLevel": -9},
                {"name": "Factory", "size": 32, "decay": 1.4, "diffuse": 60, "wetLevel": -10, "highCut": 8000},
                {"name": "Hangar", "size": 32, "decay": 2.0, "diffuse": 55, "wetLevel": -7},
            ],
            "Special": [
                {"name": "Wooden Room", "size": 20, "decay": 0.6, "diffuse": 80, "wetLevel": -14, "bassBoost": 20},
                {"name": "Concrete Room", "size": 22, "decay": 1.0, "diffuse": 90, "wetLevel": -12, "highCut": 10000},
                {"name": "Tiled Room", "size": 18, "decay": 0.8, "diffuse": 95, "wetLevel": -11, "highCut": 14000},
                {"name": "Carpeted Room", "size": 20, "decay": 0.4, "diffuse": 75, "wetLevel": -16, "highCut": 6000},
                {"name": "Glass Room", "size": 24, "decay": 1.2, "diffuse": 85, "wetLevel": -10, "highCut": 16000},
            ],
            "Vocals": [
                {"name": "Vocal Room A", "size": 16, "decay": 0.5, "diffuse": 85, "wetLevel": -15},
                {"name": "Vocal Room B", "size": 18, "decay": 0.6, "diffuse": 80, "wetLevel": -14},
                {"name": "Vocal Room C", "size": 14, "decay": 0.4, "diffuse": 90, "wetLevel": -17},
                {"name": "Vocal Ambient", "size": 22, "decay": 0.8, "diffuse": 70, "wetLevel": -12},
                {"name": "Vocal Intimate", "size": 12, "decay": 0.3, "diffuse": 95, "wetLevel": -18},
            ],
        },
        "plate": {
            "Classic": [
                {"name": "Classic Plate", "algorithm": "tank", "decay": 2.0, "dampen": 50, "wetLevel": -12},
                {"name": "Bright Plate", "algorithm": "tank", "decay": 1.5, "dampen": 30, "wetLevel": -14, "highCut": 16000},
                {"name": "Dark Plate", "algorithm": "tank", "decay": 2.5, "dampen": 70, "wetLevel": -10, "highCut": 6000},
                {"name": "Short Plate", "algorithm": "simple", "decay": 0.8, "dampen": 40, "wetLevel": -16},
                {"name": "Long Plate", "algorithm": "tank", "decay": 4.0, "dampen": 60, "wetLevel": -8},
                {"name": "Vintage Plate", "algorithm": "nested", "decay": 2.2, "dampen": 55, "wetLevel": -11},
                {"name": "Modern Plate", "algorithm": "tank", "decay": 1.8, "dampen": 35, "wetLevel": -13},
                {"name": "Lush Plate", "algorithm": "tank", "decay": 3.0, "dampen": 45, "wetLevel": -9},
            ],
        },
        "early": {
            "Programs": [
                {"name": "Abrupt Echo", "program": 0, "size": 20, "wetLevel": -14},
                {"name": "Backstage Pass", "program": 1, "size": 35, "wetLevel": -12},
                {"name": "Concert Venue", "program": 2, "size": 50, "wetLevel": -10},
                {"name": "Damaged Goods", "program": 3, "size": 25, "wetLevel": -15},
                {"name": "Elevator Pitch", "program": 4, "size": 15, "wetLevel": -18},
                {"name": "Floor Thirteen", "program": 5, "size": 40, "wetLevel": -11},
                {"name": "Garage Band", "program": 6, "size": 22, "wetLevel": -13},
                {"name": "Home Studio", "program": 7, "size": 18, "wetLevel": -16},
            ],
        },
    }

    @router.get("/status")
    async def get_dragonfly_status():
        """Get Dragonfly reverb status with real-time audio levels."""
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("dragonfly")

        # Build preset list for current variant
        variant = _dragonfly_state["variant"]
        presets = []
        if variant in FACTORY_PRESETS:
            for bank, bank_presets in FACTORY_PRESETS[variant].items():
                for preset in bank_presets:
                    presets.append({
                        "name": preset["name"],
                        "bank": bank,
                        "variant": variant
                    })

        return {
            **_dragonfly_state,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
            "availablePresets": presets,
            "earlyPrograms": EARLY_PROGRAMS,
        }

    @router.post("/set-variant/{variant}")
    async def set_dragonfly_variant(variant: str):
        """Set reverb variant (hall/room/plate/early)."""
        if variant not in VARIANTS:
            raise HTTPException(status_code=400, detail=f"Invalid variant. Must be one of: {VARIANTS}")
        _dragonfly_state["variant"] = variant
        _dragonfly_state["currentPreset"] = None
        _dragonfly_state["currentBank"] = None
        return {"status": "ok", "variant": variant}

    # === Common Parameter Endpoints ===

    @router.post("/set-dry-level/{value}")
    async def set_dry_level(value: float):
        """Set dry level in dB (-80 to 0)."""
        if not -80 <= value <= 0:
            raise HTTPException(status_code=400, detail="Dry level must be between -80 and 0 dB")
        _dragonfly_state["dryLevel"] = value
        return {"status": "ok", "dryLevel": value}

    @router.post("/set-wet-level/{value}")
    async def set_wet_level(value: float):
        """Set wet level in dB (-80 to 0)."""
        if not -80 <= value <= 0:
            raise HTTPException(status_code=400, detail="Wet level must be between -80 and 0 dB")
        _dragonfly_state["wetLevel"] = value
        return {"status": "ok", "wetLevel": value}

    @router.post("/set-width/{value}")
    async def set_width(value: float):
        """Set stereo width (50-150%)."""
        if not 50 <= value <= 150:
            raise HTTPException(status_code=400, detail="Width must be between 50 and 150%")
        _dragonfly_state["width"] = value
        return {"status": "ok", "width": value}

    @router.post("/set-predelay/{value}")
    async def set_predelay(value: float):
        """Set pre-delay in ms (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Pre-delay must be between 0 and 100 ms")
        _dragonfly_state["predelay"] = value
        return {"status": "ok", "predelay": value}

    @router.post("/set-decay/{value}")
    async def set_decay(value: float):
        """Set decay time in seconds (0.1-10)."""
        if not 0.1 <= value <= 10:
            raise HTTPException(status_code=400, detail="Decay must be between 0.1 and 10 seconds")
        _dragonfly_state["decay"] = value
        return {"status": "ok", "decay": value}

    @router.post("/set-low-cut/{value}")
    async def set_low_cut(value: float):
        """Set low cut frequency in Hz (0-200)."""
        if not 0 <= value <= 200:
            raise HTTPException(status_code=400, detail="Low cut must be between 0 and 200 Hz")
        _dragonfly_state["lowCut"] = value
        return {"status": "ok", "lowCut": value}

    @router.post("/set-high-cut/{value}")
    async def set_high_cut(value: float):
        """Set high cut frequency in Hz (1000-16000)."""
        if not 1000 <= value <= 16000:
            raise HTTPException(status_code=400, detail="High cut must be between 1000 and 16000 Hz")
        _dragonfly_state["highCut"] = value
        return {"status": "ok", "highCut": value}

    # === Hall/Room Shared Parameters ===

    @router.post("/set-size/{value}")
    async def set_size(value: float):
        """Set room size in meters. Hall: 10-60, Room: 8-32, Early: 10-60."""
        variant = _dragonfly_state["variant"]
        if variant == "room":
            if not 8 <= value <= 32:
                raise HTTPException(status_code=400, detail="Size must be between 8 and 32 meters for Room")
        elif variant in ["hall", "early"]:
            if not 10 <= value <= 60:
                raise HTTPException(status_code=400, detail="Size must be between 10 and 60 meters")
        else:
            raise HTTPException(status_code=400, detail="Size parameter not available for Plate variant")
        _dragonfly_state["size"] = value
        return {"status": "ok", "size": value}

    @router.post("/set-diffuse/{value}")
    async def set_diffuse(value: float):
        """Set diffusion amount (0-100%)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Diffuse must be between 0 and 100%")
        _dragonfly_state["diffuse"] = value
        return {"status": "ok", "diffuse": value}

    @router.post("/set-spin/{value}")
    async def set_spin(value: float):
        """Set spin rate in Hz. Hall: 0-10, Room: 0-5."""
        variant = _dragonfly_state["variant"]
        max_spin = 10 if variant == "hall" else 5
        if not 0 <= value <= max_spin:
            raise HTTPException(status_code=400, detail=f"Spin must be between 0 and {max_spin} Hz")
        _dragonfly_state["spin"] = value
        return {"status": "ok", "spin": value}

    @router.post("/set-wander/{value}")
    async def set_wander(value: float):
        """Set wander amount (0-100%)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Wander must be between 0 and 100%")
        _dragonfly_state["wander"] = value
        return {"status": "ok", "wander": value}

    # === Hall-Specific Parameters ===

    @router.post("/set-early-level/{value}")
    async def set_early_level(value: float):
        """Set early reflections level in dB (-80 to 0). Hall only."""
        if not -80 <= value <= 0:
            raise HTTPException(status_code=400, detail="Early level must be between -80 and 0 dB")
        _dragonfly_state["earlyLevel"] = value
        return {"status": "ok", "earlyLevel": value}

    @router.post("/set-early-send/{value}")
    async def set_early_send(value: float):
        """Set early send to late reverb (0-100%). Hall only."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Early send must be between 0 and 100%")
        _dragonfly_state["earlySend"] = value
        return {"status": "ok", "earlySend": value}

    @router.post("/set-late-level/{value}")
    async def set_late_level(value: float):
        """Set late reflections level in dB (-80 to 0). Hall only."""
        if not -80 <= value <= 0:
            raise HTTPException(status_code=400, detail="Late level must be between -80 and 0 dB")
        _dragonfly_state["lateLevel"] = value
        return {"status": "ok", "lateLevel": value}

    @router.post("/set-low-xover/{value}")
    async def set_low_xover(value: float):
        """Set low crossover frequency in Hz (50-1000). Hall only."""
        if not 50 <= value <= 1000:
            raise HTTPException(status_code=400, detail="Low crossover must be between 50 and 1000 Hz")
        _dragonfly_state["lowXover"] = value
        return {"status": "ok", "lowXover": value}

    @router.post("/set-high-xover/{value}")
    async def set_high_xover(value: float):
        """Set high crossover frequency in Hz (1000-16000). Hall only."""
        if not 1000 <= value <= 16000:
            raise HTTPException(status_code=400, detail="High crossover must be between 1000 and 16000 Hz")
        _dragonfly_state["highXover"] = value
        return {"status": "ok", "highXover": value}

    @router.post("/set-low-mult/{value}")
    async def set_low_mult(value: float):
        """Set low decay multiplier (0.5-2.5). Hall only."""
        if not 0.5 <= value <= 2.5:
            raise HTTPException(status_code=400, detail="Low multiplier must be between 0.5 and 2.5")
        _dragonfly_state["lowMult"] = value
        return {"status": "ok", "lowMult": value}

    @router.post("/set-high-mult/{value}")
    async def set_high_mult(value: float):
        """Set high decay multiplier (0.2-1.2). Hall only."""
        if not 0.2 <= value <= 1.2:
            raise HTTPException(status_code=400, detail="High multiplier must be between 0.2 and 1.2")
        _dragonfly_state["highMult"] = value
        return {"status": "ok", "highMult": value}

    @router.post("/set-modulation/{value}")
    async def set_modulation(value: float):
        """Set modulation depth (0-100%). Hall only."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Modulation must be between 0 and 100%")
        _dragonfly_state["modulation"] = value
        return {"status": "ok", "modulation": value}

    # === Room-Specific Parameters ===

    @router.post("/set-bass-boost/{value}")
    async def set_bass_boost(value: float):
        """Set bass boost amount (0-100%). Room only."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Bass boost must be between 0 and 100%")
        _dragonfly_state["bassBoost"] = value
        return {"status": "ok", "bassBoost": value}

    @router.post("/set-boost-freq/{value}")
    async def set_boost_freq(value: float):
        """Set bass boost frequency in Hz (50-1050). Room only."""
        if not 50 <= value <= 1050:
            raise HTTPException(status_code=400, detail="Boost frequency must be between 50 and 1050 Hz")
        _dragonfly_state["boostFreq"] = value
        return {"status": "ok", "boostFreq": value}

    @router.post("/set-early-damp/{value}")
    async def set_early_damp(value: float):
        """Set early reflections damping in Hz (1000-16000). Room only."""
        if not 1000 <= value <= 16000:
            raise HTTPException(status_code=400, detail="Early damp must be between 1000 and 16000 Hz")
        _dragonfly_state["earlyDamp"] = value
        return {"status": "ok", "earlyDamp": value}

    @router.post("/set-late-damp/{value}")
    async def set_late_damp(value: float):
        """Set late reflections damping in Hz (1000-16000). Room only."""
        if not 1000 <= value <= 16000:
            raise HTTPException(status_code=400, detail="Late damp must be between 1000 and 16000 Hz")
        _dragonfly_state["lateDamp"] = value
        return {"status": "ok", "lateDamp": value}

    # === Plate-Specific Parameters ===

    @router.post("/set-algorithm/{algorithm}")
    async def set_algorithm(algorithm: str):
        """Set plate algorithm (simple/nested/tank). Plate only."""
        if algorithm not in ALGORITHMS:
            raise HTTPException(status_code=400, detail=f"Invalid algorithm. Must be one of: {ALGORITHMS}")
        _dragonfly_state["algorithm"] = algorithm
        return {"status": "ok", "algorithm": algorithm}

    @router.post("/set-dampen/{value}")
    async def set_dampen(value: float):
        """Set plate damping (0-100%). Plate only."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Dampen must be between 0 and 100%")
        _dragonfly_state["dampen"] = value
        return {"status": "ok", "dampen": value}

    # === Early Reflections Parameters ===

    @router.post("/set-program/{value}")
    async def set_program(value: int):
        """Set early reflections program (0-7)."""
        if not 0 <= value <= 7:
            raise HTTPException(status_code=400, detail="Program must be between 0 and 7")
        _dragonfly_state["program"] = value
        return {"status": "ok", "program": value, "programName": EARLY_PROGRAMS[value]}

    # === Bypass and Presets ===

    @router.post("/set-bypass/{bypass}")
    async def set_bypass(bypass: bool):
        """Set bypass state."""
        _dragonfly_state["bypass"] = bypass
        return {"status": "ok", "bypass": bypass}

    @router.get("/presets")
    async def get_presets():
        """Get all available factory presets organized by variant and bank."""
        return {"presets": FACTORY_PRESETS}

    @router.get("/presets/{variant}")
    async def get_variant_presets(variant: str):
        """Get presets for a specific variant."""
        if variant not in VARIANTS:
            raise HTTPException(status_code=400, detail=f"Invalid variant. Must be one of: {VARIANTS}")
        return {"variant": variant, "presets": FACTORY_PRESETS.get(variant, {})}

    @router.post("/load-preset/{preset_name}")
    async def load_preset(preset_name: str):
        """Load a factory preset by name."""
        variant = _dragonfly_state["variant"]

        # Find the preset
        if variant not in FACTORY_PRESETS:
            raise HTTPException(status_code=404, detail=f"No presets for variant: {variant}")

        for bank, presets in FACTORY_PRESETS[variant].items():
            for preset in presets:
                if preset["name"] == preset_name:
                    # Apply preset values
                    for key, value in preset.items():
                        if key != "name" and key in _dragonfly_state:
                            _dragonfly_state[key] = value

                    _dragonfly_state["currentPreset"] = preset_name
                    _dragonfly_state["currentBank"] = bank

                    return {"status": "ok", "preset": preset_name, "bank": bank, "applied": preset}

        raise HTTPException(status_code=404, detail=f"Preset not found: {preset_name}")

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/dragonfly", tags=["dragonfly"])

    @router.get("/status")
    async def get_dragonfly_status():
        return {"available": False, "error": "Dragonfly dependencies not installed"}
