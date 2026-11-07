[English](backend-api.md) | **简体中文**

# SusDock 模块接口文档

本文档面向 WebUI 前端。后端代码位于 `src/module/`，内容记录脚本当前的输出与行为。

## 1. 运行环境

KernelSU 通过 WebView 加载模块 `webroot/` 下的页面。前端通过 `kernelsu` 包提供的 `exec()` 调用脚本：

```ts
import { exec, moduleInfo } from "kernelsu";

const { id } = JSON.parse(moduleInfo()) as { id: string };
const result = await exec(`sh '/data/adb/modules/${id}/entry.sh' status quick`);

if (result.errno !== 0) {
    throw new Error(result.stderr);
}
// 成功时 result.stdout 为 key=value 行，result.stderr 为运行日志
```

模块目录根据 `module.prop` 中的 `id` 定位：

```
/data/adb/modules/<id>
```

`id` 由 `package.json` 的 `name` 生成，当前为 `susdock`。前端应使用 `moduleInfo()` 返回的 `id` 拼接路径，不应硬编码。

## 2. 调用约定

入口仅有一个：`<moddir>/entry.sh`

### 2.1 stdout / stderr

| 流     | 内容                                                       |
| ------ | ---------------------------------------------------------- |
| stdout | 仅输出机器可读结果：`key=value` 行、单个值，或原始日志文本 |
| stderr | 运行日志，格式为 `[YYYY-MM-DD HH:MM:SS] [LEVEL] message`   |

`key=value` 行仅使用小写 key，匹配 `^[a-z_][a-z0-9_]*=.*$`。同一个 key 可能多次出现（多行内容），应取第一次出现的值。

### 2.2 退出码

| 退出码 | 含义                   |
| ------ | ---------------------- |
| `0`    | 成功 / 布尔命令为真    |
| `1`    | 通用失败；布尔命令为假 |
| `>1`   | 具体错误码，见第 6 节  |

`err()` 会向 stderr 写入 `[ERROR] <message>`，随后执行 `exit 1`。因此退出码为 1 时应检查 stderr：包含 `[ERROR]` 表示执行失败，否则为正常的否定结果。

### 2.3 前置检查

每次调用都会先执行以下检查：

| 条件                               | stderr                                 | 退出码 |
| ---------------------------------- | -------------------------------------- | ------ |
| `MODDIR` 未设置                    | `[ERROR] MODDIR not set`               | 1      |
| 模块被禁用（存在 `disable` 文件）  | `[ERROR] module is disabled`           | 1      |
| 模块标记卸载（存在 `remove` 文件） | `[ERROR] module is marked for removal` | 1      |
| 命令未知                           | `[ERROR] invalid command: <cmd>`       | 1      |

## 3. 路径

| 变量                    | 路径                                    | 说明                               |
| ----------------------- | --------------------------------------- | ---------------------------------- |
| `DATA_DIR`              | `/data/adb/<id>`                        | 模块数据目录                       |
| `MOD_DIR`               | `/data/adb/<id>/mod`                    | 驱动与版本文件                     |
| `CONFIG_FILE`           | `/data/adb/<id>/config`                 | 持久化设置，当前仅识别 `LOG_LEVEL` |
| `LOG_FILE`              | `/data/adb/<id>/logs/module.log`        | 当前日志                           |
| 轮转日志                | `/data/adb/<id>/logs/module.log.1`      | 超过 1 MiB 时轮转                  |
| `UPSTREAM_VERSION_FILE` | `/data/adb/<id>/mod/version`            | 已安装的上游版本（即 tag）         |
| `UPSTREAM_LOCAL_TARGET` | `/data/adb/<id>/mod/susfs_guard_lkm.ko` | 已下载的驱动                       |
| `REBOOT_FLAG`           | `/data/adb/<id>/mod/reboot`             | 存在表示需要重启                   |

## 4. 命令一览

