# fixtures/cmake/CMakeLists.txt

cmake_minimum_required(VERSION 3.25 FATAL_ERROR)
project(demo VERSION 1.2.3 LANGUAGES CXX C)

# line comment
#[[ bracket comment
    spanning lines ]]
#[==[ leveled bracket comment ]==]

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
option(DEMO_BUILD_TESTS "Build tests" OFF)
set(SRC_LIST main.cpp util.cpp "with space.cpp")
set(ENV{CC} clang)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
elseif(CMAKE_BUILD_TYPE STREQUAL "Debug" OR DEFINED ENV{CI})
    message(STATUS "debug: ${CMAKE_BUILD_TYPE} in $ENV{HOME}")
else()
    message(WARNING "tab\there\n and \"escaped\" \\ backslash \${not_a_var}")
endif()

if(CMAKE_VERSION VERSION_LESS 3.28 AND (WIN32 OR APPLE) AND "${X}" MATCHES "^[a-z]+$")
    message(FATAL_ERROR [=[bracket argument with ${no_expand} and "quotes"]=])
endif()

add_executable(demo ${SRC_LIST})
target_include_directories(demo PRIVATE include PUBLIC $<BUILD_INTERFACE:${CMAKE_SOURCE_DIR}/inc>)
target_compile_options(demo PRIVATE
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wall -Wextra -O2>
    $<$<CONFIG:Debug>:-g3>)
target_link_libraries(demo PRIVATE fmt::fmt Threads::Threads)
set_target_properties(demo PROPERTIES OUTPUT_NAME demo_bin POSITION_INDEPENDENT_CODE ON)

foreach(item IN LISTS SRC_LIST ITEMS 1 2 3)
    list(APPEND ALL "${item}")
endforeach()

function(add_thing name)
    cmake_parse_arguments(ARG "QUIET" "TARGET" "SOURCES" ${ARGN})
    if(ARG_QUIET)
        return()
    endif()
    set(${name}_OUT "${ARG_TARGET}" PARENT_SCOPE)
endfunction()

macro(my_macro)
    message("${ARGV0} ${ARGC} @ONLY@")
endmacro()

while(i LESS 10)
    math(EXPR i "${i}+1")
endwhile()

find_package(fmt 10.0 REQUIRED CONFIG)
include(GNUInstallDirs)
install(TARGETS demo RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
add_test(NAME t1 COMMAND demo --flag=1 0x1F 3.14)
