

find_program(NPM_COMMAND npm)


if(CMAKE_BUILD_TYPE MATCHES Debug)
    set(BUILD_REACT "echo")
    set(BUILD_REACT_ARGS Skipping react debug build)
else()
    set(BUILD_REACT npm)
    set(BUILD_REACT_ARGS run build)
endif()

set(BUILD_DIRECTORY ${PROJECT_SOURCE_DIR}/vite/dist)


add_custom_command(
    OUTPUT ${BUILD_DIRECTORY}/index.html
    COMMAND ${BUILD_REACT}
    ARGS ${BUILD_REACT_ARGS}
    WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}/vite

    DEPENDS
    # find public src *.json *.ts  -type f >/tmp/tmp.txt                    
    public/serve.json
    public/fonts/Roboto-BoldItalic.woff2
    public/fonts/Roboto-MediumItalic.woff2
    public/fonts/Roboto-Thin.woff2
    public/fonts/Roboto-LightItalic.woff2
    public/fonts/epf/epf_lul-webfont.woff
    public/fonts/epf/stylesheet.css
    public/fonts/england-hand/stylesheet.css
    public/fonts/england-hand/england-webfont.woff
    public/fonts/comforta/Comfortaa-Bold.ttf
    public/fonts/comforta/Comfortaa-Light.ttf
    public/fonts/comforta/Comfortaa-Regular.ttf
    public/fonts/Roboto-Light.woff2
    public/fonts/Roboto-BlackItalic.woff2
    public/fonts/Roboto-ThinItalic.woff2
    public/fonts/cooper/cooperhewitt-book-webfont.woff2
    public/fonts/cooper/cooperhewitt-lightitalic-webfont.woff2
    public/fonts/cooper/cooperhewitt-bookitalic-webfont.woff2
    public/fonts/cooper/cooperhewitt-semibold-webfont.woff2
    public/fonts/cooper/cooperhewitt-light-webfont.woff2
    public/fonts/LICENSE.txt
    public/fonts/Roboto-Regular.woff2
    public/fonts/Roboto-Medium.woff2
    public/fonts/Roboto-Black.woff2
    public/fonts/Roboto-Bold.woff2
    public/fonts/Roboto-Italic.woff2
    public/fonts/pirulen/stylesheet.css
    public/fonts/pirulen/pirulen_rg-webfont.woff
    public/fonts/questrial/questrial-regular-webfont.woff
    public/fonts/questrial/stylesheet.css
    public/fonts/nexa/Nexa_Free_Bold-webfont.woff
    public/fonts/nexa/stylesheet.css
    public/robots.txt
    public/css/modGui.css
    public/css/roboto.css
    public/manifest.json
    public/logo192.png
    public/img/fx_dial.svg
    public/img/fx_spatial.svg
    public/img/ic_logo.svg
    public/img/ic_navigate_next.svg
    public/img/fx_simulator.svg
    public/img/fx_lr.svg
    public/img/fx_pitch.svg
    public/img/vst.svg
    public/img/missing_thumbnail.jpg
    public/img/ic_bank.svg
    public/img/fx_utility.svg
    public/img/fx_compressor.svg
    public/img/fx_phaser.svg
    public/img/fx_delay.svg
    public/img/ic_drawer.svg
    public/img/fx_limiter.svg
    public/img/fx_mixer.svg
    public/img/fx_amplifier.svg
    public/img/edit_banks.svg
    public/img/old_delete_outline_black_24dp.svg
    public/img/fx_eq.svg
    public/img/edit_banks_white.svg
    public/img/Pi-Logo-3.svg
    public/img/fx_split_a.svg
    public/img/fx_spectral.svg
    public/img/settings_white_24dp.svg
    public/img/fx_converter.svg
    public/img/ic_presets.svg
    public/img/fx_flanger2.svg
    public/img/fx_generator.svg
    public/img/Pi-Logo-3.png
    public/img/red-light-on.png
    public/img/fx_oscillator.svg
    public/img/ic_drawer_2.svg
    public/img/ic_presets_white.svg
    public/img/fx_chorus.svg
    public/img/settings_black_24dp.svg
    public/img/footswitch_strip.png
    public/img/BlackKnob.png
    public/img/fx_analyzer.svg
    public/img/old_delete_outline_white_24dp.svg
    public/img/fx_reverb.svg
    public/img/fx_instrument.svg
    public/img/audio-output.png
    public/img/ic_drawer_2.png
    public/img/cx_mono.svg
    public/img/fx_split_b.svg
    public/img/default_album.jpg
    public/img/fx_filter_hp.svg
    public/img/fx_parametric_eq.svg
    public/img/fx_filter.svg
    public/img/fx_error.svg
    public/img/cx_stereo.svg
    public/img/fx_modulator.svg
    public/img/red-light-off.png
    public/img/delete_outline_black_24dp.svg
    public/img/fx_gate.svg
    public/img/vst.png
    public/img/fx_function.svg
    public/img/audio-input.png
    public/img/fx_terminal.svg
    public/img/fx_plugin.svg
    public/img/fx_distortion.svg
    public/img/fx_constant.svg
    public/img/cc-by.png
    public/img/fx_empty.svg
    public/img/ic_navigate_before.svg
    public/img/fx_flanger.svg
    public/var/plugin_classes.json
    public/var/uiplugins.json
    public/var/current_pedalboard.json
    public/var/config.json
    public/favicon.ico
    public/iso_codes.json
    public/logo512.png
    public/sample_lv2_plugins.json
    # The modern MAP2 web build no longer depends on the frozen legacy
    # web/src/pipedal tree. Keep only active web/vite inputs in this manifest.
    src/assets/react.svg
    src/vite-env.d.ts
    src/index.css
    src/main.tsx
    package.json
    package-lock.json
    tsconfig.app.json
    tsconfig.json
    tsconfig.node.json
    vite.config.ts

)

message(STATUS "VITE TARGET: ${BUILD_DIRECTORY}/index.html")

add_custom_target(
    ReactBuild ALL
    DEPENDS ${BUILD_DIRECTORY}/index.html
)
