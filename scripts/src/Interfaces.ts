
// inside the azure portal these would be stubbed out better
export declare type SerializedNotebook = any;
export declare type SerializedEntry = any;

// same as the ai levels so that a renderer mapping them to icon is easy to set up
export enum SeverityLevel {
    Verbose = "Verbose",
    Information = "Information",
    Warning = "Warning",
    Error = "Error",
    Critical = "Critical",
}

export interface BestPracticeSummaryResult {
    ruleId: string;
    message: string;
    
    severity?: SeverityLevel; // only output if failed
    counts?: { [n: string]: number; };
}

// iterate over items and count up various statistics
export interface BestPracticeSummarizer {
    id: string;
    name: string;
    testPaths: string[];// jsonpath narrow down to items to look at, might litearlly be "$..*" to look at every element
    valuePaths: string[];// path in that value to grab distinct values from, matches up with testpaths
    valueMap?: { [n: string]: string; }; 
}

export interface BestPracticeResults {
    filePath?: string;
    ruleResults: BestPracticeRuleResult[];
    summarizerResults: BestPracticeSummaryResult[];
}

export interface BestPracticeRuleResult {
    ruleId: string;
    message: string;
    stepName?: string;
    severity: SeverityLevel;
    context?: string;
    path?: string;
}

export interface BestPracticeRule {
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
