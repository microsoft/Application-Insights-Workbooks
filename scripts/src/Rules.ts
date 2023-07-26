// NOTE: using the $..items syntax to get ALL things inside a thing called items!

import { BestPracticeRule, BestPracticeRuleResult, SerializedNotebook, SeverityLevel } from "./Interfaces";
import { isEmpty, isNullOrWhitespace, notNullOrUndefined } from "./Utils";

const JsonPath = require('jsonpath');

// these regexs are copied here so this file can be reused in the github as well, self contained.
/** regex for finding params in brackets, including any format specifiers, like :escape, which can be used in query steps */
const ValidSpecifierRegex = "[_a-zA-Z0-9\xA0-\uFFFF\\-\\$\\@\\.\\[\\]\\*\\?\\(\\)\\<\\>\\=\\,\\:]*";
const ValidParameterNameRegex = "[_a-zA-Z\xA0-\uFFFF][_a-zA-Z0-9\xA0-\uFFFF]*";
//const ParameterRegex = new RegExp("\{" + ValidParameterNameRegex + "(:"+ ValidSpecifierRegex + ")?\}", "g");
const OnlyParameterRegex = new RegExp("^\{" + ValidParameterNameRegex + "(:"+ ValidSpecifierRegex + ")?\}$", "g");

function resourceIdCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[]) : BestPracticeRuleResult[] {
    if (!isEmpty(pathResult)) {
        return pathResult.map( (x, i) => {
            if (typeof x === "string" && resourceIdRegex.test(x)) {

                const path = paths[i];
                const stepName = stepNameFromPath(workbook, path);

                return {
                    ruleId: rule.id,
                    severity: rule.severityLevel,
                    message: rule.name,
                    stepName: stepName,
                    context: x,
                    path: path,
                };
            }
        }).filter(notNullOrUndefined);
    }

    return [];
}

function emptyCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[]) : BestPracticeRuleResult[] {
    const name = isEmpty(pathResult) ? "" : pathResult[0];
    if (isNullOrWhitespace(name)) {
        return [{
            ruleId: rule.id,
            severity: rule.severityLevel,
            stepName: `unnamed (index ${index})`,
            message: "All steps should have nonempty step name",
            context: "",
            path: paths[0],
        }];
    }
    return [];
}

function nameCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[]) : BestPracticeRuleResult[] {
    const name = isEmpty(pathResult) ? "" : pathResult[0];
    if (!isNullOrWhitespace(name) && /^(text|query|link|group|metrics|parameters) - \d+/i.test(name)) {
        return [{
            ruleId: rule.id,
            severity: rule.severityLevel,
            stepName: name,
            message: "All steps should have non-default step name",
            context: name,
            path: paths[0],
        }];
    }
    return [];
}

function tooManyCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[], thing: string, max: number) : BestPracticeRuleResult[] {
    if (!isEmpty(pathResult) && pathResult.length > max) {
        return [{
            ruleId: rule.id,
            severity: rule.severityLevel,
            message: rule.name,
            context: `${pathResult.length} ${thing} > ${max}`,
            path: paths[0],
        }];
    }
    return [];
}

function tooLargeQueryCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[], max: number) : BestPracticeRuleResult[] {
    if (!isEmpty(pathResult)) {
        return pathResult.map( (x, i) => {
            const query = x.queryText || x.query || (x.content && x.content.query) || "";
            return {
                ruleId: rule.id,
                severity: rule.severityLevel,
                stepName: x.name,
                message: rule.name,
                context: `(${query.length} ch > ${max}) ${trimString(query)}`,
                path: paths[i],
            };
        });
    }
    return [];
}

function printQueryCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[]) : BestPracticeRuleResult[] {
    if (!isEmpty(pathResult)) {
        return pathResult.map((x, i) => {
            const query = x.queryText || x.query || (x.content && x.content.query) || "";
            // common to use print/etc with union isfuzzy=true for testing for valid table names, so don't warn on those
            if (query.includes("print ") && !query.includes("isfuzzy")) {
                return {
                    ruleId: rule.id,
                    severity: rule.severityLevel,
                    stepName: x.name,
                    message: rule.name,
                    context: trimString(query),
                    path: paths[i],
                };
            }
            return undefined;
        }).filter(notNullOrUndefined);
    }
    return [];
}


const resourceIdRegex = /(\/subscriptions\/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})/gi; 

function stepNameFromPath(workbook: SerializedNotebook, path: string) {
    // try to turn the path into a step name, that will be something like
    // $.items[10].content.items[3].content.items[2].content.gridSettings.formatters[1].formatOptions.workbookContext.templateId
    // and the name of the step there would be
    // $.items[10].content.items[3].content.items[2].name
    let stepName = "";
    try {
        const lastItems = path.lastIndexOf(".items[");
        const endOfLastItems = path.indexOf("]", lastItems);
        const namePath = path.substring(0, endOfLastItems+1) + ".name";
        stepName = JsonPath.query(workbook, namePath)[0];
    } catch (error) {
        // invalid path/etc
        console.log(error);
    }
    return stepName;
}

function baseQueryCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[], predicate: (queryText: string) => boolean) : BestPracticeRuleResult[] {
    if (!isEmpty(pathResult)) {
        return pathResult.map((x, i) => {
            const query = x.queryText || x.query || (x.content && x.content.query) || "";
            if (predicate(query)) {
                return {
                    ruleId: rule.id,
                    severity: rule.severityLevel,
                    stepName: x.name,
                    message: rule.name,
                    context: trimString(query),
                    path: paths[i],
                };
            }
            return undefined;
        }).filter(notNullOrUndefined);
    }
    return [];
}

function datatableQueryCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[]) : BestPracticeRuleResult[] {
    return baseQueryCheck(rule, workbook, entry, index, pathResult, paths, (query) => query.includes("datatable") && !query.includes("where") );
}

function parameterOnlyQueryCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[]) : BestPracticeRuleResult[] {
    return baseQueryCheck(rule, workbook, entry, index, pathResult, paths, (query) => { 
        // this should return true if the query text is ONLY a parameter, not *uses* a parameter
        return OnlyParameterRegex.test(query.trim());
    });
}

function trimString(context: string) : string {
    return isNullOrWhitespace(context) || context.length <= 100 ? context : (context.substr(0, 100) + "...");
}


function noParamLabelCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[]) : BestPracticeRuleResult[] {
    if (!isEmpty(pathResult)) {
        return pathResult.map( (x,i) => {
            return {
                ruleId: rule.id,
                severity: rule.severityLevel,
                stepName: entry.name,
                message: `param "${x.name}" does not have a label set for localization`,
                context: x.name,
                path: paths[i],
            };
        });
    }
    return [];
}

function criteriaAndValueCheck(rule:BestPracticeRule, workbook: SerializedNotebook, entry: any, index: number, pathResult: any[], paths: string[]) : BestPracticeRuleResult[] {
    if (!isEmpty(pathResult)) {
        return pathResult.map( (x,i) => {
            return {
                ruleId: rule.id,
                severity: rule.severityLevel,
                stepName: entry.name,
                message: `param "${x.name}" is a criteria parameter and has a value set in the template content`,
                context: x.name,
                path: paths[i],
            };
        });
    }
    return [];
}

function tooLargeCheck(rule:BestPracticeRule, workbook: SerializedNotebook, max: number) : BestPracticeRuleResult[] {
    try {
        // serialize the whole workbook, with 2 spaces indentation, etc
        const s = JSON.stringify(workbook, null, 2);
        if (s.length > max) {
            return [{
                severity: rule.severityLevel,
                ruleId: rule.id,
                message: rule.name,
                context: `${s.length} ch > ${max}`,
            }];
        }
    } catch (e) {
        // couldn't stringify that's even worse
        return [{
            severity: SeverityLevel.Error,
            ruleId: rule.id,
            message: "Workbook failed to stringify: " + e
        }];
    }
    return [];
}

