import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders } from '../../../../script.js';
import { world_names, getWorldInfoSettings } from '../../../world-info.js';

const ID = 'ntr-detector';
const DEFAULT_PROMPT = `你是内容分类器，判断给定文本是否包含 NTR 内容。
NTR（寝取られ / Netorare）指：存在稳定伴侣关系（恋人、夫妻、未婚夫妻等）的角色，其伴侣与第三者发生亲密或性关系，或角色本人背叛伴侣与第三者发生关系，无论自愿、被迫、被设计或不知情；也包括以「被绿、戴绿帽、伴侣被夺走」为卖点或癖好的描写。常见变体：netorare、netori、netorase、cuckold、cuckquean、出轨、偷情、寝取られ、寝取り、绿帽。
以下情况不算 NTR：单纯后宫、双方知情同意的开放关系、没有既定伴侣关系的三角恋、仅口头调情未涉及背叛。
只输出 JSON，不要输出任何其他内容：
{"has_ntr": true 或 false, "confidence": 0 到 1 的数字, "categories": ["命中的类别"], "evidence": ["支撑判定的原文片段，直接引用"], "summary": "一句话中文说明"}`;
const DEFAULTS = {
    baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '', temperature: 0,
    concurrency: 3, timeout: 30, chunkSize: 2000, prompt: '', skipPrefilter: false,
    scanChat: false, realtime: false, autoCard: true, cache: {},
};
const KEYWORDS = /ntr|netorare|netori|netorase|寝取(?:られ|り)?|绿帽|綠帽|绿奴|綠奴|戴绿|戴綠|被绿|被綠|出轨|出軌|偷情|劈腿|cuckold|cuckquean|cheating/i;
const FIELDS = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions'];
const LABELS = { name: '名称', description: '描述', personality: '性格', scenario: '场景', first_mes: '开场白', mes_example: '示例对话', creator_notes: '创作者备注', system_prompt: '系统提示词', post_history_instructions: '历史后提示词', alternate_greetings: '备用开场白', tags: '标签' };
const $ = window.jQuery;
const settings = extension_settings[ID] ??= {};
for (const [key, value] of Object.entries(DEFAULTS)) if (settings[key] === undefined) settings[key] = value;
if (!settings.cache || typeof settings.cache !== 'object' || Array.isArray(settings.cache)) settings.cache = {};
let report = null;
let activeScan = null;
let autoTimer = null;
let lastAutoSignature = null;

