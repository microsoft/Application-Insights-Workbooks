powershell -NoProfile -ExecutionPolicy Unrestricted -Command "& '%~dp0processTemplates.ps1' dev"
exit /B %ERRORLEVEL%