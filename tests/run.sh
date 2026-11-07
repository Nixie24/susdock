#!/usr/bin/env bash
#
# 模块脚本的回归测试。不需要真机：把 src/module 复制到临时目录，
# 把 /data/adb 换成临时路径，再用假 ksud / ksu_susfs 驱动分支。
#
# 运行：bash tests/run.sh

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PASS=0
FAIL=0

pass() {
    PASS=$((PASS + 1))
}

fail() {
    echo "FAIL: $*" >&2
    FAIL=$((FAIL + 1))
}

assert_eq() {
    if [ "$1" = "$2" ]; then
        pass
    else
        fail "$3 (expected '$2', got '$1')"
    fi
}

assert_contains() {
    case "$1" in
        *"$2"*) pass ;;
        *) fail "$3 (missing '$2' in output)" ;;
    esac
}

assert_exists() {
    if [ -e "$1" ]; then pass; else fail "$2 (missing $1)"; fi
}

assert_missing() {
    if [ ! -e "$1" ]; then pass; else fail "$2 (unexpected $1)"; fi
}

# 每个用例一个临时目录，互不干扰
setup() {
    T=$(mktemp -d)
    cp -r "$ROOT/src/module" "$T/module"
    find "$T/module" -name '*.sh' -exec sed -i "s#/data/adb/#$T/data/#g" {} +
    mkdir -p "$T/bin" "$T/data/module/mod"
    # ksud 负责加载；ksu_susfs 默认失败，表示当前内核还没有 SuSFS
    printf '#!/bin/sh\nexit 0\n' > "$T/bin/ksud"
    printf '#!/bin/sh\nexit 1\n' > "$T/bin/ksu_susfs"
    chmod +x "$T/bin/ksud" "$T/bin/ksu_susfs"
}

teardown() {
    rm -rf "$T"
}

# 在临时模块目录里调用 entry 函数。脚本先落盘再执行，
# 避免函数体里的 $1/$2 被外层 shell 提前展开。
mod_call() {
    {
        printf 'MODDIR=%s\n' "'$T/module'"
        # shellcheck disable=SC2016 # 写入子脚本，$MODDIR 需要保持字面
        printf '. "$MODDIR/lib/common.sh"\n'
        # shellcheck disable=SC2016
        printf '. "$MODDIR/entries/mod.sh"\n'
        printf '%s\n' "$1"
    } > "$T/call.sh"

    bash "$T/call.sh" 2> "$T/stderr.log"
}

test_autoload_toggle() {
    setup

    assert_eq "$(mod_call 'mod_autoload')" "enabled=false" "初始状态应为关闭"
    assert_exists "$T/module/post-fs-data.sh" "默认应有模块自带的脚本"

    assert_eq "$(mod_call 'mod_autoload on')" "enabled=true" "开启后状态应为开"
    assert_exists "$T/data/post-fs-data.d/module.sh" "开启后应写入优先副本"
    assert_missing "$T/module/post-fs-data.sh" "开启后应隐藏模块自带的脚本"
    assert_exists "$T/module/.post-fs-data.sh" "开启后应保留隐藏文件"

    assert_eq "$(mod_call 'mod_autoload')" "enabled=true" "开启后读取状态"
    assert_eq "$(mod_call 'mod_autoload off')" "enabled=false" "关闭后状态应为关"
    assert_missing "$T/data/post-fs-data.d/module.sh" "关闭后应删除优先副本"
    assert_exists "$T/module/post-fs-data.sh" "关闭后应恢复模块脚本"
    assert_missing "$T/module/.post-fs-data.sh" "关闭后不应保留隐藏文件"

    mod_call 'mod_autoload maybe' > /dev/null
    assert_eq "$?" "1" "非法参数应返回 1"

    teardown
}

