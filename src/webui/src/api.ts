/*
 * 和模块里的 shell 脚本打交道。界面布局相关的东西不放在这里，
 * 但抛给界面展示的错误文案走 i18n。接口细节见 docs/backend-api.md。
 */
import { exec, moduleInfo } from "kernelsu";
import { t } from "./i18n";
import { first, parseKV } from "./protocol";
import { loadUpstream } from "./upstream";

const FALLBACK_MODULE_ID = "susdock";
const MODULE_ROOT = "/data/adb/modules";
const MAX_LOG_LINES = 2000;

export type LogLevel = "DEBUG" | "ERROR" | "INFO" | "WARN";

export interface ModuleStatus {
    android: string;
    gkiBranch: string;
    kernel: string;
    koSize: number;
    loaded: boolean;
    local: string;
    rebootRequired: boolean;
    running: string;
}

export interface PendingUpdate {
    sha256: string;
    url: string;
    version: string;
}

export type UpdateCheck =
    | { state: "available"; update: PendingUpdate }
    | { state: "current"; version: string }
    | { state: "error"; message: string };

export interface UpdateResult {
    errno: number;
    log: string;
    ok: boolean;
}

interface ReleaseAsset {
    digest: string;
    name: string;
    url: string;
}

interface Release {
    assets: ReleaseAsset[];
    tag: string;
}

interface ExecOutput {
    errno: number;
    stderr: string;
    stdout: string;
}

// module.prop 的 id 由 package.json 的 name 生成，不要写死路径
function moduleDir(): string {
    try {
        const info = JSON.parse(moduleInfo()) as { id?: unknown };
        if (typeof info.id === "string" && /^[\w.-]+$/.test(info.id)) {
            return `${MODULE_ROOT}/${info.id}`;
        }
    }
    catch {
        // moduleInfo() 在非 KernelSU 环境不可用
    }

    return `${MODULE_ROOT}/${FALLBACK_MODULE_ID}`;
}

