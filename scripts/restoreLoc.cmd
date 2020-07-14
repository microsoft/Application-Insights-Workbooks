@echo off

pushd "%~dp0"

echo Preparing localization restore...

setlocal
set RepoRoot=%~dp0..\
set OutDir=%RepoRoot%out
set NUGET_PACKAGES=%RepoRoot%packages
set LocalizationXLocPkgVer=2.0.0

nuget install Localization.XLoc -Version %LocalizationXLocPkgVer% -OutputDirectory "%NUGET_PACKAGES%" -NonInteractive -Verbosity detailed
if "%errorlevel%" neq "0" (
    popd
    exit /b %errorlevel%
)

nuget install LSBuild.XLoc -OutputDirectory "%NUGET_PACKAGES%" -NonInteractive -Verbosity detailed
if "%errorlevel%" neq "0" (
    popd
    exit /b %errorlevel%
)

nuget install Localization.Languages -OutputDirectory "%NUGET_PACKAGES%" -NonInteractive -Verbosity detailed
if "%errorlevel%" neq "0" (
    popd
    exit /b %errorlevel%
)

echo Localization restore finished with exit code '%errorlevel%'.

popd
exit /b %errorlevel%