test_boot_script_paths() {
    setup
    : > "$T/data/module/mod/susfs_guard_lkm.ko"
    : > "$T/data/module/mod/reboot"

    mod_call 'mod_autoload on' > /dev/null

    # 从 post-fs-data.d 执行，路径应回推到模块数据目录
    out=$(PATH="$T/bin:$PATH" bash "$T/data/post-fs-data.d/module.sh" 2>&1)
    assert_contains "$out" "susfs: loaded" "应执行 insmod"
    assert_missing "$T/data/module/mod/reboot" "加载成功后应清除重启标记"
    assert_exists "$T/data/module/logs/module.log" "日志应写入模块数据目录"

    # 已加载时跳过，并保留重启标记
    : > "$T/data/module/mod/reboot"
    printf '#!/bin/sh\necho v1.0\n' > "$T/bin/ksu_susfs"
    chmod +x "$T/bin/ksu_susfs"
    out=$(PATH="$T/bin:$PATH" bash "$T/data/post-fs-data.d/module.sh" 2>&1)
    assert_contains "$out" "already loaded" "已加载时应跳过"
    assert_exists "$T/data/module/mod/reboot" "跳过时不应清除重启标记"

    # ksud insmod 失败时返回 1，保留标记
    printf '#!/bin/sh\nexit 1\n' > "$T/bin/ksu_susfs"
    printf '#!/bin/sh\nexit 1\n' > "$T/bin/ksud"
    chmod +x "$T/bin/ksu_susfs" "$T/bin/ksud"
    PATH="$T/bin:$PATH" bash "$T/data/post-fs-data.d/module.sh" > /dev/null 2>&1
    assert_eq "$?" "1" "ksud insmod 失败应返回 1"
    assert_exists "$T/data/module/mod/reboot" "失败时不应清除重启标记"

    teardown
}

