const assert = require('chai').assert;
const Mocha = require('mocha');
const fs = require('fs');
const path = require('path');
const Validator = require('jsonschema').Validator;

const ArrayLocIdentifier = {
    "items": "name",
    "parameters": "id",
    "labelSettings": "columnId",
    "links": "id"
};

const LocKeys = [
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
    "noDataMessage",
    "markDown" // specific to cohorts
];

const TrailingAndLeadingWhitespaceSlashRegex = /\s\/|\/\s|\s\\|\\\s/;

const GallerySchema = "https://raw.githubusercontent.com/microsoft/Application-Insights-Workbooks/master/schema/gallery.json";
const GalleryVersion = "TemplateGallery/1.0";

describe('Validating Cohorts...', () => {
    const cohortPath = './Cohorts';

    it('Verifying .cohort files', function (done) {
        let failedList = [];
        browseDirectory(cohortPath, (error, results) => {
            validateNoImplicitGalleryFiles(results);
            results.filter(file => file.endsWith('.cohort'))
                .forEach(file => {
                    validateJsonStringAndGetObject(file)
                });

            done();
        });
    });
});

describe('Validating Workbooks...', () => {
    const workbookPath = './Workbooks';

    it('Verifying .workbook files', function (done) {
        browseDirectory(workbookPath, (error, results) => {

            validateNoImplicitGalleryFiles(results);
            results.filter(file => file.endsWith('.workbook'))
                .forEach(file => {
                    let settings = validateJsonStringAndGetObject(file);
                    validateNoResourceIds(settings, file);
                    validateNoFromTemplateId(settings, file);
                    validateNoDuplicateId(settings, '', {}, file);
                    validateSingleWorkbookFile(settings, file);
                    validateWorkbookFilePathLength(file);
                });

            done();
        });
    });

    it('Verifying armtemplate.json files', function (done) {
        browseDirectory(workbookPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.endsWith('.armtemplate'))
                .forEach(file => {
                    let settings = validateJsonStringAndGetObject(file);
                    // "$schema": "https://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
                    validateSettingsForArmTemplate(settings, file);
                    validateWorkbookFilePathLength(file);
                    validateNoResourceIds(settings, file);
                    validateNoSubscriptionIdInTemplate(settings, file);
                });
            done();
        });
    });
});

describe('Validating Gallery files...', () => {
    const galleryPath = './gallery';

    it('Verifying gallery files', function (done) {
        browseDirectory(galleryPath, (error, results) => {
            if (error) throw error;

            var validator = new Validator();
            const schemaFile = "./schema/gallery.json";
            const schemaJSON = fs.readFileSync(schemaFile, 'utf8');
            const schema = TryParseJson(schemaJSON);

            validateGalleryFileNames(results);

            results.forEach(file => {
                    let settings = validateJsonStringAndGetObject(file);
                    validateGallerySchema(file, settings, validator, schema);
                    validateGalleryVersionAndSchemaFields(file, settings);
                    validateNoDuplicateCategories(file, settings);
                    validateNoDuplicateTemplates(file, settings);
                    validateTemplateIds(file, settings);
                });
            done();
        });
    });


});

function validateWorkbookFilePathLength(file) {
    // validate the length of the category+file name. this is hard to do directly because of galleries and the specifics
    // of where the build machine/users put these folders when they clone. on the build machine it appears to be S:\Workbooks\
    // which is 13 ch.  will "reserve" 55 for now, leaving 200 for full path names
    let fullPath = file.length;
    // the path of the workbook when packaged is really its folder name, its containing folder names, .json
    let folders = file.split("/");
    // folders 0 and 1 are "." and "workbooks", and the last part is the filename
    let workbookkey = folders[2]
    for (let i = 3; i < folders.length-1; i++) {
        workbookkey += "-" + folders[i];
    }
    workbookkey += ".json";

    if (fullPath > 200) {
        assert.fail("file path " + fullPath + " longer than 200ch limit: '" + file + "' this file may fail to copy in build steps")
    } if (workbookkey.length > 100) {
        assert.fail("packaged workbook key '" + workbookkey + "' = length " + workbookkey.length + ", longer than 100ch limit: '" + file + "'.  Reduce file/folder path depth or rename folders to reduce duplicate information")
    }
}

