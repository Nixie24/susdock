import type { DictKey, Text } from "../i18n";
import type { UpstreamPreset } from "../upstream";
import { LANG_EVENT, msg, t, tOf } from "../i18n";
import { notify } from "../notify";
import { customSetting, loadUpstream, OFFICIAL_API, presetSetting, saveUpstream } from "../upstream";
import { requireElement } from "./dom";

type Preset = Exclude<UpstreamPreset, "custom">;

const NOTE_KEY: Record<UpstreamPreset, DictKey> = {
    custom: "upstream.note.custom",
    mirror: "upstream.note.mirror",
    official: "upstream.note.official",
};

const HTTPS_URL = /^https:\/\/\S+$/;

/*
 * 更新源设置弹窗。设置存在 localStorage，由 api.ts 通过环境变量传给脚本。
 * 结构在 index.html，样式在 stylesheet.css。
 * 事件：sd-upstream-changed（保存成功后触发，bubbles）
 */
export class SdUpstreamDialog extends HTMLElement {
    private ready = false;
    private preset: UpstreamPreset = "official";
    private lastError: Text = "";

    connectedCallback(): void {
        if (this.ready) {
            return;
        }
        this.ready = true;

        document.addEventListener(LANG_EVENT, () => this.sync());

        const dialog = this.dialog();

        requireElement(this, "#upstream-close").addEventListener("click", () => dialog.close());
        requireElement(this, "#upstream-cancel").addEventListener("click", () => dialog.close());
        requireElement(this, "#upstream-save").addEventListener("click", () => this.save());

        requireElement(this, "#upstream-clear").addEventListener("click", () => {
            this.input().value = "";
            this.input().focus();
            this.sync();
        });

        // 手动改地址就不再算预设，下载也回到直连
        this.input().addEventListener("input", () => {
            this.preset = this.input().value.trim() === OFFICIAL_API ? "official" : "custom";
            this.sync();
        });

        for (const button of this.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
            button.addEventListener("click", () => this.applyPreset(button.dataset.preset as Preset));
        }

        // 点遮罩关闭：dialog 自身铺满视口，命中自身就是点了遮罩
        dialog.addEventListener("click", event => {
            if (event.target === dialog) {
                dialog.close();
            }
        });
    }

    open(): void {
        const setting = loadUpstream();

        this.preset = setting.preset;
        this.input().value = setting.api;
        this.setError("");
        this.sync();

        if (!this.dialog().open) {
            this.dialog().showModal();
        }
    }

    private applyPreset(preset: Preset): void {
        const setting = presetSetting(preset);

        this.preset = setting.preset;
        this.input().value = setting.api;
        this.setError("");
        this.sync();
        this.input().focus();
    }

    private save(): void {
        const value = this.input().value.trim();

        if (!HTTPS_URL.test(value)) {
            this.setError(msg("upstream.invalid"));
            this.input().focus();
            return;
        }

        saveUpstream(this.preset === "custom" ? customSetting(value) : presetSetting(this.preset));

        this.dialog().close();
        notify(t("upstream.saved"));
        this.dispatchEvent(new CustomEvent("sd-upstream-changed", { bubbles: true, composed: true }));
    }

    // 同步预设按钮高亮和下载说明
    private sync(): void {
        for (const button of this.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
            button.classList.toggle("active", button.dataset.preset === this.preset);
        }

        requireElement(this, "#upstream-note").textContent = t(NOTE_KEY[this.preset]);

        const error = requireElement(this, "#upstream-error");
        error.textContent = tOf(this.lastError);
        error.hidden = this.lastError === "";
    }

    private setError(text: Text): void {
        this.lastError = text;

        const node = requireElement(this, "#upstream-error");
        node.textContent = tOf(text);
        node.hidden = text === "";
    }

    private dialog(): HTMLDialogElement {
        return requireElement<HTMLDialogElement>(this, "#upstream-dialog");
    }

    private input(): HTMLInputElement {
        return requireElement<HTMLInputElement>(this, "#upstream-input");
    }
}

if (!customElements.get("sd-upstream-dialog")) {
    customElements.define("sd-upstream-dialog", SdUpstreamDialog);
}
