@echo off

pushd "%~dp0"

echo Preparing localization build...

setlocal

set RepoRoot=%~dp0..\
set OutDir=%RepoRoot%out
set NUGET_PACKAGES=%RepoRoot%packages
set LocalizationXLocPkgVer=2.0.0


echo Running localization build...

set XLocPath=%NUGET_PACKAGES%\Localization.XLoc.%LocalizationXLocPkgVer%
set LocProject=%RepoRoot%src\LocProject.json

dotnet "%XLocPath%\tools\netcore\Microsoft.Localization.XLoc.dll" /f "%LocProject%"

echo Localization build finished with exit code '%errorlevel%'.

popd
exit /b %errorlevel%
