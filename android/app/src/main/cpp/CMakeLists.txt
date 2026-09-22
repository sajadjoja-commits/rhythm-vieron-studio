cmake_minimum_required(VERSION 3.18.1)
project("whisper-jni" C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(WHISPER_DIR ${CMAKE_CURRENT_SOURCE_DIR}/whisper)

# Assert that real whisper.cpp and ggml sources are present; fail build if missing
if (NOT EXISTS ${WHISPER_DIR}/whisper.h OR NOT EXISTS ${WHISPER_DIR}/whisper.cpp)
    message(FATAL_ERROR "Real whisper.cpp source files are missing from ${WHISPER_DIR}! Refusing to compile stub.")
endif()

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${WHISPER_DIR}
)

add_definitions(-DGGML_USE_K_QUANTS)

# Complete real native Whisper & GGML engine sources
set(WHISPER_SOURCES
    ${WHISPER_DIR}/ggml.c
    ${WHISPER_DIR}/ggml-alloc.c
    ${WHISPER_DIR}/ggml-backend.c
    ${WHISPER_DIR}/ggml-quants.c
    ${WHISPER_DIR}/whisper.cpp
    whisper-jni.cpp
)

add_library(whisper SHARED
    ${WHISPER_SOURCES}
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(whisper
    ${log-lib}
    ${android-lib}
)

target_compile_options(whisper PRIVATE -O3 -fvisibility=default)

if (ANDROID_ABI STREQUAL "arm64-v8a")
    target_compile_options(whisper PRIVATE -march=armv8-a)
endif()
