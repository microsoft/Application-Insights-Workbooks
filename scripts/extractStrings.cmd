cd /D "%~dp0"
@echo off 
rem The following path will be hardcoded to test a single workbook file until the workbook is verified by the loc team. Eventually this will be the workbooks/cohort folder
set REL_PATH= "..\Workbooks\Storage\Overview"
set ABS_PATH=

pushd %REL_PATH%
set ABS_PATH=%CD%
popd

node extractStrings.js %ABS_PATH%