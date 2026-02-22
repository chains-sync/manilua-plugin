import { initI18n, t } from './i18n';

declare const Millennium: {
    callServerMethod: (methodName: string, args?: Record<string, unknown>) => Promise<any>;
};

type BackendResponse<T = Record<string, unknown>> = {
    success: boolean;
    error?: string;
} & T;

interface DepotInfo {
    id: string;
    name: string;
    config: any;
    size: string | null;
    has_key: boolean;
}

let isBusy = false;

function backendLog(message: string) {
    try {
        if (typeof Millennium?.callServerMethod === 'function') {
            Millennium.callServerMethod('Logger.log', { message: String(message) }).catch(() => undefined);
        }
    } catch (error) {
        console.warn('[manilua] backendLog failed', error);
    }
}

async function callBackend<T = any>(method: string, args?: Record<string, unknown>): Promise<T> {
    try {
        const result = args === undefined
            ? await Millennium.callServerMethod(method)
            : await Millennium.callServerMethod(method, args);

        if (typeof result === 'string') {
            try {
                return JSON.parse(result) as T;
            } catch {
                return result as unknown as T;
            }
        }
        return result as T;
    } catch (error) {
        backendLog(`Backend call failed: ${method} - ${String(error)}`);
        throw error;
    }
}

function findButtonContainer(): Element | null {
    const selectors = [
        '.game_area_purchase_game_wrapper .game_purchase_action_bg',
        '.game_area_purchase_game:not(.demo_above_purchase) .game_purchase_action_bg',
        '.game_area_purchase_game:not(.demo_above_purchase) .game_purchase_action',
        '.game_area_purchase_game:not(.demo_above_purchase) .btn_addtocart',
        '.game_area_purchase_game_wrapper',
        '.game_purchase_action_bg',
        '.game_purchase_action',
        '.btn_addtocart',
        '[class*="purchase"]',
    ];

    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            if (selector.endsWith('.btn_addtocart')) {
                return element.parentElement;
            }
            return element;
        }
    }
    return null;
}

function getCurrentAppId(): number | null {
    const urlMatch = window.location.href.match(/\/app\/(\d+)/);
    if (urlMatch) {
        return parseInt(urlMatch[1], 10);
    }
    const dataAppId = document.querySelector('[data-appid]');
    if (dataAppId) {
        const value = dataAppId.getAttribute('data-appid');
        if (value) {
            const parsed = parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
                return parsed;
            }
        }
    }
    return null;
}

