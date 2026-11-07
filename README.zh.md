<img src="assets/favicon.svg" alt="SusDock logo" width="96" height="96">

# SusDock

面向 KernelSU 的 SuSFS LKM 管理器，根据设备信息从上游获取匹配的预编译 `.ko`。

[English](README.md) | **简体中文**

## 上游

发布版本与预编译驱动来自 [inforcqb/susfs4ksu-for-lkm](https://github.com/inforcqb/susfs4ksu-for-lkm)，x86_64 兼容版本来自 [ymuuuu/susfs4ksu-lkm-x64](https://github.com/ymuuuu/susfs4ksu-lkm-x64)。感谢相关维护者持续提供构建产物——SusDock **仅**负责下载与安装。同时感谢 [SuSFS](https://github.com/simonpunk/susfs4ksu) 与 [KernelSU](https://github.com/tiann/KernelSU) 项目。

## 使用

1. 在 KernelSU 中安装模块 zip 并重启。
2. 从模块卡片打开 WebUI。
3. 检查并安装更新，重启后生效。

WebUI 提供状态、更新、日志、日志等级与更新源管理。

运行要求：KernelSU、arm64、Android 12 及以上。仅检查更新与下载需要网络连接。

## 工作原理

SusDock 由 shell 后端与 WebUI 前端组成。

- **后端**（`src/module/`）读取设备信息（Android 版本、内核版本、GKI 分支），获取上游 release JSON，选择并下载匹配的 `.ko`，校验 sha256，记录已安装版本与重启标记，并管理开机加载与日志。
- **前端**（`src/webui/`）使用纯 TypeScript 与 Vite 构建，运行于 KernelSU 的 WebView 中，通过 `kernelsu.exec()` 调用后端，自身不直接访问网络。

命令、输出格式与退出码见 [docs/backend-api.zh.md](docs/backend-api.zh.md)。

## 协议

GPL-2.0，见 [LICENSE](LICENSE)。
