var fs = require('fs'), xml2js = require('xml2js');
// Usage: https://github.com/Leonidas-from-XIV/node-xml2js
const Encoding = 'utf8';

function readFile(file) {
    return fs.readFileSync(file, Encoding);
}

function parseXMLFile(fileData) {
    xml2js.parseStringPromise(fileData /*, options */).then(function (result) {
        parseResult(result);
    })
        .catch(function (err) {
            // Failed
            console.error(err);
        });
}

function parseResult(result) {
    console.log(result);
    // language 
    const lang = result.LCX.$.TgtCul;
    console.log("Processing language: ", lang);

    // strings 
    const strings = result.LCX.Item[0].Item[0].Item
    console.log(strings);
    var locStringData = {};
    strings.forEach(entry => {
        console.log(entry);
        parseStringEntry(entry, locStringData);
    });
    
    console.log("Done");
    const translatedJSON =  replaceText(locStringData);
    writeResultToFile(translatedJSON, "fr");

}

/** Write file as new workbook  */
function writeResultToFile(data, lang) {
    const workbookdir = "C:\\src\\Application-Insights-Workbooks\\Workbooks\\Azure Monitor - Getting Started\\Resource Picker\\loc\\fr";
    const workbookname = "Resource Picker.workbook";
    const fullpath = workbookdir.concat("\\", workbookname);
    const content = JSON.stringify(data, null, "\t");
    try {
    if (!fs.existsSync(workbookdir)) {
        fs.mkdirSync(workbookdir, { recursive: true });
    }
      fs.writeFileSync(fullpath, content);
      console.log(">>>>> Wrote to file: ", fullpath);
    } catch (e) {
      console.error("Cannot write to file: ", fullpath, "ERROR: ", e);
    }
  }
  

function parseStringEntry(entry, locStringData) {
    var itemId = entry.$.ItemId;

    // strings always start with ; so get rid of the first char
    itemId = itemId.substring(1);
    const originalEngText = entry.Str[0].Val[0];
    const translatedText = entry.Str[0].Tgt[0].Val[0];
    console.log(itemId, originalEngText, translatedText);

    locStringData[itemId] = {};
    locStringData[itemId]["eng"] = originalEngText; // TODO: better name?
    locStringData[itemId]["val"] = translatedText;
}

function replaceText(stringMap) {
    const templateFile = "C:\\src\\Application-Insights-Workbooks\\Workbooks\\Azure Monitor - Getting Started\\Resource Picker\\Resource Picker.workbook";
    const data = fs.readFileSync(templateFile)
    var parsed = JSON.parse(data);

    const keys = Object.keys(stringMap);
    keys.forEach(key => {
        const keyArray = convertStringKeyToPath(key);
        // value in the template

        const templateVal = getValFromPath(keyArray, parsed);
        const translatedVal = stringMap[key]["val"];
        const engVal = stringMap[key]["eng"];

        if (templateVal === engVal) {
            // change the template value
            var source = {};
            assignValueToPath(source, keyArray, translatedVal);
            ObjectAssign(Object.create(parsed), source);
        }
    });
    return parsed;
};


function convertStringKeyToPath(key) {
    const vals = key.split(".");
    return vals;
}

function getValFromPath(paths, obj) {
    var output = obj;
    paths.forEach(key => {
        output = output[key];
    });
    return output;
}

function assignValueToPath(obj, path, value) {
    var emptyObj = {};
    const val = assignValueToObject(emptyObj, path, value);
    Object.assign(obj, emptyObj);
}

function ObjectAssign(target, ...sources) {
    sources.forEach(source => {
        Object.keys(source).forEach(key => {
            const s_val = source[key]
            const t_val = target[key]
            target[key] = t_val && s_val && typeof t_val === 'object' && typeof s_val === 'object'
                ? ObjectAssign(t_val, s_val)
                : s_val
        });
    });
    return target;
}

function assignValueToObject(obj, keys, value) {
    obj = typeof obj === 'object' ? obj : {};
    var curStep = obj;
    for (var i = 0; i < keys.length - 1; i++) {
        var key = keys[i];

        if (!curStep[key] && !Object.prototype.hasOwnProperty.call(curStep, key)) {
            var nextKey = keys[i + 1];
            var useArray = /^\+?(0|[1-9]\d*)$/.test(nextKey);
            curStep[key] = useArray ? [] : {};
        }
        curStep = curStep[key];
    }
    var finalStep = keys[keys.length - 1];
    curStep[finalStep] = value;
};

/**
 * MAIN
 */
const fileData = readFile("C:\\Users\\erlin\\Documents\\sampleLCLFile.lcl");
parseXMLFile(fileData);
