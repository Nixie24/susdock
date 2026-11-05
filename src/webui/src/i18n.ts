/*
 * 国际化：中文 / English / Русский，外加"跟随系统"。
 * 选择存 localStorage（键 lang），默认 system 按 navigator.language 猜。
 * 静态文案在 index.html 里打 data-i18n 标记，动态文案调 t()；
 * 切语言时重新遍历 DOM，并在 document 上发 LANG_EVENT，
 * 组件把最后一次渲染的状态存下来，收到事件就重画。
 */

export type Language = "en" | "ru" | "system" | "zh";
export type Locale = "en" | "ru" | "zh";
export type Args = Record<string, number | string>;

const KEY = "lang";

export const LANG_EVENT = "sd-languagechange";

const en = {
    "common.unknown": "unknown",
    "core.missingNode": "Missing element: {selector}",
    "app.notInKsu": "Not running in a KernelSU environment",
    "app.commandFailed": "Command failed (errno {errno})",
    "app.readStatusFailed": "Failed to read status: {message}",
    "api.badJson": "Upstream response is not valid JSON",
    "api.missingFields": "Upstream response lacks tag_name or assets",
    "api.noAsset": "No driver matches this device: android {branch} / kernel {kernel}",
    "api.noSha": "Upstream provides no sha256 digest",

    "theme.toLight": "Switch to light theme",
    "theme.toDark": "Switch to dark theme",

    "language.title": "Language",
    "language.system": "Follow system",

    "status.title": "Status",
    "action.refresh": "Refresh",
    "state.reading": "Reading…",
    "state.reboot": "Reboot required",
    "field.kernel": "Kernel version",
    "field.running": "Loaded version",
    "field.local": "Local version",
    "field.koSize": "Driver size",
    "state.loaded": "● Loaded",
    "state.unloaded": "● Not loaded",
    "state.readFailed": "Read failed",

    "autoload.title": "Boot loading",
    "autoload.key": "Load the driver early at boot",
    "autoload.hint": "By default the module's own post-fs-data.sh is used; when enabled, /data/adb/post-fs-data.d/ loads it earlier",
    "autoload.metaOn": "Enabled; after reboot post-fs-data.d loads it early.",
    "autoload.metaOff": "Disabled; the module's post-fs-data.sh loads it.",
    "autoload.enabledToast": "Early boot loading enabled",
    "autoload.disabledToast": "Early boot loading disabled",
    "autoload.readFailed": "Read failed: {message}",
    "autoload.toggleFailed": "Toggle failed: {message}",
    "autoload.moduleDisabled": "The module is disabled, boot loading cannot be changed.",

    "update.title": "Check for updates",
    "update.settings": "Update source settings",
    "update.check": "Check for updates",
    "update.apply": "Update",
    "update.again": "Check again",
    "update.recheck": "Re-check",
    "update.retry": "Retry",
    "update.busyCheck": "Querying upstream…",
    "update.busyDownload": "Downloading and verifying…",
    "update.available": "New version found",
    "update.upToDate": "Up to date",
    "update.failed": "Update failed",
    "update.done": "Update complete; takes effect after reboot.",
    "update.doneToast": "Update complete, reboot to apply",
    "update.scriptFailed": "The update script failed.",
    "update.checkFailed": "Check failed: {message}",
    "update.fail.1": "Invalid install arguments (version, URL or sha256).",
    "update.fail.2": "Download failed, check the network.",
    "update.fail.3": "Driver verification failed (sha256 mismatch).",
    "update.fail.4": "Write failed, check storage space and permissions.",

    "log.title": "Log",
    "log.level": "Level",
    "log.autoOn": "Auto-refresh: on",
    "log.autoOff": "Auto-refresh: off",
    "log.orderAsc": "Order: oldest first",
    "log.orderDesc": "Order: newest first",
    "log.clear": "Clear",
    "log.empty": "(log is empty)",
    "log.metaLast": "Last updated {time} · {count} lines",
    "log.metaTime": "Last updated {time}",
    "log.readFailed": "Failed to read log: {message}",
    "log.cleared": "Log cleared",
    "log.clearFailed": "Failed to clear log: {message}",
    "log.levelSet": "Log level set to {level}, takes effect on next run",
    "log.levelFailed": "Failed to set log level: {message}",

    "upstream.title": "Update source",
    "upstream.close": "Close",
    "upstream.hint": "Used for update checks and driver downloads.",
    "upstream.official": "Official",
    "upstream.mirror": "CN mirror",
    "upstream.cancel": "Cancel",
    "upstream.save": "Save",
    "upstream.saved": "Update source saved",
    "upstream.invalid": "Enter an address starting with https://",
    "upstream.clear": "Clear",
    "upstream.note.official": "Driver download: direct GitHub",
    "upstream.note.mirror": "Driver download: via ghfast.top",
    "upstream.note.custom": "Driver download: direct GitHub",
};