| 命令                     | 作用                     | 网络   |
| ------------------------ | ------------------------ | ------ |
| `status installed`       | 驱动是否已加载           | 否     |
| `status susfs_version`   | 运行中的 SuSFS 版本      | 否     |
| `status reboot_required` | 是否需要重启             | 否     |
| `status quick`           | 本机状态汇总             | 否     |
| `mod release`            | 下载上游 release JSON    | **是** |
| `mod update`             | 按给定 URL 安装更新      | **是** |
| `mod version`            | 本地已安装版本           | 否     |
| `mod clear-reboot`       | 清除重启标记             | 否     |
| `mod upstream`           | 读取本次实际生效的更新源 | 否     |
| `mod autoload`           | 读取开机自动加载开关状态 | 否     |
| `mod autoload on\|off`   | 开启 / 关闭开机自动加载  | 否     |
| `log tail [lines]`       | 读取日志尾部             | 否     |
| `log clear`              | 清空日志                 | 否     |
| `log level`              | 读取日志等级             | 否     |
| `log set-level <LEVEL>`  | 设置日志等级             | 否     |

## 5. 命令详情

### 5.1 `status installed`

| 流     | 值                               |
| ------ | -------------------------------- |
| stdout | `true` \| `false`                |
| exit   | `0` 已加载；`1` 未加载或无法检测 |

SuSFS 会将自身模块从 `lsmod` 中隐藏，因此此处不查询 `lsmod`，而是执行
`ksu_susfs show version`：执行成功即视为可用。若 `ksu_susfs` 不存在，则返回 `false`，
退出码为 1，stderr 为 `[ERROR] ksu_susfs not found: …`。

### 5.2 `status susfs_version`

| 流     | 值                                      |
| ------ | --------------------------------------- |
| stdout | `<version>`，格式 `x.y.z`，移除前缀 `v` |
| exit   | `0`                                     |

错误码：`1` 表示未找到 `ksu_susfs`，`2` 表示无法获取版本。

### 5.3 `status reboot_required`

| 流     | 值                       |
| ------ | ------------------------ |
| stdout | `true` \| `false`        |
| exit   | `0` 需要重启；`1` 不需要 |

### 5.4 `status quick`

不进行网络请求，适合每次界面刷新时调用。

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

| key               | 类型           | 说明                                                |
| ----------------- | -------------- | --------------------------------------------------- |
| `android_version` | string         | `ro.build.version.release`，无法获取时为 `unknown`  |
| `kernel_version`  | string         | 内核主次版本，如 `6.1`                              |
| `gki_branch`      | string         | `uname -r` 中的 `-androidNN-`，无法获取时为空字符串 |
| `loaded`          | `true`/`false` | `ksu_susfs show version` 是否成功                   |
| `reboot_required` | `true`/`false` | 重启标记文件是否存在                                |
| `running_version` | string         | `ksu_susfs show version`，移除 `v` 前缀             |
| `local_version`   | string         | 已安装的上游 tag，无法获取时为 `unknown`            |
| `ko_size`         | integer        | 本地 `.ko` 字节数，不存在时为 `0`                   |

`local_version` 来自上游 `tag_name`，可能包含 `v` 前缀；`running_version` 已移除该前缀。前端在比较两者前应统一移除 `v`。

`gki_branch` 用于选择上游资产：优先使用该字段，无法获取时回退到 `android_version` 的主版本号。

退出码始终为 `0`；单项失败会降级为 `unknown`。

### 5.5 `mod release`

下载上游 release JSON 并原样输出至 stdout。**脚本不解析 JSON**，解析工作由 WebUI 使用 `JSON.parse` 完成。

| 流     | 值                     |
| ------ | ---------------------- |
| stdout | Release JSON，原样输出 |
| exit   | `0` 成功；`6` 获取失败 |

```json
{ "assets": [], "tag_name": "<tag>" }
```

下载失败时 stderr 包含 `[ERROR] failed to fetch release info`。临时文件写入 `/data/adb/<id>/release.<pid>.json`，输出后删除。

### 5.6 `mod update <version> <url> <sha256>`

根据调用方提供的资产进行安装：下载 `.ko`、校验 sha256、写入版本文件并创建重启标记。URL 必须以 `https://` 开头，sha256 必须为 64 位十六进制字符串。

