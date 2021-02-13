cd /D "%~dp0"

set "root=%~dp0"
set "subfolder=localization"
set "localizationrepo=%root%%subfolder%"
dir

REM clone the new localization string-only repository
git clone --single-branch --branch main --no-tags https://github.com/microsoft/Workbooks-Localization localization

REM move contents of localization folder into root, lcl files are needed in specified output location
cd /d %localizationrepo%
for /d %%i in (*) do move "%%i" "%~dp0"
    Move %localizationrepo% "%~dp0"

cd /D "%~dp0"
dir

exit /B 0