var browseDirectory = function (dir, done, hasRoot=false, rootDir="") {
    var results = [];
    if (!dir.endsWith("{Lang}")) {
        fs.readdir(dir, function (err, list) {
            if (err) return done(err);
            var i = 0;
            (function next() {
                var file = list[i++];
                if (!file) return done(null, results);
                file = dir + '/' + file;
                fs.stat(file, function (err, stat) {
                    if (stat && stat.isDirectory() && !file.endsWith("{Lang}")) {
                        browseDirectory(file, function (err, res) {
                            results = results.concat(res);
                            next();
                        });
                    } else {
                        if (hasRoot && dir === rootDir) {
                            next();
                        } else {
                            results.push(file);
                            next();
                        }
                    }
                });
            })();
        });
    }
};

function validateJsonStringAndGetObject(file) {
    // also validate the file name. 
    // * it can have either / or \ but not both.
    // * it cannnot have & or ? or #
    // * it cannot have a trailing or leading whitespace from the slash
    if (file.indexOf("/") !== -1 && file.indexOf("\\") !== -1) {
        assert.fail("Filename contains both '/' and '\\' characters: '" + file + "'")
    } else {
        ["&", "?", "#"].forEach( c => {
            if (file.indexOf(c) !== -1) {
                assert.fail("Filename contains invalid '" + c + "' character: '" + file + "'");
            }
        });
    }

    if (TrailingAndLeadingWhitespaceSlashRegex.test(file)) {
        assert.fail("Invalid file path: " + file + ". Trailing whitespace found before or after '/' or '\\'.");
    }

    let json = fs.readFileSync(file, 'utf8');
    let obj = TryParseJson(json, file);
    return obj;
}

function validateSettingsForArmTemplate(settings, file) {
    ["$schema"].forEach( field => checkProperty(settings, field, file) );
}

// Implicit gallery files (categoryResources.json and settings.json) are switched to using explicit gallery files.
// Check to make sure no one is trying to make galleries this way anymore
function validateNoImplicitGalleryFiles(files) {
    files.forEach(file => {
        if (file.endsWith("categoryResources.json") || file.endsWith("settings.json")) {
          assert.fail(file + ": Galleries are no longer being generated implicitly through categoryResources.json and settings.json files. Please review Contributing.md for latest guidance.");
        }
    });
}

function validateNoResourceIds(settings, file) {
    // make sure there are no strings like '/subscriptions/[guid]` in the whole content
    // not parsing individual steps/etc at this time
    let str = JSON.stringify(settings);
    let regexp = /(\/subscriptions\/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})/gi;
    while ((matches = regexp.exec(str)) !== null) {
        assert.fail(file + ": Found probably hardcoded resource Id '" + matches[0] + "'");
    }
}

function validateNoSubscriptionIdInTemplate(settings, file) {
    // make sure there are no strings like "subscriptions": "[guid]" in the whole content. this is used on arm template files
    // where it is more common to have a thing like this for certain endpoints.
    // not parsing individual steps/etc at this time
    let str = JSON.stringify(settings);
    let regexp = /(\"subscription[s]*\"\s*:\s*[\[]*\s*"[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})/gi;
    while ((matches = regexp.exec(str)) !== null) {
        assert.fail(file + ": Found probably hardcoded subscription Id '" + matches[0] + "'");
    }
}

// validate that the template content does not have a "fromTemplateId" field
function validateNoFromTemplateId(settings, file) {
    if (settings.fromTemplateId) {
        assert.fail(file + ": Found prohibited field `fromTemplateId` in template content");
    }
}

// validate that the template does not contain any duplicate ids
function validateNoDuplicateId(obj, key, outputMap, file) {
    for (var field in obj) {
        var objectEntry = obj[field];
        var jsonKey;
        if (typeof objectEntry === 'object') {
            // If the last field is a number, it is part of an array.
            // See if there's another identifier such that if a template order is edited, the string does not need to be re-localized
            if (!isNaN(parseInt(field))) {
                jsonKey = getKeyForArrayObject(key, objectEntry, field);
            } else {
                jsonKey = key.concat(".", field);
            }
            validateNoDuplicateId(objectEntry, jsonKey, outputMap, file);

        } else if (LocKeys.includes(field)) {
            jsonKey = key.concat(".", field).substring(1);
            const jsonVal = obj[field];
            if (jsonVal) {
                if (outputMap[jsonKey] != null) {
                    assert.fail("Found duplicate key: " + jsonKey + " in template: " + file + ". To fix this error, change the step name or id", /**true**/);
                } else {
                    outputMap[jsonKey] = jsonVal;
                }
            }
        }
    }
}

/** Gets unique key identifier for array object */
function getKeyForArrayObject(key, objectEntry, field) {
    const identifier = endsWithLocIdentifier(key);
    if (identifier !== "" && objectEntry[ArrayLocIdentifier[identifier]] != null) {
        // remove special characters from the identifier
        return key.concat(".", removeNonAplhaNumeric(objectEntry[ArrayLocIdentifier[identifier]]));
    }
    return key.concat(".", field);
}