export type DictKey = keyof typeof en;

const zh: Record<DictKey, string> = {
    "common.unknown": "未知",
    "core.missingNode": "缺少节点：{selector}",
    "app.notInKsu": "未在 KernelSU 环境中运行",
    "app.commandFailed": "命令失败 (errno {errno})",
    "app.readStatusFailed": "读取状态失败：{message}",
    "api.badJson": "上游响应不是合法 JSON",
    "api.missingFields": "上游响应缺少 tag_name 或 assets",
    "api.noAsset": "没有匹配本机的驱动：android {branch} / 内核 {kernel}",
    "api.noSha": "上游没有提供 sha256",

    "theme.toLight": "切换到浅色",
    "theme.toDark": "切换到深色",

    "language.title": "语言",
    "language.system": "跟随系统",

    "status.title": "状态",
    "action.refresh": "刷新",
    "state.reading": "读取中…",
    "state.reboot": "需重启",
    "field.kernel": "内核版本",
    "field.running": "运行版本",
    "field.local": "本地版本",
    "field.koSize": "驱动大小",
    "state.loaded": "● 已加载",
    "state.unloaded": "● 未加载",
    "state.readFailed": "读取失败",

    "autoload.title": "开机加载",
    "autoload.key": "开机优先加载驱动",
    "autoload.hint": "默认用模块自带的 post-fs-data.sh；开启后改用 /data/adb/post-fs-data.d/ 优先加载",
    "autoload.metaOn": "已开启，重启后由 post-fs-data.d 优先加载。",
    "autoload.metaOff": "已关闭，由模块的 post-fs-data.sh 加载。",
    "autoload.enabledToast": "已开启开机加载",
    "autoload.disabledToast": "已关闭开机加载",
    "autoload.readFailed": "读取失败：{message}",
    "autoload.toggleFailed": "切换失败：{message}",
    "autoload.moduleDisabled": "模块已被禁用，无法修改开机加载。",

    "update.title": "检测更新",
    "update.settings": "更新源设置",
    "update.check": "检测更新",
    "update.apply": "更新",
    "update.again": "再查一次",
    "update.recheck": "重新检测",
    "update.retry": "重试",
    "update.busyCheck": "正在查询上游…",
    "update.busyDownload": "正在下载并校验…",
    "update.available": "发现新版本",
    "update.upToDate": "已是最新版本",
    "update.failed": "更新失败",
    "update.done": "更新完成，重启后生效。",
    "update.doneToast": "更新完成，重启后生效",
    "update.scriptFailed": "更新脚本执行失败。",
    "update.checkFailed": "检测失败：{message}",
    "update.fail.1": "安装参数无效（版本、URL 或 sha256）。",
    "update.fail.2": "下载失败，请检查网络。",
    "update.fail.3": "驱动校验失败（sha256 不匹配）。",
    "update.fail.4": "写入失败，请检查存储空间与权限。",

    "log.title": "日志",
    "log.level": "等级",
    "log.autoOn": "自动刷新：开",
    "log.autoOff": "自动刷新：关",
    "log.orderAsc": "排序：正序",
    "log.orderDesc": "排序：倒序",
    "log.clear": "清空",
    "log.empty": "（日志为空）",
    "log.metaLast": "最后更新 {time} · {count} 行",
    "log.metaTime": "最后更新 {time}",
    "log.readFailed": "读取日志失败：{message}",
    "log.cleared": "日志已清空",
    "log.clearFailed": "清空日志失败：{message}",
    "log.levelSet": "日志等级已设为 {level}，下次执行生效",
    "log.levelFailed": "设置日志等级失败：{message}",

    "upstream.title": "更新源",
    "upstream.close": "关闭",
    "upstream.hint": "检测更新与下载驱动时使用这个地址。",
    "upstream.official": "官方",
    "upstream.mirror": "国内加速",
    "upstream.cancel": "取消",
    "upstream.save": "保存",
    "upstream.saved": "更新源已保存",
    "upstream.invalid": "请输入以 https:// 开头的地址",
    "upstream.clear": "清空",
    "upstream.note.official": "驱动下载：直连 GitHub",
    "upstream.note.mirror": "驱动下载：经 ghfast.top 加速",
    "upstream.note.custom": "驱动下载：直连 GitHub",
};

