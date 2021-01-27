const assert = require('chai').assert;
const Mocha = require('mocha');
const fs = require('fs');
const path = require('path');

describe('Validating Cohorts...', () => {
    const cohortPath = './Cohorts';

    it('Verifying .cohort files', function (done) {
        let failedList = [];
        browseDirectory(cohortPath, (error, results) => {
            results.filter(file => file.endsWith('.cohort'))
                .forEach(file => {
                    validateJsonStringAndGetObject(file)
                });

            done();
        });
    });

    it('Verifying cohort settings files', function (done) {
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.endsWith('settings.json'))
                .forEach(file => {
                    let settings = validateJsonStringAndGetObject(file);
                    validateSettingsForCohort(settings, file);
                });

            done();
        });
    });

    it('Verifying cohort category files', function (done) {
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.endsWith('categoryResources.json'))
                .forEach(file => {
                    let category = validateJsonStringAndGetObject(file);
                    validateCategory(category, file);
                });

            done();
        });
    });
    
    it('Verifying cohort category or settings json exists', function (done) {
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.endsWith('.cohort'))
                .forEach(folder => {
                    validateJsonExistForWorkbook(cohortPath, results, folder.substr(cohortPath.length+1))
                });

            done();
        });
    });
});

describe('Validating Workbooks...', () => {
    const workbookPath = './Workbooks';

    it('Verifying .workbook files', function (done) {
        browseDirectory(workbookPath, (error, results) => {
            results.filter(file => file.endsWith('.workbook'))
                .forEach(file => {
                    let settings = validateJsonStringAndGetObject(file);
                    validateNoResourceIds(settings, file);
                    validateNoFromTemplateId(settings, file);
                    validateSingleWorkbookFile(settings, file);
                    validateWorkbookFilePathLength(file);
                });

            done();
        });
    });

    it('Verifying workbook settings.json files', function (done) {
        browseDirectory(workbookPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.endsWith('settings.json'))
                .forEach(file => {
                    let settings = validateJsonStringAndGetObject(file)
                    validateSettingsForWorkbook(settings, file);
                    // verify there is a workbook file in this directory too
                    validateWorkbookExistForSettings(file);
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
                });
            done();
        });
    });    

    it('Verifying workbook category json files', function (done) {
        browseDirectory(workbookPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.endsWith('categoryResources.json'))
                .forEach(file => {
                    let category = validateJsonStringAndGetObject(file);
                    validateCategory(category, file);
                });

            done();
        }, true, workbookPath);
    });

    it('Verifying workbook category or settings json exists', function (done) {
        browseDirectory(workbookPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.endsWith('.workbook'))
                .forEach(folder => {
                    validateJsonExistForWorkbook(workbookPath, results, folder.substr(workbookPath.length+1))
                });

            done();
        }, true, workbookPath);
    });
});

function validateJsonExistForWorkbook(rootPath, results, file) {
    let paths = getProgressivePaths(rootPath, file);
    paths.forEach(folder => {
        let result = results.filter(s => {
            return s.indexOf(folder + "/categoryResources.json") > -1 || s.indexOf(folder + "/settings.json") > -1;
        });
        if (result.length === 0) {
            assert.fail("categoryResources.json or settings.json doesn't exist in folder '" + folder + "'")
        }
    });
}

function validateWorkbookExistForSettings(file) {
    let folder = path.dirname(file);
    fs.readdir(folder, (err, list) => {
        let workbooks = list.filter(s => s.endsWith(".workbook"));
        if (workbooks.length == 0 ) {
            assert.fail("settings.json file exists with no corresponding .workbook in folder '" + folder + "'")
        }
    });
}

function getProgressivePaths(rootPath, file) {
    let paths = file.split("/").filter(folder => folder !== "." && folder !== ".." && folder.indexOf(".workbook") === -1 && folder.indexOf(".cohort") === -1);
    let files = [];
    if (paths && paths.length > 0) {
        var runningPath = rootPath + "/" + paths[0];
        files[0] = runningPath;
        for (let i = 1; i < paths.length; i++) {
            runningPath += "/" + paths[i];
            files[i] = runningPath;
        }
    }
    return files;
}

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
    if (file.indexOf("/") !== -1 && file.indexOf("\\") !== -1) {
        assert.fail("Filename contains both '/' and '\\' characters: '" + file + "'")
    } else {
        ["&", "?", "#"].forEach( c => {
            if (file.indexOf(c) !== -1) {
                assert.fail("Filename contains invalid '" + c + "' character: '" + file + "'");
            }
        });
    }

    let json = fs.readFileSync(file, 'utf8');
    let obj = TryParseJson(json, file);
    return obj;
}

function validateSettingsForCohort(settings, file) {
    ["$schema", "name", "author"].forEach( field => checkProperty(settings, field, file) );
}

function validateSettingsForWorkbook(settings, file) {
    ["$schema", "name", "author", "galleries"].forEach( field => checkProperty(settings, field, file) );
    if (!Array.isArray(settings.galleries)) {
        assert.fail("The galleries should be an array with '" + file + "'");
    }
}

function validateSettingsForArmTemplate(settings, file) {
    ["$schema"].forEach( field => checkProperty(settings, field, file) );
}

function validateNoResourceIds(settings, file) {
    // there's probably a better way but this is simplest. make sure there are no strings like '/subscriptions/[guid]` in the whole content
    // not parsing individual steps/etc at this time
    let str = JSON.stringify(settings);
    let regexp = /(\/subscriptions\/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})/gi; 
    while ((matches = regexp.exec(str)) !== null) {
        assert.fail(file + ": Found probably hardcoded resource Id '" + matches[0] + "'");
    }
}

// validate that the template content does not have a "fromTemplateId" field
function validateNoFromTemplateId(settings, file) {
    if (settings.fromTemplateId) {
        assert.fail(file + ": Found prohibited field `fromTemplateId` in template content");
    }
}

// validate that there's only one .workbook file in a folder, as only one is going to get picked up by the processing
function validateSingleWorkbookFile(settings, file) {
    let dir = path.dirname(file);
    fs.readdir(dir, (err, list) => {
        let workbooks = list.filter(s => s.endsWith(".workbook"));
        if (workbooks.length > 1) {
            assert.fail(file + ": Found " + workbooks.length + " .workbook files in folder. Only one is allowed.");
        }    
    });
}

function validateCategory(category, file) {
    checkProperty(category, "$schema", file);
    checkProperty(category, 'en-us', file);
    ["name", "description", "order"].forEach( field => checkProperty(category['en-us'], field, file) );
}

function checkProperty(obj, name, file) {
    if (!obj) {
        assert.fail("Can't check a property. The object is undefined.");
    }

    if (!obj.hasOwnProperty(name)) {
        assert.fail("The " + name + " field is missing with '" + file + "'");
    }
}

function TryParseJson(str, file) {
    try {
        return JSON.parse(str);
    } catch (e) {
        assert.fail('Invalid json format with \'' + file + '\'.\n' + e);
        return null;
    }
}