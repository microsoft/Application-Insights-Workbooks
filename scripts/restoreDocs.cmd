cd /D "%~dp0"
dir
REM clone the new localization string-only repository
git clone --single-branch --branch main --no-tags https://github.com/microsoft/Workbooks-Localization localization
dir

exit /B 0