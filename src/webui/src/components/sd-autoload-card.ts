import type { Text } from "../i18n";
import { readAutoload, setAutoload } from "../api";
import { messageOf } from "../errors";
import { LANG_EVENT, msg, t, tOf } from "../i18n";
import { notify } from "../notify";
import { requireElement } from "./dom";

/*
 * 开机加载开关。状态来自 post-fs-data.d/ 里的脚本是否存在，
 * 切换失败时把勾选状态改回去，避免界面和实际不一致。
 * 记住最近一次提示（Text），换语言时重渲染。
 */
export class SdAutoloadCard extends HTMLElement {
    private busy = false;
    private ready = false;
    private lastMeta: Text = msg("state.reading");

    connectedCallback(): void {
        if (this.ready) {
            return;
        }
        this.ready = true;

        document.addEventListener(LANG_EVENT, () => this.renderMeta());

        requireElement<HTMLInputElement>(this, "#autoload-toggle")
            .addEventListener("change", () => void this.toggle());

        void this.load();
    }

    private async load(): Promise<void> {
        const toggle = requireElement<HTMLInputElement>(this, "#autoload-toggle");

        try {
            const enabled = await readAutoload();
            toggle.checked = enabled;
            this.setMeta(enabled);
        }
        catch (error) {
            toggle.checked = false;
            this.lastMeta = msg("autoload.readFailed", { message: this.describe(error) });
            this.renderMeta();
        }
    }

    private async toggle(): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;

        const toggle = requireElement<HTMLInputElement>(this, "#autoload-toggle");
        const wanted = toggle.checked;
        toggle.disabled = true;

        try {
            const enabled = await setAutoload(wanted);
            toggle.checked = enabled;
            this.setMeta(enabled);
            notify(t(enabled ? "autoload.enabledToast" : "autoload.disabledToast"));
        }
        catch (error) {
            toggle.checked = !wanted;
            const message = this.describe(error);
            this.lastMeta = msg("autoload.toggleFailed", { message });
            this.renderMeta();
            notify(t("autoload.toggleFailed", { message }));
        }
        finally {
            toggle.disabled = false;
            this.busy = false;
        }
    }

    // entry.sh 在模块被禁用时统一报 "module is disabled"，这里换成可读提示
    private describe(error: unknown): string {
        const message = messageOf(error);
        return message.includes("module is disabled")
            ? t("autoload.moduleDisabled")
            : message;
    }

    private setMeta(enabled: boolean): void {
        this.lastMeta = msg(enabled ? "autoload.metaOn" : "autoload.metaOff");
        this.renderMeta();
    }

    private renderMeta(): void {
        this.meta().textContent = tOf(this.lastMeta);
    }

    private meta(): HTMLElement {
        return requireElement(this, "#autoload-meta");
    }
}

if (!customElements.get("sd-autoload-card")) {
    customElements.define("sd-autoload-card", SdAutoloadCard);
}
