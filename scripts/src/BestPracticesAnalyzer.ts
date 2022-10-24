const JsonPath = require('jsonpath');

// inside the azure portal these woud be stubbed out better
declare type SerializedNotebook = any;
declare type SerializedEntry = any;

function isEmpty(v: any) {
    return v === undefined || v === null || Array.isArray(v) && v.length === 0 || v === "";
}

function notNullOrUndefined<T>(v: T) : boolean {
    return v !== undefined && v !== null;
}

function isNullOrWhitespace(v: any) : boolean {
    return isEmpty(v) || typeof(v) === "string" && v.trim().length === 0;
}

// above: stub out better.

// same as the ai levels so that a renderer mapping them to icon is easy to set up
export enum SeverityLevel {
    Verbose = "Verbose",
    Information = "Information",
    Warning = "Warning",
    Error = "Error",
    Critical = "Critical",
}

export interface BestPracticeRuleResult {
    ruleId: string;
    message: string;
    stepName?: string;
    severity: SeverityLevel;
    context?: string;
    path?: string;
}

interface BestPracticeRule {
    id: string;
    name: string;
    severityLevel: SeverityLevel;
    /** json path to the items to use as source for the path. if null/undefined, the source is "the workbook" object */
    sourcePath?: string;
    /** 
     * the jsonpath test path applied to each of the items that was the result of source path.
     * each test path will run once, and the results unioned together, the results of this will be passed to the evaluator as pathResult */
    testPaths: string[];
    evaluator: (rule:BestPracticeRule, workbook: SerializedNotebook, entry: SerializedEntry, index: number, pathResult: any[], paths: string[]) => BestPracticeRuleResult[];
}

// these regexs are copied here so this file can be reused in the github as well, self contained.
/** regex for finding params in brackets, including any format specifiers, like :escape, which can be used in query steps */
const ValidSpecifierRegex = "[_a-zA-Z0-9\xA0-\uFFFF\\-\\$\\@\\.\\[\\]\\*\\?\\(\\)\\<\\>\\=\\,\\:]*";
const ValidParameterNameRegex = "[_a-zA-Z\xA0-\uFFFF][_a-zA-Z0-9\xA0-\uFFFF]*";
//const ParameterRegex = new RegExp("\{" + ValidParameterNameRegex + "(:"+ ValidSpecifierRegex + ")?\}", "g");
const OnlyParameterRegex = new RegExp("^\{" + ValidParameterNameRegex + "(:"+ ValidSpecifierRegex + ")?\}$", "g");


// NOTE: using the $..items syntax to get ALL things inside a thing called items!

const Rules: BestPracticeRule[] =
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

    // TODO: Queries that are doing datatable
    // TODO: Queries that are doing "range Steps from 1 to 1 step 1"

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

export interface BestPracticeSummaryResult {
    ruleId: string;
    message: string;
    
    severity?: SeverityLevel; // only output if failed
    counts?: { [n: string]: number; };
}

// iterate over items and count up various statistics
interface BestPracticeSummarizer {
    id: string;
    name: string;
    testPaths: string[];// jsonpath narrow down to items to look at, might litearlly be "$..*" to look at every element
    valuePaths: string[];// path in that value to grab distinct values from, matches up with testpaths
    valueMap?: { [n: string]: string; }; 
}

const queryTypeToDisplayName: { [n: string]: string; } = {
    ["0"]: "logs",
    ["1"]: "arg",
    ["2"]: "parameters",
    ["4"]: "azure health",
    ["7"]: "merge",
    ["6"]: "custom rp",
    ["10"]: "custom endpoint",
    ["8"]: "json",
    ["9"]: "adx",
    ["11"]: "intune",
    ["12"]: "arm",
    ["13"]: "changes",
    ["14"]: "msgraph",
    ["15"]: "permissions",
    ["16"]: "prom",
};

const stepTypesToName: { [n: string]: string; } = { 
    "1": "text", 
    "3": "query", 
    "9": "parameters", 
    "10": "metrics", 
    "11": "links/actions", 
    "12": "groups" 
};