const ru: Record<DictKey, string> = {
    "common.unknown": "неизвестно",
    "core.missingNode": "Нет элемента: {selector}",
    "app.notInKsu": "За пределами окружения KernelSU",
    "app.commandFailed": "Команда завершилась с ошибкой (errno {errno})",
    "app.readStatusFailed": "Не удалось прочитать статус: {message}",
    "api.badJson": "Ответ upstream — некорректный JSON",
    "api.missingFields": "В ответе upstream нет tag_name или assets",
    "api.noAsset": "Нет драйвера для этого устройства: android {branch} / ядро {kernel}",
    "api.noSha": "Upstream не передал sha256",

    "theme.toLight": "Переключить на светлую тему",
    "theme.toDark": "Переключить на тёмную тему",

    "language.title": "Язык",
    "language.system": "Как в системе",

    "status.title": "Состояние",
    "action.refresh": "Обновить",
    "state.reading": "Чтение…",
    "state.reboot": "Нужна перезагрузка",
    "field.kernel": "Версия ядра",
    "field.running": "Загруженная версия",
    "field.local": "Локальная версия",
    "field.koSize": "Размер драйвера",
    "state.loaded": "● Загружен",
    "state.unloaded": "● Не загружен",
    "state.readFailed": "Ошибка чтения",

    "autoload.title": "Загрузка при старте",
    "autoload.key": "Ранняя загрузка драйвера при старте",
    "autoload.hint": "По умолчанию используется post-fs-data.sh модуля; при включении драйвер раньше загружается через /data/adb/post-fs-data.d/",
    "autoload.metaOn": "Включено: после перезагрузки драйвер загружается раньше через post-fs-data.d.",
    "autoload.metaOff": "Выключено: драйвер загружается через post-fs-data.sh модуля.",
    "autoload.enabledToast": "Ранняя загрузка при старте включена",
    "autoload.disabledToast": "Ранняя загрузка при старте выключена",
    "autoload.readFailed": "Ошибка чтения: {message}",
    "autoload.toggleFailed": "Не удалось переключить: {message}",
    "autoload.moduleDisabled": "Модуль отключён — изменить загрузку при старте нельзя.",

    "update.title": "Проверка обновлений",
    "update.settings": "Настройки источника обновлений",
    "update.check": "Проверить обновления",
    "update.apply": "Обновить",
    "update.again": "Проверить ещё раз",
    "update.recheck": "Повторная проверка",
    "update.retry": "Повторить",
    "update.busyCheck": "Запрос к upstream…",
    "update.busyDownload": "Загрузка и проверка…",
    "update.available": "Найдена новая версия",
    "update.upToDate": "Обновлений нет",
    "update.failed": "Сбой обновления",
    "update.done": "Обновление завершено, применится после перезагрузки.",
    "update.doneToast": "Обновление завершено, требуется перезагрузка",
    "update.scriptFailed": "Скрипт обновления завершился с ошибкой.",
    "update.checkFailed": "Сбой проверки: {message}",
    "update.fail.1": "Некорректные параметры установки (версия, URL или sha256).",
    "update.fail.2": "Не удалось загрузить, проверьте сеть.",
    "update.fail.3": "Проверка драйвера не пройдена (несовпадение sha256).",
    "update.fail.4": "Ошибка записи, проверьте свободное место и права.",

    "log.title": "Журнал",
    "log.level": "Уровень",
    "log.autoOn": "Автообновление: вкл",
    "log.autoOff": "Автообновление: выкл",
    "log.orderAsc": "Порядок: старые сверху",
    "log.orderDesc": "Порядок: новые сверху",
    "log.clear": "Очистить",
    "log.empty": "(журнал пуст)",
    "log.metaLast": "Обновлено {time} · строк: {count}",
    "log.metaTime": "Обновлено {time}",
    "log.readFailed": "Не удалось прочитать журнал: {message}",
    "log.cleared": "Журнал очищен",
    "log.clearFailed": "Не удалось очистить журнал: {message}",
    "log.levelSet": "Уровень журнала: {level}, применится при следующем запуске",
    "log.levelFailed": "Не удалось задать уровень журнала: {message}",

    "upstream.title": "Источник обновлений",
    "upstream.close": "Закрыть",
    "upstream.hint": "Используется для проверки обновлений и загрузки драйвера.",
    "upstream.official": "Официальный",
    "upstream.mirror": "Зеркало (КНР)",
    "upstream.cancel": "Отмена",
    "upstream.save": "Сохранить",
    "upstream.saved": "Источник обновлений сохранён",
    "upstream.invalid": "Введите адрес, начинающийся с https://",
    "upstream.clear": "Очистить",
    "upstream.note.official": "Загрузка драйвера: напрямую с GitHub",
    "upstream.note.mirror": "Загрузка драйвера: через ghfast.top",
    "upstream.note.custom": "Загрузка драйвера: напрямую с GitHub",
};

const DICT: Record<Locale, typeof en> = { en, ru, zh };

function storedLanguage(): Language {
    try {
        const value = localStorage.getItem(KEY);
        if (value === "en" || value === "ru" || value === "zh" || value === "system") {
            return value;
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
    let text: string = DICT[locale][key] ?? key;

    if (args !== undefined) {
        for (const [name, value] of Object.entries(args)) {
            text = text.replaceAll(`{${name}}`, String(value));
        }
    }

    return text;
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
