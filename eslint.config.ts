import type { ESLint, Rule } from "eslint";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import antfu, { parserPlain } from "@antfu/eslint-config";

/*
 * 直接调用 shellcheck npm 包下载好的原生二进制。
 * node_modules/.bin/shellcheck 只是转发脚本，自身还要在 PATH 里找 node；
 * 编辑器里的 ESLint 进程（如 VS Code 插件）未必有 node 在 PATH 中。
 */
const projectDir = fileURLToPath(new URL(".", import.meta.url));
const moduleDir = fileURLToPath(new URL("src/module/", import.meta.url));
const shellcheckBin = fileURLToPath(new URL(
    `node_modules/shellcheck/bin/shellcheck${process.platform === "win32" ? ".exe" : ""}`,
    import.meta.url,
));

/*
 * shellcheck 规则选项，与 CLI 参数一一对应：
 *
 *   checkSourced      -a, --check-sourced
 *   enable            -o, --enable
 *   exclude           -e, --exclude
 *   include           -i, --include
 *   severity          -S, --severity
 *   shell             -s, --shell
 *   sourcePath        -P, --source-path（可重复）
 *   externalSources   -x, --external-sources
 *   rcFile            --rcfile
 *   noRc              --norc
 *   extendedAnalysis  --extended-analysis
 *
 * 未暴露：--format（固定 json1）、--color（无终端）、--version / --help /
 * --list-optional（非检查行为）、--wiki-link-count（仅影响文本输出）。
 */
interface ShellcheckOptions {
    /* 规则自身选项：shellcheck 的工作目录，相对路径以项目根为基准 */
    cwd?: string;
    checkSourced?: boolean;
    enable?: Array<number | string> | "all";
    exclude?: Array<number | string>;
    include?: Array<number | string>;
    severity?: "error" | "warning" | "info" | "style";
    shell?: "sh" | "bash" | "dash" | "ksh" | "busybox";
    sourcePath?: string[];
    externalSources?: boolean;
    rcFile?: string;
    noRc?: boolean;
    extendedAnalysis?: boolean;
}

function buildShellcheckArgs(options: ShellcheckOptions): string[] {
    const args = ["--format=json1"];

    if (options.checkSourced)
        args.push("--check-sourced");

    if (options.enable !== undefined)
        args.push(`--enable=${Array.isArray(options.enable) ? options.enable.join(",") : options.enable}`);

    if (options.exclude !== undefined && options.exclude.length > 0)
        args.push(`--exclude=${options.exclude.join(",")}`);

    if (options.include !== undefined && options.include.length > 0)
        args.push(`--include=${options.include.join(",")}`);

    if (options.severity)
        args.push(`--severity=${options.severity}`);

    if (options.shell)
        args.push(`--shell=${options.shell}`);

    for (const path of options.sourcePath ?? [])
        args.push(`--source-path=${path}`);

    if (options.externalSources)
        args.push("--external-sources");

    if (options.rcFile !== undefined)
        args.push(`--rcfile=${options.rcFile}`);

    if (options.noRc)
        args.push("--norc");

    if (options.extendedAnalysis !== undefined)
        args.push(`--extended-analysis=${options.extendedAnalysis}`);

    /* 从 stdin 读取，确保检查的是 ESLint 当前内存中的文本（--fix 时不是磁盘内容） */
    args.push("-");

    return args;
}

interface ShellcheckReplacement {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    replacement: string;
}

/*
 * shellcheck 的行列号从 1 开始，ESLint 的 fixer 需要绝对偏移量。
 * 任意两段修改区间重叠时放弃整条修复，避免只应用一半生成坏代码。
 */
function toFixes(
    fixer: Rule.RuleFixer,
    replacements: ShellcheckReplacement[],
    offsetAt: (line: number, column: number) => number,
) {
    const ranges = replacements
        .map(replacement => ({
            range: [
                offsetAt(replacement.line, replacement.column),
                offsetAt(replacement.endLine, replacement.endColumn),
            ] as [number, number],
            text: replacement.replacement,
        }))
        .sort((a, b) => a.range[0] - b.range[0]);

    for (let index = 1; index < ranges.length; index++) {
        if (ranges[index].range[0] < ranges[index - 1].range[1])
            return null;
    }

    return ranges.map(item => fixer.replaceTextRange(item.range, item.text));
}

