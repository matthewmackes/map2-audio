from app.routes import plugins as plugins_route


def test_load_juce_processors_includes_delay_multi_tap_parameters():
    processors = plugins_route._load_juce_processors()  # noqa: SLF001 - targeted catalog coverage
    delay = next(item for item in processors if item["uri"] == "map2://juce/delay")
    symbols = {parameter["symbol"] for parameter in delay["parameters"]}

    assert {
        "tap1_level",
        "tap2_level",
        "tap2_ratio",
        "tap3_level",
        "tap3_ratio",
        "tap4_level",
        "tap4_ratio",
    }.issubset(symbols)
