from app.services.plugin_profiler import PluginProfiler


def test_plugin_profiler_tracks_duplicate_uris_by_instance_id():
    profiler = PluginProfiler(sample_rate=48000, buffer_size=256)
    profiler.register_plugin("urn:test:duplicate", "Duplicate A", instance_id=101, plugin_position=0)
    profiler.register_plugin("urn:test:duplicate", "Duplicate B", instance_id=202, plugin_position=1)

    profiler.measure_end("urn:test:duplicate", 0, instance_id=101, plugin_position=0)
    profiler.measure_end("urn:test:duplicate", 0, instance_id=202, plugin_position=1)

    stats = profiler.get_all_stats()

    assert len(stats) == 2
    assert {entry["instance_id"] for entry in stats} == {101, 202}
    assert {entry["plugin_position"] for entry in stats} == {0, 1}


def test_plugin_profiler_aggregates_duplicate_uri_lookup_without_identity():
    profiler = PluginProfiler(sample_rate=48000, buffer_size=256)
    profiler.register_plugin("urn:test:duplicate", "Duplicate A", instance_id=101, plugin_position=0)
    profiler.register_plugin("urn:test:duplicate", "Duplicate B", instance_id=202, plugin_position=1)

    profiler.measure_end("urn:test:duplicate", 0, instance_id=101, plugin_position=0)
    profiler.measure_end("urn:test:duplicate", 0, instance_id=202, plugin_position=1)

    stats = profiler.get_plugin_stats("urn:test:duplicate")

    assert stats is not None
    assert stats["uri"] == "urn:test:duplicate"
    assert stats["call_count"] == 2
