import type { LogLevel } from "../api";
import type { Text } from "../i18n";
import { clearLog, readLog, readLogLevel, setLogLevel } from "../api";
import { messageOf } from "../errors";
import { intlLocale, LANG_EVENT, msg, t, tOf } from "../i18n";
import { notify } from "../notify";
import { requireElement } from "./dom";

const AUTO_MS = 5000;
const LOG_LINES = 300;

function clock(): string {
    return new Date().toLocaleTimeString(intlLocale(), { hour12: false });
}

// 倒序：最新的一行在最上面
function reverseLines(text: string): string {
    const out: string[] = [];

    // unshift 避免依赖 Array#reverse / toReversed，老 WebView 也能跑
    for (const line of text.replace(/\n+$/, "").split("\n")) {
        out.unshift(line);
    }

    return out.join("\n");
}

/*
 * 日志面板：预览、清空、调节等级。
 * 等级改动要等下一次命令执行才生效，所以这里只提示，不刷新当前日志。
 * 按钮文字和统计行随语言切换重渲染；日志正文只在下次刷新时换文案。
 */
export class SdLogPanel extends HTMLElement {
    private auto = true;
    private lastLogText = "";
    private lastMeta: Text = msg("state.reading");
    private loading = false;
    private readError = "";
    private ready = false;
    private reverse = false;
    private timer: number | null = null;

    connectedCallback(): void {
        if (this.ready) {
            return;
        }
        this.ready = true;

        document.addEventListener(LANG_EVENT, () => this.renderTexts());

        requireElement(this, "#log-refresh").addEventListener("click", () => void this.refresh());
        requireElement(this, "#log-clear").addEventListener("click", () => void this.clear());
        requireElement(this, "#log-auto").addEventListener("click", () => this.toggleAuto());
        requireElement(this, "#log-order").addEventListener("click", () => this.toggleOrder());
        requireElement<HTMLSelectElement>(this, "#log-level")
            .addEventListener("change", () => void this.changeLevel());

        this.renderTexts();
        void this.loadLevel();
        void this.refresh();
        this.startAuto();
    }

    disconnectedCallback(): void {
        this.stopAuto();
    }

    private async refresh(jumpToEnd = false): Promise<void> {
        if (this.loading) {
            return;
        }
        this.loading = true;

        const log = requireElement<HTMLElement>(this, "#log-output");

        // 正序时新日志在底部，倒序时在顶部；只有原本就贴在那一端才跟着滚
        const pinned = this.reverse
            ? log.scrollTop <= 8
            : log.scrollTop + log.clientHeight >= log.scrollHeight - 8;

        try {
            const text = await readLog(LOG_LINES);
            const trimmed = text.trim();

            this.readError = "";
            this.lastLogText = text;

            const count = trimmed === "" ? 0 : trimmed.split("\n").length;
            this.lastMeta = msg("log.metaLast", { count, time: clock() });
        }
        catch (error) {
            this.readError = messageOf(error);
            this.lastLogText = "";
            this.lastMeta = msg("log.metaTime", { time: clock() });
        }
        finally {
            this.loading = false;
        }

        this.renderLog();

        if (jumpToEnd || pinned) {
            log.scrollTop = this.reverse ? 0 : log.scrollHeight;
        }
    }

    private async clear(): Promise<void> {
        try {
            await clearLog();
            await this.refresh();
            notify(t("log.cleared"));
        }
        catch (error) {
            notify(t("log.clearFailed", { message: messageOf(error) }));
        }
    }

    private async loadLevel(): Promise<void> {
        try {
            const level = await readLogLevel();
            requireElement<HTMLSelectElement>(this, "#log-level").value = level;
        }
        catch {
            // 读不到就保留默认选项
        }
    }

    private async changeLevel(): Promise<void> {
        const select = requireElement<HTMLSelectElement>(this, "#log-level");
        const level = select.value as LogLevel;

        try {
            const applied = await setLogLevel(level);
            select.value = applied;
            notify(t("log.levelSet", { level: applied }));
        }
        catch (error) {
            notify(t("log.levelFailed", { message: messageOf(error) }));
            await this.loadLevel();
        }
    }

    private toggleOrder(): void {
        this.reverse = !this.reverse;
        this.renderTexts();
        void this.refresh(true);
    }

    private toggleAuto(): void {
        this.auto = !this.auto;
        this.renderTexts();

        if (this.auto) {
            this.startAuto();
        }
        else {
            this.stopAuto();
        }
    }

    // 按当前排序状态渲染日志正文和统计行
    private renderLog(): void {
        const log = requireElement<HTMLElement>(this, "#log-output");

        if (this.readError !== "") {
            log.textContent = t("log.readFailed", { message: this.readError });
        }
        else if (this.lastLogText.trim() === "") {
            log.textContent = t("log.empty");
        }
        else {
            log.textContent = this.reverse ? reverseLines(this.lastLogText) : this.lastLogText;
        }
    }

    private renderTexts(): void {
        requireElement(this, "#log-auto").textContent = t(this.auto ? "log.autoOn" : "log.autoOff");
        requireElement(this, "#log-order").textContent = t(this.reverse ? "log.orderDesc" : "log.orderAsc");
        this.renderLog();
        requireElement(this, "#log-meta").textContent = tOf(this.lastMeta);
    }

    private startAuto(): void {
        this.stopAuto();
        this.timer = window.setInterval(() => void this.refresh(), AUTO_MS);
    }

    private stopAuto(): void {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
    }
}

if (!customElements.get("sd-log-panel")) {
    customElements.define("sd-log-panel", SdLogPanel);
}
