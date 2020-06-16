@echo off

pushd "%~dp0"

echo Preparing localization build...

set RepoRoot=%~dp0
set OutDir=%RepoRoot%locout
set NUGET_PACKAGES=%RepoRoot%locout\.packages
set LocalizationXLocPkgVer=1.2.3

nuget install Localization.XLoc -Version %LocalizationXLocPkgVer% -OutputDirectory "%NUGET_PACKAGES%" -NonInteractive -Verbosity detailed -PreRelease
if "%errorlevel%" neq "0" (
    popd
    exit /b %errorlevel%
)

nuget install Localization.Languages -OutputDirectory "%NUGET_PACKAGES%" -NonInteractive -Verbosity detailed -PreRelease
if "%errorlevel%" neq "0" (
    popd
    exit /b %errorlevel%
)

popd
exit /b %errorlevel%
