import type { ModuleStatus } from "../api";
import type { SdBadge } from "./sd-badge";
import type { SdRow } from "./sd-row";
import { onLanguageChange, t } from "../i18n";
import { requireElement } from "./dom";
import "./sd-badge";
import "./sd-row";

const FIELDS = ["android", "kernel", "running", "local", "koSize"] as const;

function formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "-";
    }

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/*
 * 状态卡：只负责显示，数据由 sd-app 拉取后写入。
 * DOM 全部来自 index.html。
 * 记住最近一次的状态，换语言时重画 badge（数值本身不翻译）。
 */
export class SdStatusCard extends HTMLElement {
    private status: ModuleStatus | null = null;
    private error: string | null = null;
    private ready = false;

    connectedCallback(): void {
        if (this.ready) {
            return;
        }
        this.ready = true;

        onLanguageChange(this, () => this.rerender());
    }

    setStatus(status: ModuleStatus): void {
        this.status = status;
        this.error = null;
        this.rerender();
    }

    setError(message: string): void {
        this.error = message;
        this.rerender();
    }

    private rerender(): void {
        const badge = requireElement<SdBadge>(this, "#state-badge");

        if (this.error !== null) {
            badge.textContent = t("state.readFailed");
            badge.tone = "fail";
            badge.title = this.error;
            requireElement(this, "#reboot-badge").hidden = true;

            for (const field of FIELDS) {
                this.setField(field, "-");
            }

            return;
        }

        if (this.status === null) {
            return;
        }

        const status = this.status;
        badge.textContent = status.loaded ? t("state.loaded") : t("state.unloaded");
        badge.tone = status.loaded ? "ok" : "fail";

        requireElement(this, "#reboot-badge").hidden = !status.rebootRequired;

        // 空值在这里补翻译，换语言时能跟着变
        this.setField("android", status.android || t("common.unknown"));
        this.setField("kernel", status.kernel || t("common.unknown"));
        this.setField("running", status.running || t("common.unknown"));
        this.setField("local", status.local || t("common.unknown"));
        this.setField("koSize", formatSize(status.koSize));
    }

    private setField(field: string, value: string): void {
        requireElement<SdRow>(this, `sd-row[data-field="${field}"]`).value = value;
    }
}

if (!customElements.get("sd-status-card")) {
    customElements.define("sd-status-card", SdStatusCard);
}