test_status_installed_uses_ksu_susfs() {
    setup
    mkdir -p "$T/data/ksu/bin"
    printf '#!/bin/sh\necho v1.0\n' > "$T/data/ksu/bin/ksu_susfs"
    chmod +x "$T/data/ksu/bin/ksu_susfs"

    out=$(mod_call "
        . \"\$MODDIR/entries/status.sh\"
        status_installed
        echo rc=\$?
    ")
    assert_contains "$out" "true" "ksu_susfs 可用时应显示已加载"
    assert_contains "$out" "rc=0" "已加载应返回 0"

    # ksu_susfs 不可用时回到 false
    printf '#!/bin/sh\nexit 1\n' > "$T/data/ksu/bin/ksu_susfs"
    out=$(mod_call "
        . \"\$MODDIR/entries/status.sh\"
        status_installed
        echo rc=\$?
    ")
    assert_contains "$out" "false" "ksu_susfs 不可用时应显示未加载"

    teardown
}

test_boot_script_requires_ksud() {
    setup
    : > "$T/data/module/mod/susfs_guard_lkm.ko"
    rm -f "$T/bin/ksud"

    out=$(PATH="$T/bin:/usr/bin:/bin" bash "$T/module/post-fs-data.sh" 2>&1)
    rc=$?
    assert_contains "$out" "ksud not found" "缺少 ksud 时应提示"
    assert_eq "$rc" "1" "缺少 ksud 应返回 1"

    teardown
}

test_boot_script_custom_ko_name() {
    setup
    : > "$T/data/module/mod/susfs_guard_lkm-android15-6.6.ko"

    out=$(PATH="$T/bin:$PATH" bash "$T/module/post-fs-data.sh" 2>&1)
    assert_contains "$out" "susfs: loaded" "任意名字的 .ko 也应加载"
    assert_contains "$out" "susfs_guard_lkm-android15-6.6.ko" "日志应带上实际文件名"

    teardown
}

test_boot_script_respects_disable() {
    setup
    : > "$T/data/module/mod/susfs_guard_lkm.ko"
    : > "$T/module/disable"

    out=$(PATH="$T/bin:$PATH" bash "$T/module/post-fs-data.sh" 2>&1)
    rc=$?
    assert_contains "$out" "module is disabled" "模块禁用时应跳过"
    assert_eq "$rc" "0" "禁用时退出码应为 0"

    teardown
}

test_release_json() {
    setup
    printf '{"tag_name":"v1.5.3","assets":[]}' > "$T/fake.json"

    out=$(mod_call "
        download() { cp '$T/fake.json' \"\$2\"; }
        release_json
    ")
    assert_contains "$out" '"tag_name":"v1.5.3"' "release_json 应原样输出 JSON"
    assert_eq "$(find "$T/data/module" -type f -name "release.*.json" 2> /dev/null | wc -l | tr -d ' ')" "0" "临时文件应删除"

    teardown
}

test_release_json_scratch_collision() {
    setup
    printf '{"tag_name":"v1.5.3","assets":[]}' > "$T/fake.json"

    # download() 会用 _tmp 做自己的临时文件，这里模拟同样的行为
    out=$(mod_call "
        download() {
            _tmp=\"\$2.tmp.\$\$\"
            cp '$T/fake.json' \"\$_tmp\"
            mv \"\$_tmp\" \"\$2\"
        }
        release_json
    ")
    assert_contains "$out" '"tag_name":"v1.5.3"' "download 的临时变量不应影响输出"

    teardown
}

test_release_failure() {
    setup

    out=$(mod_call "
        download() { return 4; }
        release_json
        echo rc=\$?
    ")
    assert_contains "$out" "rc=6" "下载失败应返回 6"

    teardown
}

test_update_requires_args() {
    setup

    out=$(mod_call "mod_update; echo rc=\$?")
    assert_contains "$out" "rc=1" "缺少参数应返回 1"

    teardown
}

test_update_rejects_bad_sha() {
    setup

    out=$(mod_call "mod_update v1 'https://example.invalid/x.ko' 'not-a-sha'; echo rc=\$?")
    assert_contains "$out" "rc=3" "非法 sha256 应返回 3"

    teardown
}

test_update_refreshes_boot_script() {
    setup
    printf 'payload\n' > "$T/payload.ko"
    SHA=$(sha256sum "$T/payload.ko" | awk '{print $1}')
    mkdir -p "$T/data/post-fs-data.d"
    printf 'OLD\n' > "$T/data/post-fs-data.d/module.sh"

    mod_call "
        download() { cp '$T/payload.ko' \"\$2\"; }
        mod_update v9.9.9 'https://example.invalid/x.ko' '$SHA'
    " > /dev/null

    assert_contains "$(head -1 "$T/data/post-fs-data.d/module.sh")" "#!/system/bin/sh" "更新后应刷新副本"

    # 开关关闭时不创建副本
    rm -f "$T/data/post-fs-data.d/module.sh"
    mod_call "
        download() { cp '$T/payload.ko' \"\$2\"; }
        mod_update v9.9.9 'https://example.invalid/x.ko' '$SHA'
    " > /dev/null
    assert_missing "$T/data/post-fs-data.d/module.sh" "开关关闭时不应创建副本"

    teardown
}

test_customize_refresh() {
    setup
    mkdir -p "$T/data/post-fs-data.d"
    # 安装时 module.prop 已由构建脚本渲染，这里补一份
    printf 'id=susdock\n' > "$T/module/module.prop"

    # 开关未开启：不创建
    MODPATH="$T/module" bash "$T/module/customize.sh" > /dev/null 2>&1
    assert_missing "$T/data/post-fs-data.d/susdock.sh" "未开启时不应创建"

    # 开关已开启：覆盖旧副本，并隐藏模块自带的脚本
    printf 'OLD\n' > "$T/data/post-fs-data.d/susdock.sh"
    MODPATH="$T/module" bash "$T/module/customize.sh" > /dev/null 2>&1
    assert_contains "$(head -1 "$T/data/post-fs-data.d/susdock.sh")" "#!/system/bin/sh" "安装后应覆盖副本"
    assert_missing "$T/module/post-fs-data.sh" "开启时应隐藏模块脚本"
    assert_exists "$T/module/.post-fs-data.sh" "开启时应保留隐藏文件"

    teardown
}

test_uninstall_cleanup() {
    setup
    mkdir -p "$T/data/post-fs-data.d" "$T/data/module/mod" "$T/data/module/logs"
    : > "$T/data/post-fs-data.d/module.sh"
    : > "$T/data/module/mod/susfs_guard_lkm.ko"
    : > "$T/data/module/mod/version"
    : > "$T/data/module/logs/module.log"

    bash "$T/module/uninstall.sh" > /dev/null 2>&1
    assert_missing "$T/data/post-fs-data.d/module.sh" "卸载应删除开机脚本"
    assert_missing "$T/data/module/mod/susfs_guard_lkm.ko" "卸载应删除驱动"
    assert_exists "$T/data/module/logs/module.log" "卸载应保留日志"
    assert_exists "$T/data/module/mod/version" "卸载应保留版本记录"

    teardown
}

for test in \
    test_autoload_toggle \
    test_boot_script_paths \
    test_status_installed_uses_ksu_susfs \
    test_boot_script_requires_ksud \
    test_boot_script_custom_ko_name \
    test_boot_script_respects_disable \
    test_release_json \
    test_release_json_scratch_collision \
    test_release_failure \
    test_update_requires_args \
    test_update_rejects_bad_sha \
    test_update_refreshes_boot_script \
    test_customize_refresh \
    test_uninstall_cleanup; do
    "$test"
done

echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
