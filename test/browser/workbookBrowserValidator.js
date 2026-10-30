const fs = require('fs');
const { URL } = require('url');

function isAzurePortalUrl(value) {
    return /^https:\/\/portal\.azure\.(com|us|cn)(\/|$)/.test(value);
}

function createValidationPlan(workbookSource, options = {}) {
    function checkObject(value, label, keys) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`${label} must be an object.`);
        }
        if (keys && Object.keys(value).some(key => !keys.includes(key))) {
            throw new Error(`${label} contains an unsupported option.`);
        }
    }

    function label(value, name) {
        if (typeof value !== 'string' || !value.trim()) {
            throw new Error(`${name} must be a non-empty string.`);
        }
        return value.replace(/\s+/g, ' ').trim();
    }

    function labels(values, name) {
        if (!Array.isArray(values)) {
            throw new Error(`${name} must be an array.`);
        }
        const result = values.map(value => label(value, name));
        if (new Set(result).size !== result.length) {
            throw new Error(`${name} must contain unique labels.`);
        }
        return result;
    }

    if (typeof workbookSource !== 'string' || !workbookSource.trim()) {
        throw new Error('Workbook source must be a non-empty JSON string.');
    }
    const source = workbookSource.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    let workbook;
    try {
        workbook = JSON.parse(source);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('Workbook source must be valid JSON.');
        }
        throw error;
    }
    if (!workbook || workbook.version !== 'Notebook/1.0' || !Array.isArray(workbook.items)) {
        throw new Error('Expected a Notebook/1.0 workbook with an items array.');
    }
    checkObject(options, 'Browser validation options', ['tabs', 'deferred', 'timeout', 'screenshots']);
    const timeout = options.timeout === undefined ? 30000 : options.timeout;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120000) {
        throw new Error('timeout must be an integer between 1 and 120000 milliseconds.');
    }
    let screenshots = false;
    if (options.screenshots !== undefined && options.screenshots !== false) {
        checkObject(options.screenshots, 'screenshots', ['directory', 'maskSelectors']);
        const directory = options.screenshots.directory;
        if (typeof directory !== 'string' || !directory.trim() || /[\u0000-\u001F]/.test(directory) ||
            /^(?:[\\/]{2}|[a-z][a-z0-9+.-]*:)/i.test(directory.replace(/^[a-z]:[\\/]/i, '')) ||
            directory.split(/[\\/]/).includes('..')) {
            throw new Error('screenshots.directory must be a local directory without URLs, network paths, or parent traversal.');
        }
        const maskSelectors = options.screenshots.maskSelectors === undefined ? [] : options.screenshots.maskSelectors;
        if (!Array.isArray(maskSelectors) || maskSelectors.some(selector => typeof selector !== 'string' || !selector.trim())) {
            throw new Error('screenshots.maskSelectors must be an array of non-empty CSS selectors.');
        }
        screenshots = { directory, maskSelectors };
    }

    const links = [];
    const tabsets = [];
    let itemCount = 0;
    function visit(items, inheritedGlobals) {
        if (!Array.isArray(items)) {
            throw new Error('Workbook group items must be an array.');
        }
        const globals = new Map(inheritedGlobals);
        for (const item of items) {
            checkObject(item, 'Workbook item');
            itemCount++;
            const content = item.content || {};
            if (item.type === 9) {
                const parameters = content.parameters || [];
                if (!Array.isArray(parameters)) {
                    throw new Error('Workbook parameters must be an array.');
                }
                for (const parameter of parameters) {
                    if (parameter.isGlobal === true) {
                        globals.set(parameter.name, parameter);
                    }
                }
            }
            if (item.type === 11) {
                const itemLinks = content.links || [];
                if (!Array.isArray(itemLinks)) {
                    throw new Error('Workbook links must be an array.');
                }
                if (content.style === 'tabs') {
                    tabsets.push(itemLinks);
                }
                for (const link of itemLinks) {
                    links.push({ item, link, globals: new Map(globals) });
                }
            }
            if (item.type === 12) {
                const childGlobals = visit(content.items || [], globals);
                if (content.exportParameters === true) {
                    for (const [name, parameter] of childGlobals) {
                        globals.set(name, parameter);
                    }
                }
            }
        }
        return globals;
    }
    visit(workbook.items, new Map());

    const primaryTabs = tabsets[0] || [];
    if (tabsets.some(tabset => tabset.some(link => link.linkTarget !== 'parameter'))) {
        throw new Error('Automatic tab navigation supports parameter links only.');
    }
    if (options.tabs === undefined && primaryTabs.some(link => /[{}]/.test(link.linkLabel))) {
        throw new Error('Provide explicit tabs when tab labels contain parameter substitutions.');
    }
    const tabs = labels(options.tabs === undefined ? primaryTabs.map(link => link.linkLabel) : options.tabs, 'tabs');
    if ((!primaryTabs.length && tabs.length) || (primaryTabs.length && !tabs.length)) {
        throw new Error('tabs must describe the primary parameter-driven tabset.');
    }
    const requested = options.deferred === undefined ? [] : options.deferred;
    if (!Array.isArray(requested)) {
        throw new Error('deferred must be an array.');
    }
    const deferred = requested.map(check => {
        checkObject(check, 'Deferred-content check', [
            'tab', 'trigger', 'heading', 'hideTriggerAfterLoad', 'minRows', 'maxRows', 'columns'
        ]);
        const trigger = label(check.trigger, 'trigger');
        const heading = label(check.heading, 'heading');
        const tab = check.tab === undefined ? tabs[0] : label(check.tab, 'tab');
        if (tab !== undefined && !tabs.includes(tab)) {
            throw new Error('A deferred-content tab must belong to the primary tabset.');
        }
        const hideTriggerAfterLoad = check.hideTriggerAfterLoad === undefined ? false : check.hideTriggerAfterLoad;
        if (typeof hideTriggerAfterLoad !== 'boolean') {
            throw new Error('hideTriggerAfterLoad must be a boolean.');
        }
        for (const name of ['minRows', 'maxRows']) {
            if (check[name] !== undefined && (!Number.isSafeInteger(check[name]) || check[name] < 0)) {
                throw new Error(`${name} must be a non-negative integer.`);
            }
        }
        if (check.minRows !== undefined && check.maxRows !== undefined && check.minRows > check.maxRows) {
            throw new Error('minRows must not exceed maxRows.');
        }
        const columns = check.columns === undefined ? undefined : labels(check.columns, 'columns');
        if (columns && !columns.length) {
            throw new Error('columns must contain at least one label.');
        }
        const matches = links.filter(entry => typeof entry.link.linkLabel === 'string' &&
            label(entry.link.linkLabel, 'Link label') === trigger);
        if (matches.length !== 1 || matches[0].link.linkTarget !== 'parameter') {
            throw new Error(`Trigger "${trigger}" must identify one parameter link, not an external or ARM action.`);
        }
        const producer = matches[0];
        if (hideTriggerAfterLoad &&
            producer.item.conditionalVisibility?.parameterName === producer.link.cellValue &&
            !producer.globals.has(producer.link.cellValue)) {
            throw new Error(`Trigger "${trigger}" must declare its visibility parameter as global before the producer.`);
        }
        return { tab, trigger, heading, hideTriggerAfterLoad, minRows: check.minRows, maxRows: check.maxRows, columns };
    });

    const groups = new Map();
    for (const check of deferred) {
        const key = JSON.stringify([check.tab, check.trigger]);
        if (!groups.has(key)) {
            groups.set(key, { tab: check.tab, trigger: check.trigger, checks: [] });
        }
        groups.get(key).checks.push(check);
    }
    return { source, itemCount, tabs, deferred, deferredGroups: Array.from(groups.values()), timeout, screenshots };
}

