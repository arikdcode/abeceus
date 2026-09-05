cmake_minimum_required(VERSION 3.16)
project(sandbox LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_executable(sandbox
    src/main.cpp
    src/engine.cpp
    src/combat.cpp
    src/json_io.cpp
    src/http.cpp
    src/log.cpp
)

target_include_directories(sandbox PRIVATE src)
target_compile_definitions(sandbox PRIVATE
    SANDBOX_WEB_DIR="${CMAKE_SOURCE_DIR}/web"
)
target_compile_options(sandbox PRIVATE -Wall -Wextra -Wpedantic)

if (CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(sandbox PRIVATE -O2)
endif()
