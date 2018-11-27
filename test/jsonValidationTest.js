const assert = require('chai').assert;
const Mocha = require('mocha');
const fs = require('fs');

describe('Validating Cohorts...', () => {
    const cohortPath = './Cohorts';

    it('Verifying .cohort files', function (done) {
        let failedList = [];
        browseDirectory(cohortPath, (error, results) => {
            results.filter(file => file.substr(-7) === '.cohort')
                .forEach(file => {
                    validateJsonStringAndGetObject(file)
                });

            done();
        });
    });

    it('Verifying cohort settings files', function (done) {
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.substr(-13) === 'settings.json')
                .forEach(file => {
                    let json = validateJsonStringAndGetObject(file);
                    validateSettingsForCohort(json, file);
                });

            done();
        });
    });

    it('Verifying cohort category files', function (done) {
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.substr(-22) === 'categoryResources.json')
                .forEach(file => {
                    let json = validateJsonStringAndGetObject(file);
                    validateCategory(json, file);
                });

            done();
        });
    });
});

describe('Validating Workbooks...', () => {
    const cohortPath = './Workbooks';

    it('Verifying .workbook files', function (done) {
        let failedList = [];
        browseDirectory(cohortPath, (error, results) => {
            results.filter(file => file.substr(-9) === '.workbook')
                .forEach(file => {
                    validateJsonStringAndGetObject(file)
                });

            done();
        });
    });

    it('Verifying workbook settings.json files', function (done) {
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.substr(-13) === 'settings.json')
                .forEach(file => {
                    let json = validateJsonStringAndGetObject(file)
                    validateSettingsForWorkbook(json, file);
                });

            done();
        });
    });

    it('Verifying workbook category json files', function (done) {
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.substr(-22) === 'categoryResources.json')
                .forEach(file => {
                    let json = validateJsonStringAndGetObject(file);
                    validateCategory(json, file);
                });

            done();
        });
    });
});

var browseDirectory = function (dir, done) {
    var results = [];
    fs.readdir(dir, function (err, list) {
        if (err) return done(err);
        var i = 0;
        (function next() {
            var file = list[i++];
            if (!file) return done(null, results);
            file = dir + '/' + file;
            fs.stat(file, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    browseDirectory(file, function (err, res) {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                }
            });
        })();
    });
};

function validateJsonStringAndGetObject(file) {
    let json = fs.readFileSync(file, 'utf8');
    let obj = TryParseJson(json)
    assert.isTrue(obj != null, 'Invalid json format with \'' + file + '\'');
    return obj;
}

function validateSettingsForCohort(settings) {
    if (!settings.hasOwnProperty('$schema')) {
        assert.fail("The $schema field is missing with '" + file + "'");
    }
    if (!settings.hasOwnProperty('name')) {
        assert.fail("The name field is missing with '" + file + "'");
    }
    if (!settings.hasOwnProperty('author')) {
        assert.fail("The author field is missing with '" + file + "'");
    }
}

function validateSettingsForWorkbook(settings, file) {
    if (!settings.hasOwnProperty('$schema')) {
        assert.fail("The $schema field is missing with '" + file + "'");
    }
    if (!settings.hasOwnProperty('name')) {
        assert.fail("The name field is missing with '" + file + "'");
    }
    if (!settings.hasOwnProperty('author')) {
        assert.fail("The author field is missing with '" + file + "'");
    }
    if (!settings.hasOwnProperty('galleries')) {
        assert.fail("The galleries field is missing with '" + file + "'");
    }
    if (!Array.isArray(settings.galleries)) {
        assert.fail("The galleries should be an array with '" + file + "'");
    }
}

function validateCategory(category, file) {
    if (!category.hasOwnProperty('en-us')) {
        assert.fail("The en-us field is missing with '" + file + "'");
    }
    if (!category['en-us'].hasOwnProperty('name')) {
        assert.fail("The name field is missing with '" + file + "'");
    }
    if (!category['en-us'].hasOwnProperty('description')) {
        assert.fail("The description field is missing with '" + file + "'");
    }
    if (!category['en-us'].hasOwnProperty('order')) {
        assert.fail("The order field is missing with '" + file + "'");
    }
}

function TryParseJson(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}