const visualizationNames: { [n: string]: string; } = { 
    undefined: "set by query",
    "": "set by query", 
    // for the query step, they're already strings
    // metrics has them as numbers?
    "1": "barchart", 
    "2": "linechart", 
    "3": "areachart", 
    "4": "scatterchart",
    // ours are represented as numbers outside the metrics range
    "0": "table",
    "-1": "tiles",
    "-2": "map",
    "-3": "graph"
};

const parameterTypes: { [n: string]: string; } = { 
    "1": "text", 
    "2": "dropdown", 
    "3": "query", 
    "4": "time range",
    "5": "resource",
    "6": "subscription",
    "7": "resource type",
    "8": "location",
    "9": "multi-value",
    "10": "options group",
    "11": "tabs",
};

// TODO: 
// time ranges in parameters?
// styles of parameters steps
// types of actions (links, set param, etc)
// styles of actions (toolbar/tabs/links/etc)
// types of links in visualization settings
// steps using conditional visibilty
// graphs with honeycomb


const Summarizers: BestPracticeSummarizer[] =
[
    { 
        id: "STEPS001",
        testPaths: ["$..items[*]"],
        valuePaths: ["$.type"],
        name: "Count of each step type", 
        valueMap: stepTypesToName
    },
    { 
        id: "DATASOURCE001",
        testPaths: ["$..items[?(@.type == 3)]"],
        valuePaths: ["$.content.queryType"],
        name: "Count of each data source used in query steps", 
        valueMap: queryTypeToDisplayName,
    },
    { 
        id: "DATASOURCE002",
        valuePaths: ["$.queryType"], // syntax?
        testPaths: ["$..items[?(@.type == 9)].content.parameters[?(@.query)]"], // parameters that use query
        name: "Count of each data source used in parameters", 
        valueMap: queryTypeToDisplayName,
    },
    { 
        id: "DATASOURCE000",
        testPaths: ["$..items[?(@.type == 3)]", "$..items[?(@.type == 9)].content.parameters[?(@.query)]"], // parameters that use query
        valuePaths: ["$.content.queryType", "$.queryType"], // syntax?
        name: "Count of each data source used in queries OR parameters (combined)", 
        valueMap: queryTypeToDisplayName,
    },
    { 
        id: "VIS001",
        valuePaths: ["$.content.visualization"],
        testPaths: ["$..items[?(@.type == 3)]"], // query step 
        name: "Count of query visualizations used", 
        valueMap: visualizationNames,
    },
    { 
        id: "VIS002",
        valuePaths: ["$.content.chartType"],
        testPaths: ["$..items[?(@.type == 10)]"], // metrics step
        name: "Count of metrics visualizations used", 
        valueMap: { ...visualizationNames, ...{ undefined: "table" } },
    },
    { 
        id: "VIS000",
        valuePaths: ["$.content.visualization", "$.content.chartType"],
        testPaths: ["$..items[?(@.type == 3)]", "$..items[?(@.type == 10)]"], // query step and metrics step
        name: "Count of query visualizations used in queries or metrics (combined)", 
        valueMap: visualizationNames,
    },
    { 
        id: "PARAMS001",
        valuePaths: ["$.type"], 
        testPaths: ["$..items[?(@.type == 9)].content.parameters[*]"], 
        name: "Types of parameters", 
        valueMap: parameterTypes
    },
    { 
        id: "PARAMS002",
        valuePaths: ["$.isGlobal"], 
        testPaths: ["$..items[?(@.type == 9)].content.parameters[*]"], 
        name: "Global vs standard parameters",
        valueMap: { "true": "Global", "false": "Standard", "": "Standard", undefined: "Standard" }, 
    },

];

export interface BestPracticeResults {
    filePath?: string;
    ruleResults: BestPracticeRuleResult[];
    summarizerResults: BestPracticeSummaryResult[];
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