import type { Text } from "../i18n";
import { LANG_EVENT, tOf } from "../i18n";
import { requireElement } from "./dom";
import "./sd-badge";

type View = "available" | "busy" | "current" | "failed" | "idle" | "note";

/*
 * 更新卡：只负责显示和发事件，具体请求由 sd-app 处理。
 * 事件：sd-check（开始检测）、sd-update（执行更新）
 * 视图 DOM 全部来自 index.html，用 data-view 标记。
 * 动态文案传 Text 进来，存最近一份，换语言时重渲染。
 */
export class SdUpdateCard extends HTMLElement {
    private ready = false;
    private lastBusy: Text = "";
    private lastNote: Text = "";
    private lastReason: Text = "";
    private lastLog = "";

    connectedCallback(): void {
        if (this.ready) {
            return;
        }
        this.ready = true;

        document.addEventListener(LANG_EVENT, () => this.rerender());

        // 事件委托：所有按钮都带 data-action，隐藏视图里的按钮也能正常响应
        this.addEventListener("click", event => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;

            if (action === "check") {
                this.emit("sd-check");
            }
            else if (action === "update") {
                this.emit("sd-update");
            }
        });
    }

    setIdle(): void {
        this.show("idle");
    }

    setBusy(text: Text): void {
        this.lastBusy = text;
        requireElement(this, ".busy-text").textContent = tOf(text);
        this.show("busy");
    }

    setAvailable(version: string): void {
        requireElement(this, "[data-role=\"available-tag\"]").textContent = version;
        this.show("available");
    }

    setCurrent(version: string): void {
        const tag = requireElement(this, "[data-role=\"current-tag\"]");
        tag.textContent = version;
        tag.hidden = version === "";
        this.show("current");
    }

    setFailed(reason: Text, log: string): void {
        this.lastReason = reason;
        this.lastLog = log;
        requireElement(this, "[data-role=\"reason\"]").textContent = tOf(reason);
        requireElement(this, "[data-role=\"log\"]").textContent = log;
        this.show("failed");
    }

    setNote(text: Text): void {
        this.lastNote = text;
        requireElement(this, "[data-role=\"note\"]").textContent = tOf(text);
        this.show("note");
    }

    private rerender(): void {
        requireElement(this, ".busy-text").textContent = tOf(this.lastBusy);
        requireElement(this, "[data-role=\"reason\"]").textContent = tOf(this.lastReason);
        requireElement(this, "[data-role=\"note\"]").textContent = tOf(this.lastNote);
        requireElement(this, "[data-role=\"log\"]").textContent = this.lastLog;
    }

    private show(view: View): void {
        for (const section of this.querySelectorAll<HTMLElement>("[data-view]")) {
            section.hidden = section.dataset.view !== view;
        }
    }

    private emit(name: string): void {
        this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
    }
}

if (!customElements.get("sd-update-card")) {
    customElements.define("sd-update-card", SdUpdateCard);
}
