cd /D "%~dp0"
@echo off 
rem This is the root repository folder
set REL_PATH= "..\"
set ABS_PATH=

pushd %REL_PATH%
set ABS_PATH=%CD%
popd

node generateTemplates.js %ABS_PATH% dev