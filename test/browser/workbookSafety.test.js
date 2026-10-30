const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureWorkbookScreenshot, bindParameterTrigger, activateWorkbookControl,
    verifySelectedTenant } = require('./workbookBrowserValidator');

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
