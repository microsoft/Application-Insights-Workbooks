const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const { loadValidationInput, createPlaywrightScript } = require('./workbookBrowserValidator');

function main(argv) {
    const args = minimist(argv, {
        string: ['workbook', 'checks', 'output', 'screenshots'],
        boolean: ['help'],
        unknown() {
            throw new Error('Unsupported argument. Use --workbook, --checks, --output, --screenshots, or --help.');
        }
    });
    if (args.help) {
        console.log('Usage: npm run test:browser:script -- --workbook <file> [--checks <json>] [--screenshots <local-directory>] --output <new-script.js>');
        return;
    }
    if (args._.length || typeof args.output !== 'string' || !args.output.trim()) {
        throw new Error('Provide --workbook and --output; the output file must not already exist.');
    }
    const input = loadValidationInput(args.workbook, args.checks, args.screenshots);
    fs.writeFileSync(args.output, createPlaywrightScript(input.source, input.options), { encoding: 'utf8', flag: 'wx' });
    console.log(`Created ${path.basename(args.output)}. Run it in a new empty unsaved workbook's Advanced Editor.`);
    console.log(input.options.screenshots ?
        'Screenshots are enabled with conservative masking. Review every image before sharing; no automatic upload.' :
        'Would screenshots help? Opt in with --screenshots <local-directory>; screenshots remain disabled by default.');
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