function endsWithLocIdentifier(key) {
    const ids = Object.keys(ArrayLocIdentifier);
    for (var i in ids) {
      if (key.endsWith(ids[i])) {
        return ids[i];
      }
    }
    return null;
  }

function removeNonAplhaNumeric(str) {
    return str.replace(/[\W_]/g, "");
}

// validate that there's only one .workbook file in a folder, as only one is going to get picked up by the processing
function validateSingleWorkbookFile(settings, file) {
    let dir = path.dirname(file);
    fs.readdir(dir, (err, list) => {
        let workbooks = list.filter(s => s.endsWith(".workbook") );
        if (workbooks.length > 1) {
            assert.fail(file + ": Found " + workbooks.length + " .workbook files in folder. Only one is allowed.");
        }
    });
}

function checkProperty(obj, name, file) {
    if (!obj) {
        assert.fail("Can't check a property. The object is undefined.");
    }

    if (!obj.hasOwnProperty(name)) {
        assert.fail("The " + name + " field is missing with '" + file + "'");
    }
}

function validateGalleryFileNames(files) {
    const galleryFileNameRegex = new RegExp("[a-z0-9\\-\\s]+.json");
    files.forEach(file => {
        const fileName = file.split("/").pop();
        const matchesRegex = galleryFileNameRegex.test(fileName);
        if (!matchesRegex) {
            assert.fail(file + ": Gallery file should be a JSON file, and should be named the ARM resource type where '\\' are replaced with '-'");
        }

        const fileSubDir = file.replace("./gallery/", "");
        const subDirCount = fileSubDir.split("/").length - 1;
        // Ensures that there is only one sub-directory for workbookType 
        if (subDirCount !== 1) {
            assert.fail(file + ": Gallery file should follow the naming convension /gallery/{workbookType}/{resourceType}.json");
        }
    });
}

function validateGallerySchema(file, settings, validator, schema) {
    const validationResult  = validator.validate(settings, schema);
    if (validationResult && validationResult.errors.length !== 0) {
        assert.fail(file + " : Gallery file does not conform to the gallery schema. Errors: " + validationResult.errors.join(", "));
    }
}

function validateNoDuplicateCategories(file, settings) {
    const areUnique = areArrayItemsUnique(settings["categories"], "id");
    if (!areUnique) {
        assert.fail(file + " : Gallery file contains categories with non-unique ids");
    }
}

function validateGalleryVersionAndSchemaFields(file, settings) {
    const isCorrectVersion = settings["version"] === GalleryVersion;
    if (!isCorrectVersion) {
        assert.fail(file + " : Gallery file does not contain correct version. Version should be set to: " + GalleryVersion);
    }
    const isCorrectSchema = settings["$schema"] === GallerySchema;
    if (!isCorrectSchema) {
        assert.fail(file + " : Gallery file does not contain correct $schema. Schema should be set to: " + GallerySchema);
    }
}

function validateNoDuplicateTemplates(file, settings) {
    settings["categories"].forEach(category => {
        const areUnique = areArrayItemsUnique(category["templates"], "id");
        if (!areUnique) {
            assert.fail(file + " : Gallery file contains templates with non-unique ids");
        }
    });
}

function validateTemplateIds(file, settings) {
    settings["categories"].forEach(category => {
        category["templates"].forEach(template => {
            const templatePath = "./".concat(template.id);
            fs.readdir(templatePath, (err, list) => {
                if (err) {
                    assert.fail(file + " : Template with ID: " + template.id + " could not be found in the specified path. The ID should be the folder where the template resides relative to the root repository (eg. Workbooks/Performance/Apdex)");
                }
                let templates = list.filter(s => s.endsWith(".workbook") || s.endsWith(".cohort"));
                if (templates.length === 0) {
                    assert.fail(file + " : Template with ID: " + template.id + " does not exist in specified path. The ID should be the folder where the template resides relative to the root repository (eg. Workbooks/Performance/Apdex)");
                }
            });
        });
    });
}


function areArrayItemsUnique(arr, key) {   
    const uniques = new Set(arr.map(item => item[key.toLowerCase()]));   
    return [...uniques].length === arr.length; 
}

function TryParseJson(str, file) {
    try {
        return JSON.parse(str);
    } catch (e) {
        assert.fail('Invalid json format with \'' + file + '\'.\n' + e);
        return null;
    }
}