export const Rules: BestPracticeRule[] =
[
    { 
        id: "NAME000",
        severityLevel: SeverityLevel.Information,
        sourcePath: "$..items[*]",
        name: "All steps should have non-empty names", 
        testPaths: ["$.name"],
        evaluator: emptyCheck
    },
    { 
        id: "NAME001",
        severityLevel: SeverityLevel.Information,
        sourcePath: "$..items[*]",
        name: "All steps should have non-default names", 
        testPaths: ["$.name"],
        evaluator: nameCheck
    },
    // missing param labels for loc
    { 
        id: "PARAM001",
        severityLevel: SeverityLevel.Warning,
        // type 9 == parameters, 
        sourcePath: "$..items[?(@.type == 9)]",
        name: "Parameters should have labels for localization", 
        // filters to items with no label value AND not hidden when locked
        testPaths: ["content.parameters[?(!@.label && !@.isHiddenWhenLocked)]"],
        evaluator: noParamLabelCheck
    },

    // criteria parameters with saved values
    { 
        id: "PARAM002",
        severityLevel: SeverityLevel.Warning,
        // type 9 == parameters, 
        sourcePath: "$..items[?(@.type == 9)]",
        name: "Criteria Parameters not have value in template", 
        // criteria parameters with a value set, value isn't necessary
        testPaths: ["content.parameters[?(@.criteriaData && @.value)]"],
        evaluator: criteriaAndValueCheck
    },

    { 
        id: "ARG001",
        severityLevel: SeverityLevel.Warning,
        name: "Should not have too many ARG queries (Avoid throttling)", 
        // type 3 == query, queryType 1 == ARG
        testPaths: ["$..items[?(@.type == 3 && @.content.queryType == 1)]",
                    "$..items[?(@.type == 9)].content.parameters[?(@.queryType == 1)]"],
        evaluator: (rule, wb, entry, index, result, paths) => tooManyCheck(rule, wb, entry, index, result, paths, "queries", 15) // 15 is ARG's throtte
    },
    { 
        id: "KQL001",
        severityLevel: SeverityLevel.Warning,
        name: "Should not have too many Logs queries (Avoid throttling)", 
        // type 3 == query, queryType 0 == logs
        testPaths: ["$..items[?(@.type == 3 && !@.content.queryType)]",
                    "$..items[?(@.type == 9)].content.parameters[?(!@.queryType)]"],
        evaluator: (rule, wb, entry, index, result, paths) => tooManyCheck(rule, wb, entry, index, result, paths, "queries", 40) // 45 is draft's throttle but 40 is a lot
    },
    { 
        id: "KQL002",
        severityLevel: SeverityLevel.Warning,
        name: "Very large logs query (simplify?)", 
        // type 3 == query, queryType 0 == logs
        testPaths: ["$..items[?(@.type == 3 && !@.content.queryType && @.content.query && @.content.query.length > 3000)]",
                    "$..items[?(@.type == 9)].content.parameters[?(!@.queryType &&@.query && @.query.length > 3000)]"],
        evaluator: (rule, wb, entry, index, result, paths) => tooLargeQueryCheck(rule, wb, entry, index, result, paths, 3000) // 3k is a large query text
    },
    { 
        id: "KQL003",
        severityLevel: SeverityLevel.Warning,
        name: "Avoid Logs queries just doing print (use criteria/JSON params)", 
        // type 3 == query, queryType 0 == logs
        testPaths: ["$..items[?(@.type == 3 && !@.content.queryType)]",
                    "$..items[?(@.type == 9)].content.parameters[?(!@.queryType)]"],
        evaluator: printQueryCheck
    },

    { 
        id: "KQL004",
        severityLevel: SeverityLevel.Warning,
        name: "Avoid Logs queries just doing datatable (use JSON data source instead)", 
        // type 3 == query, queryType 0 == logs
        testPaths: ["$..items[?(@.type == 3 && !@.content.queryType)]",
                    "$..items[?(@.type == 9)].content.parameters[?(!@.queryType)]"],
        evaluator: datatableQueryCheck
    },
    { 
        id: "KQL005",
        severityLevel: SeverityLevel.Warning,
        name: "Avoid Logs queries just doing parameter only queries (hard for users to edit, won't work in pins)", 
        // type 3 == query, queryType 0 == logs
        testPaths: ["$..items[?(@.type == 3 && !@.content.queryType)]",
                    "$..items[?(@.type == 9)].content.parameters[?(!@.queryType)]"],
        evaluator: parameterOnlyQueryCheck
    },    

    // TODO: text steps: avoid using html styles (use markdown instead)

    // too many steps in general
    { 
        id: "GROUPS000",
        severityLevel: SeverityLevel.Information,
        name: "Should not have too many steps without splitting into template based groups", 
        testPaths: ["$..items[*]"],
        evaluator: (rule, wb, entry, index, result, paths) => tooManyCheck(rule, wb, entry, index, result, paths, "steps", 30) // 30 is probably a reasonable average
    },

    { 
        id: "SIZE002",
        severityLevel: SeverityLevel.Warning,
        name: "Avoid overly large templates, they become hard to edit. Consider template based groups.", 
        testPaths: ["$..items[*]"],
        evaluator: (rule, wb, entry, index, result, paths) => tooManyCheck(rule, wb, entry, index, result, paths, "steps", 100) // 100 is pretty large
    },

    // too big in general, warn if over 100k of json content
    { 
        id: "SIZE000",
        severityLevel: SeverityLevel.Warning,
        name: "Overall JSON size large (Slow loading)", 
        testPaths: [], // no paths at all, evaluator doesn't look at result, only workbook
        evaluator: (rule, wb, entry, index, result, paths) => tooLargeCheck(rule, wb, 100*1000) // ~100k
    },
    { 
        id: "SIZE001",
        severityLevel: SeverityLevel.Error,
        name: "Overall JSON size very large (Slow loading)", 
        testPaths: [], // no paths at all, evaluator doesn't look at result, only workbook
        evaluator: (rule, wb, entry, index, result, paths) => tooLargeCheck(rule, wb, 500*1000) // ~500k
    },

    // Error: no resource ids
    { 
        id: "RES000",
        severityLevel: SeverityLevel.Error,
        name: "Do not use resource ids in templates (non-portable)", 
        testPaths: ["$..*"], // every element
        evaluator: resourceIdCheck,
    },
];


// TODO: more complicated rules:
// parameters marked global but then never used that way
// parameters declared but never used
// nothing downstream exports them again (could be in nested content maybe though?)