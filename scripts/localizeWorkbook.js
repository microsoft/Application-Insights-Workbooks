const fs = require('fs')

// Keys to localize. Add new keys here.
const Keys = [
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
    "typeSettings",
    "noDataMessage"
];

const Encoding = 'utf8';
const StringFileName = 'strings.json'

// FUNCTIONS
function testPath(path) {
    if (fs.existsSync(path)) {
        // file exists
        console.log("Found file...", path);
        return true;
    } else {
        console.error("File doesn't exist");
        return false;
    }
}


function isValidFileType(filename) {
    const parts = filename.split('.');
    const extension = parts[parts.length - 1];
    return extension === "workbook" || extension === "cohort";
}

function openWorkbook(file) {
    try {
        const data = fs.readFileSync(file, Encoding);
        return data;
    } catch (err) {
        console.error(err);
    }
}

function getObjects(obj, objKey, outputMap) {
    const key = (objKey || '').concat('.');
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) {
            continue;
        }
        if (typeof obj[i] == 'object') {
            getObjects(obj[i], key.concat(i), outputMap);
        } else if (Keys.includes(i)) {
            outputMap[key] = obj[i];
        }
    }
}

function writeToFile(data, path) {
    const parts = path.split('\\');
    var directoryPath = '';
    for (var i = 0; i < parts.length - 1; i++) {
        directoryPath = directoryPath.concat(parts[i], '\\');
    }
    const fullpath = directoryPath.concat(StringFileName);
    console.log(directoryPath);
    const content = JSON.stringify(data, null, "\t");
    try {
        fs.writeFileSync(fullpath, content);
        console.log("Wrote to file... ", fullpath);
        console.log("String file generated. Please check the file in.")
    } catch (e) {
        console.log("Cannot write file ", e);
    }
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

    const isValid = isValidFileType(filePath);
    if (!isValid) {
        console.error("The provided path does not contain a workbook. The extension must end with .workbook or .cohort");
        return;
    }
    // Valid workbook, start read the content
    const data = openWorkbook(filePath);
    var map = {};
    getObjects(JSON.parse(data), '', map);
    console.log(map);

    // Write new strings to file
    writeToFile(map, filePath);
}
