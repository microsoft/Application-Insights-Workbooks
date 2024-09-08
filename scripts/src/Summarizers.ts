import { BestPracticeSummarizer } from "./Interfaces";

const queryTypeToDisplayName: { [n: string]: string; } = {
    ["-1"]: "sample data",
    ["0"]: "logs",
    ["1"]: "arg",
    ["2"]: "parameters",
    ["3"]: "alerts (unsupported)",
    ["4"]: "azure health",
    ["5"]: "guest health (unsupported)",
    ["6"]: "custom rp",
    ["7"]: "merge",
    ["8"]: "json",
    ["9"]: "adx",
    ["10"]: "custom endpoint",
    ["11"]: "intune",
    ["12"]: "arm",
    ["13"]: "changes",
    ["14"]: "msgraph",
    ["15"]: "permissions",
    ["16"]: "prom",
    ["17"]: "gpt",
};

const stepTypesToName: { [n: string]: string; } = { 
    "1": "text", 
    "2": "users (unsupported)", 
    "3": "query", 
    "4": "funnels (unsupported)", 
    "5": "retention (unsupported)", 
    "6": "sessions (unsupported)", 
    "7": "events (unsupported)", 
    "8": "old parameters (unsupported)", 
    "9": "parameters", 
    "10": "metrics", 
    "11": "links/actions", 
    "12": "groups",
    "13": "view repeater",
    "14": "data repeater",
    "15": "data source",
    "16": "visualization",
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


const graphTypeNames : { [n: string]: string; } = { 
    undefined: "graph",
    0: "graph",
    2: "honeycomb"
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
        id: "VIS003", //honeycombs
        valuePaths: ["$.content.graphSettings.type"],
        testPaths: ["$..items[?(@.content.chartType == -3 || @.content.visualization == \"graph\")]"], // metrics using graph
        name: "Count of graph types used", 
        valueMap: graphTypeNames,
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
    { 
        id: "PARAMS003", // parameter styles
        valuePaths: ["$.content.style"], 
        testPaths: ["$..items[?(@.type == 9)]"], 
        name: "Display style of parameter steps",
    },

];