// 单引号包裹，内部单引号按 POSIX 规则转义成 '\''
function shellQuote(value: string): string {
    return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

// 更新源存在 localStorage，这里通过环境变量交给 entry.sh，脚本不写配置文件
function upstreamEnv(): string {
    const { api, mirror } = loadUpstream();
    let env = `UPSTREAM_API=${shellQuote(api)}`;

    if (mirror !== "") {
        env += ` UPSTREAM_MIRROR=${shellQuote(mirror)}`;
    }

    return `${env} `;
}

function run(args: string): Promise<ExecOutput> {
    if (!("ksu" in globalThis)) {
        return Promise.reject(new Error(t("app.notInKsu")));
    }

    return exec(`${upstreamEnv()}sh '${moduleDir()}/entry.sh' ${args}`);
}

async function runOk(args: string): Promise<string> {
    const { errno, stderr, stdout } = await run(args);
    if (errno !== 0) {
        throw new Error(cleanError(stderr || stdout) || t("app.commandFailed", { errno }));
    }

    return stdout;
}

// stderr 里混着普通日志，取最后一条 [ERROR] 作为错误信息
function cleanError(text: string): string {
    const lines = text.split("\n").map(line => line.trim()).filter(line => line !== "");
    let message = "";

    for (const line of lines) {
        if (line.includes("[ERROR]")) {
            message = line.replace(/^.*\[ERROR\]\s*/, "");
        }
    }

    if (message !== "") {
        return message;
    }

    return lines[lines.length - 1] ?? "";
}

function toNumber(value: string): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function readStatus(): Promise<ModuleStatus> {
    const map = parseKV(await runOk("status quick"));

    return {
        android: first(map, "android_version", t("common.unknown")),
        gkiBranch: first(map, "gki_branch", ""),
        kernel: first(map, "kernel_version", t("common.unknown")),
        koSize: toNumber(first(map, "ko_size", "0")),
        loaded: first(map, "loaded") === "true",
        local: first(map, "local_version", t("common.unknown")),
        rebootRequired: first(map, "reboot_required") === "true",
        running: first(map, "running_version", t("common.unknown")),
    };
}

/*
 * 上游 JSON 由 `mod release` 原样输出，这里用 JSON.parse 解析。
 * shell 不再参与解析，压缩/报错页/权限问题都不会伪装成「解析失败」。
 */
async function fetchRelease(): Promise<Release> {
    const raw = await runOk("mod release");

    let data: unknown;
    try {
        data = JSON.parse(raw);
    }
    catch {
        throw new Error(t("api.badJson"));
    }

    const body = data as { assets?: unknown; tag_name?: unknown };
    if (typeof body.tag_name !== "string" || !Array.isArray(body.assets)) {
        throw new TypeError(t("api.missingFields"));
    }

    const assets: ReleaseAsset[] = [];
    for (const item of body.assets) {
        if (typeof item !== "object" || item === null) {
            continue;
        }
        const asset = item as { browser_download_url?: unknown; digest?: unknown; name?: unknown };
        if (typeof asset.name !== "string" || typeof asset.browser_download_url !== "string") {
            continue;
        }
        assets.push({
            digest: typeof asset.digest === "string" ? asset.digest : "",
            name: asset.name,
            url: asset.browser_download_url,
        });
    }

    return { assets, tag: body.tag_name };
}

// 资产名形如 susfs_guard_lkm-android15-6.6.ko。优先用 uname 的 GKI 分支，
// 取不到时退回 Android 版本主号。
function pickAsset(release: Release, status: ModuleStatus): ReleaseAsset | null {
    const branch = status.gkiBranch === "" ? status.android.split(".")[0] : status.gkiBranch;
    const name = `susfs_guard_lkm-android${branch}-${status.kernel}.ko`;
    return release.assets.find(asset => asset.name === name) ?? null;
}

function sha256Of(asset: ReleaseAsset): string {
    return asset.digest.startsWith("sha256:") ? asset.digest.slice("sha256:".length) : "";
}

// 加速前缀只作用于 GitHub 的文件下载，和旧版 shell 的行为保持一致
function withMirror(url: string): string {
    const { mirror } = loadUpstream();
    return mirror !== "" && url.startsWith("https://github.com/") ? `${mirror}${url}` : url;
}

export async function checkUpdate(): Promise<UpdateCheck> {
    const [release, status] = await Promise.all([fetchRelease(), readStatus()]);

    if (release.tag === status.local) {
        return { state: "current", version: release.tag };
    }

    const asset = pickAsset(release, status);
    if (asset === null) {
        const branch = status.gkiBranch === "" ? status.android : status.gkiBranch;
        return {
            state: "error",
            message: t("api.noAsset", { branch, kernel: status.kernel }),
        };
    }

    const sha256 = sha256Of(asset);
    if (sha256 === "") {
        return { state: "error", message: t("api.noSha") };
    }

    return {
        state: "available",
        update: { version: release.tag, url: withMirror(asset.url), sha256 },
    };
}

export async function applyUpdate(update: PendingUpdate): Promise<UpdateResult> {
    const args = ["mod", "update", update.version, update.url, update.sha256]
        .map(shellQuote)
        .join(" ");
    const { errno, stderr, stdout } = await run(args);
    const log = [stderr, stdout]
        .filter(part => part.trim() !== "")
        .join("\n")
        .trim();

    return { errno, log, ok: errno === 0 };
}

/*
 * 开机加载开关的状态就是 post-fs-data.d/ 里有没有本模块的脚本，
 * 所以每次都问后端，不在前端缓存。
 */
export async function readAutoload(): Promise<boolean> {
    const map = parseKV(await runOk("mod autoload"));
    return first(map, "enabled") === "true";
}

export async function setAutoload(enabled: boolean): Promise<boolean> {
    const map = parseKV(await runOk(`mod autoload ${enabled ? "on" : "off"}`));
    return first(map, "enabled") === "true";
}

export function readLog(lines = 300): Promise<string> {
    const count = Math.min(Math.max(Math.trunc(lines), 1), MAX_LOG_LINES);
    return runOk(`log tail ${count}`);
}

export async function clearLog(): Promise<void> {
    await runOk("log clear");
}

function isLogLevel(value: string): value is LogLevel {
    return value === "DEBUG" || value === "INFO" || value === "WARN" || value === "ERROR";
}

export async function readLogLevel(): Promise<LogLevel> {
    const value = (await runOk("log level")).trim().toUpperCase();
    return isLogLevel(value) ? value : "INFO";
}

export async function setLogLevel(level: LogLevel): Promise<LogLevel> {
    const value = (await runOk(`log set-level ${level}`)).trim().toUpperCase();
    return isLogLevel(value) ? value : level;
}

// 模块自身的版本，从管理器拿；拿不到就返回空串
export function moduleVersion(): string {
    try {
        const info = JSON.parse(moduleInfo()) as { version?: unknown };
        return typeof info.version === "string" ? info.version : "";
    }
    catch {
        return "";
    }
}
