cd /D "%~dp0"
cd "..\output\package"
npm pack . --quiet
cd /D "%~dp0"
