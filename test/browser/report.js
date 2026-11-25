const fs = require('fs');
const minimist = require('minimist');
const { publicValidationReport, writeValidationReport } = require('./workbookValidationReport');

function main(argv) {
    const args = minimist(argv, {
        string: ['input', 'output'],
        boolean: ['help'],
        unknown() { throw new Error('Use --input <report.json> --output <new-local-prefix> or --help.'); }
    });
    if (args.help) {
        console.log('Usage: npm run test:browser:report -- --input <report.json> --output <new-local-prefix>');
        return;
    }
    if (args._.length || !args.input || !args.output) throw new Error('Provide --input and --output.');
    const report = publicValidationReport(JSON.parse(fs.readFileSync(args.input, 'utf8')));
    writeValidationReport(report, args.output);
    console.log(`Report written. Automated checks: ${report.automationStatus}; coverage: ${report.status}. Authorized reviewer approval remains separate.`);
    if (report.automationStatus !== 'passed' || ['failed', 'blocked'].includes(report.status)) process.exitCode = 1;
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { main };
