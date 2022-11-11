import { BestPracticeSummarizer } from "./Interfaces";

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
// steps using conditional visibilty (single, multi)
// graphs with honeycomb
// Check for grids with custom rowcounts
// time brushing enabled
// App insight annotations enabled
// Charts export selections (single, multi)
// filtering turned on


export const Summarizers: BestPracticeSummarizer[] =
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
