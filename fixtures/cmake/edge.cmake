# fixtures/cmake/edge.cmake

message("a" "b"c)
set(X "${A_${B}}")
set(Y $<IF:$<BOOL:${Z}>,a;b,c>)
if(${X} STREQUAL "")
  message(STATUS "old-style deref in condition")
endif()
message([=[ ]] still inside ]=])
message("multi
line string")
set(Z "semi;colon;list")
set(W unquoted\ with\ escaped\ space)
IF(WIN32)
  MESSAGE("case-insensitive commands")
ENDIF()
set(${prefix}_${name} "dynamic var name")
message("${CMAKE_${lang}_COMPILER}" $ENV{PATH} $CACHE{VAR})
list(APPEND L a b c) # trailing comment
message(STATUS "# not a comment" # real comment
        "arg")
