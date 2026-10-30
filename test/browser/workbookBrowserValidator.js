const fs = require('fs');
const { URL } = require('url');

function isAzurePortalUrl(value) {
    return /^https:\/\/portal\.azure\.(com|us|cn)(\/|$)/.test(value);
}

function isAzureSignInUrl(value) {
    return /^https:\/\/(login\.microsoftonline\.(com|us)|login\.partner\.microsoftonline\.cn|login\.chinacloudapi\.cn)(\/|$)/.test(value);
}

function normalizeTenantSelection(value) {
    if (value === undefined) return undefined;
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        value.useBrowserSession === true && Object.keys(value).length === 1) {
        return { useBrowserSession: true };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(key => !['id', 'confirmed'].includes(key)) ||
        typeof value.id !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id.trim()) ||
        (value.confirmed !== undefined && typeof value.confirmed !== 'boolean')) {
        throw new Error('tenant must contain a tenant GUID and an explicit boolean confirmed choice.');
    }
    return { id: value.id.trim().toLowerCase(), confirmed: value.confirmed === true };
}

function requireConfirmedTenant(value) {
    const tenant = normalizeTenantSelection(value);
    if (!tenant?.confirmed && !tenant?.useBrowserSession) {
        throw new Error('PAUSED: Ask the user which Azure tenant to sign in to and wait for explicit selection and confirmation, including in autopilot. Do not choose the current/default tenant.');
    }
    return tenant;
}

async function portalSelectionPrompt(page) {
    const prompts = [
        { reason: 'account-selection', text: /^(Pick|Choose|Select) (an? )?account$/i },
        { reason: 'tenant-selection', text: /^(Pick|Choose|Select|Switch) (an? )?(tenant|directory|organization)$/i }
    ];
    for (const prompt of prompts) {
        if (await page.getByText(prompt.text, { exact: true }).filter({ visible: true }).count()) {
            return prompt.reason;
        }
    }
}

async function verifySelectedTenant(page, value) {
    const tenant = requireConfirmedTenant(value);
    if (!isAzurePortalUrl(page.url())) {
        throw new Error('PAUSED: Sign in to Azure in the external browser before running portal validation. Leave account and tenant choices to the user.');
    }
    if (await portalSelectionPrompt(page)) {
        throw new Error('PAUSED: An Azure account or tenant choice is pending. Let the user select it in the external browser; no choice is made automatically.');
    }
    const account = page.getByRole('button', { name: /^Account menu/ });
    if (await account.count() !== 1 || !await account.isVisible()) {
        throw new Error('PAUSED: Cannot verify the selected tenant from the portal account menu.');
    }
    const titles = await account.locator('[title]').evaluateAll(elements => elements.map(element => element.getAttribute('title') || ''));
    const ids = new Set(titles.flatMap(title => {
        const directory = title.match(/\bDirectory:([\s\S]*)/i);
        return directory ? Array.from(directory[1].matchAll(/\(([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\)/gi),
            match => match[1].toLowerCase()) : [];
    }));
    if (ids.size !== 1 || (!tenant.useBrowserSession && !ids.has(tenant.id))) {
        throw new Error('PAUSED: The signed-in tenant is different from, or cannot be matched to, the user-confirmed tenant. Ask the user to select it; do not switch automatically.');
    }
    return { id: ids.values().next().value, confirmed: true };
}

async function openAzurePortal(page, tenant = { useBrowserSession: true }, timeout = 30000) {
    requireConfirmedTenant(tenant);
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120000) {
        throw new Error('timeout must be an integer between 1 and 120000 milliseconds.');
    }
    const current = page.url();
    if (current === 'about:blank') {
        await page.goto('https://portal.azure.com/', { waitUntil: 'domcontentloaded', timeout });
    } else if (!isAzurePortalUrl(current) && !isAzureSignInUrl(current)) {
        throw new Error('Use a blank external browser page or an existing Azure portal/sign-in page. Other pages will not be replaced.');
    }
    if (isAzurePortalUrl(page.url())) {
        const ready = await page.waitForFunction(() => {
            if (!/^https:\/\/portal\.azure\.(com|us|cn)(\/|$)/.test(location.href)) return true;
            const visible = element => element.getClientRects().length > 0;
            if (Array.from(document.querySelectorAll('button[aria-label^="Account menu"]')).some(visible)) return true;
            return Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"],[role="dialog"]')).some(element =>
                visible(element) && /\b(Pick|Choose|Select|Switch) (an? )?(account|tenant|directory|organization)\b/i.test(element.textContent));
        }, null, { timeout });
        await ready.dispose();
    }
    const prompt = await portalSelectionPrompt(page);
    if (prompt || !isAzurePortalUrl(page.url())) {
        return {
            status: 'paused',
            reason: prompt || 'sign-in',
            guidance: 'Select the account/tenant and finish sign-in in this external browser, then rerun. No account or tenant was selected automatically.',
            workbookValidated: false
        };
    }
    await verifySelectedTenant(page, tenant);
    return {
        status: 'ready',
        tenantVerified: true,
        guidance: 'The external browser is already signed in without a pending choice. Continue in a new empty unsaved workbook Advanced Editor; validation pins and rechecks this tenant.',
        workbookValidated: false
    };
}

