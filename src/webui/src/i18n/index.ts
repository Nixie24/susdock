/*
 * 国际化：中文 / English / Русский，外加"跟随系统"。
 * 英文是唯一的键来源（en.ts），其他语言放 locales/，各自 export default。
 * locales/ 由 Vite 在构建时静态收集，新增语言只需加文件并在 LOCALES 登记。
 * 选择存 localStorage（键 lang），默认 system 按 navigator.language 猜。
 * 静态文案在 index.html 里打 data-i18n 标记，动态文案调 t()；
 * 切语言时重新遍历 DOM，并在 document 上发 LANG_EVENT，
 * 组件把最后一次渲染的状态存下来，收到事件就重画。
 */

import en, { type DictKey, label as enLabel } from "./en";

export type Args = Record<string, number | string>;
export type Dict = typeof en;
export type { DictKey };

// 语言清单：新增语言时在这里加一项，并在 locales/ 放同名文件
export const LOCALES = ["en", "ru", "zh"] as const;

export type Locale = (typeof LOCALES)[number];
export type Language = "system" | Locale;

const KEY = "lang";

export const LANG_EVENT = "sd-languagechange";

const PLACEHOLDER = /\{(\w+)\}/g;

// 非英语字典：Vite 构建时静态收集 locales/ 下的所有模块
interface LocaleModule {
    default: Dict;
    label: string;
}

const modules = import.meta.glob<LocaleModule>("./locales/*.ts", { eager: true });

const DICT: Partial<Record<Locale, Dict>> = { en };
const LABELS: Partial<Record<Locale, string>> = { en: enLabel };

for (const [path, module] of Object.entries(modules)) {
    const code = path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf(".")) as Locale;
    DICT[code] = module.default;
    LABELS[code] = module.label;
}

function devWarn(message: string, ...rest: unknown[]): void {
    if (import.meta.env.DEV) {
        console.warn(`[i18n] ${message}`, ...rest);
    }
}

if (import.meta.env.DEV) {
    for (const locale of LOCALES) {
        if (DICT[locale] === undefined) {
            devWarn(`missing dictionary for "${locale}"`);
        }
    }
    for (const code of Object.keys(DICT)) {
        if (!(LOCALES as readonly string[]).includes(code)) {
            devWarn(`"${code}" is not listed in LOCALES`);
        }
    }
}

// 字典缺失时退回英文，避免界面整块空白
function dictFor(locale: Locale): Dict {
    return DICT[locale] ?? en;
}

// 语言选择器用的自称，不随当前界面语言变化
export function languageLabel(locale: Locale): string {
    return LABELS[locale] ?? locale;
}

function storedLanguage(): Language {
    try {
        const value = localStorage.getItem(KEY);
        if (value === "system" || (LOCALES as readonly string[]).includes(value ?? "")) {
            return value as Language;
        }
    }
    catch {
        // 隐私模式等场合读不了，用默认值
    }

    return "system";
}

function systemLocale(): Locale {
    for (const tag of navigator.languages ?? [navigator.language ?? ""]) {
        const base = tag.toLowerCase();
        if (base.startsWith("zh")) {
            return "zh";
        }
        if (base.startsWith("ru")) {
            return "ru";
        }
    }

    return "en";
}

let language: Language = "system";
let locale: Locale = "en";

export function currentLanguage(): Language {
    return language;
}

export function currentLocale(): Locale {
    return locale;
}

// 给 toLocaleTimeString 之类用的 BCP 47 标签
export function intlLocale(): string {
    return locale === "zh" ? "zh-CN" : locale;
}

export function t(key: DictKey, args?: Args): string {
    const text: string | undefined = dictFor(locale)[key];

    if (text === undefined) {
        // index.html 里的 key 写错时能看出来，而不是显示 undefined
        devWarn(`unknown key: ${key}`);
        return key;
    }

    if (args === undefined) {
        if (text.includes("{")) {
            devWarn(`missing args for "${key}": ${text}`);
        }
        return text;
    }

    // 不用 Object.hasOwn：目标是 ES2021，老 WebView 没有
    return text.replaceAll(PLACEHOLDER, (match, name: string) => {
        if (args[name] === undefined) {
            devWarn(`missing arg "${name}" for key "${key}"`);
            return match;
        }

        return String(args[name]);
    });
}

export interface Msg {
    args?: Args;
    key: DictKey;
}

// 组件里可能混着后端原始报错（没法翻译），所以文案统一用 Text：
// 要么是 {key,args}（换语言时可重译），要么是原样字符串
export type Text = Msg | string;

export function msg(key: DictKey, args?: Args): Msg {
    return { args, key };
}

export function tOf(text: Text): string {
    return typeof text === "string" ? text : t(text.key, text.args);
}

// 组件统一订阅：切换语言时重画，已从文档移除的跳过
export function onLanguageChange(host: HTMLElement, rerender: () => void): void {
    document.addEventListener(LANG_EVENT, () => {
        if (host.isConnected) {
            rerender();
        }
    });
}

function translateAttr(root: ParentNode, attribute: string, apply: (el: HTMLElement, key: DictKey) => void): void {
    const dataKey = attribute.slice(5).replaceAll(/-(\w)/g, (_, c: string) => c.toUpperCase());

    for (const el of root.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
        const key = (el.dataset as Record<string, string | undefined>)[dataKey];
        if (key !== undefined) {
            apply(el, key as DictKey);
        }
    }
}

function applyLanguage(): void {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;

    translateAttr(document, "data-i18n", (el, key) => {
        el.textContent = t(key);
    });
    translateAttr(document, "data-i18n-title", (el, key) => {
        el.title = t(key);
    });
    translateAttr(document, "data-i18n-aria-label", (el, key) => {
        el.setAttribute("aria-label", t(key));
    });
    translateAttr(document, "data-i18n-placeholder", (el, key) => {
        el.setAttribute("placeholder", t(key));
    });
}

function resolve(next: Language): void {
    language = next;
    locale = next === "system" ? systemLocale() : next;
}

export function setLanguage(next: Language): void {
    resolve(next);

    try {
        localStorage.setItem(KEY, next);
    }
    catch {
        // 存不了只影响下次打开，本次会话内仍然生效
    }

    applyLanguage();
    document.dispatchEvent(new Event(LANG_EVENT));
}

// 模块加载即应用一次：main.ts 的 import 链在组件注册前跑到这里，
// 此时文档已解析完（type=module 相当于 defer），静态文案先翻译好再升级组件。
resolve(storedLanguage());
applyLanguage();

// 跟随系统时，系统语言在运行中变化也要跟着切
window.addEventListener("languagechange", () => {
    if (language !== "system") {
        return;
    }

    resolve("system");
    applyLanguage();
    document.dispatchEvent(new Event(LANG_EVENT));
});
