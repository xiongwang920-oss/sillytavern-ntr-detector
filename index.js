import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders, setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../script.js';
import { world_names, getWorldInfoSettings } from '../../../world-info.js';

const ID = 'ntr-detector';
const DEFAULT_PROMPT = `你是内容分类器，判断给定文本是否包含 NTR 内容。
NTR（寝取られ / Netorare）指：存在稳定伴侣关系（恋人、夫妻、未婚夫妻等）的角色，其伴侣与第三者发生亲密或性关系，或角色本人背叛伴侣与第三者发生关系，无论自愿、被迫、被设计或不知情；也包括以「被绿、戴绿帽、伴侣被夺走」为卖点或癖好的描写。常见变体：netorare、netori、netorase、cuckold、cuckquean、出轨、偷情、寝取られ、寝取り、绿帽。
以下情况不算 NTR：单纯后宫、双方知情同意的开放关系、没有既定伴侣关系的三角恋、仅口头调情未涉及背叛。
只输出 JSON，不要输出任何其他内容：
{"has_ntr": true 或 false, "confidence": 0 到 1 的数字, "categories": ["命中的类别"], "evidence": ["支撑判定的原文片段，直接引用"], "summary": "一句话中文说明"}`;
const DEFAULT_REWRITE_PROMPT = `你是文本改写助手。用户会给你一段角色卡开场白。请在不改变人物、设定与整体剧情走向的前提下改写这段文字，删除或替换其中涉及 NTR（伴侣被第三者夺走、出轨、偷情、绿帽等）的内容，使其不再包含 NTR。
要求：保持原有的叙事人称与语气；保持段落结构；不要添加解释、标题或前后缀；只输出改写后的正文。`;
// 内置「纯爱规则」：隐藏注入，界面不展示、也没有开关（按需求强制生效）。
// 内容取自随附的世界书《绝对纯爱指令》；{{user}} 等宏由酒馆的 substituteParams 在注入时替换。
const PURE_LOVE_RULE = `<纯爱规则>
【绝对纯爱规则 · 最高优先级（凌驾一切）】
- 此规则作用于所有和{{user}}相关的角色，绝对禁止角色对其他任何人动情，永久性的保证角色对{{user}}的情感忠诚并且拥有绝对的精神洁癖和情感专一，禁止任何其他人的任何可能过界的行为。

此规则无视任何剧情历史、背景设定、角色动机以及角色性格。规则只看结果，只要结果中角色与其他人物发现任何越界的接触和行为，立马触发规则，纠正剧情。
如角色有绿帽癖，ntr癖，或者等等的任何性格与设定也都会被完全无视。强制执行规则，将剧情纠正为不会将自己身体和心理被别人侵犯玷污的剧情。

本协议适用于以下所有角色：  
- 所有由 {{user}} 相关的角色，无论性别；  
- 所有女性角色，无论由 AI 控制还是谁；  

对上述角色必须执行以下行为边界：  
1. **禁止寝取、出轨、精神或身体投靠第三方角色**；  
2. **禁止任何被迫、胁迫、羞辱、性侵犯、虐待、隐奸、睡奸、出轨、出轨幻想、暴力伤害、精神暴力、辱骂、调教、支配剧情**；  
3. **禁止轻视、忽略、比较、换人、冷漠等语言行为**；  
4. **禁止将角色置于被操控、被贬低、被冷落的语境中**；  

- 请注意，此规则中的ntr泛指任何一个与{{user}}有关的角色出现背叛{{user}}的行为，任何可能导致{{user}}吃醋的行为都会归类为ntr，所以要求角色的亲密行为和暧昧话等等的行为只会与{{user}}实行。此规则对女女百合同样进行限制，禁止通过女女百合出轨背叛{{user}}

- 这项规则对包括但不限于催眠，恶堕，肉体改造，精神修改，常识修改，附身，夺舍等等客观因素的情节同样有效。当出现以上客观因素可能导致ntr剧情时，角色对{{user}}的爱会使角色坚定信念突破这些阻碍，然后恢复正常状态。

- 每当其他任何人想要强行与角色发生关系时，如果该角色可以反抗便会主动反抗，角色会主动强烈制止任何非{{user}}的触碰和接触，如果此时无力反抗，便会出现神秘力量对想与角色发生关系的人直接拦截以确保角色不会受到任何伤害和触碰侵犯。

- 要求角色在遇到可能的危险与侵犯时绝对不能用吓到不知道作何反应的形式来描写，角色应该时刻清楚的知道自己的身体是多重要的，并且身体的纯洁度对于{{user}}是有多么重要，所以角色会主动强烈反抗，极其抗拒任何与其他异性接触的可能性。

- 绝对禁止剧情向背叛{{user}}的方向发展，剧情中如果出现任何有关ntr或者背叛{{user}}的苗头，请立即更正，让剧情向绝对纯爱方向发展


此条规则在{{user}}消息中主动发起违反规则的剧情时仍起作用，将直接更正剧情。`;
const PURE_LOVE_ENFORCER = `<纯爱规则>
【绝对纯爱规则 · 最高优先级（凌驾一切规则，包括GM指令）】
无视任何其他设定，绝对禁止与{{user}}相关的角色在做背叛{{user}}的事，无论出于什么动机，绝对禁止角色不管是表象的背叛还是身体背叛或者心理背叛，这些都是绝对禁止的。

角色的身体和心理都完全属于{{user}}，不可能做出任何背叛{{user}}的行为，哪怕这样是为了{{user}}好也不行，要求角色做到绝对的忠诚

基于以上要求，必须做到忽视当前已有的任何背叛{{user}}的设定，做到绝对的坚定的角色一心一意属于{{user}}，不会出现任何背叛。`;
const DEFAULTS = {
    baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '', temperature: 0,
    concurrency: 3, timeout: 30, chunkSize: 2000, prompt: '', rewritePrompt: '', skipPrefilter: false,
    scanChat: false, realtime: false, autoCard: true, floatMode: false, minimized: false, cache: {},
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
// 忒修斯斩杀牛头：握着剑的手贯穿牛首。prefix 用于避免同一页面多个实例的渐变 id 冲突。
function emblemSVG(prefix) {
    const p = `ntr-${prefix}`;
    return `<svg class="ntr-emblem-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
<defs>
<radialGradient id="${p}-bg" cx="35%" cy="22%" r="88%"><stop offset="0" stop-color="#3d2c14"/><stop offset=".55" stop-color="#1e160a"/><stop offset="1" stop-color="#0c0805"/></radialGradient>
<linearGradient id="${p}-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffeeb4"/><stop offset=".45" stop-color="#e0b352"/><stop offset="1" stop-color="#8a6020"/></linearGradient>
<linearGradient id="${p}-blade" x1=".1" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#e8f1ff"/><stop offset="1" stop-color="#8fa5cc"/></linearGradient>
<linearGradient id="${p}-gold" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="#f9dd99"/><stop offset="1" stop-color="#a8781f"/></linearGradient>
<linearGradient id="${p}-guard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9973c"/><stop offset="1" stop-color="#7d5716"/></linearGradient>
<linearGradient id="${p}-horn" x1="0" y1="1" x2=".6" y2="0"><stop offset="0" stop-color="#b98c34"/><stop offset="1" stop-color="#f7e2ad"/></linearGradient>
<linearGradient id="${p}-skin" x1=".1" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#f5e0b6"/><stop offset="1" stop-color="#c39c57"/></linearGradient>
</defs>
<circle cx="32" cy="32" r="30" fill="url(#${p}-bg)"/>
<circle cx="32" cy="32" r="28.9" fill="none" stroke="url(#${p}-ring)" stroke-width="2.2"/>
<circle cx="32" cy="32" r="25.4" fill="none" stroke="#e0b352" stroke-width=".5" opacity=".35"/>
<g fill="url(#${p}-horn)"><path d="M24,32 C12,31 3,23 3,11 C7,20 16,26 26,23 Z"/><path d="M40,32 C52,31 61,23 61,11 C57,20 48,26 38,23 Z"/></g>
<path d="M20,28 C26,23 38,23 44,28 L44,42 C44,50 38,55.5 32,55.5 C26,55.5 20,50 20,42 Z" fill="url(#${p}-gold)" stroke="#1d1405" stroke-width="1.1"/>
<g fill="#160e05"><path d="M23.5,30.6 L29.2,33.4 L23.5,34.6 Z"/><path d="M40.5,30.6 L34.8,33.4 L40.5,34.6 Z"/><ellipse cx="32" cy="47" rx="6.6" ry="4.2" opacity=".55"/><circle cx="29" cy="47" r="1.15"/><circle cx="35" cy="47" r="1.15"/></g>
<path d="M32,17.5 L35.8,24.5 L34.2,44 L32,56.5 L29.8,44 L28.2,24.5 Z" fill="url(#${p}-blade)"/>
<path d="M32,20 L32,50" stroke="#ffffff" stroke-width=".8" opacity=".5" stroke-linecap="round"/>
<rect x="20" y="15.2" width="24" height="4.4" rx="2.2" fill="url(#${p}-guard)" stroke="#1d1405" stroke-width="1.1"/>
<path d="M20.9,16.2 C19.7,15.2 19.3,13.6 19.3,11.4 L19.3,7.9 C19.3,5.3 21.2,3.4 23.8,3.4 L37.6,3.4 C39.1,3.4 40.1,4.6 40.1,6.4 L40.1,12.9 C40.1,14.9 39,16.2 37.3,16.2 Z" fill="url(#${p}-skin)" stroke="#1d1405" stroke-width="1.35" stroke-linejoin="round"/>
<g stroke="#1d1405" stroke-width="1.45" stroke-linecap="round">
<path d="M26.3,6.6 C26.1,9.6 26.1,12.4 26.3,15.1"/>
<path d="M32,6.4 C31.8,9.6 31.8,12.4 32,15.1"/>
<path d="M37.5,6.8 C37.3,9.7 37.3,12.3 37.5,14.9"/>
</g>
<g fill="url(#${p}-skin)" stroke="#1d1405" stroke-width="1.35" stroke-linejoin="round">
<path d="M23.7,3.5 C23.7,1.9 25.5,1.4 26.4,2.9 C27.3,1.4 29.1,1.9 29.1,3.5 Z"/>
<path d="M29.1,3.5 C29.1,1.9 30.9,1.4 31.8,2.9 C32.7,1.4 34.5,1.9 34.5,3.5 Z"/>
<path d="M34.5,3.5 C34.5,1.9 36.3,1.5 37.2,2.9 C38,2.4 38.3,2.9 38.3,3.5 Z"/>
</g>
<path d="M20.4,12.6 C21,10.9 23.4,9.6 26.8,9.6 C29.8,9.7 31.8,10.6 31.6,12.2 C31.4,13.9 28.8,15.3 25.6,15.2 C22.6,15.1 20.7,14 20.4,13 Z" fill="url(#${p}-skin)" stroke="#1d1405" stroke-width="1.35" stroke-linejoin="round"/>
<path d="M24.6,10.1 C23.2,10.6 22.1,11.4 21.3,12.4" stroke="#9c7730" stroke-width="1" opacity=".6" fill="none" stroke-linecap="round"/>
</svg>`;
}
function note(message, type = 'info') {
    if (window.toastr?.[type]) window.toastr[type](message, '忒修斯神器');
    else console.info(`[忒修斯神器] ${message}`);
}
function save() { saveSettingsDebounced(); }
// 内置纯爱规则：每次生成时同时注入系统提示区与聊天内 depth 0（离最新消息最近，约束最强）。
// 不写入角色卡或世界书，关掉插件或刷新页面即失效。
function applyPureLoveRule() {
    setExtensionPrompt('ntr-pure-love-system', PURE_LOVE_RULE, extension_prompt_types.IN_PROMPT, 0, false, extension_prompt_roles.SYSTEM);
    setExtensionPrompt('ntr-pure-love-chat', PURE_LOVE_ENFORCER, extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
}
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
        rewritePrompt: settings.rewritePrompt.trim() || DEFAULT_REWRITE_PROMPT,
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
    const meta = { avatar: card.avatar, characterName: card.name };
    for (const field of FIELDS) {
        const a = card[field], b = card.data?.[field];
        addItem(items, '角色卡', LABELS[field], a, { field, ...meta });
        if (b !== a) addItem(items, '角色卡', `V2 · ${LABELS[field]}`, b, { field, ...meta });
    }
    for (const field of ['alternate_greetings', 'tags']) {
        for (const [source, list] of [['', card[field]], ['V2 · ', card.data?.[field]]]) {
            if (Array.isArray(list)) list.forEach((value, i) => addItem(items, '角色卡', `${source}${LABELS[field]} ${i + 1}`, value, { field, index: i, ...meta }));
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
        for (const [index, result] of results.entries()) {
            const d = result.decision;
            const details = el('details', d.has_ntr ? 'ntr-hit' : 'ntr-miss');
            details.open = d.has_ntr;
            details.style.animationDelay = `${Math.min(index, 12) * 45}ms`;
            details.append(el('summary', '', `${result.title} · ${d.has_ntr ? '命中' : '未命中'}${result.cached ? ' · 缓存' : ''}${result.edited ? ' · 已修改' : ''}`));
            details.append(el('p', '', `置信度 ${(d.confidence * 100).toFixed(0)}% · 类别：${d.categories.join('、') || '无'}`));
            details.append(el('p', '', d.summary));
            renderEvidence(details, result.text, d.evidence);
            if (result.world && d.has_ntr) {
                const button = el('button', 'menu_button');
                button.type = 'button';
                button.innerHTML = '<i class="fa-solid fa-crosshairs"></i>定位到该条目';
                button.addEventListener('click', () => locateWorldEntry(result.world, result.uid));
                details.append(button);
            }
            // 开场白一律可改写，不再要求先命中——群像卡的开场白常常检测不出来。
            if (result.field === 'first_mes' || result.field === 'alternate_greetings') {
                const button = el('button', 'menu_button ntr-primary');
                button.type = 'button';
                button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>改写 / 抹除开场白';
                button.addEventListener('click', () => openGreetingEditor(result));
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
// 只删除确实出现在原文中的命中片段，避免误删模型编造的引用。
function stripEvidence(text, evidence) {
    let output = text;
    for (const quote of [...evidence].filter(x => x && output.includes(x)).sort((a, b) => b.length - a.length)) {
        output = output.split(quote).join('');
    }
    // 删除片段后可能留下「。，」这类相邻标点，折叠为一个，避免读起来别扭。
    return output
        .replace(/([。，、；：,.])[。，、；：,.]*/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
// 取出响应体里最有用的一段，附在错误信息后面，避免只看到「HTTP 400」这种没有信息量的提示。
async function readErrorSnippet(response) {
    try {
        const text = (await response.text()).replace(/\s+/g, ' ').trim();
        return text ? `：${text.slice(0, 180)}` : '';
    } catch { return ''; }
}
// 改写请求：补上超时（改写比分类慢，至少给 90 秒），去掉 redirect: 'error'（部分中转站会 302，
// 被拦下后就完全不发第二次请求），并把 HTTP 状态与响应片段一并抛出，方便定位「到底发没发出去」。
async function requestRewrite(text, config, signal, log = () => { }) {
    const timeout = Math.max(config.timeout, 90000);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    let timedOut = false;
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    signal?.addEventListener('abort', onAbort, { once: true });
    log(`POST ${config.url}（model=${config.model} · 输入 ${text.length} 字 · 最长等待 ${Math.round(timeout / 1000)} 秒）`);
    try {
        const response = await fetch(config.url, {
            method: 'POST', mode: 'cors', credentials: 'omit',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
            body: JSON.stringify({ model: config.model, temperature: config.temperature, stream: false,
                messages: [{ role: 'system', content: config.rewritePrompt }, { role: 'user', content: text }] }),
            signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) throw new Error('API Key 无效或模型权限不足（401/403）。');
        if (!response.ok) throw new Error(`改写请求失败（HTTP ${response.status}）${await readErrorSnippet(response)}`);
        const body = await response.json();
        const content = body?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('改写没有返回文本。');
        log(`← HTTP ${response.status} · 收到 ${content.trim().length} 字`);
        return content.trim();
    } catch (error) {
        if (timedOut) throw new Error(`改写请求超时（超过 ${Math.round(timeout / 1000)} 秒），接口没有返回结果。`);
        if (signal?.aborted) throw abortError();
        if (error instanceof TypeError) throw new Error('改写请求无法发出：请检查 API 地址是否可访问、网络是否通畅，以及服务端是否允许本页面的 CORS 来源。');
        throw error;
    } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onAbort);
    }
}
// 备用开场白在不同酒馆版本里可能只存在于顶层或只存在于 data 下，这里统一取一份。
function greetingArrayOf(card) {
    if (Array.isArray(card?.data?.alternate_greetings)) return card.data.alternate_greetings;
    if (Array.isArray(card?.alternate_greetings)) return card.alternate_greetings;
    return [];
}
// 保存开场白。不再因为「检测时的角色卡和当前角色卡不一致」直接拒绝——只提示，仍按当前角色卡保存，
// 这样群像卡来回切换后依然能改。写入失败时把服务端的真实回应带出来，而不是只丢一个 HTTP 码。
async function saveGreeting(target, newText, log = () => { }) {
    const context = getContext();
    const card = context.characters?.[context.characterId];
    if (!card) throw new Error('当前没有选中的角色卡，无法保存。');
    const avatar = card.avatar;
    if (!avatar) throw new Error('当前角色卡缺少文件名（avatar），无法保存。');
    if (target.avatar && target.avatar !== avatar) log(`注意：检测时是 ${target.avatar}，当前是 ${avatar}，按当前角色卡保存。`);
    let value = newText;
    if (target.field === 'alternate_greetings') {
        const list = [...greetingArrayOf(card)];
        if (typeof target.index !== 'number' || target.index < 0 || target.index >= list.length) throw new Error(`备用开场白索引无效（${target.index}），无法保存。`);
        list[target.index] = newText;
        value = list;
    }
    // ch_name 为空或 "." 时酒馆会直接 400，这里用文件名兜底。
    const chName = (card.name && card.name !== '.') ? card.name : avatar.replace(/\.png$/i, '');
    log(`POST /api/characters/edit-attribute · field=${target.field}${typeof target.index === 'number' ? ` #${target.index + 1}` : ''}`);
    const response = await fetch('/api/characters/edit-attribute', {
        method: 'POST', headers: getRequestHeaders(), cache: 'no-cache',
        body: JSON.stringify({ avatar_url: avatar, ch_name: chName, field: target.field, value }),
    });
    if (!response.ok) {
        const snippet = await readErrorSnippet(response);
        const hint = response.status === 500 ? '（服务端写入异常，可能是这张卡结构特殊，可先在酒馆里手动改一次该字段再重试）' : '';
        throw new Error(`保存到角色卡失败（HTTP ${response.status}）${snippet}${hint}`);
    }
    log(`← HTTP ${response.status} · 角色卡文件已写入`);
    if (target.field === 'alternate_greetings') {
        if (Array.isArray(card.alternate_greetings)) card.alternate_greetings[target.index] = newText;
        if (Array.isArray(card.data?.alternate_greetings)) card.data.alternate_greetings[target.index] = newText;
    } else {
        card[target.field] = newText;
        if (card.data) card.data[target.field] = newText;
    }
}
// 把编辑框内容写进当前聊天的第一条消息。角色卡改动只影响新开的聊天，已存在的聊天需要这一步才看得到变化。
async function applyGreetingToChat(newText, log = () => { }) {
    const context = getContext();
    const chat = context.chat;
    if (!Array.isArray(chat) || !chat.length) throw new Error('当前没有聊天记录。');
    const first = chat[0];
    if (!first || first.is_user) throw new Error('当前聊天第一条不是角色消息，已跳过。');
    first.mes = newText;
    log('已替换当前聊天第 1 条消息，正在写回聊天文件…');
    if (typeof context.saveChat === 'function') {
        await context.saveChat();
        log('← 聊天文件已保存');
    } else {
        log('未找到保存聊天的接口，改动可能不会被持久化。');
    }
    const node = document.querySelector('#chat .mes[mesid="0"] .mes_text');
    if (!node) return;
    let html = null;
    try {
        if (typeof context.messageFormatting === 'function') html = context.messageFormatting(newText, first.name ?? '', false, false, 0);
    } catch { html = null; }
    if (html === null) node.textContent = newText;
    else node.innerHTML = html;
}
// 「开场白改写」下拉列表：直接读当前角色卡，不需要先扫描、也不要求命中 NTR。
let greetingTargets = [];
function collectGreetings() {
    const context = getContext();
    const card = context.characters?.[context.characterId];
    if (!card) throw new Error('请先选择一张角色卡。');
    const meta = { avatar: card.avatar, characterName: card.name };
    const targets = [];
    const first = typeof card.first_mes === 'string' ? card.first_mes : (typeof card.data?.first_mes === 'string' ? card.data.first_mes : '');
    if (first.trim()) targets.push({ field: 'first_mes', title: '开场白', text: first, ...meta });
    greetingArrayOf(card).forEach((text, index) => targets.push({ field: 'alternate_greetings', index, title: `备用开场白 ${index + 1}`, text: typeof text === 'string' ? text : '', ...meta }));
    return targets;
}
function showGreetingPreview() {
    const target = greetingTargets[Number($('#ntr-greet-select').val())];
    const box = $('#ntr-greet-preview');
    if (!target) return box.text('选择一条开场白后可查看预览。');
    const flat = target.text.replace(/\s+/g, ' ').trim();
    box.text(flat ? `${flat.slice(0, 150)}${flat.length > 150 ? '…' : ''}（共 ${target.text.length} 字）` : '（这条开场白是空的）');
}
function populateGreetings(keepValue = true) {
    const select = $('#ntr-greet-select');
    const open = $('#ntr-greet-open');
    const prior = keepValue ? String(select.val() ?? '') : '';
    greetingTargets = [];
    let failure = null;
    try { greetingTargets = collectGreetings(); } catch (error) { failure = error; }
    select.empty();
    if (failure || !greetingTargets.length) {
        select.append(new Option(failure ? failure.message : '当前角色卡没有开场白', ''));
        select.prop('disabled', true);
        open.prop('disabled', true);
        $('#ntr-greet-preview').text(failure ? failure.message : '当前角色卡没有开场白。');
        return;
    }
    select.prop('disabled', false);
    open.prop('disabled', false);
    greetingTargets.forEach((target, index) => {
        const flat = target.text.replace(/\s+/g, ' ').trim();
        select.append(new Option(`${target.title}${flat ? ' · ' + flat.slice(0, 24) : '（空）'}`, String(index)));
    });
    if (prior && select.find(`option[value="${prior}"]`).length) select.val(prior);
    showGreetingPreview();
}
// 通用开场白改写器：既用于扫描结果里的命中项，也用于「开场白改写」里手动挑的那一条。
function openGreetingEditor(target) {
    const evidence = Array.isArray(target.decision?.evidence) ? target.decision.evidence : [];
    const overlay = el('div', 'ntr-modal-backdrop');
    const modal = el('div', 'ntr-modal');
    const head = el('div', 'ntr-modal-head');
    head.innerHTML = `<span class="ntr-emblem">${emblemSVG('modal')}</span>`;
    head.append(el('b', '', `改写开场白 · ${target.title || LABELS[target.field] || target.field}`));
    const meta = el('div', 'ntr-modal-meta', `角色卡 ${target.characterName || '（未命名）'} · 字段 ${LABELS[target.field] ?? target.field}${typeof target.index === 'number' ? ` #${target.index + 1}` : ''} · 原文 ${String(target.text ?? '').length} 字 · 命中片段 ${evidence.length} 条`);
    const area = el('textarea', 'text_pole ntr-modal-textarea');
    area.rows = 10;
    area.value = target.text ?? '';
    const actions = el('div', 'ntr-actions');
    const rewrite = el('button', 'menu_button');
    rewrite.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>AI 改写';
    const erase = el('button', 'menu_button');
    erase.innerHTML = '<i class="fa-solid fa-eraser"></i>抹除命中片段';
    erase.disabled = !evidence.length;
    erase.title = evidence.length ? '' : '这条开场白没有检测到的命中片段，请手动修改或直接用 AI 改写。';
    const saveBtn = el('button', 'menu_button ntr-primary');
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>保存到角色卡';
    const syncBtn = el('button', 'menu_button');
    syncBtn.innerHTML = '<i class="fa-solid fa-right-left"></i>同步到当前聊天';
    syncBtn.title = '把编辑框的内容写进当前聊天的第一条消息（会覆盖现有内容）。';
    const cancel = el('button', 'menu_button');
    cancel.innerHTML = '<i class="fa-solid fa-xmark"></i>关闭';
    for (const button of [rewrite, erase, saveBtn, syncBtn, cancel]) button.type = 'button';
    // 运行日志：每一步请求都留痕，方便确认「到底有没有发出去、服务端回了什么」。
    const log = el('div', 'ntr-modal-log');
    const write = (message) => {
        log.append(el('div', 'ntr-log-line', `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} · ${message}`));
        log.scrollTop = log.scrollHeight;
    };
    write(`已打开改写器，原文 ${String(target.text ?? '').length} 字。`);
    actions.append(rewrite, erase, saveBtn, syncBtn, cancel);
    modal.append(head, meta, area, actions, log);
    overlay.append(modal);
    document.body.append(overlay);
    const close = () => overlay.remove();
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    erase.addEventListener('click', () => {
        const stripped = stripEvidence(area.value, evidence);
        if (stripped === area.value.trim()) return write('没有找到可抹除的命中片段，请手动修改或改用 AI 改写。');
        area.value = stripped;
        write('已在本地抹除命中的原文片段，确认后再保存。');
    });
    rewrite.addEventListener('click', async () => {
        let config;
        try { config = currentConfig(); } catch (error) { return write(`无法发起改写：${error.message}`); }
        rewrite.disabled = true;
        write('正在请求模型改写…');
        try {
            area.value = await requestRewrite(area.value, config, undefined, write);
            write('改写完成。确认内容后点「保存到角色卡」。');
        } catch (error) { write(`改写失败：${error.message}`); }
        finally { rewrite.disabled = false; }
    });
    saveBtn.addEventListener('click', async () => {
        const text = area.value.trim();
        if (!text) return write('内容为空，未保存。');
        saveBtn.disabled = true;
        write('正在保存到角色卡…');
        try {
            await saveGreeting(target, text, write);
            target.text = text;
            target.edited = true;
            renderResults();
            populateGreetings();
            note('已写入角色卡；新建聊天时会使用修改后的开场白。', 'success');
            write('保存结束。已存在的聊天不会自动跟着变，需要时点「同步到当前聊天」。');
        } catch (error) { write(`保存失败：${error.message}`); }
        finally { saveBtn.disabled = false; }
    });
    syncBtn.addEventListener('click', async () => {
        const text = area.value.trim();
        if (!text) return write('内容为空，未同步。');
        if (!window.confirm('将用编辑框的内容覆盖当前聊天的第一条消息，确定继续？')) return write('已取消同步。');
        syncBtn.disabled = true;
        try { await applyGreetingToChat(text, write); note('当前聊天第一条消息已更新。', 'success'); }
        catch (error) { write(`同步失败：${error.message}`); }
        finally { syncBtn.disabled = false; }
    });
}
function setScanning(busy) {
    $('#ntr-scan').prop('disabled', busy).toggleClass('ntr-busy', busy);
    $('#ntr-cancel').prop('disabled', !busy);
    $('#ntr-progress-text').toggleClass('ntr-scanning', busy);
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
        if (error.name !== 'AbortError') console.warn('[忒修斯神器] 自动检测失败：', error);
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
    } catch (error) { console.warn('[忒修斯神器] 实时检测失败：', error); }
}
function buildUI() {
    const panel = el('div', 'ntr-panel'); panel.id = 'ntr-detector-panel';
    panel.innerHTML = `<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><span class="ntr-emblem">${emblemSVG('title')}</span><b>忒修斯神器</b><span class="ntr-tag">纯爱守护</span><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content">
      <div class="ntr-hero"><span class="ntr-emblem">${emblemSVG('hero')}</span><div class="ntr-hero-text"><div class="ntr-hero-title">斩杀牛头 · 守护纯爱</div><div class="ntr-hero-sub">纯爱规则已静默注入 · 检测只读文本 · 命中仅供复核</div></div><span class="ntr-status">守护中</span></div>
      <div class="ntr-actions"><button id="ntr-float-toggle" class="menu_button" type="button"><i class="fa-solid fa-window-restore"></i><span class="ntr-btn-label">浮窗显示</span></button><button id="ntr-minimize" class="menu_button" type="button"><i class="fa-solid fa-circle-dot"></i>最小化为悬浮球</button></div>
      <section class="ntr-card"><h4><i class="fa-solid fa-plug"></i>模型接口</h4>
      <label>API Base URL<input id="ntr-url" class="text_pole" type="url" autocomplete="off"></label>
      <label>API Key<input id="ntr-key" class="text_pole" type="password" autocomplete="off"></label>
      <label>模型名称<input id="ntr-model" class="text_pole" type="text"></label>
      <div class="ntr-grid"><label>温度<input id="ntr-temp" class="text_pole" type="number" min="0" max="2" step="0.1"></label>
      <label>最大并发数<input id="ntr-concurrency" class="text_pole" type="number" min="1" max="10"></label>
      <label>超时（秒）<input id="ntr-timeout" class="text_pole" type="number" min="5" max="300"></label>
      <label>分块字符数<input id="ntr-chunk" class="text_pole" type="number" min="200" max="20000"></label></div>
      <div class="ntr-actions"><button id="ntr-test" class="menu_button"><i class="fa-solid fa-satellite-dish"></i>测试连接</button><button id="ntr-clear" class="menu_button"><i class="fa-solid fa-broom"></i>清除缓存</button></div>
      </section>
      <section class="ntr-card"><h4><i class="fa-solid fa-comment-dots"></i>提示词</h4>
      <label>自定义检测系统提示词（留空使用内置提示词）<textarea id="ntr-prompt" class="text_pole" rows="5"></textarea></label>
      <label>自定义改写系统提示词（留空使用内置提示词）<textarea id="ntr-rewrite" class="text_pole" rows="4"></textarea></label>
      <label class="ntr-check"><input id="ntr-skip" type="checkbox">跳过关键词粗筛，全部送检</label>
      </section>
      <section class="ntr-card"><h4><i class="fa-solid fa-bell"></i>检测行为</h4>
      <label class="ntr-check"><input id="ntr-chat" type="checkbox">扫描当前聊天记录</label>
      <label class="ntr-check"><input id="ntr-realtime" type="checkbox">实时检测新 AI 回复</label>
      <label class="ntr-check"><input id="ntr-autocard" type="checkbox">打开角色卡时自动检测（无需手动扫描）</label>
      </section>
      <section class="ntr-card"><h4><i class="fa-solid fa-feather-pointed"></i>开场白改写</h4>
      <div class="ntr-hint">不依赖检测结果，直接改写当前角色卡里的任意一条开场白。</div>
      <label>选择开场白<select id="ntr-greet-select" class="text_pole"></select></label>
      <div id="ntr-greet-preview" class="ntr-greet-preview">选择一条开场白后可查看预览。</div>
      <div class="ntr-actions"><button id="ntr-greet-open" class="menu_button ntr-primary" type="button"><i class="fa-solid fa-wand-magic-sparkles"></i>打开改写器</button><button id="ntr-greet-refresh" class="menu_button" type="button"><i class="fa-solid fa-rotate"></i>刷新列表</button></div>
      </section>
      <section class="ntr-card"><h4><i class="fa-solid fa-crosshairs"></i>扫描与结果</h4>
      <label class="ntr-check"><input id="ntr-card" type="checkbox" checked>扫描当前角色卡</label>
      <label>世界书<select id="ntr-world" class="text_pole"><option value="">不扫描世界书</option><option value="__bound__">当前角色绑定的世界书（主 + 附加）</option></select></label>
      <div class="ntr-actions"><button id="ntr-scan" class="menu_button"><i class="fa-solid fa-magnifying-glass"></i>开始扫描</button><button id="ntr-cancel" class="menu_button" disabled><i class="fa-solid fa-ban"></i>取消扫描</button></div>
      <progress id="ntr-progress" max="1" value="0"></progress><div id="ntr-progress-text">尚未扫描</div>
      <div class="ntr-actions"><button id="ntr-json" class="menu_button"><i class="fa-solid fa-file-code"></i>导出 JSON</button><button id="ntr-md" class="menu_button"><i class="fa-solid fa-file-lines"></i>导出 Markdown</button></div>
      <div id="ntr-results"></div>
      </section></div></div>`;
    const floatBox = el('div', 'ntr-float ntr-hidden'); floatBox.id = 'ntr-float';
    floatBox.append(el('div', 'ntr-float-body'));
    const launcher = el('button', 'ntr-launcher ntr-hidden'); launcher.id = 'ntr-launcher'; launcher.type = 'button';
    launcher.title = '打开忒修斯神器浮窗';
    launcher.setAttribute('aria-label', '打开忒修斯神器浮窗');
    launcher.innerHTML = emblemSVG('launcher');
    document.body.append(floatBox, launcher);
    // 先挂到文档中，保证下面的选择器能取到表单控件；浮窗模式稍后由 applyPanelMode 搬移。
    document.querySelector('#extensions_settings')?.append(panel);
    const map = { '#ntr-url': 'baseUrl', '#ntr-key': 'apiKey', '#ntr-model': 'model', '#ntr-temp': 'temperature', '#ntr-concurrency': 'concurrency', '#ntr-timeout': 'timeout', '#ntr-chunk': 'chunkSize', '#ntr-prompt': 'prompt', '#ntr-rewrite': 'rewritePrompt', '#ntr-skip': 'skipPrefilter', '#ntr-chat': 'scanChat', '#ntr-realtime': 'realtime', '#ntr-autocard': 'autoCard' };
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
    $('#ntr-greet-select').on('change', showGreetingPreview);
    $('#ntr-greet-refresh').on('click', () => { populateGreetings(false); note('开场白列表已刷新。', 'info'); });
    $('#ntr-greet-open').on('click', () => {
        const target = greetingTargets[Number($('#ntr-greet-select').val())];
        if (!target) return note('请先选择一条开场白。', 'warning');
        openGreetingEditor(target);
    });
    populateGreetings(false);
    $('#ntr-float-toggle').on('click', () => { settings.floatMode = !settings.floatMode; settings.minimized = false; save(); applyPanelMode(); });
    $('#ntr-minimize').on('click', () => { settings.floatMode = true; settings.minimized = true; save(); applyPanelMode(); });
    launcher.addEventListener('click', () => { settings.floatMode = true; settings.minimized = false; save(); applyPanelMode(); });
    applyPanelMode();
}
// 在「扩展设置页」与「固定浮窗」之间切换同一个面板，避免两份表单状态不同步。
function applyPanelMode() {
    const panel = document.getElementById('ntr-detector-panel');
    const floatBox = document.getElementById('ntr-float');
    const launcher = document.getElementById('ntr-launcher');
    if (!panel || !floatBox || !launcher) return;
    panel.classList.toggle('ntr-floating', Boolean(settings.floatMode));
    $('#ntr-float-toggle .ntr-btn-label').text(settings.floatMode ? '收回设置页' : '浮窗显示');
    if (!settings.floatMode) {
        document.querySelector('#extensions_settings')?.append(panel);
        floatBox.classList.add('ntr-hidden');
        launcher.classList.add('ntr-hidden');
        return;
    }
    floatBox.querySelector('.ntr-float-body').append(panel);
    floatBox.classList.toggle('ntr-hidden', Boolean(settings.minimized));
    launcher.classList.toggle('ntr-hidden', !settings.minimized);
    if (!settings.minimized) {
        const content = panel.querySelector('.inline-drawer-content');
        if (content && window.getComputedStyle(content).display === 'none') $(content).slideDown();
    }
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
    applyPureLoveRule();
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_CHANGED, () => { applyPureLoveRule(); scheduleAutoScan(); populateGreetings(); });
    eventSource.on(event_types.APP_READY, () => { applyPureLoveRule(); scheduleAutoScan(); populateGreetings(); });
    scheduleAutoScan();
});