```sh
sh entry.sh mod update "<version>" "<url>" "<sha256>"
```

| 流     | 值                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| stdout | 空                                                                                                                 |
| stderr | `[..] [INFO] download [...]: <url> -> <path>`<br>`[..] [INFO] update installed: <version> (reboot to take effect)` |

| 退出码 | 含义                          |
| ------ | ----------------------------- |
| `0`    | 安装成功，**重启后生效**      |
| `1`    | 参数缺失，或 URL 不是 https   |
| `2`    | 下载失败                      |
| `3`    | sha256 格式错误，或校验不匹配 |
| `4`    | 写入失败（目录、权限、磁盘）  |

失败时，stderr 的最后一行通常以 `[ERROR]` 开头，可直接展示。

### 5.7 `mod version`

| 流     | 值                                            |
| ------ | --------------------------------------------- |
| stdout | 本地存储的版本（上游 tag，可能包含 `v` 前缀） |
| exit   | `0` 成功；`3` 本地版本文件缺失                |

### 5.8 `mod clear-reboot`

| 流     | 值                     |
| ------ | ---------------------- |
| stdout | 空                     |
| exit   | `0` 成功；`1` 删除失败 |

### 5.9 `log tail [lines]`

读取日志尾部并输出纯文本，而非 `key=value`。

```
sh entry.sh log tail 200
```

| 参数    | 默认  | 说明                                |
| ------- | ----- | ----------------------------------- |
| `lines` | `200` | 返回行数；非数字或 `0` 时回退为 200 |

- 若存在轮转文件 `module.log.1`，会先拼接其内容再截取，避免刚完成轮转时日志看似为空。
- 日志文件不存在时输出为空，退出码仍为 `0`。
- 输出固定为时间正序。WebUI 的倒序显示由前端自行反转；脚本不提供排序参数。

```
[2026-10-27 12:00:00] [INFO] download [curl]: https://... -> /data/adb/...
[2026-10-27 12:00:03] [INFO] download done: /data/adb/...
```

### 5.10 `log clear`

清空 `module.log` 并删除 `module.log.1`。退出码始终为 `0`。

### 5.11 `log level`

| 流     | 值                                            |
| ------ | --------------------------------------------- |
| stdout | 当前等级：`DEBUG` / `INFO` / `WARN` / `ERROR` |
| exit   | `0`                                           |

取值：`DEBUG` | `INFO` | `WARN` | `ERROR`。

### 5.12 `log set-level <LEVEL>`

大小写不敏感，写入 `/data/adb/<id>/config`：

```sh
sh entry.sh log set-level "<LEVEL>"
```

| 流     | 值                                     |
| ------ | -------------------------------------- |
| stdout | 规范化后的等级，如 `DEBUG`             |
| stderr | `[..] [INFO] log level set to <LEVEL>` |

| 退出码 | 含义                          |
| ------ | ----------------------------- |
| `0`    | 成功，stdout 为规范化后的等级 |
| `1`    | 参数不是合法等级              |
| `2`    | 写入配置文件失败              |

新等级在下一条命令执行时生效，当前进程不受影响。环境变量 `LOG_LEVEL` 的优先级高于配置文件。

### 5.13 `mod upstream`

读取本次调用实际生效的更新源。配置由 WebUI 存储在 `localStorage`，调用脚本时通过环境变量传入；脚本本身不读写上游配置。

```
upstream=https://api.github.com/repos/inforcqb/susfs4ksu-lkm/releases/latest
mirror=
official=https://api.github.com/repos/inforcqb/susfs4ksu-lkm/releases/latest
```

| key        | 说明                               |
| ---------- | ---------------------------------- |
| `upstream` | 本次实际生效的 Releases API 地址   |
| `mirror`   | 驱动下载加速前缀，空字符串表示直连 |
| `official` | 官方地址（默认值）                 |

### 5.14 `mod autoload`

控制开机时加载已安装驱动的方式。开关状态由
`/data/adb/post-fs-data.d/<id>.sh` 是否存在决定，不写入配置文件。

