import type { PendingUpdate } from "../api";
import type { DictKey, Language } from "../i18n";
import type { SdStatusCard } from "./sd-status-card";
import type { SdUpdateCard } from "./sd-update-card";
import type { SdUpstreamDialog } from "./sd-upstream-dialog";
import { applyUpdate, checkUpdate, moduleVersion, readStatus } from "../api";
import { messageOf } from "../errors";
import { currentLanguage, LANG_EVENT, msg, setLanguage, t } from "../i18n";
import { notify } from "../notify";
import { currentTheme, initTheme, toggleTheme } from "../theme";
import { requireElement } from "./dom";
import "./sd-autoload-card";
import "./sd-badge";
import "./sd-log-panel";
import "./sd-row";
import "./sd-status-card";
import "./sd-update-card";
import "./sd-upstream-dialog";

const FAIL_REASONS: Partial<Record<number, DictKey>> = {
    1: "update.fail.1",
    2: "update.fail.2",
    3: "update.fail.3",
    4: "update.fail.4",
};

/*
 * 页面根组件：负责编排状态刷新和更新流程。
 * 页面结构全部写在 index.html，这里只绑事件、写数据。
 */
export class SdApp extends HTMLElement {
    private pending: PendingUpdate | null = null;
    private ready = false;

    connectedCallback(): void {
        if (this.ready) {
            return;
        }
        this.ready = true;

        initTheme();

        const version = moduleVersion();
        if (version !== "") {
            requireElement(this, "#version").textContent = version;
        }

        const themeButton = requireElement<HTMLButtonElement>(this, "#theme");
        themeButton.addEventListener("click", () => {
            toggleTheme();
            this.syncTheme(themeButton);
        });
        this.syncTheme(themeButton);

        this.initLanguageBar();
        document.addEventListener(LANG_EVENT, () => {
            this.syncTheme(themeButton);
        });

        requireElement<HTMLButtonElement>(this, "#refresh-status")
            .addEventListener("click", () => void this.refreshStatus());

        const update = requireElement<SdUpdateCard>(this, "sd-update-card");
        update.addEventListener("sd-check", () => void this.detectUpdate());
        update.addEventListener("sd-update", () => void this.installUpdate());

        const upstream = requireElement<SdUpstreamDialog>(this, "sd-upstream-dialog");
        requireElement<HTMLButtonElement>(this, "#upstream-open")
            .addEventListener("click", () => upstream.open());
        this.addEventListener("sd-upstream-changed", () => update.setIdle());

        void this.refreshStatus();
        this.autoCheck();
    }

    // 底部语言选择：跟随系统 / English / Русский / 简体中文
    private initLanguageBar(): void {
        const select = requireElement<HTMLSelectElement>(this, "#language");
        select.value = currentLanguage();
        select.addEventListener("change", () => {
            setLanguage(select.value as Language);
        });
    }

    // 打开页面时自动查一次。10 分钟内重复打开不重复请求，
    // 避免未认证的 GitHub API 被刷到限流。
    private autoCheck(): void {
        const key = "autoCheckAt";
        const interval = 10 * 60 * 1000;

        try {
            const last = Number(localStorage.getItem(key) ?? "0");
            if (Number.isFinite(last) && Date.now() - last < interval) {
                return;
            }
            localStorage.setItem(key, String(Date.now()));
        }
        catch {
            // 读不了就每次都查
        }

        void this.detectUpdate();
    }

    private syncTheme(button: HTMLButtonElement): void {
        const mode = currentTheme();
        const label = t(mode === "dark" ? "theme.toLight" : "theme.toDark");

        // 图标显示的是"点一下会切到哪"，具体图标由 CSS 按 .dark 选择
        button.title = label;
        button.setAttribute("aria-label", label);
    }

    private async refreshStatus(): Promise<void> {
        const card = requireElement<SdStatusCard>(this, "sd-status-card");

        try {
            card.setStatus(await readStatus());
        }
        catch (error) {
            const message = messageOf(error);
            card.setError(message);
            notify(t("app.readStatusFailed", { message }));
        }
    }

    private async detectUpdate(): Promise<void> {
        const card = requireElement<SdUpdateCard>(this, "sd-update-card");
        card.setBusy(msg("update.busyCheck"));

        try {
            const result = await checkUpdate();

            if (result.state === "available") {
                this.pending = result.update;
                card.setAvailable(result.update.version);
                return;
            }
            if (result.state === "current") {
                this.pending = null;
                card.setCurrent(result.version);
                return;
            }

            this.pending = null;
            card.setNote(msg("update.checkFailed", { message: result.message }));
        }
        catch (error) {
            this.pending = null;
            card.setNote(msg("update.checkFailed", { message: messageOf(error) }));
        }
    }

    private async installUpdate(): Promise<void> {
        if (this.pending === null) {
            await this.detectUpdate();
            if (this.pending === null) {
                return;
            }
        }

        const update = this.pending;
        const card = requireElement<SdUpdateCard>(this, "sd-update-card");
        card.setBusy(msg("update.busyDownload"));

        try {
            const result = await applyUpdate(update);

            if (result.ok) {
                this.pending = null;
                await this.refreshStatus();
                card.setNote(msg("update.done"));
                notify(t("update.doneToast"));
                return;
            }

            notify(t("update.failed"));
            card.setFailed(msg(FAIL_REASONS[result.errno] ?? "update.scriptFailed"), result.log);
        }
        catch (error) {
            card.setFailed(messageOf(error), "");
        }
    }
}

if (!customElements.get("sd-app")) {
    customElements.define("sd-app", SdApp);
}
