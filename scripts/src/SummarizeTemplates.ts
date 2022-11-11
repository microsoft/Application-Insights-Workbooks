import { BestPracticeResults, BestPracticeSummaryResult } from "./Interfaces";
import { forEachKey, getDirectoriesRecursive, logError, logMessage, readTemplateFile, testPath } from "./Utils";

const fs = require('fs');
const BestPractices = require('./BestPracticesAnalyzer');

function usage() {
    console.log("usage: summarizetemplates folder_path ")
    console.log(" all .workbook files inside this path will be analyzed to produce summary info")
    process.exit(1);
}

/**
 * ============================================================
 * SCRIPT MAIN
 * ============================================================
 */

const directoryPath = process.argv[2]
if (!directoryPath) { // Path to extract strings from 
    usage();
}
const exists = testPath(directoryPath); // Verify directory path
if (!exists) {
  logError("Given script argument directory does not exist", true);
}

let count = 0;
const directories = getDirectoriesRecursive(directoryPath);
const promises: Promise<BestPracticeResults>[] = [];
directories.forEach(folder => {
    logMessage(`Processing folder ${folder}...`);
    const files = fs.readdirSync(folder).filter(x => x.toLowerCase().endsWith(".workbook"));
    if (!files || files.length === 0) {
      return;
    };

    files.forEach(file => {
        const fullPath = folder.concat("\\", file);
        const content = readTemplateFile(fullPath);
        ++count;
        logMessage(`Processing file ${fullPath}...(${count})`);
        const work = BestPractices.analyzeWorkbook(content, fullPath);
        promises.push(work);
    });
})

Promise.allSettled(promises).then(results => {
    // sum up all the answers
    const failures = [];
    const totals = results.reduce((totals, result) => {
        if (result.status === "fulfilled") {
            result.value.summarizerResults.reduce((t, thisResult) => {
                // have to merge up the invidual rows in each result
                let mergedResults = t[thisResult.message];
                if (mergedResults) {
                    forEachKey(thisResult.counts, (k, count) => {
                        let mergedCount = mergedResults.counts[k] || 0;
                        mergedCount += count;
                        mergedResults.counts[k] = mergedCount;
                    })
                }
                t[thisResult.message] = mergedResults || thisResult;
                return t;
            }, totals);
        } else {
            failures.push(result.reason);
        }
        return totals;
    }, {} as { [key: string]: BestPracticeSummaryResult } );

    // for now just to-string all the summary stuff?
    forEachKey(totals, (k, result) => {
        if (Object.keys(result.counts ||[]).length > 0) {
            const title = `${result.ruleId} - ${result.message}`;
            console.log(`\n${title}`);
            console.log("-".repeat(title.length));
            // pretty print table, one pass to find max widths
            let maxName = 0;
            let maxNum = 0;
            forEachKey(result.counts, (key, value) => {
                let len = key.length;
                if (len > maxName) {
                    maxName = len;
                }
                len = value.toString().length;
                if (len > maxNum) {
                    maxNum = len;
                }
            });
            forEachKey(result.counts, (key, value) => {
                const valueStr = value.toString();
                console.log(`${key}${" ".repeat(maxName-key.length)}\t${valueStr.padStart(maxNum, " ")}\t(avg ${(value/count).toFixed(2)})`);
            }, (a, b) => b.value - a.value);
            console.log("");
        }
    });

    if (failures.length > 0) {
        console.log("--------------------------------------------------");
        console.log("FAILURES")
        console.log("--------------------------------------------------");
        failures.forEach(x => console.error(x));
    }

    console.log(`Done. Processed ${count} templates.`);
});