function markScreenshotMasks(body, settings) {
    const document = body.ownerDocument;
    if (document.querySelector('[data-workbook-validation-mask],[data-workbook-validation-label],[data-workbook-validation-capture],[data-workbook-validation-style]')) {
        throw new Error('A previous screenshot mask is still present; refusing to capture.');
    }
    const elements = new Set(body.querySelectorAll(
        'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="combobox"],[role="searchbox"],' +
        '[role="gridcell"],[role="rowheader"],svg,canvas,img,picture,video,iframe,object,embed'
    ));
    for (const selector of settings.maskSelectors) {
        const matches = body.querySelectorAll(selector);
        if (!matches.length) {
            throw new Error('An additional screenshot mask selector matched no elements; refusing to capture.');
        }
        for (const element of matches) elements.add(element);
    }
    const allowedLabels = new Set(settings.allowedLabels.map(label => label.replace(/\s+/g, ' ').trim()));
    const labels = new Set();
    const walker = document.createTreeWalker(body, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue.replace(/\s+/g, ' ').trim();
        const parent = node.parentElement;
        if (!text || !parent || parent.closest('script,style,noscript')) continue;
        const fixedLabel = parent.closest('[role="tab"],[role="heading"],[role="columnheader"],h1,h2,h3,h4,h5,h6');
        if (fixedLabel && allowedLabels.has(text) && !parent.closest('[role="gridcell"],[role="rowheader"]')) {
            labels.add(parent);
            continue;
        }
        if (/^[\uE000-\uF8FF\s]+$/.test(text)) continue;
        elements.add(parent);
    }
    for (const element of elements) element.setAttribute('data-workbook-validation-mask', settings.marker);
    for (const element of labels) element.setAttribute('data-workbook-validation-label', settings.marker);
    body.setAttribute('data-workbook-validation-capture', settings.marker);
    return elements.size;
}

