# Magic

**单文件组件 · 编译即运行**

[![npm](https://img.shields.io/npm/v/@love-sqjm/magic?color=%2331A9FF)](https://www.npmjs.com/package/@love-sqjm/magic)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![output](https://img.shields.io/badge/output-zero--browser--deps-31A9FF)](#)

---

**Magic** (@love-sqjm/magic) 是一个基于 [Bun](https://bun.sh) 的 Web 应用**构建工具**. 它将 `.m` 单文件组件 (SFC) 编译为原生 HTML/JS/CSS, 提供编译时宏, 树摇, CSS 处理, 增量缓存与内置的开发服务器.

> **注意**: Magic 不是框架, 是一个构建工具. `.m` 文件是专有的组件格式, 编译后输出为标准 Web 产物

> 📖 English: [README_EN.md](./README_EN.md) · 📖 完整文档: [doc/](./doc/) 目录 (12 篇技术文档 × 中英双语)

---

## ✨ 核心特性

**🧩 `.m` 单文件组件**

- 一个文件 = `<template>` + 多个 `<script>` (8 种 code 类型) + `<css>` (支持 scope / default-theme)
- 编译时作用域隔离, 杜绝样式污染
- `<slot>` (含 `must` 强制校验) 与 `<extend>` 组件继承

**⚡ 增量编译 (CAS + DAG)**

- SQLite 缓存 (`bun:sqlite`), `.m` 文件按内容哈希, 其他文件按 mtime+size
- 依赖追踪: 引用文件变化自动触发导入方重编
- Windows 上使用 Rust 二进制 `usn-scan` (5ms/766 文件) 加速扫描
- Tree-shaking (`remove-unused`)

**🎨 CSS 处理链**

1. shorthand-expand → 2. scope 改写 → 3. keyframes 重命名 → 4. default-theme 变量提取 → 5. autoprefixer → 6. lightningcss

**🛣️ 内置开发服务器**

- HTTP + WebSocket, `magic build` 完成后通过 `GET /__magic/reload` 端点主动推送浏览器刷新

---

## 🚀 快速上手

```bash
bun install -g @love-sqjm/magic    # 全局安装 CLI
magic init my-app                   # 创建项目
cd my-app && magic run             # 启动开发服务器
magic build                        # 构建到 build-debug/ 目录
```

编写 `app/index.m`:

```xml
<template>
    <div #id="app">
        <h1 #id="title">Hello Magic!</h1>
    </div>
</template>
<script code="global">
    const { $app, $title } = $id();
    $title.textContent = "欢迎使用 Magic";
</script>
<css scope="#id:app">
    h1 { color: #31A9FF; }
</css>
```

---

## 🏗️ 编译器流水线 (7 步)

```
magic build / magic run
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  Step 1  配置解析   examine_BuildConfig  │
  │  Step 2  文件扫描   scan                  │
  │  Step 3  目录初始化  initDir               │
  │  Step 4  文件分类   classify               │
  │  Step 5  核心编译   compile                │
  │  Step 6  代码生成   generate               │
  │  Step 7  压缩优化   optimize               │
  └─────────────────────────────────────────┘
        │
        ▼
  build-debug/index.html  (通过 dev server 预览)
```


| Step        | 关键点                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. config   | 解析`build.toml` → `BuildConfig`, 合并 `extends`, 解析 `app.xml`, 宏替换 `${name}` 等, 调用 `onConfigParsed` 钩子                                                                        |
| 2. scan     | 调用`filtrationFile()` 扫描源码, Windows 上走 Rust, 其他平台走 TS fallback. 创建 `Source` 对象, 加载 SQLite 缓存比对 hash                                                                 |
| 3. initdir  | 创建`{out}-{model}/` + `.magic/` 输出目录 (如 `build-debug/` + `.magic/`) |
| 4. classify | 按扩展名分组:`.m` → 编译队列, 其他 → 复制到输出目录 (仅 changed)                                                                                                                        |
| 5. compile  | **核心**: `node-html-parser` 解析 → 提取 `<import>` / `<template>` / `<script>` (8 种类型) / `<css>` (scope + default-theme) → Babel AST + 宏替换 → PostCSS 处理 → 生成 `MDataOutput` |
| 6. generate | 渲染 HTML/JS/CSS 产物, 写入`index.html` (注入 CSP + reload.js), 批量写 SQLite 缓存                                                                                                        |
| 7. optimize | Minify (JS/CSS/HTML, 受`optimize['min-code']` 控制) + 文件合并 + SourceMap                                                                                                                |

完整说明见 [doc/](./doc/) 目录 (12 篇技术文档).

---

## 🔧 技术栈

- 运行时: [Bun](https://bun.sh) (~1.3+) · TypeScript
- JS 解析: [@babel/parser](https://babeljs.io) + @babel/traverse + @babel/generator + @babel/types
- HTML 解析: [node-html-parser](https://www.npmjs.com/package/node-html-parser)
- CSS: [postcss](https://postcss.org) + [lightningcss](https://lightningcss.dev) (交叉编译) + css-shorthand-expand
- 代码格式化: [prettier](https://prettier.io)
- HTML 压缩: [html-minifier-terser](https://www.npmjs.com/package/html-minifier-terser)
- WebSocket: [ws](https://www.npmjs.com/package/ws) (dev server 推送 reload)
- 文件扫描: [fast-glob](https://www.npmjs.com/package/fast-glob) + Rust `bin/usn-scan/` (Windows 加速, 纯 std 库零依赖)
- MIME: [mime-types](https://www.npmjs.com/package/mime-types)
- 数据库: SQLite (通过 `bun:sqlite` 内置模块)
- 进程间通信: HTTP `GET /__magic/reload` 端点 (build → dev server)
- Lint / 测试: [eslint](https://eslint.org) + typescript-eslint + `bun test` + [happy-dom](https://github.com/capricorn86/happy-dom)

---

## 📄 License

MIT © [SQJM](https://github.com/SQJM)