const shellcheckPlugin = {
    rules: {
        shellcheck: {
            meta: {
                type: "problem",
                fixable: "code",
                docs: {
                    description: "Run shellcheck on shell scripts under src/module",
                },
                schema: [{
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        cwd: {
                            type: "string",
                            description: "Working directory for shellcheck, relative to the project root (default: src/module)",
                        },
                        checkSourced: {
                            type: "boolean",
                            description: "Include warnings from sourced files (-a)",
                        },
                        enable: {
                            description: "Optional checks to enable, or \"all\" (-o)",
                            oneOf: [
                                { type: "array", items: { type: ["string", "number"] } },
                                { type: "string", enum: ["all"] },
                            ],
                        },
                        exclude: {
                            type: "array",
                            items: { type: ["string", "number"] },
                            description: "Warning codes to exclude (-e)",
                        },
                        include: {
                            type: "array",
                            items: { type: ["string", "number"] },
                            description: "Only consider these warning codes (-i)",
                        },
                        severity: {
                            type: "string",
                            enum: ["error", "warning", "info", "style"],
                            description: "Minimum severity to report (-S)",
                        },
                        shell: {
                            type: "string",
                            enum: ["sh", "bash", "dash", "ksh", "busybox"],
                            description: "Script dialect (-s)",
                        },
                        sourcePath: {
                            type: "array",
                            items: { type: "string" },
                            description: "Paths used to resolve source directives (-P)",
                        },
                        externalSources: {
                            type: "boolean",
                            description: "Allow following source outside FILES (-x)",
                        },
                        rcFile: {
                            type: "string",
                            description: "Use this configuration file instead of .shellcheckrc",
                        },
                        noRc: {
                            type: "boolean",
                            description: "Do not look for .shellcheckrc files",
                        },
                        extendedAnalysis: {
                            type: "boolean",
                            description: "Enable dataflow analysis (default true)",
                        },
                    },
                }],
            },

            create(context: Rule.RuleContext) {
                const options = (context.options[0] ?? {}) as ShellcheckOptions;
                const cwd = options.cwd === undefined ? moduleDir : resolve(projectDir, options.cwd);
                const text = context.sourceCode.text;
                let output = "{\"comments\":[]}";

                try {
                    output = execFileSync(shellcheckBin, buildShellcheckArgs(options), {
                        cwd,
                        input: text,
                        encoding: "utf8",
                    });
                }
                catch (error) {
                    /*
                     * shellcheck 发现问题时退出码为 1，stdout 仍是完整 JSON；
                     * 其余错误继续抛出，避免静默跳过检查。
                     */
                    const { status, stdout, code } = error as {
                        status?: number;
                        stdout?: string;
                        code?: string;
                    };

                    if (code === "ENOENT") {
                        throw new Error(
                            `[shellcheck] 无法执行 ${shellcheckBin}（cwd: ${cwd}）。`
                            + " 请确认二进制已下载且目录存在，必要时先运行一次 `pnpm exec shellcheck --version`。",
                        );
                    }

                    if (status !== 1 || typeof stdout !== "string") {
                        throw error;
                    }

                    output = stdout;
                }

                const { comments } = JSON.parse(output) as {
                    comments: Array<{
                        file: string;
                        code: number;
                        level: string;
                        message: string;
                        line: number;
                        column: number;
                        endLine: number;
                        endColumn: number;
                        fix?: {
                            replacements: ShellcheckReplacement[];
                        } | null;
                    }>;
                };

                /* 预先算好每行起始偏移，供 shellcheck 的 1-based 行列号换算使用 */
                const lineStarts = [0];

                for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1))
                    lineStarts.push(index + 1);

                function offsetAt(line: number, column: number): number {
                    return Math.min(text.length, (lineStarts[line - 1] ?? text.length) + column - 1);
                }

                /*
                 * shellcheck 在跟随 source / 启用扩展分析时，可能对同一位置重复输出
                 * 相同的检查码，这里按“检查码 + 位置”去重；
                 * 同时忽略被 source 文件的诊断（file 不是 "-"）——那些行号属于别的
                 * 文件，由该文件自己的 ESLint 检查负责报告。
                 */
                const seen = new Set<string>();

                for (const comment of comments) {
                    /* stdin 模式下当前文件的诊断 file 为 "-"，其余来自被 source 的文件 */
                    if (comment.file !== "-")
                        continue;

                    const key = [comment.code, comment.line, comment.column, comment.endLine, comment.endColumn].join(":");

                    if (seen.has(key))
                        continue;

                    seen.add(key);

                    const fix = comment.fix;

                    context.report({
                        /*
                         * shellcheck 的行列号从 1 开始，而 ESLint 的 loc 列号从 0 开始。
                         */
                        loc: {
                            start: { line: comment.line, column: comment.column - 1 },
                            end: { line: comment.endLine, column: comment.endColumn - 1 },
                        },
                        message: `SC${comment.code}: ${comment.message} (${comment.level})`,
                        fix: fix ? fixer => toFixes(fixer, fix.replacements, offsetAt) : undefined,
                    });
                }

                return {};
            },
        } satisfies Rule.RuleModule,
    },
} satisfies ESLint.Plugin;