function screenshotRedactionStyle(marker) {
    const scope = `body[data-workbook-validation-capture="${marker}"]`;
    return `${scope}, ${scope} * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; background-image: none !important; }
        ${scope} [data-workbook-validation-label="${marker}"] { color: #111111 !important; -webkit-text-fill-color: #111111 !important; }
        ${scope} [data-workbook-validation-mask="${marker}"], ${scope} [data-workbook-validation-mask="${marker}"] * { background-color: #111111 !important; color: transparent !important; -webkit-text-fill-color: transparent !important; }
        ${scope} :is(svg,canvas,img,picture,video,iframe,object,embed) { visibility: hidden !important; }`;
}

function applyScreenshotRedaction(body, settings) {
    const document = body.ownerDocument;
    const style = document.createElement('style');
    style.setAttribute('data-workbook-validation-style', settings.marker);
    style.textContent = settings.css;
    document.head.append(style);
    const probe = document.createElement('span');
    probe.textContent = 'Screenshot redaction probe';
    body.append(probe);
    try {
        const computed = document.defaultView.getComputedStyle(probe);
        if (computed.color !== 'rgba(0, 0, 0, 0)' ||
            computed.getPropertyValue('-webkit-text-fill-color') !== 'rgba(0, 0, 0, 0)') {
            throw new Error('Screenshot redaction CSS did not take effect; refusing to capture.');
        }
    } finally {
        probe.remove();
    }
}