- 关闭（默认）：由 KernelSU 执行模块目录中的 `post-fs-data.sh`。
- 开启：首先将脚本复制到 `post-fs-data.d/<id>.sh`，然后将模块内的
  `post-fs-data.sh` 重命名为 `.post-fs-data.sh`，避免同一脚本执行两次。
- 关闭：删除副本，并将 `.post-fs-data.sh` 重命名回 `post-fs-data.sh`。

```sh
sh entry.sh mod autoload     # 读取状态
sh entry.sh mod autoload on  # 安装优先副本并隐藏内置脚本
sh entry.sh mod autoload off # 删除副本并恢复内置脚本
```

| 流     | 值                                                                      |
| ------ | ----------------------------------------------------------------------- |
| stdout | `enabled=true` \| `enabled=false`                                       |
| exit   | `0` 成功；`1` 参数不是 `on` / `off`；`4` 复制、重命名、chmod 或删除失败 |

卸载模块时，`uninstall.sh` 会删除该脚本，避免残留。

### 5.15 上游相关环境变量

| 变量              | 说明                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| `UPSTREAM_API`    | Releases API 地址；不是以 `https://` 开头时回退为官方地址                          |
| `UPSTREAM_MIRROR` | 驱动下载前缀（如 `https://ghfast.top/`），仅作用于 `.ko` 的 `browser_download_url` |

ghfast.top 仅代理文件下载，不代理 `api.github.com`。因此「国内加速」仅加速驱动下载，版本信息仍从官方 API 获取。

调用示例：

```sh
UPSTREAM_API='https://api.github.com/repos/inforcqb/susfs4ksu-lkm/releases/latest' \
    UPSTREAM_MIRROR='https://ghfast.top/' \
    sh entry.sh mod release
```

### 5.16 日志等级过滤

`log <level> <message>` 仅输出大于等于当前等级的日志：

| 等级    | 数值 |
| ------- | ---- |
| `DEBUG` | 0    |
| `INFO`  | 1    |
| `WARN`  | 2    |
| `ERROR` | 3    |

## 6. 错误码汇总

### download.sh

| 码  | 含义           |
| --- | -------------- |
| 1   | 缺少参数       |
| 2   | 无可用下载工具 |
| 3   | 无法创建目录   |
| 4   | 网络请求失败   |
| 5   | 下载内容为空   |
| 6   | 写入失败       |

### upstream.sh

| 码  | 含义             |
| --- | ---------------- |
| 3   | 本地文件缺失     |
| 6   | 获取上游信息失败 |

### entries/mod.sh

| 码  | 含义                  |
| --- | --------------------- |
| 1   | 参数缺失或 URL 非法   |
| 2   | 下载失败              |
| 3   | sha256 非法或校验失败 |
| 4   | 写入失败              |

### entries/status.sh

| 码  | 含义           |
| --- | -------------- |
| 1   | 依赖工具不可用 |
| 2   | 获取版本失败   |

### entries/log.sh

| 码  | 含义     |
| --- | -------- |
| 1   | 参数错误 |
| 2   | 写入失败 |

## 7. 对接注意事项

1. 状态卡使用 `status quick`，不进行网络请求，适合每次刷新时调用。
2. 更新检测通过 `mod release` 与前端 `JSON.parse` 完成：使用 `tag_name` 与 `local_version` 比较，并使用 `gki_branch` / `kernel_version` 匹配资产名称 `susfs_guard_lkm-android<branch>-<kernel>.ko`。
3. `mod update` 需要显式传入版本、URL 与 sha256。返回 0 仅表示文件安装完成，应向用户说明「重启后生效」，然后刷新状态卡并读取 `reboot_required`。
4. 日志面板使用 `log tail`，以纯文本渲染；清空后应立即重新获取。
5. 修改日志等级后，应提示用户「下次执行生效」；当前日志不会立即变化。
6. `exec()` 可能因 SELinux、权限或模块被禁用而直接失败，必须处理 `errno !== 0`。
