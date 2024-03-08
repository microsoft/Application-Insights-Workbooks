import { exit } from "process";
import { BestPracticeResults, SeverityLevel } from "./Interfaces";
import { flattenString, getDirectoriesRecursive, logMessage, readTemplateFile, testPath } from "./Utils";

const fs = require('fs');
const BestPractices = require('./BestPracticesAnalyzer');

function usage(message: string) {
    console.log("usage: analyzetemplates --severity:value [one or more files/folders]")
    console.log(" all .workbook files on the command line or in folders on the command line will be analyzed")
    console.log(" severity: 0=critical, 1=error, 2=warning, 3=information, 4=verbose (default). All severities below threshold will be output");
    console.log(`\n${message}`);
    process.exit(1);
}

/**
 * ============================================================
 * SCRIPT MAIN
 * ============================================================
 */
if (process.argv.length < 3) { 
    usage("invalid command line arguments");
}

const args = process.argv.slice(2);
// look for settings
const settings = args.filter(x => x.startsWith("--")).map(x => x.substring(2)).reduce( (values, thisVal) => {
    const parts = thisVal.split(":");
    values[parts[0]] = parts[1];
    return values;
}, {});

// look for severity
let severityLevel = 4;
if (settings.hasOwnProperty("severity")) {
    const sevValue = settings["severity"];
    severityLevel = parseInt(sevValue, 10);
    console.log(`Severity level explicitly set to ${severityLevel}.`);
    if (isNaN(severityLevel) || severityLevel < 0 || severityLevel > 5) {
        usage(`invalid severity level ${sevValue}.  Settings were ${JSON.stringify(settings)}`);
    }
}

const filesAndDirectories = args.filter(x=> !x.startsWith("--"));
const directories = [];
filesAndDirectories.forEach(d => {
    const exists = testPath(d); // Verify directory path
    if (!exists) {
        usage(`File/directory ${d} does not exist`);
    } else {
        directories.push( ...getDirectoriesRecursive(d));
    }
});


if (filesAndDirectories.length === 0) {
    usage("No matching files/directories found");
}


let count = 0;

const promises: Promise<BestPracticeResults>[] = [];
const files: string[] = [];
directories.forEach(f => {
    
    logMessage(`Processing file/folder ${f}...`);
    if (fs.statSync(f).isDirectory()) {
        const dirFiles = fs.readdirSync(f).filter(x => x.toLowerCase().endsWith(".workbook") || x.toLowerCase().endsWith(".json"));
        if (dirFiles || dirFiles?.length > 0) {
            files.push( ... dirFiles.map( df => f.concat("\\", df)))
        };
    } else {
        files.push(f);
    }
});

files.forEach(fullPath => {
    const content = readTemplateFile(fullPath);
    ++count;
    logMessage(`Processing file ${fullPath}...(${count})`);
    const work = BestPractices.analyzeWorkbook(content, fullPath);
    promises.push(work);
});


Promise.allSettled(promises).then(results => {
    // sum up all the answers
    let critical = 0, errors = 0, warnings = 0, infos = 0, verbose = 0;
    const failures = [];
    results.forEach(result => {
        if (result.status === "fulfilled") {
            const ruleResults = result.value.ruleResults;
            const path = result.value.filePath;
            ruleResults?.forEach( ruleResult => {
                let consoleWrite: (s) => void;
                
                switch (ruleResult.severity) {
                    case SeverityLevel.Critical:
                        ++critical;
                        consoleWrite = console.error;
                        break;
                    case SeverityLevel.Error:
                        if (severityLevel > 0) {
                            ++errors;
                            consoleWrite = console.error;
                        }
                        break;
                    case SeverityLevel.Warning:
                        if (severityLevel > 1) {
                            ++warnings;
                            consoleWrite = console.error;
                        }
                        break;
                    case SeverityLevel.Information:
                        if (severityLevel > 2) {
                            ++infos;
                            consoleWrite = console.error;
                        }
                        break;
                    default:
                        if (severityLevel > 3) {
                            ++verbose;
                            consoleWrite = console.log;
                        }
                        break;
                }

                if (consoleWrite) {
                    consoleWrite( `${path}: ${ruleResult.severity} ${ruleResult.ruleId}: ${ruleResult.message} [${ruleResult.stepName ? ("Step \"" + ruleResult.stepName + "\": ") : "" }${flattenString(ruleResult.context)}]`);
                }
            })
        } else {
            // this doesn't seem to actually work, instead you get
            //     UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function 
            //     without a catch block, or by rejecting a promise which was not handled with .catch(). 
            //     To terminate the node process on unhandled promise rejection, use the CLI flag `--unhandled-rejections=strict` (see https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode). (rejection id: 1)
            failures.push(result.reason);
        }
    });


    if (failures.length > 0) {
        console.log("--------------------------------------------------");
        console.log("FAILURES")
        console.log("--------------------------------------------------");
        failures.forEach(x => console.error(x));
    }

    console.log(`Done. Processed ${count} template(s).`);
    console.log(`    ${critical} critical errors(s).`);
    if (severityLevel > 0) {
        console.log(`    ${errors} error(s).`);
    }
    if (severityLevel > 1) {
        console.log(`    ${warnings} warning(s).`);
    }
    if (severityLevel > 2) {
        console.log(`    ${infos} informational(s).`);
    }
    if (severityLevel > 3) {
        console.log(`    ${verbose} verbose result(s).`);
    }

    // if critical or errors, exit with error as well
    if (critical + errors > 0) {
        exit(1);
    }
});