async function captureMaskedScreenshot(page, target, settings, allowedLabels, index) {
    const frame = page.locator('iframe[name="Workbooks.ReactView"]').contentFrame();
    const body = frame.locator('body');
    const marker = `capture-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2)}`;
    const file = `${marker}.png`;
    const separator = settings.directory.includes('\\') ? '\\' : '/';
    const path = settings.directory.replace(/[\\/]+$/, '') + separator + file;
    const maskedElements = await body.evaluate(markScreenshotMasks, {
        marker, allowedLabels, maskSelectors: settings.maskSelectors
    });
    try {
        if (!maskedElements) throw new Error('No screenshot masks were applied; refusing to capture.');
        const css = screenshotRedactionStyle(marker);
        await body.evaluate(applyScreenshotRedaction, { marker, css });
        await target.screenshot({
            path,
            type: 'png',
            scale: 'css',
            animations: 'disabled',
            caret: 'hide'
        });
    } finally {
        await body.evaluate((element, marker) => {
            for (const masked of element.querySelectorAll(`[data-workbook-validation-mask="${marker}"]`)) {
                masked.removeAttribute('data-workbook-validation-mask');
            }
            for (const label of element.querySelectorAll(`[data-workbook-validation-label="${marker}"]`)) {
                label.removeAttribute('data-workbook-validation-label');
            }
            element.removeAttribute('data-workbook-validation-mask');
            element.removeAttribute('data-workbook-validation-label');
            element.removeAttribute('data-workbook-validation-capture');
            for (const style of element.ownerDocument.querySelectorAll(`[data-workbook-validation-style="${marker}"]`)) {
                style.remove();
            }
        }, marker);
    }
    return { file, maskedElements, reviewRequired: true };
}

