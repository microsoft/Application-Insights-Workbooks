cd /D "%~dp0"
@echo off

set REL_PATH=..\output\package\en-us\Workbooks
set ABS_PATH=

rem // Save current directory and change to target directory
pushd %REL_PATH%

rem // Save value of CD variable (current directory)
set ABS_PATH=%CD%

rem // Restore original directory
popd

node localizeWorkbook.js %ABS_PATH%