function normalizeScreenshotOptions(value) {
    if (value === undefined || value === false) return false;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(key => !['directory', 'maskSelectors', 'redaction', 'allowSensitiveCapture'].includes(key))) {
        throw new Error('screenshots must be an object with supported options only.');
    }
    const directory = value.directory;
    if (typeof directory !== 'string' || !directory.trim() || /[\u0000-\u001F]/.test(directory) ||
        /^(?:[\\/]{2}|[a-z][a-z0-9+.-]*:)/i.test(directory.replace(/^[a-z]:[\\/]/i, '')) ||
        directory.split(/[\\/]/).includes('..')) {
        throw new Error('screenshots.directory must be a local directory without URLs, network paths, or parent traversal.');
    }
    const maskSelectors = value.maskSelectors === undefined ? [] : value.maskSelectors;
    if (!Array.isArray(maskSelectors) || maskSelectors.some(selector => typeof selector !== 'string' || !selector.trim())) {
        throw new Error('screenshots.maskSelectors must be an array of non-empty CSS selectors.');
    }
    const redaction = value.redaction === undefined ? 'auto' : value.redaction;
    const allowSensitiveCapture = value.allowSensitiveCapture === undefined ? false : value.allowSensitiveCapture;
    if (!['auto', 'manual', 'ai-assisted', 'none'].includes(redaction) || typeof allowSensitiveCapture !== 'boolean') {
        throw new Error('Choose auto, manual, ai-assisted, or none redaction and a boolean allowSensitiveCapture choice.');
    }
    if (redaction !== 'auto' && !allowSensitiveCapture) {
        throw new Error('PAUSED: Non-auto screenshots can expose sensitive content. Obtain explicit approval and set allowSensitiveCapture to true; never disable redaction automatically.');
    }
    if (['manual', 'ai-assisted'].includes(redaction) && !maskSelectors.length) {
        throw new Error('Manual and AI-assisted redaction require explicitly reviewed maskSelectors. No AI service is called automatically.');
    }
    if (redaction === 'none' && maskSelectors.length) {
        throw new Error('Unredacted mode cannot silently ignore maskSelectors; use a selective redaction mode instead.');
    }
    return { directory, maskSelectors, redaction, allowSensitiveCapture };
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
    checkObject(options, 'Browser validation options', ['tabs', 'deferred', 'timeout', 'screenshots', 'tenant']);
    const timeout = options.timeout === undefined ? 30000 : options.timeout;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120000) {
        throw new Error('timeout must be an integer between 1 and 120000 milliseconds.');
    }
    const screenshots = normalizeScreenshotOptions(options.screenshots);
    const tenant = normalizeTenantSelection(options.tenant);

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
        if (producer.item.content.style !== 'toolbar') {
            throw new Error(`Trigger "${trigger}" must belong to a source-defined toolbar; other link renderers cannot be bound safely.`);
        }
        const toolbarLabels = producer.item.content.links.map(link => label(link.linkLabel, 'Toolbar link label'));
        if (toolbarLabels.some(value => /[{}]/.test(value))) {
            throw new Error('Deferred toolbar contracts require static link labels for runtime binding.');
        }
        if (hideTriggerAfterLoad &&
            producer.item.conditionalVisibility?.parameterName === producer.link.cellValue &&
            !producer.globals.has(producer.link.cellValue)) {
            throw new Error(`Trigger "${trigger}" must declare its visibility parameter as global before the producer.`);
        }
        return { tab, trigger, heading, hideTriggerAfterLoad, minRows: check.minRows, maxRows: check.maxRows, columns, toolbarLabels };
    });

    const groups = new Map();
    for (const check of deferred) {
        const key = JSON.stringify([check.tab, check.trigger]);
        if (!groups.has(key)) {
            groups.set(key, { tab: check.tab, trigger: check.trigger, toolbarLabels: check.toolbarLabels, checks: [] });
        }
        groups.get(key).checks.push(check);
    }
    return { source, itemCount, tabs, deferred, deferredGroups: Array.from(groups.values()), timeout, screenshots, tenant };
}

