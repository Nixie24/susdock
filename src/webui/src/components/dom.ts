import { t } from "../i18n";

// 组件只操作 index.html 里已有的节点，找不到就直接报错，避免静默失效
export function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
    const node = root.querySelector<T>(selector);
    if (node === null) {
        throw new Error(t("core.missingNode", { selector }));
    }

    return node;
}
