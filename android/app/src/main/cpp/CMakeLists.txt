cmake_minimum_required(VERSION 3.18.1)
project("whisper-jni" C CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Configure whisper source directory if present
set(WHISPER_DIR ${CMAKE_CURRENT_SOURCE_DIR}/whisper.cpp)

if (EXISTS ${WHISPER_DIR}/whisper.h)
    add_definitions(-DHAVE_WHISPER_CPP)
    include_directories(${WHISPER_DIR})
    
    add_library(whisper SHARED
        whisper-jni.cpp
        ${WHISPER_DIR}/whisper.cpp
        ${WHISPER_DIR}/ggml.c
    )
else()
    # Stub compilation mode when whisper.cpp sources are provided separately or dynamically
    add_library(whisper SHARED
        whisper-jni.cpp
    )
endif()

find_library(log-lib log)

target_link_libraries(whisper
    ${log-lib}
)
