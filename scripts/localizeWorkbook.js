const fs = require('fs')

// FUNCTIONS
function testPath(path) {
    if (fs.existsSync(path)) {
        //file exists
        console.log("file exists", path);
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
        console.log(data)
        return data;
    } catch (err) {
        console.error(err)
    }
}

function extractStrings(json) {

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
    extractStrings(json);
}
