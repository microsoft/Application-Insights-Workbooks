const assert = require('chai').assert;
const Mocha = require('mocha');
const fs = require('fs');

describe('Validating Cohorts...', () => {
    const cohortPath = './Cohorts';

    it('Verifying .cohort files', function(done){
        let failedList = [];
        browseDirectory(cohortPath, (error, results) => {
            results.filter(file => file.substr(-7) === '.cohort')
                .forEach(file => {                    
                    validateJsonString(file)
                });
            
                done();
        });
    });

    it('Verifying cohort settings files', function(done){
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.substr(-13) === 'settings.json')
                .forEach(file => {
                    validateJsonString(file);
                });
            
                done();
        });
    });

    it('Verifying cohort category files', function(done){
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.substr(-22) === 'categoryResources.json')
                .forEach(file => {
                    validateJsonString(file);
                });
            
                done();
        });
    });
});

describe('Validating Workbooks...', () => {
    const cohortPath = './Workbooks';

    it('Verifying .workbook files', function(done){
        let failedList = [];
        browseDirectory(cohortPath, (error, results) => {
            results.filter(file => file.substr(-9) === '.workbook')
                .forEach(file => {                    
                    validateJsonString(file)
                });
            
                done();
        });
    });

    it('Verifying workbook settings.json files', function(done){
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.substr(-13) === 'settings.json')
                .forEach(file => {
                    console.log(file);
                    validateJsonString(file);
                });
            
                done();
        });
    });

    it('Verifying workbook category json files', function(done){
        browseDirectory(cohortPath, (error, results) => {
            if (error) throw error;
            results.filter(file => file.substr(-22) === 'categoryResources.json')
                .forEach(file => {
                    validateJsonString(file);
                });
            
                done();
        });
    });
});

function validateJsonString(file) {
    let json = fs.readFileSync(file, 'utf8');
    assert.isTrue(isJsonString(json), 'Invalid json format with \'' + file + '\'');
}

var browseDirectory = function(dir, done) {
    var results = [];
    fs.readdir(dir, function(err, list) {
      if (err) return done(err);
      var i = 0;
      (function next() {
        var file = list[i++];
        if (!file) return done(null, results);
        file = dir + '/' + file;
        fs.stat(file, function(err, stat) {
          if (stat && stat.isDirectory()) {
            browseDirectory(file, function(err, res) {
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



function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}