import threading

from app.services.midi_hub import cluster_router as cluster_router_module
from app.services.midi_hub import event_list_service as event_list_service_module
from app.services.midi_hub import macros as macros_module
from app.services.midi_hub import preset_service as preset_service_module
from app.services.midi_hub import recorder as recorder_module
from app.services.midi_hub import router as router_module
from app.services.midi_hub import scheduler as scheduler_module
from app.services.midi_hub import script_engine as script_engine_module
from app.services.midi_hub import tesira_client as tesira_client_module
from app.services.midi_hub import traffic_monitor as traffic_monitor_module
from app.services.midi_hub import virtual_gpio as virtual_gpio_module


def _assert_singleton_guarded(module, attr_name: str, getter_name: str) -> None:
    original = getattr(module, attr_name)
    try:
        setattr(module, attr_name, None)
        seen: list[int] = []

        def _worker() -> None:
            seen.append(id(getattr(module, getter_name)()))

        threads = [threading.Thread(target=_worker) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=0.5)

        assert len(set(seen)) == 1
    finally:
        setattr(module, attr_name, original)


def test_midi_hub_aux_singletons_are_guarded() -> None:
    targets = [
        (preset_service_module, "_midi_hub_preset_service_singleton", "get_midi_hub_preset_service"),
        (event_list_service_module, "_midi_hub_event_list_service_singleton", "get_midi_hub_event_list_service"),
        (recorder_module, "_midi_recorder_singleton", "get_midi_recorder"),
        (script_engine_module, "_midi_script_engine_singleton", "get_midi_script_engine"),
        (macros_module, "_midi_macro_service_singleton", "get_midi_macro_service"),
        (router_module, "_midi_router_singleton", "get_midi_router"),
        (scheduler_module, "_midi_scheduler_singleton", "get_midi_scheduler"),
        (cluster_router_module, "_midi_cluster_router_singleton", "get_midi_cluster_router"),
        (tesira_client_module, "_tesira_client_singleton", "get_tesira_client"),
        (virtual_gpio_module, "_virtual_gpio_singleton", "get_virtual_gpio_service"),
        (traffic_monitor_module, "_midi_traffic_monitor_singleton", "get_midi_traffic_monitor"),
    ]

    for module, attr_name, getter_name in targets:
        _assert_singleton_guarded(module, attr_name, getter_name)
