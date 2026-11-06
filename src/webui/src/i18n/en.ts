/*
 * 英文文案：所有语言的键都以这里为准，其余语言用 Record<DictKey, string> 对齐。
 * 新增键先加到这里，tsc 会强制其他语言补齐。
 */

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

// 语言选择器里显示的名称，用该语言自己的写法
export const label = "English";

export default en;
