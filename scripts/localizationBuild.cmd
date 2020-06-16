@echo off

pushd "%~dp0"

echo Preparing localization build...

set RepoRoot=%~dp0..\
set OutDir=%RepoRoot%locout
set NUGET_PACKAGES=%RepoRoot%locout\.packages
set LocalizationXLocPkgVer=1.2.3

echo Running localization build...

set XLocPath=%NUGET_PACKAGES%\Localization.XLoc.%LocalizationXLocPkgVer%
set LocProject=%RepoRoot%src\LocProject.json

%XLocPath%\tools\netfx\Microsoft.Localization.XLoc.exe /f "%LocProject%"

echo Localization build finished with exit code '%errorlevel%'.

popd
exit /b %errorlevel%
