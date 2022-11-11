import { BestPracticeResults, BestPracticeRuleResult, BestPracticeSummaryResult, SerializedNotebook, SeverityLevel } from "./Interfaces";
import { Rules } from "./Rules";
import { Summarizers } from "./Summarizers";
import { isEmpty, isNullOrWhitespace } from "./Utils";

const JsonPath = require('jsonpath');

function joinPath(topPath: string, path: any[]) {
    // ["$", "items", 5, "parameters", 3] => "$.items[5].parameters[3]"
    const thisPath = path.reduce( (str, at, ind) => {
        // if at is a number, wrap it in [], otherwise prepend a dot
        str += ind === 0 ? at : typeof at === "number" ? (`[${at}]`) : (`.${at}`);
        return str;
    }, "");
    if (!isNullOrWhitespace(topPath)) {
        return topPath + (thisPath.startsWith("$") ? thisPath.substr(1, thisPath.length-1) : thisPath);
    }
    return thisPath;
}

export function analyzeWorkbook(workbook: SerializedNotebook, filePath: string) : Promise<BestPracticeResults> {
    const ruleResults: BestPracticeRuleResult[] = [];

    Rules.forEach(rule => {
        try {
            // TODO: source path here needs to be tracked and combined with testpaths items below so the full path of the item is always available
            const items = rule.sourcePath ? JsonPath.query(workbook, rule.sourcePath) as any[] : [workbook];
            const paths = rule.sourcePath ? JsonPath.paths(workbook, rule.sourcePath) as any[] : [[""]];
            if (!isEmpty(items)) {
                items.forEach( (item, index) => {
                    const testItems = [];
                    const testPaths = [];
                    const topPath = joinPath("", paths[index]);
                    rule.testPaths.forEach(path => {
                        try {
                            testItems.push(... JsonPath.query(item, path));
                            testPaths.push(... JsonPath.paths(item, path).map(x => joinPath(topPath, x)));
                        } catch (ee) {
                            ruleResults.push( { 
                                ruleId: "FAIL001",
                                severity: SeverityLevel.Error,
                                message: `rule ${rule.id} testPath ${path} could not be evaluated: ${ee}`
                            });
                        }
                    });
                    const evaluatedResults = rule.evaluator(rule, workbook, item, index, testItems, testPaths);
                    if (!isEmpty(evaluatedResults)) {
                        ruleResults.push(...evaluatedResults || []);
                    }
                });
            }
        } catch (e) {
            ruleResults.push( { 
                ruleId: "FAIL000",
                severity: SeverityLevel.Error,
                message: `rule ${rule.id} could not be evaluated: ${e}`
            });
        }

    });

    const summaryResults: BestPracticeSummaryResult[] = [];

    Summarizers.forEach(rule => {
        const counts = {};
        try {
            rule.testPaths.forEach( (testPath, index) => {
                const items = JsonPath.query(workbook, testPath) as any[];
                const valuePath = rule.valuePaths[index];
                if (!isEmpty(items)) {
                    items.forEach( (item) => {
                        try {
                            const value = JsonPath.query(item, valuePath);
                            // value is always an array from jsonpath
                            if (Array.isArray(value)) {
                                const inner = value[0];
                                const mappedValue = rule.valueMap?.[inner] || inner;
                                let v = counts[mappedValue] || 0;
                                counts[mappedValue] = ++v;
                            }
                        } catch (ee) {
                            summaryResults.push( { 
                                ruleId: "FAIL002",
                                severity: SeverityLevel.Error,
                                message: `rule ${rule.id} testPath ${valuePath} could not be evaluated: ${ee}`
                            });
                        }
                    });
                }
            });

            summaryResults.push( {
                ruleId: rule.id,
                message: rule.name,
                counts: counts,
            });

        } catch (e) {
            summaryResults.push( { 
                ruleId: "FAIL000",
                severity: SeverityLevel.Error,
                counts: undefined,
                message: `rule ${rule.id} could not be evaluated: ${e}`
            });
        }
    });

    return Promise.resolve( { 
        filePath: filePath,
        ruleResults: ruleResults, 
        summarizerResults: summaryResults
    });
}
