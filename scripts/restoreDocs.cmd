cd /D "%~dp0"
dir
REM grab only the master branch, no tags, simplest possible clone of the repos
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.cs-cz.git cs-cz
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.es-es.git es-es
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.de-de.git de-de
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.fr-fr.git fr-fr
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.hu-hu.git hu-hu
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.it-it.git it-it
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.ja-jp.git ja-jp
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.ko-kr.git ko-kr
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.nl-nl.git nl-nl
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.pl-pl.git pl-pl
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.pt-br.git pt-br
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.pt-pt.git pt-pt
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.ru-ru.git ru-ru
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.sv-se.git sv-se
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.tr-tr.git tr-tr
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.zh-cn.git zh-cn
git clone --single-branch --branch master --no-tags https://github.com/MicrosoftDocs/Application-Insights-Workbooks.zh-tw.git zh-tw
dir

exit /B 0