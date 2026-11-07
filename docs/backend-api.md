**English** | [简体中文](backend-api.zh.md)

# SusDock Module API

For the WebUI frontend. The backend lives in `src/module/`; this document records what the scripts currently output and how they behave.

## 1. Runtime environment

KernelSU opens pages under the module's `webroot/` in a WebView. The frontend calls the scripts through `exec()` from the `kernelsu` package:

```ts
import { exec, moduleInfo } from "kernelsu";

const { id } = JSON.parse(moduleInfo()) as { id: string };
const result = await exec(`sh '/data/adb/modules/${id}/entry.sh' status quick`);

if (result.errno !== 0) {
    throw new Error(result.stderr);
}
// On success, result.stdout holds key=value lines and result.stderr holds the run log.
```

The module directory is located by the `id` in `module.prop`:

```
/data/adb/modules/<id>
```

`id` comes from `name` in `package.json` and is currently `susdock`. The frontend builds the path from `moduleInfo()`'s `id`; do not hardcode it.

## 2. Calling conventions

There is a single entry point: `<moddir>/entry.sh`

### 2.1 stdout / stderr

| Stream | Content                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| stdout | Machine-readable results only: `key=value` lines, a single value, or raw log text |
| stderr | Run log, formatted as `[YYYY-MM-DD HH:MM:SS] [LEVEL] message`                     |

`key=value` lines use lower-case keys only and match `^[a-z_][a-z0-9_]*=.*$`. The same key may appear multiple times (multi-line content); take the first value.

### 2.2 Exit codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| `0`  | Success / true for boolean commands  |
| `1`  | Generic failure / false for booleans |
| `>1` | Specific error code, see section 6   |

`err()` writes `[ERROR] <message>` to stderr and then exits 1. So when the exit code is 1, check stderr: an `[ERROR]` line means the call failed; otherwise it is a normal negative result.

### 2.3 Preflight checks

Every call goes through these checks first:

| Condition                                      | stderr                                 | Exit code |
| ---------------------------------------------- | -------------------------------------- | --------- |
| `MODDIR` is not set                            | `[ERROR] MODDIR not set`               | 1         |
| Module is disabled (`disable` exists)          | `[ERROR] module is disabled`           | 1         |
| Module is marked for removal (`remove` exists) | `[ERROR] module is marked for removal` | 1         |
| Unknown command                                | `[ERROR] invalid command: <cmd>`       | 1         |

## 3. Paths

| Variable                | Path                                    | Description                                  |
| ----------------------- | --------------------------------------- | -------------------------------------------- |
| `DATA_DIR`              | `/data/adb/<id>`                        | Module data directory                        |
| `MOD_DIR`               | `/data/adb/<id>/mod`                    | Driver and version files                     |
| `CONFIG_FILE`           | `/data/adb/<id>/config`                 | Persisted settings; only `LOG_LEVEL` for now |
| `LOG_FILE`              | `/data/adb/<id>/logs/module.log`        | Current log                                  |
| Rotated log             | `/data/adb/<id>/logs/module.log.1`      | Rotated when it exceeds 1 MiB                |
| `UPSTREAM_VERSION_FILE` | `/data/adb/<id>/mod/version`            | Installed upstream version (the tag)         |
| `UPSTREAM_LOCAL_TARGET` | `/data/adb/<id>/mod/susfs_guard_lkm.ko` | Downloaded driver                            |
| `REBOOT_FLAG`           | `/data/adb/<id>/mod/reboot`             | Present means a reboot is required           |

## 4. Command overview

| Command                  | Purpose                            | Network |
| ------------------------ | ---------------------------------- | ------- |
| `status installed`       | Whether the driver is loaded       | No      |
| `status susfs_version`   | Running SuSFS version              | No      |
| `status reboot_required` | Whether a reboot is required       | No      |
| `status quick`           | Local status summary               | No      |
| `mod release`            | Download the upstream release JSON | **Yes** |
| `mod update`             | Install an update from a given URL | **Yes** |
| `mod version`            | Locally installed version          | No      |
| `mod clear-reboot`       | Clear the reboot flag              | No      |
| `mod upstream`           | Show the effective update source   | No      |
| `mod autoload`           | Read the boot autoload toggle      | No      |
| `mod autoload on\|off`   | Enable / disable boot autoload     | No      |
| `log tail [lines]`       | Read the end of the log            | No      |
| `log clear`              | Clear the log                      | No      |
| `log level`              | Read the log level                 | No      |
| `log set-level <LEVEL>`  | Set the log level                  | No      |

## 5. Command details

### 5.1 `status installed`

| Stream | Value                                            |
| ------ | ------------------------------------------------ |
| stdout | `true` \| `false`                                |
| exit   | `0` loaded; `1` not loaded or cannot be detected |

SuSFS hides its own module from `lsmod`, so this does not ask `lsmod`; it runs
`ksu_susfs show version` and treats success as available. If `ksu_susfs` is
missing, it returns `false` with exit code 1 and `[ERROR] ksu_susfs not found: …`
on stderr.

### 5.2 `status susfs_version`