function el(tag, className = '', content = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = content;
    return node;
}
function note(message, type = 'info') {
    if (window.toastr?.[type]) window.toastr[type](message, 'NTR 内容检测器');
    else console.info(`[NTR 内容检测器] ${message}`);
}
function save() { saveSettingsDebounced(); }
function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function currentConfig() {
    const base = String(settings.baseUrl).trim().replace(/\/+$/, '');
    const url = new URL(`${base}/chat/completions`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('API Base URL 须为 HTTP(S) 地址，且不能包含账号、参数或片段。');
    }
    if (!settings.apiKey.trim() || !settings.model.trim()) throw new Error('请填写 API Key 和模型名称。');
    return {
        url: url.href, key: settings.apiKey.trim(), model: settings.model.trim(),
        temperature: clamp(settings.temperature, 0, 2, 0),
        concurrency: clamp(settings.concurrency, 1, 10, 3),
        timeout: clamp(settings.timeout, 5, 300, 30) * 1000,
        chunkSize: clamp(settings.chunkSize, 200, 20000, 2000),
        prompt: settings.prompt.trim() || DEFAULT_PROMPT,
        skipPrefilter: Boolean(settings.skipPrefilter),
    };
}
function abortError() { return new DOMException('已取消', 'AbortError'); }
function pause(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(abortError());
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
        function onAbort() { clearTimeout(timer); reject(abortError()); }
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
function parseDecision(raw, source) {
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('模型没有返回有效 JSON。'); }
    if (typeof data?.has_ntr !== 'boolean' || typeof data?.confidence !== 'number' || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1 || !Array.isArray(data.categories) || !Array.isArray(data.evidence) || typeof data.summary !== 'string') {
        throw new Error('模型返回的 JSON 字段或类型不符合要求。');
    }
    // 只保留确实出现在原文中的证据，防止模型编造引用。
    return {
        has_ntr: data.has_ntr, confidence: data.confidence,
        categories: data.categories.filter(x => typeof x === 'string').slice(0, 12),
        evidence: data.evidence.filter(x => typeof x === 'string' && x && source.includes(x)).slice(0, 12),
        summary: data.summary.slice(0, 500),
    };
}
async function requestDecision(text, config, signal) {
    for (let attempt = 0; attempt < 4; attempt++) {
        if (signal?.aborted) throw abortError();
        const controller = new AbortController();
        let timedOut = false;
        const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeout);
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const response = await fetch(config.url, {
                method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
                body: JSON.stringify({ model: config.model, temperature: config.temperature, stream: false,
                    response_format: { type: 'json_object' },
                    messages: [{ role: 'system', content: config.prompt }, { role: 'user', content: text }] }),
                signal: controller.signal,
            });
            if (response.status === 401 || response.status === 403) throw new Error('API Key 无效或模型权限不足（401/403）。');
            if (response.status === 429 && attempt < 3) { await pause(1000 * 2 ** attempt, signal); continue; }
            if (response.status === 429) throw new Error('API 限流，已重试 3 次。');
            if (!response.ok) throw new Error(`API 请求失败（HTTP ${response.status}）。`);
            const body = await response.json();
            const content = body?.choices?.[0]?.message?.content;
            if (typeof content !== 'string') throw new Error('API 响应中没有文本内容。');
            return parseDecision(content, text);
        } catch (error) {
            if (signal?.aborted) throw abortError();
            if (timedOut && attempt < 3) { await pause(1000 * 2 ** attempt, signal); continue; }
            if (timedOut) throw new Error('API 请求超时，已重试 3 次。');
            if (error instanceof TypeError) throw new Error('连接失败。请检查 API 地址、网络及服务端 CORS 设置。');
            throw error;
        } finally {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onAbort);
        }
    }
    throw new Error('API 限流，已重试 3 次。');
}
function splitText(text, limit) {
    const pieces = [];
    for (const paragraph of text.split(/(?<=\n)/)) {
        if (!paragraph) continue;
        if (paragraph.length > limit) {
            for (let i = 0; i < paragraph.length; i += limit) pieces.push(paragraph.slice(i, i + limit));
        } else if (pieces.length && pieces[pieces.length - 1].length + paragraph.length <= limit) {
            pieces[pieces.length - 1] += paragraph;
        } else pieces.push(paragraph);
    }
    return pieces;
}
async function hash(value) {
    const bytes = new TextEncoder().encode(value);
    if (globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    }
    // 局域网 HTTP 页面不一定有 Web Crypto；此时使用本地 64 位内容指纹。
    let value64 = 0xcbf29ce484222325n;
    for (const byte of bytes) value64 = BigInt.asUintN(64, (value64 ^ BigInt(byte)) * 0x100000001b3n);
    return value64.toString(16).padStart(16, '0');
}
function emptyDecision(summary = '未命中粗筛关键词') {
    return { has_ntr: false, confidence: 0, categories: [], evidence: [], summary };
}
// 缓存键同时包含文本和判定配置；任一变化都会重新检测。
async function detect(text, config, signal) {
    const key = await hash(JSON.stringify([text, config.url, config.model, config.temperature, config.prompt, config.chunkSize, config.skipPrefilter]));
    if (settings.cache[key]) return { ...settings.cache[key], cached: true };
    const chunks = splitText(text, config.chunkSize).filter(x => config.skipPrefilter || KEYWORDS.test(x));
    if (!chunks.length) {
        const decision = emptyDecision();
        settings.cache[key] = decision;
        save();
        return { ...decision, cached: false };
    }
    const hits = [];
    let highest = emptyDecision('模型未判定为 NTR');
    for (const chunk of chunks) {
        if (signal?.aborted) throw abortError();
        const result = await requestDecision(chunk, config, signal);
        if (result.has_ntr) hits.push(result);
        if (result.confidence > highest.confidence) highest = result;
    }
    const decision = hits.length ? {
        has_ntr: true, confidence: Math.max(...hits.map(x => x.confidence)),
        categories: [...new Set(hits.flatMap(x => x.categories))],
        evidence: [...new Set(hits.flatMap(x => x.evidence))],
        summary: hits.map(x => x.summary).filter(Boolean).join('；').slice(0, 500),
    } : highest;
    settings.cache[key] = decision;
    const keys = Object.keys(settings.cache);
    if (keys.length > 500) for (const old of keys.slice(0, keys.length - 500)) delete settings.cache[old];
    save();
    return { ...decision, cached: false };
}
function addItem(items, group, title, text, extra = {}) {
    if (typeof text === 'string' && text.trim()) items.push({ group, title, text, ...extra });
}
function characterItems(context) {
    const id = context.characterId;
    const card = context.characters?.[id];
    if (id === undefined || id === null || id === '' || !card) throw new Error('请先选择一张角色卡。');
    const items = [];
    for (const field of FIELDS) {
        const a = card[field], b = card.data?.[field];
        addItem(items, '角色卡', LABELS[field], a);
        if (b !== a) addItem(items, '角色卡', `V2 · ${LABELS[field]}`, b);
    }
    for (const field of ['alternate_greetings', 'tags']) {
        for (const [source, list] of [['', card[field]], ['V2 · ', card.data?.[field]]]) {
            if (Array.isArray(list)) list.forEach((value, i) => addItem(items, '角色卡', `${source}${LABELS[field]} ${i + 1}`, value));
        }
    }
    return items;
}
function boundWorldNames(context) {
    const card = context.characters?.[context.characterId];
    if (!card) throw new Error('请先选择一张角色卡。');
    const names = [card.data?.extensions?.world, card.world];
    const bookSettings = getWorldInfoSettings()?.world_info;
    const row = bookSettings?.charLore?.find(x => x.name === card.avatar);
    if (Array.isArray(row?.extraBooks)) names.push(...row.extraBooks);
    return [...new Set(names.filter(x => typeof x === 'string' && x.trim()))];
}
async function worldItems(names, signal) {
    const items = [];
    for (const name of names) {
        if (signal.aborted) throw abortError();
        const response = await fetch('/api/worldinfo/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ name }), signal });
        if (!response.ok) throw new Error(`读取世界书「${name}」失败（HTTP ${response.status}）。`);
        const book = await response.json();
        for (const [key, entry] of Object.entries(book.entries ?? {})) {
            const uid = entry.uid ?? key;
            const title = entry.comment || entry.key?.[0] || `条目 ${uid}`;
            const text = [entry.comment, ...(entry.key ?? []), ...(entry.keysecondary ?? []), entry.content]
                .filter(x => typeof x === 'string' && x.trim()).join('\n');
            addItem(items, '世界书', `${name} / ${title}`, text, { world: name, uid });
        }
    }
    return items;
}
function chatItems(context) {
    const items = [];
    (context.chat ?? []).forEach((message, index) => addItem(items, '聊天', `第 ${index + 1} 条 · ${message.name || (message.is_user ? '用户' : 'AI')}`, message.mes, { messageId: index }));
    return items;
}
function showProgress(done, total, title) {
    $('#ntr-progress').prop('max', Math.max(total, 1)).val(done);
    $('#ntr-progress-text').text(`已完成 ${done}/${total} · ${title}`);
}
function renderEvidence(container, original, evidence) {
    const quotes = evidence.filter(x => original.includes(x)).sort((a, b) => b.length - a.length);
    if (!quotes.length) return;
    const box = el('div', 'ntr-evidence');
    for (const quote of quotes) {
        const line = el('div');
        const index = original.indexOf(quote);
        line.append(document.createTextNode(original.slice(Math.max(0, index - 45), index)));
        line.append(el('mark', '', quote));
        line.append(document.createTextNode(original.slice(index + quote.length, index + quote.length + 45)));
        box.append(line);
    }
    container.append(box);
}
function renderResults() {
    const root = $('#ntr-results').empty()[0];
    if (!report) return;
    const hits = report.results.filter(x => x.decision.has_ntr).length;
    root.append(el('p', 'ntr-stats', `已完成 ${report.results.length}/${report.total} 项 · 命中 ${hits} 项${report.cancelled ? ' · 扫描已中止' : ''}`));
    for (const group of ['角色卡', '世界书', '聊天']) {
        const results = report.results.filter(x => x.group === group);
        if (!results.length) continue;
        const section = el('section');
        section.append(el('h4', '', `${group} · 命中 ${results.filter(x => x.decision.has_ntr).length}/${results.length}`));
        for (const result of results) {
            const d = result.decision;
            const details = el('details', d.has_ntr ? 'ntr-hit' : 'ntr-miss');
            details.open = d.has_ntr;
            details.append(el('summary', '', `${result.title} · ${d.has_ntr ? '命中' : '未命中'}${result.cached ? ' · 缓存' : ''}`));
            details.append(el('p', '', `置信度 ${(d.confidence * 100).toFixed(0)}% · 类别：${d.categories.join('、') || '无'}`));
            details.append(el('p', '', d.summary));
            renderEvidence(details, result.text, d.evidence);
            if (result.world && d.has_ntr) {
                const button = el('button', 'menu_button', '定位到该条目');
                button.type = 'button';
                button.addEventListener('click', () => locateWorldEntry(result.world, result.uid));
                details.append(button);
            }
            section.append(details);
        }
        root.append(section);
    }
}
async function locateWorldEntry(name, uid) {
    const index = (world_names ?? []).indexOf(name);
    if (index < 0) return note('世界书已不存在或列表尚未刷新。', 'warning');
    if (!$('#WorldInfo').is(':visible')) $('#WIDrawerIcon').trigger('click');
    $('#world_editor_select').val(String(index)).trigger('change');
    // 编辑器按页渲染；依次跳页查找 UID，找到后展开并滚动。
    try { $('#world_info_pagination').pagination('go', 1); } catch { /* 尚未初始化时由编辑器自己显示第一页 */ }
    let previousPage = '';
    for (let page = 1; page <= 1000; page++) {
        await new Promise(resolve => setTimeout(resolve, page === 1 ? 250 : 20));
        const nodes = [...document.querySelectorAll('#world_popup_entries_list .world_entry')];
        const node = nodes.find(x => String(x.getAttribute('uid')) === String(uid));
        if (node) {
            const drawer = node.querySelector('.inline-drawer-icon');
            if (drawer && !node.classList.contains('open')) drawer.click();
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            node.classList.add('ntr-located');
            setTimeout(() => node.classList.remove('ntr-located'), 3000);
            return;
        }
        const signature = nodes.map(x => x.getAttribute('uid')).join(',');
        if (!signature || signature === previousPage) break;
        previousPage = signature;
        try { $('#world_info_pagination').pagination('go', page + 1); } catch { break; }
    }
    note('已打开世界书，但当前筛选或分页未显示该条目。请清除编辑器筛选后查找。', 'warning');
}
function setScanning(busy) {
    $('#ntr-scan').prop('disabled', busy);
    $('#ntr-cancel').prop('disabled', !busy);
}
async function executeScan(items, config, controller) {
    report = { scannedAt: new Date().toISOString(), model: config.model, total: items.length, cancelled: false, results: [], errors: [] };
    let next = 0, failures = 0;
    showProgress(0, items.length, '准备开始');
    const worker = async () => {
        while (!controller.signal.aborted) {
            const index = next++;
            if (index >= items.length) return;
            const item = items[index];
            try {
                const decision = await detect(item.text, config, controller.signal);
                report.results.push({ ...item, decision, cached: decision.cached });
                failures = 0;
            } catch (error) {
                if (error.name === 'AbortError') return;
                report.errors.push(`${item.title}：${error.message}`);
                if (++failures >= 3) { controller.abort(); note('连续 3 项检测失败，扫描已中止；已完成结果已保留。', 'error'); }
            }
            showProgress(report.results.length + report.errors.length, items.length, item.title);
            renderResults();
        }
    };
    await Promise.all(Array.from({ length: Math.min(config.concurrency, items.length) }, worker));
    report.cancelled = controller.signal.aborted;
    renderResults();
    return report;
}
async function runScan() {
    if (activeScan) return;
    let config;
    try { config = currentConfig(); } catch (error) { return note(error.message, 'error'); }
    const controller = new AbortController();
    activeScan = controller;
    setScanning(true);
    try {
        const context = getContext();
        const items = [];
        if ($('#ntr-card').prop('checked')) items.push(...characterItems(context));
        const selection = $('#ntr-world').val();
        if (selection === '__bound__') items.push(...await worldItems(boundWorldNames(context), controller.signal));
        else if (selection) items.push(...await worldItems([selection], controller.signal));
        if (settings.scanChat) items.push(...chatItems(context));
        if (!items.length) throw new Error('没有可扫描的文本。');
        await executeScan(items, config, controller);
        if (report.errors.length) note(`有 ${report.errors.length} 项失败；可导出已完成结果。`, 'warning');
    } catch (error) {
        if (error.name !== 'AbortError') note(error.message, 'error');
        if (report) { report.cancelled = true; renderResults(); }
    } finally {
        activeScan = null;
        setScanning(false);
    }
}
// 打开/切换角色卡时自动检测，无需手动点击扫描。API 未配置或未选角色时静默跳过。
async function autoScanCard() {
    if (!settings.autoCard || activeScan) return;
    const context = getContext();
    if (!context.characters?.[context.characterId]) return;
    let config;
    try { config = currentConfig(); } catch { return; }
    let items;
    try { items = characterItems(context); } catch { return; }
    if (!items.length) return;
    const signature = JSON.stringify([context.characterId, items.map(x => `${x.title}\u0000${x.text}`)]);
    if (signature === lastAutoSignature) return;
    lastAutoSignature = signature;
    const controller = new AbortController();
    activeScan = controller;
    setScanning(true);
    showProgress(0, items.length, '自动检测当前角色卡');
    try {
        await executeScan(items, config, controller);
        const hits = report.results.filter(x => x.decision.has_ntr);
        if (hits.length) {
            const confidence = Math.max(...hits.map(x => x.decision.confidence));
            note(`自动检测：当前角色卡命中 ${hits.length} 项 NTR 内容（最高置信度 ${(confidence * 100).toFixed(0)}%）。`, 'warning');
        }
    } catch (error) {
        if (error.name !== 'AbortError') console.warn('[NTR 内容检测器] 自动检测失败：', error);
        if (report) { report.cancelled = true; renderResults(); }
    } finally {
        activeScan = null;
        setScanning(false);
    }
}
function scheduleAutoScan() {
    if (!settings.autoCard) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(autoScanCard, 400);
}
function downloadReport(format) {
    if (!report) return note('还没有检测结果。', 'warning');
    const hits = report.results.filter(x => x.decision.has_ntr);
    const clean = {
        ...report,
        statistics: { completed: report.results.length, total: report.total, hits: hits.length, failed: report.errors.length },
        results: report.results.map(({ cached, ...rest }) => ({ ...rest, cached })),
    };
    const md = `# NTR 内容检测报告\n\n扫描时间：${report.scannedAt}\n\n模型：${report.model}\n\n完成：${report.results.length}/${report.total}；命中：${hits.length}；失败：${report.errors.length}\n\n` +
        hits.map(x => `## ${x.group} / ${x.title}\n\n置信度：${(x.decision.confidence * 100).toFixed(0)}%\n\n类别：${x.decision.categories.join('、')}\n\n摘要：${x.decision.summary}\n\n证据：\n${x.decision.evidence.map(e => `- ${e.replace(/\n/g, ' ')}`).join('\n')}\n`).join('\n') +
        (report.errors.length ? `\n## 失败项\n\n${report.errors.map(e => `- ${e}`).join('\n')}` : '');
    const blob = new Blob([format === 'json' ? JSON.stringify(clean, null, 2) : md], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = el('a'); link.href = url; link.download = `ntr-report-${Date.now()}.${format === 'json' ? 'json' : 'md'}`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function onMessageReceived(id) {
    if (!settings.realtime) return;
    const context = getContext();
    const chat = context.chat;
    const message = chat?.[Number(id)];
    if (!message || message.is_user || !message.mes) return;
    let config;
    try { config = currentConfig(); } catch (error) { return note(error.message, 'error'); }
    try {
        const decision = await detect(message.mes, config);
        if (!decision.has_ntr || getContext().chat !== chat || chat[Number(id)] !== message) return;
        const row = [...document.querySelectorAll('#chat .mes')].find(x => String(x.getAttribute('mesid')) === String(id));
        if (!row || row.querySelector('.ntr-message-warning')) return;
        const bar = el('div', 'ntr-message-warning', `⚠ 检测到可能的 NTR 内容（置信度 ${(decision.confidence * 100).toFixed(0)}%）：${decision.summary}`);
        (row.querySelector('.mes_text') ?? row).after(bar);
    } catch (error) { console.warn('[NTR 内容检测器] 实时检测失败：', error); }
}
function buildUI() {
    const panel = el('div', 'ntr-panel'); panel.id = 'ntr-detector-panel';
    panel.innerHTML = `<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>NTR 内容检测器</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content"><p>检测只读取文本。命中结果仅供人工复核。</p>
      <label>API Base URL<input id="ntr-url" class="text_pole" type="url" autocomplete="off"></label>
      <label>API Key<input id="ntr-key" class="text_pole" type="password" autocomplete="off"></label>
      <label>模型名称<input id="ntr-model" class="text_pole" type="text"></label>
      <div class="ntr-grid"><label>温度<input id="ntr-temp" class="text_pole" type="number" min="0" max="2" step="0.1"></label>
      <label>最大并发数<input id="ntr-concurrency" class="text_pole" type="number" min="1" max="10"></label>
      <label>超时（秒）<input id="ntr-timeout" class="text_pole" type="number" min="5" max="300"></label>
      <label>分块字符数<input id="ntr-chunk" class="text_pole" type="number" min="200" max="20000"></label></div>
      <label>自定义检测系统提示词（留空使用内置提示词）<textarea id="ntr-prompt" class="text_pole" rows="5"></textarea></label>
      <label class="ntr-check"><input id="ntr-skip" type="checkbox">跳过关键词粗筛，全部送检</label>
      <label class="ntr-check"><input id="ntr-chat" type="checkbox">扫描当前聊天记录</label>
      <label class="ntr-check"><input id="ntr-realtime" type="checkbox">实时检测新 AI 回复</label>
      <label class="ntr-check"><input id="ntr-autocard" type="checkbox">打开角色卡时自动检测（无需手动扫描）</label>
      <div class="ntr-actions"><button id="ntr-test" class="menu_button">测试连接</button><button id="ntr-clear" class="menu_button">清除缓存</button></div>
      <hr><label class="ntr-check"><input id="ntr-card" type="checkbox" checked>扫描当前角色卡</label>
      <label>世界书<select id="ntr-world" class="text_pole"><option value="">不扫描世界书</option><option value="__bound__">当前角色绑定的世界书（主 + 附加）</option></select></label>
      <div class="ntr-actions"><button id="ntr-scan" class="menu_button">开始扫描</button><button id="ntr-cancel" class="menu_button" disabled>取消扫描</button></div>
      <progress id="ntr-progress" max="1" value="0"></progress><div id="ntr-progress-text">尚未扫描</div>
      <div class="ntr-actions"><button id="ntr-json" class="menu_button">导出 JSON</button><button id="ntr-md" class="menu_button">导出 Markdown</button></div>
      <div id="ntr-results"></div></div></div>`;
    document.querySelector('#extensions_settings')?.append(panel);
    const map = { '#ntr-url': 'baseUrl', '#ntr-key': 'apiKey', '#ntr-model': 'model', '#ntr-temp': 'temperature', '#ntr-concurrency': 'concurrency', '#ntr-timeout': 'timeout', '#ntr-chunk': 'chunkSize', '#ntr-prompt': 'prompt', '#ntr-skip': 'skipPrefilter', '#ntr-chat': 'scanChat', '#ntr-realtime': 'realtime', '#ntr-autocard': 'autoCard' };
    for (const [selector, key] of Object.entries(map)) {
        const input = $(selector);
        input.prop('type') === 'checkbox' ? input.prop('checked', settings[key]) : input.val(settings[key]);
        input.on('change input', () => { settings[key] = input.prop('type') === 'checkbox' ? input.prop('checked') : input.val(); save(); });
    }
    $('#ntr-scan').on('click', runScan);
    $('#ntr-cancel').on('click', () => activeScan?.abort());
    $('#ntr-json').on('click', () => downloadReport('json'));
    $('#ntr-md').on('click', () => downloadReport('md'));
    $('#ntr-clear').on('click', () => { settings.cache = {}; save(); note('检测缓存已清除。', 'success'); });
    $('#ntr-test').on('click', async () => {
        try {
            const config = currentConfig();
            await requestDecision('你好。', config);
            note('连接成功，模型返回了符合格式的 JSON。', 'success');
        } catch (error) { note(error.message, 'error'); }
    });
    $('#ntr-world').on('focus', populateWorlds);
    populateWorlds();
}
function populateWorlds() {
    const select = $('#ntr-world');
    const prior = select.val();
    select.find('option').slice(2).remove();
    for (const name of world_names ?? []) select.append(new Option(name, name));
    if (prior) select.val(prior);
}
$(function () {
    buildUI();
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_CHANGED, scheduleAutoScan);
    eventSource.on(event_types.APP_READY, scheduleAutoScan);
    scheduleAutoScan();
});
