powershell -NoProfile -ExecutionPolicy Unrestricted -Command "& '%~dp0processTemplates.ps1' package"
exit /B %ERRORLEVEL%