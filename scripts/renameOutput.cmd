REM this will be a full name, like azure_monitor_workbook_templates-1.0.0-build.15583.tgz, and when the build/release try to unzip it, will use that full name in both the outer/inner folder names,
REM so you end up with folder names for extracted files like D:\a\r1\a\npm-publish\_azure_monitor_workbook_templates-1.0.0-build.15583.tgz_\azure_monitor_workbook_templates-1.0.0-build.15583.tar\package\en-us\workbooks... which
REM exceed various file/path operations for long template paths *inside* the workbook templates.
REM for now, rename the file to build.tgz

cd /D "%~dp0"
cd "..\output\package"

move azure_monitor_workbook_templates-*.tgz build.tgz

cd /D "%~dp0"