function formatBytes(bytesStr: string | null): string {
    if (!bytesStr) return 'Unknown';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return 'Unknown';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function createDepotModal(appId: number) {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-manilua-modal', 'depots');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.8)';
    overlay.style.zIndex = '10000';
    
    // Add animation
    overlay.animate([
        { opacity: 0 },
        { opacity: 1 }
    ], { duration: 200, fill: 'forwards' });

    const panel = document.createElement('div');
    panel.style.background = '#1b2838';
    panel.style.border = '1px solid currentColor';
    panel.style.borderColor = 'rgba(103, 193, 245, 0.5)';
    panel.style.borderRadius = '6px';
    panel.style.padding = '24px';
    panel.style.width = '800px';
    panel.style.maxWidth = '90vw';
    panel.style.maxHeight = '80vh';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.color = '#ffffff';
    panel.style.fontFamily = 'Motiva Sans, Arial, sans-serif';
    panel.style.boxShadow = '0 0 15px rgba(0,0,0,0.5)';

    // Title
    const title = document.createElement('h2');
    title.textContent = `Select Depots (AppID: ${appId})`;
    title.style.margin = '0 0 16px 0';
    title.style.fontSize = '22px';
    title.style.fontWeight = '300';
    title.style.color = '#fff';
    panel.appendChild(title);

    // Content container
    const content = document.createElement('div');
    content.style.flex = '1';
    content.style.overflowY = 'auto';
    content.style.marginBottom = '20px';
    content.style.background = 'rgba(0,0,0,0.3)';
    content.style.border = '1px solid rgba(255,255,255,0.1)';
    content.style.padding = '2px';
    
    const loadingDiv = document.createElement('div');
    loadingDiv.style.padding = '40px';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.color = '#67c1f5';
    loadingDiv.style.fontSize = '16px';
    loadingDiv.textContent = 'Fetching depot data from SteamCMD and keys from ManifestHub...';
    content.appendChild(loadingDiv);

    panel.appendChild(content);

    // Button container
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.justifyContent = 'flex-end';
    btnContainer.style.gap = '10px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn_grey_steamui btn_medium';
    cancelBtn.style.padding = '0 15px';
    cancelBtn.onclick = () => { overlay.remove(); isBusy = false; };
    
    const installBtn = document.createElement('button');
    installBtn.textContent = 'Install Selected';
    installBtn.className = 'btn_blue_steamui btn_medium';
    installBtn.style.padding = '0 15px';
    installBtn.disabled = true; // Disabled initially until loaded
    installBtn.style.opacity = '0.5';

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(installBtn);
    panel.appendChild(btnContainer);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Fetch Depots
    callBackend<BackendResponse<{ depots: DepotInfo[] }>>('FetchDepotsWithKeys', { appid: appId }).then((res) => {
        content.innerHTML = ''; // clear loading

        if (!res.success || !res.depots || res.depots.length === 0) {
            const err = document.createElement('div');
            err.style.color = '#ff6b6b';
            err.style.padding = '20px';
            err.textContent = res.error || 'Failed to fetch depots or no depots found.';
            content.appendChild(err);
            return;
        }

        // Create table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '13px';
        
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.background = 'rgba(0,0,0,0.5)';
        headerRow.style.color = '#67c1f5';
        headerRow.style.textAlign = 'left';

        const headers = ['Select', 'ID', 'Name / Config', 'Size', 'Key Status'];
        headers.forEach((text, i) => {
            const th = document.createElement('th');
            th.textContent = text;
            th.style.padding = '8px 10px';
            th.style.fontWeight = 'normal';
            if (i === 0 || i === 1) th.style.width = '60px'; // smaller cols for checkbox and id
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const checkboxes: HTMLInputElement[] = [];

        res.depots.forEach((depot, index) => {
            const tr = document.createElement('tr');
            tr.style.background = index % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0)';
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            // Checkbox
            const tdCheck = document.createElement('td');
            tdCheck.style.padding = '8px 10px';
            tdCheck.style.textAlign = 'center';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = depot.id;
            
            // Auto check rule: if has key and is "windows" or no specific language
            if (depot.has_key) {
                const conf = depot.config || {};
                const isWin = !conf.oslist || conf.oslist.includes('windows');
                const isLang = conf.language ? conf.language === 'english' : true; // prefer english if language specified
                if (isWin && isLang) {
                    cb.checked = true;
                }
            } else {
                cb.disabled = true;
            }
            checkboxes.push(cb);
            tdCheck.appendChild(cb);

            // Row click toggles checkbox if not disabled
            tr.style.cursor = cb.disabled ? 'not-allowed' : 'pointer';
            tr.onclick = (e) => {
                if (e.target !== cb && !cb.disabled) cb.checked = !cb.checked;
            };

            // ID
            const tdId = document.createElement('td');
            tdId.style.padding = '8px 10px';
            tdId.style.color = '#67c1f5';
            tdId.textContent = depot.id;

            // Name / Config
            const tdConfig = document.createElement('td');
            tdConfig.style.padding = '8px 10px';
            let confStrs: string[] = [];
            if (depot.config?.oslist) confStrs.push(`OS: ${depot.config.oslist}`);
            if (depot.config?.language) confStrs.push(`Lang: ${depot.config.language}`);
            if (depot.config?.osarch) confStrs.push(`Arch: ${depot.config.osarch}`);
            const confText = confStrs.length > 0 ? `[${confStrs.join(', ')}]` : '';
            tdConfig.textContent = `${depot.name && depot.name !== 'Unknown' ? depot.name : ''} ${confText}`.trim();

            // Size
            const tdSize = document.createElement('td');
            tdSize.style.padding = '8px 10px';
            tdSize.textContent = formatBytes(depot.size);

            // Status
            const tdStatus = document.createElement('td');
            tdStatus.style.padding = '8px 10px';
            if (depot.has_key) {
                tdStatus.textContent = 'Key Available';
                tdStatus.style.color = '#a3cc47'; // Steam green
            } else {
                tdStatus.textContent = 'Missing Key';
                tdStatus.style.color = '#ff6b6b'; // red
            }

            tr.appendChild(tdCheck);
            tr.appendChild(tdId);
            tr.appendChild(tdConfig);
            tr.appendChild(tdSize);
            tr.appendChild(tdStatus);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        content.appendChild(table);

        installBtn.disabled = false;
        installBtn.style.opacity = '1';

        installBtn.onclick = async () => {
            const selected = checkboxes.filter(c => c.checked && !c.disabled).map(c => c.value);
            if (selected.length === 0) {
                alert('Please select at least one depot.');
                return;
            }

            installBtn.disabled = true;
            installBtn.textContent = 'Installing...';
            cancelBtn.disabled = true;
            content.style.opacity = '0.5';

            try {
                const iRes = await callBackend<BackendResponse>('InstallDepots', { appid: appId, selectedDepots: selected });
                if (iRes.success) {
                    overlay.remove();
                    isBusy = false;
                    // Re-inject buttons to show Remove
                    document.querySelector('[data-manilua-button]')?.remove();
                    debouncedInject();
                } else {
                    alert('Install failed: ' + iRes.error);
                }
            } catch (err) {
                alert('Install failed: ' + String(err));
            } finally {
                if (document.body.contains(overlay)) {
                    installBtn.disabled = false;
                    installBtn.textContent = 'Install Selected';
                    cancelBtn.disabled = false;
                    content.style.opacity = '1';
                }
            }
        };

    }).catch((err) => {
        content.innerHTML = '';
        const errMsg = document.createElement('div');
        errMsg.style.color = '#ff6b6b';
        errMsg.style.padding = '20px';
        errMsg.textContent = 'Error fetching depots: ' + String(err);
        content.appendChild(errMsg);
    });
}

async function startRemoveFlow(appId: number, button: HTMLElement, label: HTMLSpanElement): Promise<boolean> {
    backendLog(`Starting remove flow for app ${appId}`);
    try {
        const result = await callBackend<BackendResponse>('removeViamanilua', { appid: appId });
        if (result?.success) {
            backendLog('Game config removed successfully from local dir');
            return true;
        }
        backendLog(`Failed to remove: ${result?.error ?? 'Unknown error'}`);
        label.textContent = t('btn.remove');
        button.style.opacity = '1';
        button.style.pointerEvents = 'auto';
        return false;
    } catch (error) {
        backendLog(`Remove error: ${String(error)}`);
        label.textContent = t('btn.remove');
        button.style.opacity = '1';
        button.style.pointerEvents = 'auto';
        return false;
    }
}

async function injectGamePageButtons() {
    const appId = getCurrentAppId();
    if (!appId || document.querySelector('[data-manilua-button]')) {
        return;
    }

    const container = findButtonContainer();
    if (!container) {
        return;
    }

    try {
        const status = await callBackend<BackendResponse<{ exists?: boolean }>>('hasluaForApp', { appid: appId });
        const hasLua = Boolean(status?.exists);

        const btnContainer = document.createElement('div');
        btnContainer.className = 'btn_addtocart btn_packageinfo';
        btnContainer.setAttribute('data-manilua-button', 'true');

        const button = document.createElement('span');
        button.setAttribute('role', 'button');
        button.className = 'btn_blue_steamui btn_medium';
        button.style.marginLeft = '2px';

        const buttonSpan = document.createElement('span');
        buttonSpan.textContent = hasLua ? t('btn.remove') : 'Get Depots';
        button.appendChild(buttonSpan);
        btnContainer.appendChild(button);

        button.onclick = async (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (isBusy) {
                return;
            }
            isBusy = true;

            const resetButton = () => {
                button.style.pointerEvents = 'auto';
                button.style.opacity = '1';
                buttonSpan.textContent = hasLua ? t('btn.remove') : 'Get Depots';
            };

            if (hasLua) {
                button.style.pointerEvents = 'none';
                button.style.opacity = '0.7';
                buttonSpan.textContent = 'Removing...';

                const removed = await startRemoveFlow(appId, button, buttonSpan);
                isBusy = false;

                if (removed) {
                    btnContainer.remove();
                    setTimeout(() => {
                        injectGamePageButtons().catch((error) => backendLog(`Re-injection error: ${String(error)}`));
                    }, 200);
                } else {
                    resetButton();
                }
                return;
            }

            // It does NOT have Lua, launch custom UI modal
            createDepotModal(appId);
        };

        container.appendChild(btnContainer);
    } catch (error) {
        backendLog(`Failed to inject button: ${String(error)}`);
    }
}

let injectTimeout: number | null = null;
function debouncedInject() {
    if (injectTimeout) {
        clearTimeout(injectTimeout);
    }
    injectTimeout = setTimeout(() => {
        injectGamePageButtons().catch((error) => backendLog(`Inject error: ${String(error)}`));
    }, 200);
}

export default async function PluginMain() {
    await initI18n();
    setTimeout(() => {
        const observer = new MutationObserver(() => {
            if (window.location.href.includes('/app/')) {
                debouncedInject();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        injectGamePageButtons().catch((error) => backendLog(`Initial inject error: ${String(error)}`));
    }, 1000);
}
