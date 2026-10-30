const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureWorkbookScreenshot, bindParameterTrigger, activateWorkbookControl,
    verifySelectedTenant, auditGridRows, waitForRenderReady, createPlaywrightScript } = require('./workbookBrowserValidator');
const { readValidationProvenance, publicValidationReport } = require('./workbookValidationReport');

describe('Validating browser safety with offline fixtures (opt-in)...', function () {
    let browser;
    let context;
    let page;
    let directory;

    before(async function () {
        const executablePath = process.env.WORKBOOK_BROWSER_EXECUTABLE;
        if (!executablePath || !fs.existsSync(executablePath)) {
            throw new Error('Set WORKBOOK_BROWSER_EXECUTABLE to an installed Chromium/Edge executable. No browser is downloaded.');
        }
        const { chromium } = require('playwright-core');
        browser = await chromium.launch({ executablePath, headless: true });
    });

    beforeEach(async function () {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workbook-safety-'));
        context = await browser.newContext({ viewport: { width: 900, height: 600 } });
        await context.route('**/*', route => route.abort());
        page = await context.newPage();
        await page.setContent('<!doctype html><body style="margin:0">' +
            '<div id="overlay" style="position:fixed;left:40px;top:110px;width:300px;height:80px;background:rgb(255,0,255);z-index:9999;visibility:visible!important;pointer-events:none">SYNTHETIC ACCOUNT OVERLAY</div>' +
            '<div style="padding-top:80px"><iframe name="Workbooks.ReactView" style="border:0;width:600px;height:300px" srcdoc="<!doctype html><body></body>"></iframe></div></body>');
        await page.locator('iframe[name="Workbooks.ReactView"]').contentFrame().locator('body').evaluate(body => {
            body.style.margin = '0';
            body.innerHTML = '<h3>Approved heading</h3>' +
                '<div role="gridcell" style="position:absolute;left:10px;top:50px;width:200px;height:40px;background:red">SYNTHETIC SECRET</div>';
        });
    });

    afterEach(async function () {
        if (context) await context.close();
        if (directory) {
            for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
            fs.rmdirSync(directory);
        }
    });

    after(async function () {
        if (browser) await browser.close();
    });

    async function virtualGrid({ total = 47, emptyRow = -1, drift = false, stall = false, originalScroll = 140 } = {}) {
        const frame = page.locator('iframe[name="Workbooks.ReactView"]').contentFrame();
        await frame.locator('body').evaluate((body, options) => {
            body.style.margin = '0';
            body.innerHTML = '<div id="viewport" style="height:120px;width:500px;overflow:auto">' +
                `<div role="grid" aria-rowcount="${options.total + 1}" style="height:${(options.total + 1) * 20}px;position:relative">` +
                '<div role="row"><div role="columnheader">Label</div><div role="columnheader">Value</div></div>' +
                '<div id="rows"></div></div></div>';
            const viewport = document.getElementById('viewport');
            const grid = document.querySelector('[role="grid"]');
            const rows = document.getElementById('rows');
            const render = () => {
                const start = Math.max(0, Math.floor(viewport.scrollTop / 20) - 2);
                rows.innerHTML = '';
                for (let index = start; index < Math.min(start + 12, options.total); index++) {
                    const row = document.createElement('div');
                    row.setAttribute('role', 'row');
                    row.setAttribute('aria-rowindex', String(index + 2));
                    row.style.cssText = `position:absolute;top:${(index + 1) * 20}px;height:20px`;
                    row.innerHTML = `<span role="gridcell">Synthetic ${index}</span>` +
                        `<span role="gridcell">${index === options.emptyRow ? '' : index}</span>`;
                    rows.append(row);
                }
            };
            let timer;
            viewport.addEventListener('scroll', () => {
                clearTimeout(timer);
                if (options.stall) return;
                timer = setTimeout(() => {
                    if (options.drift && viewport.scrollTop > 150) grid.setAttribute('aria-rowcount', String(options.total + 2));
                    render();
                }, 75);
            });
            viewport.scrollTop = options.originalScroll;
            render();
        }, { total, emptyRow, drift, stall, originalScroll });
        return { frame, grid: frame.getByRole('grid') };
    }

    async function offlineEditor() {
        await page.route('https://workbook-fixture.invalid/', route => route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><body><h2>Unsaved Workbook</h2>' +
                '<button aria-label="Account menu"><span title="Directory: Synthetic (11111111-2222-3333-4444-555555555555)">Synthetic</span></button>' +
                '<iframe name="Workbooks.ReactView" style="width:700px;height:450px" srcdoc="<!doctype html><body></body>"></iframe></body>'
        }));
        await page.goto('https://workbook-fixture.invalid/');
        await page.locator('iframe[name="Workbooks.ReactView"]').contentFrame().locator('body').evaluate(body => {
            body.innerHTML = '<div id="editor"><textarea aria-label="Editor content"></textarea>' +
                '<button role="menuitem" id="apply">Apply</button><button role="menuitem" id="done" hidden>Done Editing</button></div>' +
                '<div id="reading" hidden><div role="menubar" aria-label="Workbooks toolbar"><button role="menuitem">Edit</button></div>' +
                '<div role="tablist"><button role="tab" aria-selected="true">Overview</button>' +
                '<button role="tab" aria-selected="false">Details</button></div>' +
                '<div role="menubar" id="producer"><button role="menuitem" id="load">Show details</button></div>' +
                '<div id="panels"></div></div>';
            let value = '{"version":"Notebook/1.0","items":[]}';
            const model = { getValue: () => value, setValue: source => { value = source; } };
            window.monaco = { editor: { getEditors: () => [{ getDomNode: () => body, getModel: () => model }] } };
            document.getElementById('apply').onclick = () => { document.getElementById('done').hidden = false; };
            document.getElementById('done').onclick = () => {
                document.getElementById('editor').hidden = true;
                document.getElementById('reading').hidden = false;
            };
            for (const tab of document.querySelectorAll('[role="tab"]')) {
                tab.onclick = () => {
                    for (const other of document.querySelectorAll('[role="tab"]')) {
                        other.setAttribute('aria-selected', String(other === tab));
                    }
                };
            }
            document.getElementById('load').onclick = () => {
                document.getElementById('producer').hidden = true;
                document.getElementById('panels').innerHTML = '<div class="styleWrapper-maximized"><h3>Deferred table</h3>' +
                    '<div role="grid" aria-rowcount="3"><div role="row" aria-rowindex="1">' +
                    '<span role="columnheader">Label</span><span role="columnheader">Count</span></div>' +
                    '<div role="row" aria-rowindex="2"><span role="gridcell">First</span><span role="gridcell">1</span></div>' +
                    '<div role="row" aria-rowindex="3"><span role="gridcell">Second</span><span role="gridcell">2</span></div></div></div>' +
                    '<h3>Loaded details</h3>';
            };
        });
        return {
            url: () => 'https://portal.azure.com/#offline-fixture',
            getByRole: (...args) => page.getByRole(...args),
            getByText: (...args) => page.getByText(...args),
            locator: (...args) => page.locator(...args)
        };
    }

    it('executes a portable report through real editor controls, tabs, deferred panels, and a full row audit offline', async function () {
        const fixturePage = await offlineEditor();
        const file = path.join(__dirname, 'fixtures', 'Smoke.workbook');
        const source = fs.readFileSync(file, 'utf8');
        const options = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'smoke-checks.json'), 'utf8'));
        const script = createPlaywrightScript(source, { ...options, tenant: { useBrowserSession: true } },
            readValidationProvenance(file, source));
        const run = new Function(`return (${script})`)();
        const report = publicValidationReport(await run(fixturePage));
        assert.equal(report.automationStatus, 'passed');
        assert.equal(report.status, 'partial');
        const check = id => report.checks.find(check => check.id === id);
        assert.equal(check('primary-tabs').evidence.completed, 2);
        assert.equal(check('declared-tables').evidence.rowsAudited, 2);
        assert.equal(check('deferred-actions').evidence.actions, 1);
        assert.equal(check('scenario-drilldowns').status, 'not-run');
        assert.equal(check('manual-visual-review').status, 'not-run');
        assert.equal(report.screenshotRedaction, 'not-requested');
        assert(!JSON.stringify(report).includes('11111111-2222-3333-4444-555555555555'));
    });

    it('returns a source-mismatch report before modifying a real editor or activating Apply', async function () {
        const fixturePage = await offlineEditor();
        const file = path.join(__dirname, 'fixtures', 'Smoke.workbook');
        const source = fs.readFileSync(file, 'utf8');
        const script = createPlaywrightScript(source, { tenant: { useBrowserSession: true } },
            { ...readValidationProvenance(file, source), sourceSha256: '0'.repeat(64) });
        const run = new Function(`return (${script})`)();
        const report = publicValidationReport(await run(fixturePage));
        assert.equal(report.automationStatus, 'failed');
        assert.equal(report.checks.find(check => check.id === 'exact-source').reason, 'source-mismatch');
        const frame = page.locator('iframe[name="Workbooks.ReactView"]').contentFrame();
        assert.equal(await frame.locator('body').evaluate(() => window.monaco.editor.getEditors()[0].getModel().getValue()),
            '{"version":"Notebook/1.0","items":[]}');
        assert.equal(await frame.getByRole('menuitem', { name: 'Done Editing', exact: true }).count(), 0);
    });

    it('excludes existing and late parent overlays from auto and approved unredacted capture pixels', async function () {
        const iframe = page.locator('iframe[name="Workbooks.ReactView"]');
        for (const [index, redaction] of ['auto', 'none'].entries()) {
            const target = {
                async screenshot(options) {
                    await page.evaluate(() => {
                        const late = document.createElement('div');
                        late.id = 'late-overlay';
                        late.style.cssText = 'position:fixed;left:360px;top:110px;width:160px;height:80px;background:rgb(255,0,255);visibility:visible!important;z-index:99999';
                        late.textContent = 'SYNTHETIC LATE OVERLAY';
                        document.body.append(late);
                    });
                    await page.waitForFunction(() => getComputedStyle(document.getElementById('late-overlay')).visibility === 'hidden');
                    return iframe.screenshot(options);
                }
            };
            const report = await captureWorkbookScreenshot(page, target,
                { directory, redaction, allowSensitiveCapture: redaction === 'none' }, ['Approved heading'], index);
            const data = fs.readFileSync(path.join(directory, report.file)).toString('base64');
            const pixels = await page.evaluate(async data => {
                const image = new Image();
                image.src = 'data:image/png;base64,' + data;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                const values = context.getImageData(0, 0, image.width, image.height).data;
                let overlayPixels = 0;
                for (let offset = 0; offset < values.length; offset += 4) {
                    if (values[offset] === 255 && values[offset + 1] === 0 && values[offset + 2] === 255) overlayPixels++;
                }
                return { overlayPixels, secret: [...context.getImageData(20, 70, 1, 1).data] };
            }, data);
            assert.equal(pixels.overlayPixels, 0);
            assert.deepEqual(pixels.secret, redaction === 'auto' ? [17, 17, 17, 255] : [255, 0, 0, 255]);
            assert.equal(await page.locator('#overlay').evaluate(element => getComputedStyle(element).visibility), 'visible');
            assert.equal(await page.locator('#late-overlay').evaluate(element => getComputedStyle(element).visibility), 'visible');
            assert.equal(await page.locator('html').getAttribute('data-workbook-parent-isolation'), null);
            await page.locator('#late-overlay').evaluate(element => element.remove());
        }
    });

    it('restores parent visibility and workbook masking after screenshot failure', async function () {
        await assert.rejects(captureWorkbookScreenshot(page, {
            async screenshot() { throw new Error('expected capture failure'); }
        }, { directory }, ['Approved heading'], 0), /expected capture failure/);
        assert.equal(await page.locator('#overlay').evaluate(element => getComputedStyle(element).visibility), 'visible');
        assert.equal(await page.locator('html').getAttribute('data-workbook-parent-isolation'), null);
        const frame = page.locator('iframe[name="Workbooks.ReactView"]').contentFrame();
        assert.equal(await frame.locator('[data-workbook-validation-capture]').count(), 0);
    });

    it('does not hide the iframe or its ancestors while excluding parent overlays', async function () {
        const iframe = page.locator('iframe[name="Workbooks.ReactView"]');
        const target = {
            async screenshot(options) {
                const visible = await iframe.evaluate(frame => {
                    for (let element = frame; element; element = element.parentElement) {
                        if (getComputedStyle(element).visibility === 'hidden') return false;
                    }
                    return true;
                });
                assert.equal(visible, true);
                return iframe.screenshot(options);
            }
        };
        await captureWorkbookScreenshot(page, target, { directory }, ['Approved heading'], 0);
        assert.equal(await page.locator('[data-workbook-parent-allow]').count(), 0);
    });

    it('rejects a replaced workbook document during capture rather than qualifying its image', async function () {
        const iframe = page.locator('iframe[name="Workbooks.ReactView"]');
        const handle = await iframe.elementHandle();
        const frame = await handle.contentFrame();
        await assert.rejects(captureWorkbookScreenshot(page, {
            async screenshot(options) {
                await frame.goto('about:blank');
                await frame.setContent('<p>Replacement synthetic document</p>');
                return iframe.screenshot(options);
            }
        }, { directory }, ['Approved heading'], 0), /Capture rejected.*Discard/);
        assert.equal(await page.locator('html').getAttribute('data-workbook-parent-isolation'), null);
        assert.equal(await page.locator('#overlay').evaluate(element => getComputedStyle(element).visibility), 'visible');
        assert.equal(fs.readdirSync(directory).length, 1);
    });

    it('rejects scroll/viewpoint drift and removes its temporary state after writing a private image', async function () {
        const iframe = page.locator('iframe[name="Workbooks.ReactView"]');
        const frame = iframe.contentFrame();
        await frame.locator('body').evaluate(body => {
            body.innerHTML = '<div id="scroll" style="height:100px;overflow:auto"><div style="height:500px">Synthetic content</div></div>';
            document.getElementById('scroll').scrollTop = 40;
        });
        await assert.rejects(captureWorkbookScreenshot(page, {
            async screenshot(options) {
                const buffer = await iframe.screenshot(options);
                await frame.locator('#scroll').evaluate(element => element.scrollTop = 80);
                return buffer;
            }
        }, { directory }, [], 0), /viewport or scroll position changed.*Discard/);
        assert.equal(await frame.locator('[data-workbook-validation-capture]').count(), 0);
        assert.equal(await page.locator('[data-workbook-parent-allow]').count(), 0);
    });

    it('waits for visible busy/shimmer signals and ignores hidden progress controls', async function () {
        const frame = page.locator('iframe[name="Workbooks.ReactView"]').contentFrame();
        await frame.locator('body').evaluate(body => {
            body.innerHTML = '<div id="busy" aria-busy="true"><div role="progressbar">Loading</div>' +
                '<div class="ms-Shimmer-container">Placeholder</div></div><div role="progressbar" style="display:none">Hidden</div>';
            setTimeout(() => {
                document.getElementById('busy').remove();
            }, 75);
        });
        await frame.locator('body').evaluate(waitForRenderReady, 1000);
        assert.equal(await frame.locator('#busy').count(), 0);
    });

    it('fails bounded readiness checks before creating a screenshot when loading never finishes', async function () {
        const iframe = page.locator('iframe[name="Workbooks.ReactView"]');
        await iframe.contentFrame().locator('body').evaluate(body => {
            body.innerHTML = '<div aria-busy="true">Still loading</div>';
        });
        await assert.rejects(captureWorkbookScreenshot(page, iframe, { directory }, [], 0, 100), /busy indicators/);
        assert.equal(fs.readdirSync(directory).length, 0);
    });

    it('audits every delayed virtualized row, accepts zero values, and restores grid scrolling', async function () {
        const { frame, grid } = await virtualGrid();
        const audit = await grid.evaluate(auditGridRows, { maxRows: 100, timeout: 5000, nonEmptyColumns: ['Label', 'Value'] });
        assert.deepEqual(audit, { rowsAudited: 47, totalRows: 47, nonEmptyColumnsVerified: ['Label', 'Value'] });
        assert.equal(await frame.locator('#viewport').evaluate(element => element.scrollTop), 140);
        assert.equal(JSON.stringify(audit).includes('Synthetic'), false);
    });

    it('finds an empty cell outside the initial rendered rows without exposing its record', async function () {
        const { frame, grid } = await virtualGrid({ emptyRow: 37 });
        await assert.rejects(grid.evaluate(auditGridRows, {
            maxRows: 100, timeout: 5000, nonEmptyColumns: ['Value']
        }), /column "Value" contains an empty display cell/);
        assert.equal(await frame.locator('#viewport').evaluate(element => element.scrollTop), 140);
    });

    it('fails a row audit when the result count changes during virtualization', async function () {
        const { grid } = await virtualGrid({ drift: true });
        await assert.rejects(grid.evaluate(auditGridRows, {
            maxRows: 100, timeout: 5000, nonEmptyColumns: []
        }), /Grid count, schema, or document changed/);
    });

    it('never reports partial row coverage as a pass when virtualization stops progressing', async function () {
        const { grid } = await virtualGrid({ stall: true, originalScroll: 0 });
        await assert.rejects(grid.evaluate(auditGridRows, {
            maxRows: 100, timeout: 150, nonEmptyColumns: []
        }), /Timed out/);
    });

    it('refuses a same-label hyperlink and activates only the verified source toolbar', async function () {
        const frame = page.locator('iframe[name="Workbooks.ReactView"]').contentFrame();
        await frame.locator('body').evaluate(body => {
            body.innerHTML = '<div id="producer" role="menubar" style="display:none"><button role="menuitem" aria-label="Show details">Show details</button></div>' +
                '<a id="decoy" href="https://example.invalid/">Show details</a>';
            window.decoyClicks = 0;
            window.producerClicks = 0;
            document.getElementById('decoy').addEventListener('click', event => { event.preventDefault(); window.decoyClicks++; });
            document.querySelector('[role="menuitem"]').addEventListener('click', () => window.producerClicks++);
        });
        const contract = { trigger: 'Show details', toolbarLabels: ['Show details'] };
        await assert.rejects(bindParameterTrigger(frame, contract, 250), error => error.name === 'TimeoutError');
        assert.equal(await frame.locator('body').evaluate(() => window.decoyClicks), 0);
        await frame.locator('#producer').evaluate(element => element.style.display = 'block');
        await activateWorkbookControl(await bindParameterTrigger(frame, contract, 1000), 1000);
        assert.equal(await frame.locator('body').evaluate(() => window.producerClicks), 1);
        assert.equal(await frame.locator('body').evaluate(() => window.decoyClicks), 0);
        await assert.rejects(bindParameterTrigger(frame, { ...contract, toolbarLabels: ['Show details', 'Missing'] }, 1000),
            /differs from the validated source/);
    });

    it('rejects a conflicting GUID in an actual directory control rather than trusting its display name', async function () {
        const expected = '11111111-2222-3333-4444-555555555555';
        await page.evaluate(expected => {
            const button = document.createElement('button');
            button.setAttribute('aria-label', 'Account menu');
            const title = document.createElement('span');
            title.title = `Directory: Demo (${expected}) (aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee) Domain: example.invalid`;
            button.append(title);
            document.body.append(button);
        }, expected);
        const fixture = { url: () => 'https://portal.azure.com/#offline-fixture',
            getByRole: (...args) => page.getByRole(...args), getByText: (...args) => page.getByText(...args) };
        await assert.rejects(verifySelectedTenant(fixture, { id: expected, confirmed: true }), /cannot be matched/);
    });
});