function readGridSummary(element) {
    const count = element.getAttribute('aria-rowcount');
    if (count === null || !/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)) || Number(count) < 1) {
        throw new Error('Cannot validate virtualized row limits without a reliable aria-rowcount.');
    }
    const columns = Array.from(element.querySelectorAll('[role="columnheader"]'), header =>
        (header.textContent || '').replace(/^[\uE000-\uF8FF\s]+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { rows: Number(count) - 1, columns };
}

async function activateWorkbookControl(locator, timeout) {
    await locator.waitFor({ state: 'visible', timeout });
    if (!await locator.isEnabled()) {
        throw new Error('A requested workbook control is disabled; refusing to activate it.');
    }
    await locator.press('Enter');
}

async function validateWorkbookInBrowser(page, workbookSource, options = {}) {
    const plan = createValidationPlan(workbookSource, options);
    if (!isAzurePortalUrl(page.url())) {
        throw new Error('Sign in to Azure in the existing browser before running portal validation.');
    }
    if (await page.getByRole('heading', { name: /\bUnsaved Workbook\b/ }).count() !== 1) {
        throw new Error('Open a new empty unsaved workbook. Existing workbook content will not be replaced.');
    }
    const frame = page.locator('iframe[name="Workbooks.ReactView"]').contentFrame();
    const editorInput = frame.getByRole('textbox', { name: 'Editor content', exact: true });
    await editorInput.waitFor({ state: 'visible', timeout: plan.timeout });
    const sourceSha256 = await editorInput.evaluate(async (element, source) => {
        const editors = globalThis.monaco?.editor?.getEditors?.() || [];
        const active = editors.filter(editor => editor.getDomNode()?.contains(element));
        if (active.length !== 1) {
            throw new Error('Expected one active Advanced Editor; no content was replaced.');
        }
        const model = active[0].getModel();
        if (!model) {
            throw new Error('The active Advanced Editor has no model; no content was replaced.');
        }
        let existing;
        try {
            existing = JSON.parse(model.getValue().replace(/^\uFEFF/, ''));
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('Advanced Editor is not an empty workbook; no content was replaced.');
            }
            throw error;
        }
        if (!existing || existing.version !== 'Notebook/1.0' ||
            !Array.isArray(existing.items) || existing.items.length) {
            throw new Error('Advanced Editor is not an empty workbook; no content was replaced.');
        }
        model.setValue(source);
        if (model.getValue().replace(/\r\n/g, '\n') !== source) {
            throw new Error('Advanced Editor content differs from the requested source.');
        }
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }, plan.source);

    await activateWorkbookControl(frame.getByRole('menuitem', { name: 'Apply', exact: true }), plan.timeout);
    const done = frame.getByRole('menuitem', { name: 'Done Editing', exact: true });
    await done.waitFor({ state: 'visible', timeout: plan.timeout });
    await activateWorkbookControl(done, plan.timeout);
    await frame.getByRole('menubar', { name: /^Workbooks toolbar/ })
        .getByRole('menuitem', { name: 'Edit', exact: true })
        .waitFor({ state: 'visible', timeout: plan.timeout });

    const screenshots = [];
    async function capture(target, allowedLabels, stage) {
        if (plan.screenshots) {
            const result = await captureMaskedScreenshot(page, target, plan.screenshots, allowedLabels, screenshots.length);
            screenshots.push({ ...result, stage });
        }
    }
    const tabsVisited = [];
    const tablist = frame.getByRole('tablist').first();
    if (plan.tabs.length) {
        await tablist.waitFor({ state: 'visible', timeout: plan.timeout });
        const actual = (await tablist.getByRole('tab').allTextContents())
            .map(value => value.replace(/\s+/g, ' ').trim());
        if (JSON.stringify(actual) !== JSON.stringify(plan.tabs)) {
            throw new Error(`Primary tab labels differ: expected ${JSON.stringify(plan.tabs)}, found ${JSON.stringify(actual)}.`);
        }
        for (const name of plan.tabs) {
            await activateWorkbookControl(tablist.getByRole('tab', { name, exact: true }), plan.timeout);
            await tablist.getByRole('tab', { name, exact: true, selected: true })
                .waitFor({ state: 'visible', timeout: plan.timeout });
            tabsVisited.push(name);
            await capture(page.locator('iframe[name="Workbooks.ReactView"]'), plan.tabs, 'tab');
        }
    } else {
        await capture(page.locator('iframe[name="Workbooks.ReactView"]'), [], 'workbook');
    }

    const deferredChecks = [];
    let parameterActionsClicked = 0;
    for (const group of plan.deferredGroups) {
        if (group.tab !== undefined) {
            await activateWorkbookControl(tablist.getByRole('tab', { name: group.tab, exact: true }), plan.timeout);
            await tablist.getByRole('tab', { name: group.tab, exact: true, selected: true })
                .waitFor({ state: 'visible', timeout: plan.timeout });
        }
        const trigger = frame.getByRole('menuitem', { name: group.trigger, exact: true })
            .or(frame.getByRole('button', { name: group.trigger, exact: true }))
            .or(frame.getByRole('link', { name: group.trigger, exact: true }));
        await trigger.waitFor({ state: 'visible', timeout: plan.timeout });
        await trigger.scrollIntoViewIfNeeded();
        for (const check of group.checks) {
            if (await frame.getByRole('heading', { name: check.heading, exact: true, includeHidden: true }).count()) {
                throw new Error(`Deferred content "${check.heading}" was mounted before its trigger.`);
            }
        }
        await activateWorkbookControl(trigger, plan.timeout);
        parameterActionsClicked++;
        for (const check of group.checks) {
            const heading = frame.getByRole('heading', { name: check.heading, exact: true });
            await heading.waitFor({ state: 'visible', timeout: plan.timeout });
            const result = { trigger: check.trigger, heading: check.heading };
            if (check.hideTriggerAfterLoad) {
                await trigger.waitFor({ state: 'hidden', timeout: plan.timeout });
                result.producerHidden = true;
            }
            if (check.minRows !== undefined || check.maxRows !== undefined || check.columns !== undefined) {
                const panel = heading.locator('xpath=ancestor::div[contains(@class,"styleWrapper-maximized")][1]');
                if (await panel.count() !== 1) {
                    throw new Error(`Cannot locate the query panel for "${check.heading}".`);
                }
                const grid = panel.getByRole('grid');
                await grid.waitFor({ state: 'visible', timeout: plan.timeout });
                const summary = await grid.evaluate(readGridSummary);
                if (check.minRows !== undefined && summary.rows < check.minRows) {
                    throw new Error(`"${check.heading}" returned ${summary.rows} rows, below minRows ${check.minRows}.`);
                }
                if (check.maxRows !== undefined && summary.rows > check.maxRows) {
                    throw new Error(`"${check.heading}" returned ${summary.rows} rows, above maxRows ${check.maxRows}.`);
                }
                if (check.columns !== undefined && JSON.stringify(summary.columns) !== JSON.stringify(check.columns)) {
                    throw new Error(`"${check.heading}" column labels differ from the requested contract.`);
                }
                result.grid = summary;
            }
            deferredChecks.push(result);
            if (plan.screenshots) {
                const panel = heading.locator('xpath=ancestor::div[contains(@class,"styleWrapper-maximized")][1]');
                const target = await panel.count() === 1 ? panel : heading;
                await target.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
                await capture(page.locator('iframe[name="Workbooks.ReactView"]'),
                    [check.heading, ...(check.columns || [])], 'deferred');
            }
        }
    }
    return {
        sourceSha256,
        itemCount: plan.itemCount,
        tabsVisited,
        parameterActionsClicked,
        deferredChecks,
        dataContractsChecked: deferredChecks.filter(check => check.grid).length,
        screenshots: {
            enabled: Boolean(plan.screenshots),
            captures: screenshots,
            guidance: plan.screenshots ?
                'Masked screenshots are local evidence, not guaranteed anonymization. Review every image before sharing; nothing was uploaded.' :
                'Optional masked screenshots are available. Enable screenshots.directory in the checks file, --screenshots for script generation, or WORKBOOK_BROWSER_SCREENSHOTS for Mocha.'
        },
        coverage: 'Only source import, primary tabs, and requested contracts were checked; no-data is not proof of health.',
        workbookSaved: false
    };
}