/**
 * Eslint Configuration
 */
export default antfu({
    formatters: {
        css: "prettier",
        markdown: "prettier",
        prettierOptions: {
            plugins: ["prettier-plugin-css-order"],
        },
    },

    stylistic: {
        /*
         * 基础风格：
         *
         * - 4 空格
         * - 双引号
         * - 保留分号
         * - else/catch 独立换行
         */
        indent: 4,
        quotes: "double",
        semi: true,
        braceStyle: "stroustrup",

        overrides: {
            /* ---------- 引号 / 分号 / 括号 ---------- */

            "style/quote-props": ["warn", "as-needed"],
            "style/jsx-quotes": ["warn", "prefer-double"],
            "style/template-curly-spacing": ["warn", "never"],

            "style/object-curly-spacing": ["warn", "always"],
            "style/array-bracket-spacing": ["warn", "never"],
            "style/computed-property-spacing": ["warn", "never"],

            /* ---------- 逗号 ---------- */

            "style/comma-spacing": ["warn", {
                before: false,
                after: true,
            }],

            "style/comma-dangle": ["warn", {
                arrays: "always-multiline",
                objects: "always-multiline",
                imports: "always-multiline",
                exports: "always-multiline",
                functions: "always-multiline",
                generics: "always-multiline",
                tuples: "always-multiline",
                enums: "always-multiline",
            }],

            /* ---------- 分号相关 ---------- */

            "style/member-delimiter-style": ["warn", {
                multiline: {
                    delimiter: "semi",
                    requireLast: true,
                },
                singleline: {
                    delimiter: "semi",
                    requireLast: false,
                },
                multilineDetection: "brackets",
            }],

            /* ---------- 换行 ---------- */

            "style/function-paren-newline": ["warn", "consistent"],
            "style/object-curly-newline": ["warn", {
                ObjectExpression: {
                    multiline: true,
                    consistent: true,
                },
                ObjectPattern: {
                    multiline: true,
                    consistent: true,
                },
                ImportDeclaration: {
                    multiline: true,
                    consistent: true,
                },
                ExportDeclaration: {
                    multiline: true,
                    consistent: true,
                },
            }],
            "style/object-property-newline": ["warn", {
                allowAllPropertiesOnSameLine: true,
            }],
            "style/array-bracket-newline": ["warn", "consistent"],
            "style/array-element-newline": ["warn", "consistent"],
            "style/implicit-arrow-linebreak": ["warn", "beside"],
            "style/nonblock-statement-body-position": ["warn", "below"],
            "style/operator-linebreak": ["warn", "before", {
                overrides: {
                    "=": "after",
                },
            }],
            "style/multiline-ternary": ["warn", "always-multiline"],

            /* ---------- 点位置 / 箭头 ---------- */

            "style/dot-location": ["warn", "property"],
            "style/arrow-parens": ["warn", "as-needed"],
            "style/space-before-function-paren": ["warn", {
                anonymous: "never",
                named: "never",
                asyncArrow: "always",
            }],

            /* ---------- 空行 / 尾随空格 ---------- */

            "style/no-multiple-empty-lines": ["warn", {
                max: 1,
                maxBOF: 0,
                maxEOF: 0,
            }],
            "style/no-trailing-spaces": "warn",
            "style/eol-last": ["warn", "always"],

            /* ---------- 冗余 / 混用 ---------- */

            // "style/no-mixed-operators": "warn",
            "style/no-extra-parens": "warn",
        },
    },

    typescript: {
        tsconfigPath: "tsconfig.json",
        overrides: {
            /* ---------- 类型定义 ---------- */

            "ts/consistent-type-definitions": ["warn", "interface"],
            "ts/consistent-type-imports": ["warn", {
                prefer: "type-imports",
                fixStyle: "separate-type-imports",
                disallowTypeAnnotations: false,
            }],
            "ts/consistent-type-assertions": ["warn", {
                assertionStyle: "as",
            }],

            /* ---------- 类型排序 ---------- */

            "perfectionist/sort-interfaces": "off",
            "perfectionist/sort-object-types": "off",
            "perfectionist/sort-union-types": "off",
            "perfectionist/sort-intersection-types": "off",
            "perfectionist/sort-classes": "off",
            "perfectionist/sort-objects": "off",
            "perfectionist/sort-enums": ["warn", {
                type: "alphabetical",
            }],

            /* ---------- 命名约定 ---------- */

            "ts/naming-convention": ["warn", {
                selector: "default",
                format: ["camelCase", "PascalCase"],
                leadingUnderscore: "allow",
            }, {
                selector: "property",
                format: null,
            }, {
                selector: "method",
                format: null,
            }, {
                selector: "variable",
                format: ["camelCase", "PascalCase", "UPPER_CASE"],
                leadingUnderscore: "allow",
            }, {
                selector: "function",
                format: ["camelCase", "PascalCase"],
            }, {
                selector: "typeLike",
                format: ["PascalCase"],
            }, {
                selector: "typeParameter",
                format: ["PascalCase"],
            }, {
                selector: "enumMember",
                format: ["camelCase", "PascalCase"],
            }],

            /* ---------- Promise / Async ---------- */

            "ts/no-redeclare": "warn",
        },

        /*
         * 类型感知规则必须写在这里。写在 overrides 里时，
         * 它们会落到没有 ignores 保护的规则块上，
         * markdown 代码块（虚拟 .ts 文件）没有类型信息，直接崩溃。
         */
        overridesTypeAware: {
            "ts/no-unnecessary-type-assertion": "warn",
            "ts/non-nullable-type-assertion-style": "warn",
            "ts/no-floating-promises": "warn",
            "ts/no-misused-promises": "warn",
            "ts/promise-function-async": "off",
            "ts/switch-exhaustiveness-check": "off",
        },
    },

    jsonc: {
        overrides: {
            "jsonc/indent": ["warn", 4],
            "jsonc/quotes": ["warn", "double"],
            "jsonc/comma-style": ["warn", "last"],
            "jsonc/no-comments": "warn",
            "jsonc/sort-keys": "warn",
        },
    },

    yaml: {
        overrides: {
            "yaml/indent": ["warn", 2],
            "yaml/quotes": ["warn", { prefer: "double" }],
        },
    },

    toml: {
        overrides: {
            "toml/indent": ["warn", 2],
            "toml/quoted-keys": ["warn", { prefer: "as-needed" }],
        },
    },

    test: true,

    jsdoc: true,

    imports: {
        overrides: {
            "import/no-duplicates": "off",
            "import/consistent-type-specifier-style": "off",
            "import/newline-after-import": "warn",
            "import/first": "warn",
            "perfectionist/sort-imports": "warn",
            "perfectionist/sort-named-exports": "warn",
        },
    },
}, {
    files: ["**/*.{js,jsx,ts,tsx,cjs,mjs,cts,mts,vue}"],

    rules: {
        /* ---------- antfu 自定义规则 ---------- */

        /*
         * 与 object-property-newline 冲突，关闭以保证稳定。
         */
        "antfu/consistent-list-newline": "off",

        /*
         * 链式调用换行一致性。
         */
        "antfu/consistent-chaining": "warn",

        /*
         * if 后必须换行。
         */
        "antfu/if-newline": "warn",

        /*
         * 顶层函数优先 function 声明。
         */
        "antfu/top-level-function": "warn",

        /* ---------- 函数 / 对象 ---------- */

        "prefer-arrow-callback": "warn",
        "arrow-body-style": ["warn", "as-needed"],
        "object-shorthand": "warn",
        "func-style": "off",

        /* ---------- 变量声明 ---------- */

        "one-var": ["warn", "never"],
        "one-var-declaration-per-line": ["warn", "always"],
        "prefer-const": "warn",
        "no-var": "warn",

        /* ---------- 命名 ---------- */

        camelcase: "warn",
        "new-cap": "warn",
        "no-underscore-dangle": "off",
        "no-shadow": "warn",

        /* ---------- 无用 / 重复 ---------- */

        "no-unused-vars": ["warn", {
            varsIgnorePattern: "^_",
            argsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
        }],
        "unused-imports/no-unused-imports": "warn",
        "no-redeclare": "warn",
        "no-dupe-args": "warn",
        "no-dupe-class-members": "warn",
        "no-dupe-else-if": "warn",
        "no-dupe-keys": "warn",
        "no-duplicate-case": "warn",
        "no-duplicate-imports": ["warn", { allowSeparateTypeImports: true }],

        /* ---------- 三元 / 布尔 ---------- */

        "no-nested-ternary": "warn",

        /* ---------- Catch ---------- */

        "unicorn/prefer-optional-catch-binding": "warn",

        /* ---------- String ---------- */

        "prefer-template": "warn",
        "unicorn/prefer-string-raw": "warn",
        "unicorn/prefer-string-replace-all": "warn",
        "unicorn/prefer-string-slice": "warn",

        /* ---------- Array ---------- */

        "unicorn/prefer-includes": "warn",
        "unicorn/no-array-reduce": "warn",
        "unicorn/no-array-push-push": "warn",
        "unicorn/no-array-reverse": "warn",
        "unicorn/prefer-array-find": "warn",
        "unicorn/prefer-array-flat": "warn",
        "unicorn/prefer-array-flat-map": "warn",
        "unicorn/prefer-array-index-of": "warn",
        "unicorn/prefer-array-some": "warn",
        "unicorn/prefer-set-has": "warn",

        /* ---------- Loop ---------- */

        "unicorn/no-for-loop": "warn",

        /* ---------- Promise / Async ---------- */

        "no-async-promise-executor": "warn",
        "no-promise-executor-return": "warn",
        "prefer-promise-reject-errors": "warn",
        "require-await": "warn",
        "unicorn/no-unnecessary-await": "warn",

        /* ---------- Error ---------- */

        "no-throw-literal": "warn",
        "unicorn/throw-new-error": "warn",

        /* ---------- RegExp ---------- */

        "regexp/no-useless-flag": "warn",
        "regexp/no-useless-quantifier": "warn",
        "regexp/prefer-character-class": "warn",
        "regexp/prefer-d": "warn",
        "regexp/prefer-plus-quantifier": "warn",
        "regexp/prefer-question-quantifier": "warn",
        "regexp/prefer-regexp-exec": "warn",
        "regexp/prefer-regexp-test": "warn",
        "regexp/prefer-w": "warn",
        "regexp/require-unicode-regexp": "off",

        /* ---------- Unicode ---------- */

        "no-irregular-whitespace": "warn",
        "no-misleading-character-class": "warn",
        "no-control-regex": "warn",

        /* ---------- Comments ---------- */

        "eslint-comments/disable-enable-pair": "warn",
        "eslint-comments/no-unlimited-disable": "warn",
        "eslint-comments/no-unused-disable": "warn",
        "no-warning-comments": "warn",

        /* ---------- Unicorn 其余 ---------- */

        "unicorn/consistent-destructuring": "warn",
        "unicorn/consistent-function-scoping": "warn",
        "unicorn/explicit-length-check": "warn",
        "unicorn/no-lonely-if": "warn",
        "unicorn/no-useless-undefined": "warn",
        "unicorn/no-negated-condition": "warn",
        "unicorn/prefer-default-parameters": "warn",
        "unicorn/prefer-logical-operator-over-ternary": "warn",
        "unicorn/prefer-number-properties": "warn",
        "unicorn/prefer-structured-clone": "warn",
    },
}, {
    /**
     * shfmt 格式化规则
     */
    files: ["**/*.sh"],
    languageOptions: {
        parser: parserPlain,
    },
    rules: {
        "format/prettier": ["warn", {
            parser: "sh",
            plugins: ["prettier-plugin-sh"],
            variant: 1,
            keepComments: true,
            keepPadding: false,
            simplify: false,
            binaryNextLine: true,
            switchCaseIndent: true,
            spaceRedirects: true,
            indent: 4,
            minify: false,
            singleLine: false,
            functionNextLine: false,
        }],
    },
}, {
    /*
     * shellcheck 语义检查
     */
    files: ["**/*.sh"],
    plugins: {
        shellcheck: shellcheckPlugin,
    },
    rules: {
        /*
         * 可用选项见上方 ShellcheckOptions：
         * cwd / checkSourced / enable / exclude / include / severity / shell /
         * sourcePath / externalSources / rcFile / noRc / extendedAnalysis。
         *
         * cwd 相对项目根目录；示例：
         * ["warn", { severity: "warning", exclude: [2086] }]
         */
        "shellcheck/shellcheck": ["warn", {
            cwd: "src/module",
            externalSources: true,
            checkSourced: true,
            exclude: ["SC2034"],
            shell: "bash",
        }],
    },
}, {
    /*
     * .d.ts 里每个 declare module 块都需要各自 import 一次，属误报。
     */
    files: ["**/*.d.ts"],
    rules: {
        "no-duplicate-imports": "off",
    },
}, {
    /*
     * VS Code 的设置项有自己的分组惯例，不对它强制字母序。
     */
    ignores: [".vscode/**"],
});
