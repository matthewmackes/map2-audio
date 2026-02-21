# CMake generated Testfile for 
# Source directory: /home/mm/map2-audio/juce-engine
# Build directory: /home/mm/map2-audio/juce-engine/build-check
# 
# This file includes the relevant testing commands required for 
# testing this directory and lists subdirectories to be tested as well.
add_test([=[avb_tests]=] "/home/mm/map2-audio/juce-engine/build-check/avb_tests")
set_tests_properties([=[avb_tests]=] PROPERTIES  _BACKTRACE_TRIPLES "/home/mm/map2-audio/juce-engine/CMakeLists.txt;557;add_test;/home/mm/map2-audio/juce-engine/CMakeLists.txt;0;")
subdirs("_deps/juce-build")
subdirs("_deps/catch2-build")