function loadValidationInput(workbookPath, checksPath, screenshotDirectory) {
    if (typeof workbookPath !== 'string' || !workbookPath.trim()) {
        throw new Error('Set WORKBOOK_BROWSER_TEMPLATE or provide --workbook.');
    }
    if (checksPath !== undefined && (typeof checksPath !== 'string' || !checksPath.trim())) {
        throw new Error('The checks file must be a non-empty path.');
    }
    const source = fs.readFileSync(workbookPath, 'utf8');
    let options = checksPath === undefined ? {} : JSON.parse(fs.readFileSync(checksPath, 'utf8'));
    createValidationPlan(source, options);
    if (screenshotDirectory !== undefined) {
        options = { ...options, screenshots: { ...options.screenshots, directory: screenshotDirectory } };
    }
    createValidationPlan(source, options);
    return { source, options };
}

function validateCdpEndpoint(value) {
    const message = 'Use a loopback HTTP CDP endpoint without credentials, paths, query strings, or fragments.';
    let endpoint;
    try {
        endpoint = new URL(value);
    } catch (error) {
        throw new Error(message);
    }
    if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        endpoint.pathname !== '/' || endpoint.port === '0') {
        throw new Error(message);
    }
    return endpoint.href;
}

function createPlaywrightScript(workbookSource, options = {}) {
    const plan = createValidationPlan(workbookSource, options);
    // Keep the emitted runner independent of Node imports and the browser tool's filesystem access.
    const functions = [isAzurePortalUrl, createValidationPlan, markScreenshotMasks, screenshotRedactionStyle,
        applyScreenshotRedaction, captureMaskedScreenshot, readGridSummary, activateWorkbookControl, validateWorkbookInBrowser]
        .map(callback => callback.toString()).join('\n\n');
    return `async (page) => {\n${functions}\nreturn validateWorkbookInBrowser(page, ${JSON.stringify(plan.source)}, ${JSON.stringify(options)});\n}\n`;
}

module.exports = {
    isAzurePortalUrl,
    createValidationPlan,
    markScreenshotMasks,
    screenshotRedactionStyle,
    applyScreenshotRedaction,
    captureMaskedScreenshot,
    readGridSummary,
    activateWorkbookControl,
    validateWorkbookInBrowser,
    loadValidationInput,
    validateCdpEndpoint,
    createPlaywrightScript
};
