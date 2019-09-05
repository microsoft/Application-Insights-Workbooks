powershell -NoProfile -ExecutionPolicy Unrestricted -Command "& '%~dp0processTemplates.ps1'"
exit /B %ERRORLEVEL%