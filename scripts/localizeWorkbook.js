const fs = require('fs')

// Keys to localize
const keys = [
    "json",
    "description",
    "label",
    "linkLabel",
    "preText",
    "postText",
    "title",
    "chartTitle",
    "defaultItemsText",
    "loadButtonText",
    "typeSettings"
];

// FUNCTIONS
function testPath(path) {
    if (fs.existsSync(path)) {
        //file exists
        console.log("Found file...", path);
        return true;
    } else {
        console.error("File doesn't exist");
        return false;
    }
}

function getExtension(filename) {
    const parts = filename.split('.');
    return parts[parts.length - 1];
}

function isValidFileType(extension) {
    return extension === "workbook" || extension === "cohort";
}

function openWorkbook(file) {
    try {
        const data = fs.readFileSync(file, 'utf8')
        return data;
    } catch (err) {
        console.error(err)
    }
}

function getObjects(obj) {
    var objects = [];
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) {
            continue;
        }
        if (typeof obj[i] == 'object') {
            objects = objects.concat(getObjects(obj[i]));
        } else if (keys.includes(i)) {
            objects.push(obj[i]);
        }
    }
    return objects;
}

// SCRIPT
if (!process.argv[2]) {
    console.log('Workbook path not provided. Please provide the path to the workbook to localize.');
} else {
    const filePath = process.argv[2];
    const exists = testPath(filePath);
    if (!exists) {
        return;
    }
    const ext = getExtension(filePath);
    const isValid = isValidFileType(ext);
    if (!isValid) {
        console.error("The provided path does not contain a workbook. The extension must end with .workbook or .cohort");
        return;
    }
    // Valid workbook, start read the content
    const data = openWorkbook(filePath);
    console.log(getObjects(JSON.parse(data), "version", ""));
}