function markScreenshotMasks(body, settings) {
    const document = body.ownerDocument;
    if (document.querySelector('[data-workbook-validation-mask],[data-workbook-validation-label],[data-workbook-validation-capture],[data-workbook-validation-style]')) {
        throw new Error('A previous screenshot mask is still present; refusing to capture.');
    }
    const automatic = settings.redaction === undefined || settings.redaction === 'auto';
    const elements = new Set(automatic ? body.querySelectorAll(
        'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="combobox"],[role="searchbox"],' +
        '[role="gridcell"],[role="rowheader"],svg,canvas,img,picture,video,iframe,object,embed'
    ) : []);
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
    for (let node = automatic ? walker.nextNode() : null; node; node = walker.nextNode()) {
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

function screenshotRedactionStyle(marker, redaction = 'auto') {
    const scope = `body[data-workbook-validation-capture="${marker}"]`;
    const automatic = redaction === 'auto' ?
        `${scope}, ${scope} * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; background-image: none !important; }
        ${scope} [data-workbook-validation-label="${marker}"] { color: #111111 !important; -webkit-text-fill-color: #111111 !important; }
        ${scope} :is(svg,canvas,img,picture,video,iframe,object,embed) { visibility: hidden !important; }` : '';
    return `${automatic}
        ${scope}[data-workbook-validation-mask="${marker}"], ${scope} [data-workbook-validation-mask="${marker}"], ${scope} [data-workbook-validation-mask="${marker}"] * { background-color: #111111 !important; color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; background-image: none !important; }
        ${scope} [data-workbook-validation-mask="${marker}"]:is(svg,canvas,img,picture,video,iframe,object,embed), ${scope} [data-workbook-validation-mask="${marker}"] :is(svg,canvas,img,picture,video,iframe,object,embed) { visibility: hidden !important; }`;
}

function applyScreenshotRedaction(body, settings) {
    const document = body.ownerDocument;
    const style = document.createElement('style');
    style.setAttribute('data-workbook-validation-style', settings.marker);
    style.textContent = settings.css;
    document.head.append(style);
    const probe = document.createElement('span');
    probe.textContent = 'Screenshot redaction probe';
    if (settings.redaction !== undefined && settings.redaction !== 'auto') {
        probe.setAttribute('data-workbook-validation-mask', settings.marker);
    }
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

function isolateWorkbookFrame(frame, marker) {
    const document = frame.ownerDocument;
    if (document.documentElement.hasAttribute('data-workbook-parent-isolation')) {
        throw new Error('A parent-page screenshot isolation is already active; refusing to capture.');
    }
    const originals = new Map();
    const setVisibility = element => {
        if (!element.style) return;
        const value = element === frame ? 'visible' : 'hidden';
        if (element.style.getPropertyValue('visibility') === value &&
            element.style.getPropertyPriority('visibility') === 'important') return;
        if (!originals.has(element)) {
            originals.set(element, {
                value: element.style.getPropertyValue('visibility'),
                priority: element.style.getPropertyPriority('visibility'),
                hadStyle: element.hasAttribute('style')
            });
        }
        element.style.setProperty('visibility', value, 'important');
    };
    const conceal = element => {
        if (element.nodeType !== 1) return;
        setVisibility(element);
        for (const descendant of element.querySelectorAll('*')) setVisibility(descendant);
    };
    const style = document.createElement('style');
    const observer = new document.defaultView.MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') setVisibility(mutation.target);
            for (const node of mutation.addedNodes) conceal(node);
        }
    });
    const restore = () => {
        observer.disconnect();
        style.remove();
        document.documentElement.removeAttribute('data-workbook-parent-isolation');
        for (const [element, previous] of originals) {
            if (previous.value) element.style.setProperty('visibility', previous.value, previous.priority);
            else element.style.removeProperty('visibility');
            if (!previous.hadStyle && element.getAttribute('style') === '') element.removeAttribute('style');
        }
    };
    try {
        document.documentElement.setAttribute('data-workbook-parent-isolation', marker);
        style.textContent = `html[data-workbook-parent-isolation="${marker}"] body,
            html[data-workbook-parent-isolation="${marker}"] body *,
            html[data-workbook-parent-isolation="${marker}"] body *::before,
            html[data-workbook-parent-isolation="${marker}"] body *::after,
            html[data-workbook-parent-isolation="${marker}"] ::backdrop { visibility: hidden !important; }`;
        document.head.append(style);
        conceal(document.body);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        const probe = document.createElement('span');
        document.body.append(probe);
        const hidden = document.defaultView.getComputedStyle(probe).visibility === 'hidden';
        probe.remove();
        if (!hidden || document.defaultView.getComputedStyle(frame).visibility !== 'visible') {
            throw new Error('Parent-page screenshot isolation did not take effect; refusing to capture.');
        }
        return restore;
    } catch (error) {
        restore();
        throw error;
    }
}

