import type { Plugin } from "vite";
import { defineConfig } from "vite";

function escapeRegExp(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/*
 * 把构建产物里的 JS / CSS 内联进 index.html，最终只输出一个 HTML 文件。
 * KernelSU 的 WebUI 从本地路径加载，单文件能少两次请求，也避免资源路径问题。
 */
function inlineAssets(): Plugin {
    return {
        name: "inline-assets",
        apply: "build",
        enforce: "post",
        generateBundle(_options, bundle) {
            const htmlAsset = bundle["index.html"];
            if (htmlAsset === undefined || htmlAsset.type !== "asset") {
                return;
            }

            let html = String(htmlAsset.source);

            for (const [fileName, output] of Object.entries(bundle)) {
                if (fileName === "index.html") {
                    continue;
                }

                if (output.type === "chunk" && fileName.endsWith(".js")) {
                    const pattern = new RegExp(`<script[^>]*src="[^"]*${escapeRegExp(fileName)}"[^>]*></script>`);
                    if (!pattern.test(html)) {
                        continue;
                    }
                    // 内联后不能出现闭合标签，否则会提前结束脚本
                    const code = output.code.replaceAll("</script>", String.raw`<\/script>`);
                    html = html.replace(pattern, () => `<script type="module">${code}</script>`);
                    delete bundle[fileName];
                }
                else if (output.type === "asset" && fileName.endsWith(".css")) {
                    const pattern = new RegExp(`<link[^>]*href="[^"]*${escapeRegExp(fileName)}"[^>]*>`);
                    if (!pattern.test(html)) {
                        continue;
                    }
                    const css = String(output.source).replaceAll("</style>", String.raw`<\/style>`);
                    html = html.replace(pattern, () => `<style>${css}</style>`);
                    delete bundle[fileName];
                }
            }

            htmlAsset.source = html;
        },
    };
}

export default defineConfig({
    // WebUI 是从本地路径打开的，资源必须用相对路径
    base: "./",
    plugins: [inlineAssets()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
    },
});
