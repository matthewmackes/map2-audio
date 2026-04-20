"""JUCE PluginHost methods for JuceEngineService."""

from .common import *


class JucePluginHostMixin:
    """Focused JUCE engine service behavior mixed into the public service."""

    async def list_plugins(self) -> List[Dict[str, Any]]:
        """List available plugins (LV2/VST3 + hardware)"""
        if not self._engine:
            return []
        # FIX #7: Wrap blocking plugin listing in asyncio.to_thread()
        plugins = await asyncio.to_thread(self._engine.list_plugins)
        # Inject Lexicon MPX-1 as a discoverable hardware plugin (deduplicated).
        if not any((p or {}).get("uri") == LEXICON_MPX1_URI for p in plugins):
            plugins.append(build_lexicon_mpx1_plugin_descriptor())
        return plugins

    async def load_plugin(self, uri: str) -> int:
        """Load a plugin by URI, returns instance ID"""
        if not self._engine:
            return -1
        # Intercept Lexicon MPX-1 hardware plugin URI
        if uri == LEXICON_MPX1_URI and hasattr(self._engine, "load_lexicon_plugin"):
            return await self.load_lexicon_plugin()
        # FIX #7: Wrap blocking plugin loading in asyncio.to_thread()
        # Plugin loading involves disk I/O and DSP initialization - can take hundreds of ms
        return await asyncio.to_thread(self._engine.load_plugin, uri)

    async def unload_plugin(self, instance_id: int) -> bool:
        """Unload a plugin by instance ID"""
        if not self._engine:
            return False
        # Check if this is the Lexicon hardware plugin
        try:
            is_lexicon_loaded = bool(getattr(self._engine, "is_lexicon_loaded", lambda: False)())
            lexicon_instance_id = int(getattr(self._engine, "get_lexicon_instance_id", lambda: -1)())
            if is_lexicon_loaded and lexicon_instance_id == instance_id:
                return await self.unload_lexicon_plugin()
        except Exception:
            # Fall through to generic unload path.
            pass
        # FIX #7: Wrap blocking plugin unloading in asyncio.to_thread()
        return await asyncio.to_thread(self._engine.unload_plugin, instance_id)

    # ========================================
    # Lexicon MPX-1 Hardware Plugin
    # ========================================

    async def load_lexicon_plugin(self) -> int:
        """Load Lexicon MPX-1 hardware plugin. Returns instance_id."""
        if not self._engine or not hasattr(self._engine, "load_lexicon_plugin"):
            return -1
        # Singleton guard
        if hasattr(self._engine, "is_lexicon_loaded") and await asyncio.to_thread(self._engine.is_lexicon_loaded):
            return await asyncio.to_thread(self._engine.get_lexicon_instance_id)
        instance_id = await asyncio.to_thread(self._engine.load_lexicon_plugin)
        if instance_id != -1 and hasattr(self._engine, "calibrate_lexicon_latency"):
            # Auto-calibrate S/PDIF latency
            await asyncio.to_thread(self._engine.calibrate_lexicon_latency)
            logger.info(
                f"Lexicon MPX-1 loaded as instance {instance_id}, "
                f"S/PDIF latency calibrated"
            )
        return instance_id

    async def unload_lexicon_plugin(self) -> bool:
        """Unload Lexicon MPX-1 hardware plugin."""
        if not self._engine or not hasattr(self._engine, "unload_lexicon_plugin"):
            return False
        return await asyncio.to_thread(self._engine.unload_lexicon_plugin)

    async def calibrate_lexicon_latency(self) -> bool:
        """Measure S/PDIF round-trip latency via impulse response."""
        if (
            not self._engine
            or not hasattr(self._engine, "is_lexicon_loaded")
            or not hasattr(self._engine, "calibrate_lexicon_latency")
            or not await asyncio.to_thread(self._engine.is_lexicon_loaded)
        ):
            return False
        return await asyncio.to_thread(self._engine.calibrate_lexicon_latency)

    async def set_lexicon_bypass(self, bypass: bool) -> bool:
        """Set Lexicon MPX-1 bypass state."""
        if not self._engine or not hasattr(self._engine, "set_lexicon_bypass"):
            return False
        return await asyncio.to_thread(self._engine.set_lexicon_bypass, bypass)

    async def set_lexicon_mix(self, mix: float) -> bool:
        """Set Lexicon MPX-1 wet/dry mix (0.0=dry, 1.0=wet)."""
        if not self._engine or not hasattr(self._engine, "set_lexicon_mix"):
            return False
        return await asyncio.to_thread(self._engine.set_lexicon_mix, mix)

    async def set_lexicon_send_gain(self, gain_db: float) -> bool:
        """Set Lexicon MPX-1 S/PDIF send gain in dB."""
        if not self._engine or not hasattr(self._engine, "set_lexicon_send_gain"):
            return False
        return await asyncio.to_thread(self._engine.set_lexicon_send_gain, gain_db)

    async def set_lexicon_return_gain(self, gain_db: float) -> bool:
        """Set Lexicon MPX-1 S/PDIF return gain in dB."""
        if not self._engine or not hasattr(self._engine, "set_lexicon_return_gain"):
            return False
        return await asyncio.to_thread(self._engine.set_lexicon_return_gain, gain_db)

    # Pedalboard Management


    @staticmethod
    def _pedalboard_item_position(item: Dict[str, Any], fallback_index: int) -> Optional[int]:
        """Extract a stable chain position hint from a pedalboard item."""
        for key in ("position", "chain_position", "plugin_position", "slot_index", "order", "index"):
            raw = item.get(key)
            try:
                position = int(raw)
            except (TypeError, ValueError):
                continue
            if position >= 0:
                return position
        return fallback_index if fallback_index >= 0 else None

    def _get_pedalboard_matches_for_uri(self, plugin_uri: str) -> List[tuple[int, Dict[str, Any]]]:
        if not self._engine:
            return []
        pedalboard = self._engine.get_current_pedalboard()
        items = pedalboard.get("items", [])
        if not isinstance(items, list):
            return []
        return [
            (index, item)
            for index, item in enumerate(items)
            if isinstance(item, dict) and item.get("uri") == plugin_uri
        ]

    def _get_instance_id_for_uri_exact_position(
        self,
        plugin_uri: str,
        plugin_position: Optional[int] = None,
    ) -> Optional[int]:
        if not isinstance(plugin_position, int) or plugin_position < 0:
            return None
        try:
            for index, item in self._get_pedalboard_matches_for_uri(plugin_uri):
                item_position = self._pedalboard_item_position(item, index)
                if item_position == plugin_position:
                    instance_id = item.get("instance_id")
                    if isinstance(instance_id, int) and instance_id > 0:
                        return instance_id
        except Exception as e:
            logger.error(
                "Error looking up exact instance_id for %s (position=%s): %s",
                plugin_uri,
                plugin_position,
                e,
            )
        return None

    def _instance_id_matches_uri(
        self,
        plugin_uri: str,
        instance_id: Optional[int],
    ) -> bool:
        if not isinstance(instance_id, int) or instance_id <= 0:
            return False
        try:
            for _index, item in self._get_pedalboard_matches_for_uri(plugin_uri):
                if item.get("instance_id") == instance_id:
                    return True
        except Exception as e:
            logger.error(
                "Error validating instance_id for %s (instance_id=%s): %s",
                plugin_uri,
                instance_id,
                e,
            )
        return False

    def _get_instance_id_for_uri(
        self,
        plugin_uri: str,
        plugin_position: Optional[int] = None,
    ) -> Optional[int]:
        """Look up an engine instance for a plugin URI, optionally disambiguated by chain position."""
        if not self._engine:
            return None
        try:
            matches = self._get_pedalboard_matches_for_uri(plugin_uri)
            if not matches:
                return None

            if isinstance(plugin_position, int) and plugin_position >= 0:
                exact_match = self._get_instance_id_for_uri_exact_position(plugin_uri, plugin_position)
                if isinstance(exact_match, int) and exact_match > 0:
                    return exact_match

            for _index, item in matches:
                instance_id = item.get("instance_id")
                if isinstance(instance_id, int) and instance_id > 0:
                    return instance_id
        except Exception as e:
            logger.error(
                "Error looking up instance_id for %s (position=%s): %s",
                plugin_uri,
                plugin_position,
                e,
            )
        return None

    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: Optional[int] = None,
        fallback_instance_id: Optional[int] = None,
    ) -> Optional[int]:
        """Resolve a live engine instance by explicit id or URI + chain position."""
        normalized_fallback = (
            fallback_instance_id
            if isinstance(fallback_instance_id, int) and fallback_instance_id > 0
            else None
        )
        if not self._engine:
            return normalized_fallback

        exact_position_instance = await asyncio.to_thread(
            self._get_instance_id_for_uri_exact_position,
            plugin_uri,
            plugin_position,
        )
        if isinstance(exact_position_instance, int) and exact_position_instance > 0:
            return exact_position_instance

        if normalized_fallback is not None:
            fallback_matches_uri = await asyncio.to_thread(
                self._instance_id_matches_uri,
                plugin_uri,
                normalized_fallback,
            )
            if fallback_matches_uri:
                return normalized_fallback

        position_scoped_instance = await asyncio.to_thread(
            self._get_instance_id_for_uri,
            plugin_uri,
            plugin_position,
        )
        if isinstance(position_scoped_instance, int) and position_scoped_instance > 0:
            return position_scoped_instance

        return normalized_fallback

    @staticmethod
    def _runtime_item_latency_samples(item: Dict[str, Any]) -> Optional[int]:
        for key in ("latency_samples", "reported_latency_samples", "latency"):
            raw_value = item.get(key)
            try:
                latency = int(raw_value)
            except (TypeError, ValueError):
                continue
            if latency >= 0:
                return latency
        return None

    def _get_current_pedalboard_items(self) -> List[Dict[str, Any]]:
        if not self._engine:
            return []
        try:
            pedalboard = self._engine.get_current_pedalboard()
        except Exception:
            return []
        items = pedalboard.get("items", []) if isinstance(pedalboard, dict) else []
        return [item for item in items if isinstance(item, dict)]

    def _attach_runtime_identity_to_plugin_payloads(
        self,
        payloads: List[Dict[str, Any]],
        runtime_items: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        items = runtime_items if runtime_items is not None else self._get_current_pedalboard_items()
        if not items:
            return [dict(payload) for payload in payloads if isinstance(payload, dict)]

        by_uri: Dict[str, deque[tuple[int, Dict[str, Any]]]] = defaultdict(deque)
        by_instance: Dict[int, Dict[str, Any]] = {}
        by_position: Dict[tuple[str, int], Dict[str, Any]] = {}
        for index, item in enumerate(items):
            uri = item.get("uri")
            if not isinstance(uri, str) or not uri:
                continue
            by_uri[uri].append((index, item))
            instance_id = item.get("instance_id")
            if isinstance(instance_id, int) and instance_id > 0:
                by_instance[instance_id] = item
            position = self._pedalboard_item_position(item, index)
            if position is not None:
                by_position[(uri, position)] = item

        matched_runtime_indexes: set[int] = set()
        enriched: List[Dict[str, Any]] = []
        for payload_index, raw_payload in enumerate(payloads):
            if not isinstance(raw_payload, dict):
                continue
            payload = dict(raw_payload)
            uri = payload.get("uri") or payload.get("plugin_uri")
            runtime_item: Optional[Dict[str, Any]] = None

            instance_id = payload.get("instance_id")
            if isinstance(instance_id, int) and instance_id > 0:
                runtime_item = by_instance.get(instance_id)

            if runtime_item is None and isinstance(uri, str):
                raw_position = payload.get("plugin_position", payload.get("position"))
                try:
                    position = int(raw_position)
                except (TypeError, ValueError):
                    position = None
                if position is not None and position >= 0:
                    runtime_item = by_position.get((uri, position))

            if runtime_item is None and isinstance(uri, str):
                queue = by_uri.get(uri)
                while queue:
                    candidate_index, candidate_item = queue.popleft()
                    if candidate_index in matched_runtime_indexes:
                        continue
                    runtime_item = candidate_item
                    matched_runtime_indexes.add(candidate_index)
                    break

            if isinstance(runtime_item, dict):
                runtime_instance_id = runtime_item.get("instance_id")
                if isinstance(runtime_instance_id, int) and runtime_instance_id > 0:
                    payload.setdefault("instance_id", runtime_instance_id)
                runtime_position = self._pedalboard_item_position(runtime_item, payload_index)
                if runtime_position is not None:
                    payload.setdefault("position", runtime_position)
                    payload.setdefault("plugin_position", runtime_position)
                runtime_latency = self._runtime_item_latency_samples(runtime_item)
                if runtime_latency is not None:
                    payload.setdefault("latency_samples", runtime_latency)
                if runtime_item.get("name") and not payload.get("name"):
                    payload["name"] = runtime_item.get("name")

            enriched.append(payload)

        return enriched

    @staticmethod
    def _fixed_native_getter_candidates(plugin_uri: str, param_name: str) -> list[str]:
        prefix = native_fixed_processor_slug(plugin_uri)
        normalized_param = str(param_name or "").strip().lower()
        candidates = [f"get_{prefix}_{normalized_param}"]
        if normalized_param == "bypass":
            candidates.insert(0, f"is_{prefix}_bypassed")
            candidates.append(f"is_{prefix}_{normalized_param}")
        elif normalized_param == "spillover":
            candidates.insert(0, f"has_{prefix}_spillover")
            candidates.append(f"is_{prefix}_{normalized_param}")
        else:
            candidates.append(f"is_{prefix}_{normalized_param}")
        return candidates

    async def _set_fixed_native_processor_parameter(
        self,
        plugin_uri: str,
        param_name: str,
        value: float,
    ) -> Optional[bool]:
        prefix = native_fixed_processor_slug(plugin_uri)
        setter = getattr(self, f"set_{prefix}_{param_name}", None)
        if not callable(setter):
            return None

        spec = get_parameter_specs(plugin_uri).get(param_name, {})
        default_value = spec.get("default", 0.0)
        actual_value = normalized_to_actual(plugin_uri, param_name, value, default_value)
        coerced_value = coerce_actual_parameter_value(plugin_uri, param_name, actual_value)
        try:
            result = await setter(coerced_value)
        except Exception as exc:
            logger.debug(
                f"Direct fixed-native parameter set failed for {plugin_uri}.{param_name} "
                f"via {setter.__name__}: {exc}"
            )
            return False
        return True if result is None else bool(result)

    async def _get_fixed_native_processor_parameter(
        self,
        plugin_uri: str,
        param_name: str,
    ) -> Optional[float]:
        for getter_name in self._fixed_native_getter_candidates(plugin_uri, param_name):
            getter = getattr(self, getter_name, None)
            if not callable(getter):
                continue
            try:
                actual_value = await getter()
            except Exception as exc:
                logger.debug(
                    f"Direct fixed-native parameter get failed for {plugin_uri}.{param_name} "
                    f"via {getter_name}: {exc}"
                )
                return 0.0
            return actual_to_normalized(plugin_uri, param_name, actual_value)
        prefix = native_fixed_processor_slug(plugin_uri)
        get_parameters = getattr(self, f"get_{prefix}_parameters", None)
        if callable(get_parameters):
            try:
                params = await get_parameters()
            except Exception as exc:
                logger.debug(
                    f"Direct fixed-native parameter batch get failed for {plugin_uri} "
                    f"via {get_parameters.__name__}: {exc}"
                )
                return 0.0
            if isinstance(params, dict) and param_name in params:
                return actual_to_normalized(plugin_uri, param_name, params[param_name])
        return None

    async def set_parameter(
        self,
        plugin_uri: str,
        param_name: str,
        value: float,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> bool:
        """Set a plugin parameter using an explicit instance or URI plus optional chain position."""
        if not self._engine:
            logger.error("Cannot set parameter: engine not initialized")
            return False

        if is_fixed_native_processor_uri(plugin_uri):
            direct_result = await self._set_fixed_native_processor_parameter(plugin_uri, param_name, value)
            if direct_result is not None:
                return direct_result

        resolved_instance_id = instance_id
        if not isinstance(resolved_instance_id, int) or resolved_instance_id <= 0:
            resolved_instance_id = await asyncio.to_thread(
                self._get_instance_id_for_uri,
                plugin_uri,
                plugin_position,
            )

        if resolved_instance_id is None:
            logger.error("Plugin not found in chain: %s (position=%s)", plugin_uri, plugin_position)
            return False
        logger.debug(
            "Setting parameter: instance_id=%s, param=%s, value=%s, uri=%s, position=%s",
            resolved_instance_id,
            param_name,
            value,
            plugin_uri,
            plugin_position,
        )
        try:
            result = await asyncio.to_thread(
                self._engine.set_parameter_by_name,
                resolved_instance_id,
                param_name,
                value,
            )
            if not result:
                logger.error(
                    "Engine returned False for set_parameter(%s, %s, %s)",
                    resolved_instance_id,
                    param_name,
                    value,
                )
            return result
        except Exception as e:
            logger.error(f"Exception in set_parameter: {e}")
            return False

    async def set_parameter_direct(self, instance_id: int, param_name: str, value: float) -> bool:
        """Set a plugin parameter directly by instance ID"""
        if not self._engine:
            return False
        return await asyncio.to_thread(
            self._engine.set_parameter_by_name,
            instance_id,
            param_name,
            value,
        )

    def _set_parameter_batch_direct_sync(self, updates: list[tuple[int, str, float]]) -> int:
        """Apply a list of parameter updates in one worker-thread dispatch."""
        if not self._engine:
            return 0

        applied = 0
        for instance_id, param_name, value in updates:
            try:
                if self._engine.set_parameter_by_name(instance_id, param_name, value):
                    applied += 1
            except Exception:
                continue
        return applied

    async def set_parameter_batch_direct(self, updates: list[tuple[int, str, float]]) -> int:
        """Set many plugin parameters with a single threadpool hop."""
        if not self._engine or not updates:
            return 0
        return await asyncio.to_thread(self._set_parameter_batch_direct_sync, updates)

    async def get_parameter(
        self,
        plugin_uri: str,
        param_name: str,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> float:
        """Get a plugin parameter value"""
        if not self._engine:
            return 0.0

        if is_fixed_native_processor_uri(plugin_uri):
            direct_value = await self._get_fixed_native_processor_parameter(plugin_uri, param_name)
            if direct_value is not None:
                return direct_value

        resolved_instance_id = instance_id
        if not isinstance(resolved_instance_id, int) or resolved_instance_id <= 0:
            resolved_instance_id = await asyncio.to_thread(
                self._get_instance_id_for_uri,
                plugin_uri,
                plugin_position,
            )
        if resolved_instance_id is None:
            logger.error("Plugin not found in chain: %s (position=%s)", plugin_uri, plugin_position)
            return 0.0
        return await asyncio.to_thread(
            self._engine.get_parameter_by_name,
            resolved_instance_id,
            param_name,
        )

    async def set_bypass(self, instance_id: int, bypass: bool) -> bool:
        """Set plugin bypass state"""
        if not self._engine:
            return False
        return bool(await self._run_engine_call("set_bypass", instance_id, bypass, default=False))

    # Snapshot Management


    async def get_plugin_parameter(
        self,
        plugin_uri: str,
        param_index: int,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> Optional[float]:
        """Get a plugin parameter value by index with duplicate-safe instance resolution."""
        if not self._engine:
            return None

        resolved_instance_id = instance_id
        if not isinstance(resolved_instance_id, int) or resolved_instance_id <= 0:
            resolved_instance_id = await asyncio.to_thread(
                self._get_instance_id_for_uri,
                plugin_uri,
                plugin_position,
            )
        if not isinstance(resolved_instance_id, int) or resolved_instance_id <= 0:
            return None

        handler = getattr(self._engine, "get_parameter", None)
        if callable(handler):
            return float(await asyncio.to_thread(handler, resolved_instance_id, param_index))
        return None

    # MIDI Learn (JUCE)

    async def start_midi_learn(
        self,
        plugin_uri: str,
        param_index: int,
        *,
        chain_id: int = 0,
        plugin_position: Optional[int] = None,
        param_symbol: str = "",
        min_val: float = 0.0,
        max_val: float = 1.0,
        curve: str = "linear",
    ) -> bool:
        """Start MIDI learn mode for a parameter via JUCE"""
        if not self._engine:
            return False
        handler = getattr(self._engine, "midi_start_learn", None)
        if callable(handler):
            instance_id = await asyncio.to_thread(self._get_instance_id_for_uri, plugin_uri, plugin_position)
            if not isinstance(instance_id, int) or instance_id <= 0:
                logger.warning(
                    "Cannot start MIDI learn: plugin not resolved for %s (position=%s)",
                    plugin_uri,
                    plugin_position,
                )
                return False
            await asyncio.to_thread(
                handler,
                int(chain_id or 0),
                instance_id,
                param_symbol or "",
                param_index,
                min_val,
                max_val,
                curve,
            )
            return True
        try:
            return bool(await self._run_engine_call("start_midi_learn", plugin_uri, param_index, default=False))
        except AttributeError:
            logger.warning("JUCE engine does not support start_midi_learn")
            return False

    async def stop_midi_learn(self) -> bool:
        """Stop MIDI learn mode via JUCE"""
        if not self._engine:
            return False
        handler = getattr(self._engine, "midi_stop_learn", None)
        if callable(handler):
            await asyncio.to_thread(handler)
            return True
        try:
            return bool(await self._run_engine_call("stop_midi_learn", default=False))
        except AttributeError:
            return False

    async def is_midi_learning(self) -> bool:
        """Check if MIDI learn is active via JUCE"""
        if not self._engine:
            return False
        handler = getattr(self._engine, "midi_is_learning", None)
        if callable(handler):
            return bool(await asyncio.to_thread(handler))
        try:
            return bool(await self._run_engine_call("is_midi_learning", default=False))
        except AttributeError:
            return False

    async def get_midi_learn_status(self) -> Dict[str, Any]:
        """Get MIDI learn status from JUCE"""
        if not self._engine:
            return {"active": False, "target_plugin": None, "target_param": None}
        active_handler = getattr(self._engine, "midi_is_learning", None)
        target_handler = getattr(self._engine, "midi_get_learn_target", None)
        if callable(active_handler) and callable(target_handler):
            active = bool(await asyncio.to_thread(active_handler))
            target = dict(await asyncio.to_thread(target_handler)) if active else {}
            return {"active": active, "target": target}
        try:
            return await self._run_engine_call(
                "get_midi_learn_status",
                default={"active": False, "target_plugin": None, "target_param": None},
            )
        except AttributeError:
            return {"active": False, "target_plugin": None, "target_param": None}

    # VU Meters


    async def list_vst3_plugins(self) -> List[Dict[str, Any]]:
        """List VST3 plugins"""
        if not self._engine:
            return []
        return await asyncio.to_thread(self._engine.list_vst3_plugins)

    async def list_au_plugins(self) -> List[Dict[str, Any]]:
        """List AudioUnit plugins"""
        if not self._engine:
            return []
        return await asyncio.to_thread(self._engine.list_au_plugins)

    async def list_lv2_plugins(self) -> List[Dict[str, Any]]:
        """List LV2 plugins"""
        if not self._engine:
            return []
        return await asyncio.to_thread(self._engine.list_lv2_plugins)

    async def list_all_plugins(self) -> List[Dict[str, Any]]:
        """List all plugins across all formats (alias used by /api/plugins/all route)."""
        return await self.list_plugins()

    async def scan_for_plugins(self, rescan_all: bool = False) -> None:
        """Scan for available plugins"""
        if self._engine:
            await asyncio.to_thread(self._engine.scan_for_plugins, rescan_all)

    async def scan_plugins(self, format: str = None) -> None:
        """Scan for plugins (route-compatible alias); format ignored — engine scans all."""
        await self.scan_for_plugins(rescan_all=True)

    async def get_plugin_scan_status(self) -> dict:
        """Return plugin scan status."""
        return {"is_scanning": False, "progress": 0.0, "current_path": "", "total_found": 0, "errors": []}

    # System Info


    async def set_delay_time_l(self, ms: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_time_l, ms)

    async def set_delay_time_r(self, ms: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_time_r, ms)

    async def set_delay_feedback(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_feedback, percent)

    async def set_delay_mix(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_mix, percent)

    async def set_delay_tempo(self, bpm: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tempo, bpm)

    async def set_delay_tempo_sync_l(self, division: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tempo_sync_l, division)

    async def set_delay_tempo_sync_r(self, division: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tempo_sync_r, division)

    async def set_delay_tap1_level(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tap1_level, percent)

    async def set_delay_tap2_level(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tap2_level, percent)

    async def set_delay_tap2_ratio(self, ratio: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tap2_ratio, ratio)

    async def set_delay_tap3_level(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tap3_level, percent)

    async def set_delay_tap3_ratio(self, ratio: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tap3_ratio, ratio)

    async def set_delay_tap4_level(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tap4_level, percent)

    async def set_delay_tap4_ratio(self, ratio: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_tap4_ratio, ratio)

    async def set_delay_stereo_mode(self, mode: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_stereo_mode, mode)

    async def set_delay_stereo_spread(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_stereo_spread, percent)

    async def set_delay_pan(self, pan: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_pan, pan)

    async def set_delay_mod_rate(self, hz: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_mod_rate, hz)

    async def set_delay_mod_depth(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_mod_depth, percent)

    async def set_delay_mod_waveform(self, waveform: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_mod_waveform, waveform)

    async def set_delay_low_cut(self, hz: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_low_cut, hz)

    async def set_delay_high_cut(self, hz: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_high_cut, hz)

    async def set_delay_filter_in_loop(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_filter_in_loop, enabled)

    async def set_delay_diffusion(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_diffusion, percent)

    async def set_delay_duck_threshold(self, db: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_duck_threshold, db)

    async def set_delay_duck_amount(self, percent: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_duck_amount, percent)

    async def set_delay_duck_release(self, ms: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_duck_release, ms)

    async def set_delay_output_level(self, db: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_output_level, db)

    async def set_delay_spillover(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_spillover, enabled)

    async def has_delay_spillover(self) -> bool:
        if not self._engine:
            return True
        return bool(await asyncio.to_thread(self._engine.has_delay_spillover))

    async def stage_delay_spillover(self) -> bool:
        if not self._engine or not hasattr(self._engine, "stage_delay_spillover"):
            return False
        return bool(await asyncio.to_thread(self._engine.stage_delay_spillover))

    async def set_delay_bypass(self, bypass: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_delay_bypass, bypass)

    async def is_delay_bypassed(self) -> bool:
        if not self._engine:
            return False
        return bool(await asyncio.to_thread(self._engine.is_delay_bypassed))

    async def get_delay_parameters(self) -> Dict[str, Any]:
        if not self._engine:
            return {
                "delay_time_l": 500.0,
                "delay_time_r": 500.0,
                "feedback": 30.0,
                "mix": 50.0,
                "tempo": 120.0,
                "tempo_sync_l": 0,
                "tempo_sync_r": 0,
                "tap1_level": 100.0,
                "tap2_level": 0.0,
                "tap2_ratio": 0.5,
                "tap3_level": 0.0,
                "tap3_ratio": 0.33,
                "tap4_level": 0.0,
                "tap4_ratio": 0.25,
                "stereo_mode": 1,
                "stereo_spread": 100.0,
                "pan": 0.0,
                "mod_rate": 0.5,
                "mod_depth": 0.0,
                "mod_waveform": 0,
                "low_cut": 20.0,
                "high_cut": 12000.0,
                "filter_in_loop": True,
                "diffusion": 0.0,
                "duck_threshold": -20.0,
                "duck_amount": 0.0,
                "duck_release": 200.0,
                "output_level": 0.0,
                "spillover": True,
                "bypass": False,
            }
        return dict(await asyncio.to_thread(self._engine.get_delay_parameters))

    async def get_delay_metering(self) -> Dict[str, float]:
        if not self._engine:
            return {
                "input_level_l": -100.0,
                "input_level_r": -100.0,
                "output_level_l": -100.0,
                "output_level_r": -100.0,
                "delay_level_l": -100.0,
                "delay_level_r": -100.0,
                "ducking_gain": 0.0,
                "mod_phase": 0.0,
            }
        return dict(await asyncio.to_thread(self._engine.get_delay_metering))

    async def get_delay_effective_times(self) -> Dict[str, float]:
        params = await self.get_delay_parameters()
        bpm = float(params.get("tempo", 120.0) or 120.0)
        divisions = (
            0.0,
            4.0,
            2.0,
            1.0,
            0.5,
            0.25,
            0.125,
            6.0,
            3.0,
            1.5,
            0.75,
            0.375,
            2.667,
            1.333,
            0.667,
            0.333,
            0.167,
        )

        def _effective_time(delay_key: str, sync_key: str) -> float:
            division = int(params.get(sync_key, 0) or 0)
            if division <= 0 or division >= len(divisions) or bpm <= 0.0:
                return float(params.get(delay_key, 0.0) or 0.0)
            return float(divisions[division] * 60000.0 / bpm)

        return {
            "delay_time_l": _effective_time("delay_time_l", "tempo_sync_l"),
            "delay_time_r": _effective_time("delay_time_r", "tempo_sync_r"),
        }

    # ========================================
    # Boss XS-1 Polyphonic Pitch Shifter (NEW)
    # ========================================

    async def set_boss_xs1_shift_amount(self, semitones: float) -> None:
        """Set Boss XS-1 pitch shift amount in semitones (-7 to +7)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_shift_amount, semitones)

    async def get_boss_xs1_shift_amount(self) -> float:
        """Get Boss XS-1 pitch shift amount"""
        if not self._engine:
            return 0.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_shift_amount)

    async def set_boss_xs1_balance(self, percent: float) -> None:
        """Set Boss XS-1 wet/dry balance (0-100%)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_balance, percent)

    async def get_boss_xs1_balance(self) -> float:
        """Get Boss XS-1 balance"""
        if not self._engine:
            return 50.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_balance)

    async def set_boss_xs1_detune_mode(self, enabled: bool) -> None:
        """Enable Boss XS-1 detune mode"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_detune_mode, enabled)

    async def is_boss_xs1_detune_mode(self) -> bool:
        """Check if Boss XS-1 is in detune mode"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.is_boss_xs1_detune_mode)

    async def set_boss_xs1_detune_amount(self, cents: float) -> None:
        """Set Boss XS-1 detune amount in cents"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_detune_amount, cents)

    async def get_boss_xs1_detune_amount(self) -> float:
        """Get Boss XS-1 detune amount"""
        if not self._engine:
            return 20.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_detune_amount)

    async def set_boss_xs1_glide(self, ms: float) -> None:
        """Set Boss XS-1 glide time in ms"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_glide, ms)

    async def get_boss_xs1_glide(self) -> float:
        """Get Boss XS-1 glide time"""
        if not self._engine:
            return 0.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_glide)

    async def set_boss_xs1_feedback(self, feedback: float) -> None:
        """Set Boss XS-1 feedback (0 to 0.7)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_feedback, feedback)

    async def get_boss_xs1_feedback(self) -> float:
        """Get Boss XS-1 feedback"""
        if not self._engine:
            return 0.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_feedback)

    async def set_boss_xs1_pedal_enabled(self, enabled: bool) -> None:
        """Enable Boss XS-1 expression pedal"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_pedal_enabled, enabled)

    async def is_boss_xs1_pedal_enabled(self) -> bool:
        """Check if Boss XS-1 pedal is enabled"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.is_boss_xs1_pedal_enabled)

    async def set_boss_xs1_pedal_position(self, position: float) -> None:
        """Set Boss XS-1 pedal position (0-100%)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_pedal_position, position)

    async def get_boss_xs1_pedal_position(self) -> float:
        """Get Boss XS-1 pedal position"""
        if not self._engine:
            return 0.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_pedal_position)

    async def set_boss_xs1_pedal_range(self, min_st: float, max_st: float) -> None:
        """Set Boss XS-1 pedal range in semitones"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_pedal_range, min_st, max_st)

    async def get_boss_xs1_pedal_min(self) -> float:
        """Get Boss XS-1 pedal min"""
        if not self._engine:
            return -7.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_pedal_min)

    async def get_boss_xs1_pedal_max(self) -> float:
        """Get Boss XS-1 pedal max"""
        if not self._engine:
            return 7.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_pedal_max)

    async def set_boss_xs1_preset(self, preset_index: int) -> None:
        """Set Boss XS-1 preset by index"""
        if self._engine:
            presets = [
                "manual", "drop_d", "drop_d_sharp", "half_step_down",
                "capo_2nd_fret", "capo_3rd_fret", "capo_5th_fret",
                "octave_up", "octave_down", "octave_up_down",
                "micro_pitch_wide", "micro_pitch_narrow", "voice_doubling",
                "string_doubling", "pianist_octaves", "sub_bass",
                "sonic_screamer", "unique_intervals", "minor_third",
                "chord_shift", "detune_chorus", "spacey_vibrato", "robotic_mod"
            ]
            if 0 <= preset_index < len(presets):
                await asyncio.to_thread(self._engine.set_boss_xs1_preset, presets[preset_index])

    async def get_boss_xs1_preset(self) -> str:
        """Get Boss XS-1 current preset name"""
        if not self._engine:
            return "manual"
        return await asyncio.to_thread(self._engine.get_boss_xs1_preset)

    async def set_boss_xs1_bypass(self, bypass: bool) -> None:
        """Bypass Boss XS-1"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_bypass, bypass)

    async def is_boss_xs1_bypassed(self) -> bool:
        """Check if Boss XS-1 is bypassed"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.is_boss_xs1_bypassed)

    def _preset_name_to_index(self, preset_name: str) -> int:
        """Convert Boss XS-1 preset name to index"""
        presets = [
            "manual", "drop_d", "drop_d_sharp", "half_step_down",
            "capo_2nd_fret", "capo_3rd_fret", "capo_5th_fret",
            "octave_up", "octave_down", "octave_up_down",
            "micro_pitch_wide", "micro_pitch_narrow", "voice_doubling",
            "string_doubling", "pianist_octaves", "sub_bass",
            "sonic_screamer", "unique_intervals", "minor_third",
            "chord_shift", "detune_chorus", "spacey_vibrato", "robotic_mod"
        ]
        try:
            return presets.index(preset_name)
        except ValueError:
            return 0

    async def get_boss_xs1_parameters(self) -> Dict[str, Any]:
        """Get all Boss XS-1 parameters"""
        if not self._engine:
            return {
                "shift_amount": 0.0,
                "balance": 50.0,
                "detune_mode": False,
                "detune_amount": 20.0,
                "glide": 0.0,
                "feedback": 0.0,
                "pedal_enabled": False,
                "pedal_position": 0.0,
                "pedal_min": -7.0,
                "pedal_max": 7.0,
                "preset": 0,
                "bypass": False
            }
        params = await asyncio.to_thread(self._engine.get_boss_xs1_parameters)
        # Convert preset name to index for frontend compatibility
        if isinstance(params.get("preset"), str):
            params["preset"] = self._preset_name_to_index(params["preset"])
        return params

    async def set_boss_xs1_parameters(self, params: Dict[str, Any]) -> None:
        """Set all Boss XS-1 parameters at once"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_boss_xs1_parameters, params)

    async def get_boss_xs1_input_level(self) -> float:
        """Get Boss XS-1 input level in dB"""
        if not self._engine:
            return -100.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_input_level)

    async def get_boss_xs1_output_level(self) -> float:
        """Get Boss XS-1 output level in dB"""
        if not self._engine:
            return -100.0
        return await asyncio.to_thread(self._engine.get_boss_xs1_output_level)

    async def get_boss_xs1_metering(self) -> Dict[str, float]:
        """Get Boss XS-1 metering"""
        if not self._engine:
            return {
                "input_level": -100.0,
                "output_level": -100.0
            }
        input_level = await asyncio.to_thread(self._engine.get_boss_xs1_input_level)
        output_level = await asyncio.to_thread(self._engine.get_boss_xs1_output_level)
        return {
            "input_level": input_level,
            "output_level": output_level,
        }

    async def get_boss_xs1_presets(self) -> List[Dict[str, Any]]:
        """Get all Boss XS-1 presets"""
        if not self._engine:
            return []
        return await asyncio.to_thread(self._engine.get_boss_xs1_presets)

    # ========================================
    # ShoeGaze Multi-Effect Processor
    # ========================================

    async def set_shoegaze_atmosphere(self, percent: float) -> None:
        """Set ShoeGaze atmosphere (master dreamy control)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_atmosphere, percent)

    async def set_shoegaze_decay(self, seconds: float) -> None:
        """Set ShoeGaze reverb decay time"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_decay, seconds)

    async def set_shoegaze_shimmer(self, percent: float) -> None:
        """Set ShoeGaze shimmer amount"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_shimmer, percent)

    async def set_shoegaze_shimmer_pitch(self, semitones: float) -> None:
        """Set ShoeGaze shimmer pitch in semitones"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_shimmer_pitch, semitones)

    async def set_shoegaze_modulation(self, percent: float) -> None:
        """Set ShoeGaze chorus modulation depth"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_modulation, percent)

    async def set_shoegaze_mod_rate(self, hz: float) -> None:
        """Set ShoeGaze modulation rate in Hz"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_mod_rate, hz)

    async def set_shoegaze_drive(self, percent: float) -> None:
        """Set ShoeGaze saturation drive"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_drive, percent)

    async def set_shoegaze_delay_time(self, ms: float) -> None:
        """Set ShoeGaze delay time in ms"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_delay_time, ms)

    async def set_shoegaze_delay_feedback(self, percent: float) -> None:
        """Set ShoeGaze delay feedback"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_delay_feedback, percent)

    async def set_shoegaze_delay_mod(self, percent: float) -> None:
        """Set ShoeGaze delay modulation/BBD wobble"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_delay_mod, percent)

    async def set_shoegaze_low_cut(self, hz: float) -> None:
        """Set ShoeGaze low cut frequency"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_low_cut, hz)

    async def set_shoegaze_high_cut(self, hz: float) -> None:
        """Set ShoeGaze high cut frequency"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_high_cut, hz)

    async def set_shoegaze_mix(self, percent: float) -> None:
        """Set ShoeGaze wet/dry mix"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_mix, percent)

    async def set_shoegaze_stereo_width(self, percent: float) -> None:
        """Set ShoeGaze stereo width"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_stereo_width, percent)

    async def set_shoegaze_reverb_diffusion(self, percent: float) -> None:
        """Set ShoeGaze reverb diffusion"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_reverb_diffusion, percent)

    async def set_shoegaze_reverb_damping(self, percent: float) -> None:
        """Set ShoeGaze reverb damping"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_reverb_damping, percent)

    async def set_shoegaze_shimmer_feedback(self, percent: float) -> None:
        """Set ShoeGaze shimmer feedback"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_shimmer_feedback, percent)

    async def set_shoegaze_chorus_voices(self, voices: int) -> None:
        """Set ShoeGaze chorus voices (1-6)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_chorus_voices, voices)

    async def set_shoegaze_ducking(self, percent: float) -> None:
        """Set ShoeGaze ducking amount"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_ducking, percent)

    async def set_shoegaze_preset(self, preset_name: str) -> None:
        """Set ShoeGaze preset by name"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_preset, preset_name.lower())

    async def set_shoegaze_bypass(self, bypass: bool) -> None:
        """Set ShoeGaze bypass state"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_bypass, bypass)

    async def set_shoegaze_spillover(self, enabled: bool) -> None:
        """Set ShoeGaze spillover (reverb tails when bypassed)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_shoegaze_spillover, enabled)

    async def stage_shoegaze_spillover(self) -> bool:
        if not self._engine or not hasattr(self._engine, "stage_shoegaze_spillover"):
            return False
        return bool(await asyncio.to_thread(self._engine.stage_shoegaze_spillover))

    async def get_shoegaze_parameters(self) -> Dict[str, Any]:
        """Get all ShoeGaze parameters"""
        if not self._engine:
            return {
                "atmosphere": 50.0, "decay": 4.0, "shimmer": 25.0,
                "shimmer_pitch": 12.0, "modulation": 35.0, "mod_rate": 0.7,
                "drive": 15.0, "delay_time": 200.0, "delay_feedback": 30.0,
                "delay_mod": 20.0, "low_cut": 80.0, "high_cut": 8000.0,
                "mix": 50.0, "stereo_width": 150.0,
                "reverb_diffusion": 85.0, "reverb_damping": 40.0,
                "shimmer_feedback": 35.0, "chorus_voices": 4,
                "ducking": 20.0, "preset": "manual",
                "spillover": True, "bypass": False
            }
        params = await asyncio.to_thread(self._engine.get_shoegaze_parameters)
        return {
            "atmosphere": params.get("atmosphere", 50.0),
            "decay": params.get("decay", 4.0),
            "shimmer": params.get("shimmer", 25.0),
            "shimmer_pitch": params.get("shimmer_pitch", 12.0),
            "modulation": params.get("modulation", 35.0),
            "mod_rate": params.get("mod_rate", 0.7),
            "drive": params.get("drive", 15.0),
            "delay_time": params.get("delay_time", 200.0),
            "delay_feedback": params.get("delay_feedback", 30.0),
            "delay_mod": params.get("delay_mod", 20.0),
            "low_cut": params.get("low_cut", 80.0),
            "high_cut": params.get("high_cut", 8000.0),
            "mix": params.get("mix", 50.0),
            "stereo_width": params.get("stereo_width", 150.0),
            "reverb_diffusion": params.get("reverb_diffusion", 85.0),
            "reverb_damping": params.get("reverb_damping", 40.0),
            "shimmer_feedback": params.get("shimmer_feedback", 35.0),
            "chorus_voices": params.get("chorus_voices", 4),
            "ducking": params.get("ducking", params.get("ducking_amount", 20.0)),
            "preset": params.get("preset_name", params.get("preset", "manual")),
            "spillover": params.get("spillover", True),
            "bypass": params.get("bypass", False)
        }

    async def get_shoegaze_metering(self) -> Dict[str, float]:
        """Get ShoeGaze metering data"""
        if not self._engine:
            return {
                "input_level": -100.0, "output_level": -100.0,
                "reverb_level": -100.0, "shimmer_level": -100.0,
                "lfo_phase": 0.0, "grain_activity": 0.0,
                "ducking_reduction": 0.0, "feedback_level": -100.0,
                "saturation_level": 0.0, "stereo_correlation": 1.0,
                "cpu_load": 0.0
            }
        metering = await asyncio.to_thread(self._engine.get_shoegaze_metering)
        return {
            "input_level": metering.get("input_level", -100.0),
            "output_level": metering.get("output_level", -100.0),
            "reverb_level": metering.get("reverb_level", -100.0),
            "shimmer_level": metering.get("shimmer_level", -100.0),
            "lfo_phase": metering.get("lfo_phase", 0.0),
            "grain_activity": metering.get("grain_activity", 0.0),
            "ducking_reduction": metering.get("ducking_reduction", 0.0),
            "feedback_level": metering.get("feedback_level", -100.0),
            "saturation_level": metering.get("saturation_level", 0.0),
            "stereo_correlation": metering.get("stereo_correlation", 1.0),
            "cpu_load": metering.get("cpu_load", 0.0)
        }

    async def get_shoegaze_presets(self) -> List[Dict[str, str]]:
        """Get all ShoeGaze presets"""
        return [
            {"id": "manual", "name": "Manual", "description": "User-defined settings"},
            {"id": "loveless", "name": "Loveless", "artist": "My Bloody Valentine", "description": "Dense, gliding walls of sound"},
            {"id": "souvlaki", "name": "Souvlaki", "artist": "Slowdive", "description": "Ethereal, washy dream-pop"},
            {"id": "treasure", "name": "Treasure", "artist": "Cocteau Twins", "description": "Shimmering crystal highs"},
            {"id": "spaceage", "name": "Space Age", "artist": "Spiritualized", "description": "Expansive, evolving soundscapes"},
            {"id": "psychocandy", "name": "Psychocandy", "artist": "Jesus and Mary Chain", "description": "Feedback-drenched noise-pop"},
            {"id": "nowhere", "name": "Nowhere", "artist": "Ride", "description": "Swirling, propulsive textures"}
        ]

    # ============================================================
    # EVH Pitch Shifter / Interval Shifter
    # ============================================================

    async def set_pitch_shifter_pitch_l(self, cents: float) -> None:
        """Set pitch shifter left pitch in cents"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_pitch_shifter_pitch_l, cents)

    async def set_pitch_shifter_pitch_r(self, cents: float) -> None:
        """Set pitch shifter right pitch in cents"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_pitch_shifter_pitch_r, cents)

    async def set_pitch_shifter_delay_l(self, ms: float) -> None:
        """Set pitch shifter left delay in ms"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_pitch_shifter_delay_l, ms)

    async def set_pitch_shifter_delay_r(self, ms: float) -> None:
        """Set pitch shifter right delay in ms"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_pitch_shifter_delay_r, ms)

    async def set_pitch_shifter_feedback(self, amount: float) -> None:
        """Set pitch shifter feedback (0-0.9)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_pitch_shifter_feedback, amount)

    async def set_pitch_shifter_mix(self, percent: float) -> None:
        """Set pitch shifter mix (0-100)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_pitch_shifter_mix, percent)

    async def set_pitch_shifter_spread(self, percent: float) -> None:
        """Set pitch shifter stereo spread (0-100)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_pitch_shifter_spread, percent)

    async def set_pitch_shifter_preset(self, preset_index: int) -> None:
        """Set pitch shifter preset by index"""
        if self._engine:
            # Map index to preset name
            presets = [
                "manual", "eruption", "unchained", "little_guitars", "mean_street",
                "drop_dead_legs", "panama", "cathedral", "hot_for_teacher",
                "why_cant_this_be_love", "dreams", "finish_what_ya_started",
                "right_now", "cant_stop_lovin_you", "humans_being_outtro"
            ]
            if 0 <= preset_index < len(presets):
                await asyncio.to_thread(self._engine.set_pitch_shifter_preset, presets[preset_index])

    async def set_pitch_shifter_bypass(self, bypass: bool) -> None:
        """Set pitch shifter bypass state"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_pitch_shifter_bypass, bypass)

    async def get_pitch_shifter_parameters(self) -> Dict[str, Any]:
        """Get pitch shifter parameters"""
        if not self._engine:
            return {
                "pitch_l": 0.0, "pitch_r": 0.0,
                "delay_l": 0.0, "delay_r": 0.0,
                "feedback": 0.0, "mix": 50.0, "spread": 50.0,
                "preset": "manual", "bypass": False
            }
        params = await asyncio.to_thread(self._engine.get_pitch_shifter_parameters)
        return {
            "pitch_l": params.get("pitch_l", 0.0),
            "pitch_r": params.get("pitch_r", 0.0),
            "delay_l": params.get("delay_l", 0.0),
            "delay_r": params.get("delay_r", 0.0),
            "feedback": params.get("feedback", 0.0),
            "mix": params.get("mix", 50.0),
            "spread": params.get("spread", 50.0),
            "preset": params.get("preset", "manual"),
            "bypass": params.get("bypass", False)
        }

    async def get_pitch_shifter_metering(self) -> Dict[str, float]:
        """Get pitch shifter metering data"""
        if not self._engine:
            return {
                "input_level_l": -100.0, "input_level_r": -100.0,
                "output_level_l": -100.0, "output_level_r": -100.0,
                "pitch_l_actual": 0.0, "pitch_r_actual": 0.0
            }
        metering = await asyncio.to_thread(self._engine.get_pitch_shifter_metering)
        return {
            "input_level_l": metering.get("input_level_l", -100.0),
            "input_level_r": metering.get("input_level_r", -100.0),
            "output_level_l": metering.get("output_level_l", -100.0),
            "output_level_r": metering.get("output_level_r", -100.0),
            "pitch_l_actual": metering.get("pitch_l_actual", 0.0),
            "pitch_r_actual": metering.get("pitch_r_actual", 0.0)
        }

    async def get_pitch_shifter_presets(self) -> List[Dict[str, Any]]:
        """Get pitch shifter presets"""
        if self._engine:
            return await asyncio.to_thread(self._engine.get_pitch_shifter_presets)
        return []

    # ============================================================
    # Ultra-Harmonizer
    # ============================================================

    async def set_h3000_bypass(self, bypass: bool) -> None:
        """Set H3000 bypass state"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_bypass, bypass)

    async def set_h3000_algorithm(self, algorithm_index: int) -> None:
        """Set H3000 algorithm by index (0-9)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_algorithm, algorithm_index)

    async def set_h3000_algorithm_by_name(self, name: str) -> None:
        """Set H3000 algorithm by name"""
        if self._engine:
            # Convert name to algorithm index
            algorithms = {
                "micropitch": 0, "dual_shift": 1, "crystal_echoes": 2,
                "stereo_shift": 3, "layered_shift": 4, "swept_combs": 5,
                "stutter_shift": 6, "reverse_pitch": 7, "band_delays": 8,
                "patch_factory": 9
            }
            if name in algorithms:
                await asyncio.to_thread(self._engine.set_h3000_algorithm, algorithms[name])

    async def set_h3000_pitch_l(self, cents: float) -> None:
        """Set H3000 left pitch shift in cents (-2400 to +2400)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_pitch_l, cents)

    async def set_h3000_pitch_r(self, cents: float) -> None:
        """Set H3000 right pitch shift in cents (-2400 to +2400)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_pitch_r, cents)

    async def set_h3000_delay_l(self, ms: float) -> None:
        """Set H3000 left delay in milliseconds (0-1000)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_delay_l, ms)

    async def set_h3000_delay_r(self, ms: float) -> None:
        """Set H3000 right delay in milliseconds (0-1000)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_delay_r, ms)

    async def set_h3000_feedback(self, percent: float) -> None:
        """Set H3000 feedback amount (0-100)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_feedback, percent)

    async def set_h3000_cross_feedback(self, percent: float) -> None:
        """Set H3000 cross-channel feedback (0-100)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_cross_feedback, percent)

    async def set_h3000_mod_depth(self, percent: float) -> None:
        """Set H3000 modulation depth (0-100)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_mod_depth, percent)

    async def set_h3000_mod_rate(self, hz: float) -> None:
        """Set H3000 modulation rate in Hz (0.1-10)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_mod_rate, hz)

    async def set_h3000_low_cut(self, hz: float) -> None:
        """Set H3000 low cut frequency (20-500 Hz)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_low_cut, hz)

    async def set_h3000_high_cut(self, hz: float) -> None:
        """Set H3000 high cut frequency (2000-20000 Hz)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_high_cut, hz)

    async def set_h3000_mix(self, percent: float) -> None:
        """Set H3000 wet/dry mix (0-100)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_mix, percent)

    async def set_h3000_level_l(self, percent: float) -> None:
        """Set H3000 left output level (0-100)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_level_l, percent)

    async def set_h3000_level_r(self, percent: float) -> None:
        """Set H3000 right output level (0-100)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_level_r, percent)

    async def set_h3000_glide(self, ms: float) -> None:
        """Set H3000 pitch glide time in ms (0-1000)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_h3000_glide, ms)

    async def get_h3000_parameters(self) -> Dict[str, Any]:
        """Get all H3000 parameters"""
        if not self._engine:
            return {
                "algorithm": "micropitch", "algorithm_index": 0,
                "pitch_l": 0.0, "pitch_r": 0.0,
                "delay_l": 15.0, "delay_r": 20.0,
                "feedback": 0.0, "cross_feedback": 0.0,
                "mod_depth": 0.0, "mod_rate": 0.5,
                "low_cut": 80.0, "high_cut": 12000.0,
                "mix": 50.0, "level_l": 100.0, "level_r": 100.0,
                "glide": 0.0, "bypass": False
            }
        params = await asyncio.to_thread(self._engine.get_h3000_parameters)
        return {
            "algorithm": params.get("algorithm", "micropitch"),
            "algorithm_index": params.get("algorithm_index", 0),
            "pitch_l": params.get("pitch_l", 0.0),
            "pitch_r": params.get("pitch_r", 0.0),
            "delay_l": params.get("delay_l", 15.0),
            "delay_r": params.get("delay_r", 20.0),
            "feedback": params.get("feedback", 0.0),
            "cross_feedback": params.get("cross_feedback", 0.0),
            "mod_depth": params.get("mod_depth", 0.0),
            "mod_rate": params.get("mod_rate", 0.5),
            "low_cut": params.get("low_cut", 80.0),
            "high_cut": params.get("high_cut", 12000.0),
            "mix": params.get("mix", 50.0),
            "level_l": params.get("level_l", 100.0),
            "level_r": params.get("level_r", 100.0),
            "glide": params.get("glide", 0.0),
            "bypass": params.get("bypass", False)
        }



__all__ = ["JucePluginHostMixin"]
