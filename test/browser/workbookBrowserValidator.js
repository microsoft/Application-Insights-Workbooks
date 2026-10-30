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
    checkObject(options, 'Browser validation options', ['tabs', 'deferred', 'timeout']);
    const timeout = options.timeout === undefined ? 30000 : options.timeout;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120000) {
        throw new Error('timeout must be an integer between 1 and 120000 milliseconds.');
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

    return { source, itemCount, tabs, deferred, timeout };
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

    await frame.getByRole('menuitem', { name: 'Apply', exact: true }).click();
    const done = frame.getByRole('menuitem', { name: 'Done Editing', exact: true });
    await done.waitFor({ state: 'visible', timeout: plan.timeout });
    await done.click();
    await frame.getByRole('menuitem', { name: 'Edit', exact: true })
        .waitFor({ state: 'visible', timeout: plan.timeout });

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
            await tablist.getByRole('tab', { name, exact: true }).click();
            await tablist.getByRole('tab', { name, exact: true, selected: true })
                .waitFor({ state: 'visible', timeout: plan.timeout });
            tabsVisited.push(name);
        }
    }

    const deferredChecks = [];
    for (const check of plan.deferred) {
        if (check.tab !== undefined) {
            await tablist.getByRole('tab', { name: check.tab, exact: true }).click();
            await tablist.getByRole('tab', { name: check.tab, exact: true, selected: true })
                .waitFor({ state: 'visible', timeout: plan.timeout });
        }
        if (await frame.getByRole('heading', { name: check.heading, exact: true, includeHidden: true }).count()) {
            throw new Error(`Deferred content "${check.heading}" was mounted before its trigger.`);
        }
        const trigger = frame.getByRole('menuitem', { name: check.trigger, exact: true })
            .or(frame.getByRole('button', { name: check.trigger, exact: true }))
            .or(frame.getByRole('link', { name: check.trigger, exact: true }));
        await trigger.waitFor({ state: 'visible', timeout: plan.timeout });
        await trigger.click();
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
    }
    return {
        sourceSha256,
        itemCount: plan.itemCount,
        tabsVisited,
        deferredChecks,
        dataContractsChecked: deferredChecks.filter(check => check.grid).length,
        coverage: 'Only source import, primary tabs, and requested contracts were checked; no-data is not proof of health.',
        workbookSaved: false
    };
}

function loadValidationInput(workbookPath, checksPath) {
    if (typeof workbookPath !== 'string' || !workbookPath.trim()) {
        throw new Error('Set WORKBOOK_BROWSER_TEMPLATE or provide --workbook.');
    }
    if (checksPath !== undefined && (typeof checksPath !== 'string' || !checksPath.trim())) {
        throw new Error('The checks file must be a non-empty path.');
    }
    const source = fs.readFileSync(workbookPath, 'utf8');
    const options = checksPath === undefined ? {} : JSON.parse(fs.readFileSync(checksPath, 'utf8'));
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
    const functions = [isAzurePortalUrl, createValidationPlan, readGridSummary, validateWorkbookInBrowser]
        .map(callback => callback.toString()).join('\n\n');
    return `async (page) => {\n${functions}\nreturn validateWorkbookInBrowser(page, ${JSON.stringify(plan.source)}, ${JSON.stringify(options)});\n}\n`;
}

module.exports = {
    isAzurePortalUrl,
    createValidationPlan,
    readGridSummary,
    validateWorkbookInBrowser,
    loadValidationInput,
    validateCdpEndpoint,
    createPlaywrightScript
};