async function screenshotIsolatedWorkbook(page, target, options, marker) {
    const restore = await page.locator('iframe[name="Workbooks.ReactView"]').evaluateHandle(isolateWorkbookFrame, marker);
    try {
        await target.screenshot(options);
    } finally {
        try {
            await restore.evaluate(cleanup => cleanup());
        } finally {
            await restore.dispose();
        }
    }
}

async function captureMaskedScreenshot(page, target, settings, allowedLabels, index) {
    settings = normalizeScreenshotOptions(settings);
    if (!settings || settings.redaction === 'none') {
        throw new Error('Masked capture requires an enabled auto or selective redaction mode.');
    }
    const frame = page.locator('iframe[name="Workbooks.ReactView"]').contentFrame();
    const body = frame.locator('body');
    const marker = `capture-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2)}`;
    const file = `${marker}.png`;
    const separator = settings.directory.includes('\\') ? '\\' : '/';
    const path = settings.directory.replace(/[\\/]+$/, '') + separator + file;
    const maskedElements = await body.evaluate(markScreenshotMasks, {
        marker, allowedLabels, maskSelectors: settings.maskSelectors, redaction: settings.redaction
    });
    try {
        if (!maskedElements) throw new Error('No screenshot masks were applied; refusing to capture.');
        const css = screenshotRedactionStyle(marker, settings.redaction);
        await body.evaluate(applyScreenshotRedaction, { marker, css, redaction: settings.redaction });
        await screenshotIsolatedWorkbook(page, target, {
            path,
            type: 'png',
            scale: 'css',
            animations: 'disabled',
            caret: 'hide'
        }, marker);
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
    return { file, maskedElements, redaction: settings.redaction, reviewRequired: true, publicationApproved: false };
}

async function captureWorkbookScreenshot(page, target, settings, allowedLabels, index) {
    settings = normalizeScreenshotOptions(settings);
    if (!settings) throw new Error('Screenshot capture is not enabled.');
    if (settings.redaction !== 'none') {
        return captureMaskedScreenshot(page, target, settings, allowedLabels, index);
    }
    const file = `capture-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2)}.png`;
    const separator = settings.directory.includes('\\') ? '\\' : '/';
    await screenshotIsolatedWorkbook(page, target, {
        path: settings.directory.replace(/[\\/]+$/, '') + separator + file,
        type: 'png', scale: 'css', animations: 'disabled', caret: 'hide'
    }, file.replace(/\.png$/, ''));
    return { file, maskedElements: 0, redaction: 'none', reviewRequired: true, publicationApproved: false };
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

async function bindParameterTrigger(frame, group, timeout) {
    const trigger = frame.getByRole('menubar').getByRole('menuitem', { name: group.trigger, exact: true });
    await trigger.waitFor({ state: 'visible', timeout });
    const toolbar = trigger.locator('xpath=ancestor::*[@role="menubar"][1]');
    if (await toolbar.count() !== 1) {
        throw new Error('Cannot bind the parameter action to its source toolbar; refusing activation.');
    }
    const labels = await toolbar.getByRole('menuitem').evaluateAll(elements => elements.map(element =>
        (element.getAttribute('aria-label') || element.textContent || '')
            .replace(/^[\uE000-\uF8FF\s]+/, '').replace(/\s+/g, ' ').trim()));
    if (JSON.stringify(labels) !== JSON.stringify(group.toolbarLabels)) {
        throw new Error('Rendered parameter toolbar differs from the validated source; refusing activation.');
    }
    return trigger;
}

async function validateWorkbookInBrowser(page, workbookSource, options = {}) {
    const plan = createValidationPlan(workbookSource, options);
    const selectedTenant = await verifySelectedTenant(page, plan.tenant);
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
            await verifySelectedTenant(page, selectedTenant);
            const result = await captureWorkbookScreenshot(page, target, plan.screenshots, allowedLabels, screenshots.length);
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
            await verifySelectedTenant(page, selectedTenant);
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
        await verifySelectedTenant(page, selectedTenant);
        if (group.tab !== undefined) {
            await activateWorkbookControl(tablist.getByRole('tab', { name: group.tab, exact: true }), plan.timeout);
            await tablist.getByRole('tab', { name: group.tab, exact: true, selected: true })
                .waitFor({ state: 'visible', timeout: plan.timeout });
        }
        const trigger = await bindParameterTrigger(frame, group, plan.timeout);
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
        tenantVerified: true,
        itemCount: plan.itemCount,
        tabsVisited,
        parameterActionsClicked,
        deferredChecks,
        dataContractsChecked: deferredChecks.filter(check => check.grid).length,
        screenshots: {
            enabled: Boolean(plan.screenshots),
            captures: screenshots,
            guidance: plan.screenshots ?
                'Review every local image before sharing; nothing was uploaded. If auto redaction hides too much, ask the user to choose manual masks, AI-assisted mask selection, or explicitly approved unredacted capture. Never turn masking off automatically; no AI service is called.' :
                'Optional screenshots are available with auto redaction by default. Ask the user whether to capture; manual/AI-assisted masks and unredacted local capture require explicit approval.'
        },
        coverage: 'Only source import, primary tabs, and requested contracts were checked; no-data is not proof of health.',
        workbookSaved: false
    };
}

function loadValidationInput(workbookPath, checksPath, screenshotDirectory, runtime = {}) {
    if (typeof workbookPath !== 'string' || !workbookPath.trim()) {
        throw new Error('Set WORKBOOK_BROWSER_TEMPLATE or provide --workbook.');
    }
    if (checksPath !== undefined && (typeof checksPath !== 'string' || !checksPath.trim())) {
        throw new Error('The checks file must be a non-empty path.');
    }
    const source = fs.readFileSync(workbookPath, 'utf8');
    let options = checksPath === undefined ? {} : JSON.parse(fs.readFileSync(checksPath, 'utf8'));
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('Browser validation options must be an object.');
    }
    if (screenshotDirectory !== undefined) {
        options = { ...options, screenshots: { ...options.screenshots, directory: screenshotDirectory } };
    }
    if (runtime.useBrowserTenant !== undefined) {
        if (typeof runtime.useBrowserTenant !== 'boolean') {
            throw new Error('useBrowserTenant must be a boolean.');
        }
        if (runtime.useBrowserTenant && (runtime.tenantId !== undefined || runtime.confirmTenant !== undefined)) {
            throw new Error('Choose browser-session mode or an explicit tenant confirmation, not both.');
        }
        if (runtime.useBrowserTenant) {
            if (options.tenant !== undefined && !normalizeTenantSelection(options.tenant).useBrowserSession) {
                throw new Error('Browser-session mode cannot silently replace an explicit tenant constraint.');
            }
            options = { ...options, tenant: { useBrowserSession: true } };
        } else if (options.tenant?.useBrowserSession) {
            options = { ...options, tenant: undefined };
        }
    }
    if (runtime.tenantId !== undefined || runtime.confirmTenant !== undefined) {
        if (options.tenant?.useBrowserSession && runtime.tenantId === undefined) {
            throw new Error('An explicit tenant GUID is required when replacing browser-session mode.');
        }
        options = {
            ...options,
            tenant: {
                ...(options.tenant?.useBrowserSession ? {} : options.tenant),
                id: runtime.tenantId === undefined ? options.tenant?.id : runtime.tenantId,
                confirmed: runtime.confirmTenant === true
            }
        };
    }
    if (runtime.redaction !== undefined || runtime.allowSensitiveCapture !== undefined) {
        options = {
            ...options,
            screenshots: {
                ...options.screenshots,
                ...(runtime.redaction === undefined ? {} : { redaction: runtime.redaction }),
                ...(runtime.allowSensitiveCapture === undefined ? {} : { allowSensitiveCapture: runtime.allowSensitiveCapture })
            }
        };
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
    const functions = [isAzurePortalUrl, normalizeTenantSelection, requireConfirmedTenant, portalSelectionPrompt, verifySelectedTenant,
        normalizeScreenshotOptions, createValidationPlan, markScreenshotMasks, screenshotRedactionStyle,
        applyScreenshotRedaction, isolateWorkbookFrame, screenshotIsolatedWorkbook, captureMaskedScreenshot,
        captureWorkbookScreenshot, readGridSummary, activateWorkbookControl, bindParameterTrigger, validateWorkbookInBrowser]
        .map(callback => callback.toString()).join('\n\n');
    return `async (page) => {\n${functions}\nreturn validateWorkbookInBrowser(page, ${JSON.stringify(plan.source)}, ${JSON.stringify(options)});\n}\n`;
}

function createPortalScript(tenant = { useBrowserSession: true }) {
    normalizeTenantSelection(tenant);
    const functions = [isAzurePortalUrl, isAzureSignInUrl, normalizeTenantSelection, requireConfirmedTenant,
        portalSelectionPrompt, verifySelectedTenant, openAzurePortal].map(callback => callback.toString()).join('\n\n');
    return `async (page) => {\n${functions}\nreturn openAzurePortal(page, ${JSON.stringify(tenant)});\n}\n`;
}

module.exports = {
    isAzurePortalUrl,
    isAzureSignInUrl,
    normalizeTenantSelection,
    requireConfirmedTenant,
    verifySelectedTenant,
    portalSelectionPrompt,
    openAzurePortal,
    normalizeScreenshotOptions,
    createValidationPlan,
    markScreenshotMasks,
    screenshotRedactionStyle,
    applyScreenshotRedaction,
    isolateWorkbookFrame,
    screenshotIsolatedWorkbook,
    captureMaskedScreenshot,
    captureWorkbookScreenshot,
    readGridSummary,
    activateWorkbookControl,
    bindParameterTrigger,
    validateWorkbookInBrowser,
    loadValidationInput,
    validateCdpEndpoint,
    createPlaywrightScript,
    createPortalScript
};
