cd /D "%~dp0"
dir
git clone https://github.com/MicrosoftDocs/%1.git %1
dir /s %1
exit 0