| Stream | Value                                            |
| ------ | ------------------------------------------------ |
| stdout | `<version>`, format `x.y.z`, leading `v` removed |
| exit   | `0`                                              |

Error codes: `1` when `ksu_susfs` is not found, `2` when the version cannot be read.

### 5.3 `status reboot_required`

| Stream | Value                 |
| ------ | --------------------- |
| stdout | `true` \| `false`     |
| exit   | `0` required; `1` not |

### 5.4 `status quick`

Offline; suitable for every UI refresh.

```
android_version=14
kernel_version=6.1
gki_branch=14
loaded=true
reboot_required=false
running_version=<version>
local_version=<upstream-tag>
ko_size=482304
```

| key               | Type           | Description                                           |
| ----------------- | -------------- | ----------------------------------------------------- |
| `android_version` | string         | `ro.build.version.release`; `unknown` if unavailable  |
| `kernel_version`  | string         | Major.minor kernel version, e.g. `6.1`                |
| `gki_branch`      | string         | The `-androidNN-` part of `uname -r`; empty if absent |
| `loaded`          | `true`/`false` | Whether `ksu_susfs show version` succeeds             |
| `reboot_required` | `true`/`false` | Whether the reboot flag file exists                   |
| `running_version` | string         | `ksu_susfs show version` with the `v` prefix removed  |
| `local_version`   | string         | Installed upstream tag; `unknown` if unavailable      |
| `ko_size`         | integer        | Local `.ko` size in bytes; `0` if missing             |

`local_version` comes from the upstream `tag_name` and may include a `v` prefix;
`running_version` already has it stripped. Normalize both by removing the `v`
before comparing them in the frontend.

`gki_branch` is used to pick the upstream asset: prefer it, and fall back to the
major Android version when it is unavailable.

The exit code is always `0`; individual failures degrade to `unknown`.

### 5.5 `mod release`

Downloads the upstream release JSON and prints it verbatim to stdout. **The script does not parse JSON** — the WebUI parses it with `JSON.parse`.

| Stream | Value                         |
| ------ | ----------------------------- |
| stdout | Release JSON, verbatim        |
| exit   | `0` success; `6` fetch failed |

```json
{ "assets": [], "tag_name": "<tag>" }
```

On download failure, stderr contains `[ERROR] failed to fetch release info`. The temporary file is written to `/data/adb/<id>/release.<pid>.json` and removed after output.

### 5.6 `mod update <version> <url> <sha256>`

Installs the asset supplied by the caller: downloads the `.ko`, verifies the sha256, writes the version file, and creates the reboot flag. The URL must start with `https://` and the sha256 must be 64 hex characters.

```sh
sh entry.sh mod update "<version>" "<url>" "<sha256>"
```

| Stream | Value                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| stdout | Empty                                                                                                              |
| stderr | `[..] [INFO] download [...]: <url> -> <path>`<br>`[..] [INFO] update installed: <version> (reboot to take effect)` |

| Exit code | Meaning                                               |
| --------- | ----------------------------------------------------- |
| `0`       | Installed successfully, **takes effect after reboot** |
| `1`       | Missing argument, or URL is not https                 |
| `2`       | Download failed                                       |
| `3`       | Malformed sha256, or checksum mismatch                |
| `4`       | Write failed (directory, permissions, disk)           |

On failure, the last stderr line usually starts with `[ERROR]` and can be shown directly.

### 5.7 `mod version`

| Stream | Value                                                       |
| ------ | ----------------------------------------------------------- |
| stdout | Local version as stored (the upstream tag; may include `v`) |
| exit   | `0` success; `3` local version file is missing              |

### 5.8 `mod clear-reboot`

| Stream | Value                          |
| ------ | ------------------------------ |
| stdout | Empty                          |
| exit   | `0` success; `1` delete failed |

### 5.9 `log tail [lines]`

Reads the end of the log and prints plain text, not `key=value`.

```
sh entry.sh log tail 200
```

| Argument | Default | Description                                           |
| -------- | ------- | ----------------------------------------------------- |
| `lines`  | `200`   | Number of lines; non-numeric or `0` falls back to 200 |

- When the rotated file `module.log.1` exists, its content is prepended before tailing so a freshly rotated log does not look empty.
- If the log file does not exist, the output is empty and the exit code is still `0`.
- Output is always in chronological order. The WebUI reverses it for display; the script has no sort option.

```
[2026-10-27 12:00:00] [INFO] download [curl]: https://... -> /data/adb/...
[2026-10-27 12:00:03] [INFO] download done: /data/adb/...
```

### 5.10 `log clear`

Truncates `module.log` and removes `module.log.1`. The exit code is always `0`.

### 5.11 `log level`

| Stream | Value                                              |
| ------ | -------------------------------------------------- |
| stdout | Current level: `DEBUG` / `INFO` / `WARN` / `ERROR` |
| exit   | `0`                                                |

Values: `DEBUG` | `INFO` | `WARN` | `ERROR`.

### 5.12 `log set-level <LEVEL>`

Case-insensitive; writes to `/data/adb/<id>/config`:

```sh
sh entry.sh log set-level "<LEVEL>"
```

| Stream | Value                                  |
| ------ | -------------------------------------- |
| stdout | Normalized level, e.g. `DEBUG`         |
| stderr | `[..] [INFO] log level set to <LEVEL>` |

| Exit code | Meaning                                 |
| --------- | --------------------------------------- |
| `0`       | Success; stdout is the normalized level |
| `1`       | Argument is not a valid level           |
| `2`       | Failed to write the config file         |

The new level applies to the next command; the current process is unaffected. The `LOG_LEVEL` environment variable takes precedence over the config file.

### 5.13 `mod upstream`

Shows the update source actually in effect for this call. The setting is stored in the WebUI's `localStorage` and passed to the script through environment variables; the script itself never reads or writes upstream settings.

```
upstream=https://api.github.com/repos/inforcqb/susfs4ksu-lkm/releases/latest
mirror=
official=https://api.github.com/repos/inforcqb/susfs4ksu-lkm/releases/latest
```

| key        | Description                                |
| ---------- | ------------------------------------------ |
| `upstream` | Releases API URL in effect for this call   |
| `mirror`   | Driver download prefix; empty means direct |
| `official` | Official URL (the default)                 |

### 5.14 `mod autoload`

Controls how the installed driver is loaded at boot. The toggle state is simply
whether `/data/adb/post-fs-data.d/<id>.sh` exists; no config file is written.

- Off (default): the module's `post-fs-data.sh` is executed by KernelSU.
- On: copies the script to `post-fs-data.d/<id>.sh`, then renames the module's
  `post-fs-data.sh` to `.post-fs-data.sh` so the same script does not run twice.
- Off again: deletes the copy and renames `.post-fs-data.sh` back to `post-fs-data.sh`.

```sh
sh entry.sh mod autoload     # read state
sh entry.sh mod autoload on  # install the priority copy and hide the bundled script
sh entry.sh mod autoload off # remove the copy and restore the bundled script
```

| Stream | Value                                                                                   |
| ------ | --------------------------------------------------------------------------------------- |
| stdout | `enabled=true` \| `enabled=false`                                                       |
| exit   | `0` success; `1` argument is not `on` / `off`; `4` copy, rename, chmod or delete failed |

`uninstall.sh` removes this script so it does not linger after the module is uninstalled.

### 5.15 Upstream environment variables

| Variable          | Description                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `UPSTREAM_API`    | Releases API URL; falls back to the official URL when it does not start with `https://`           |
| `UPSTREAM_MIRROR` | Driver download prefix (e.g. `https://ghfast.top/`); only applied to `.ko` `browser_download_url` |

ghfast.top only proxies files, not `api.github.com`. So the "fast mirror" option only accelerates driver downloads; release info still comes from the official API.

Example:

```sh
UPSTREAM_API='https://api.github.com/repos/inforcqb/susfs4ksu-lkm/releases/latest' \
    UPSTREAM_MIRROR='https://ghfast.top/' \
    sh entry.sh mod release
```

### 5.16 Log level filtering

`log <level> <message>` only prints messages at or above the current level:

| Level   | Value |
| ------- | ----- |
| `DEBUG` | 0     |
| `INFO`  | 1     |
| `WARN`  | 2     |
| `ERROR` | 3     |

## 6. Error code summary

### download.sh

| Code | Meaning                     |
| ---- | --------------------------- |
| 1    | Missing argument            |
| 2    | No download tool available  |
| 3    | Cannot create directory     |
| 4    | Network request failed      |
| 5    | Downloaded content is empty |
| 6    | Write failed                |

### upstream.sh

| Code | Meaning                  |
| ---- | ------------------------ |
| 3    | Local file missing       |
| 6    | Failed to fetch upstream |

### entries/mod.sh

| Code | Meaning                             |
| ---- | ----------------------------------- |
| 1    | Missing argument or invalid URL     |
| 2    | Download failed                     |
| 3    | Invalid sha256 or checksum mismatch |
| 4    | Write failed                        |

### entries/status.sh

| Code | Meaning                   |
| ---- | ------------------------- |
| 1    | Required tool unavailable |
| 2    | Failed to read version    |

### entries/log.sh

| Code | Meaning          |
| ---- | ---------------- |
| 1    | Invalid argument |
| 2    | Write failed     |

## 7. Integration notes

1. Use `status quick` for the status card; it is offline and cheap enough for every refresh.
2. Update detection is `mod release` + frontend `JSON.parse`: compare `tag_name` with `local_version`, and match the asset name `susfs_guard_lkm-android<branch>-<kernel>.ko` using `gki_branch` / `kernel_version`.
3. `mod update` needs explicit version, URL and sha256. Exit code 0 only means the file is installed — make clear that it takes effect after reboot, then refresh the status card to read `reboot_required`.
4. Render the log panel from `log tail` as plain text, and refetch immediately after clearing.
5. After changing the log level, tell the user it applies to the next run; the current log does not change immediately.
6. `exec()` can fail outright due to SELinux, permissions or a disabled module; `errno !== 0` must be handled.
