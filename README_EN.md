# Magic

**Single-File Components · Compile to Run**

[![npm](https://img.shields.io/npm/v/@love-sqjm/magic?color=%2331A9FF)](https://www.npmjs.com/package/@love-sqjm/magic)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![output](https://img.shields.io/badge/output-zero--browser--deps-31A9FF)](#)

---

**Magic** (@love-sqjm/magic) is a Web application **build tool** built on [Bun](https://bun.sh). It compiles `.m` Single-File Components (SFC) into native HTML/JS/CSS, providing compile-time macros, tree-shaking, CSS processing, incremental caching, and a built-in dev server.

> **Note**: Magic is a build tool, not a framework. The `.m` file is a proprietary component format that compiles down to standard Web artifacts.

> 📖 中文版: [README.md](./README.md) · 📖 Full docs: [doc/](./doc/) directory (12 in-depth guides × bilingual)

---

## ✨ Core Features

**🧩 `.m` Single-File Components**

- One file = `<template>` + multiple `<script>` blocks (8 code types) + `<css>` (with scope / default-theme)
- Compile-time scope isolation, zero style pollution
- `<slot>` (with `must` enforcement) and `<extend>` inheritance

**⚡ Incremental Builds (CAS + DAG)**

- SQLite cache (`bun:sqlite`): content-hash for `.m` files, mtime+size for others
- Dependency tracking: changes to imported files automatically retrigger importers
- Windows uses a Rust binary `usn-scan` (5ms / 766 files) for accelerated scanning
- Tree-shaking (`remove-unused`)

**🎨 CSS Processing Pipeline**

1. shorthand-expand → 2. scope rewrite → 3. keyframes rename → 4. default-theme var extraction → 5. autoprefixer → 6. lightningcss

**🛣️ Built-in Dev Server**

- HTTP + WebSocket. After `magic build` finishes, a `GET /__magic/reload` request pushes a browser refresh.

---

## 🚀 Quick Start

```bash
bun install -g @love-sqjm/magic    # install CLI globally
magic init my-app                   # create a project
cd my-app && magic run             # start the dev server
magic build                        # build to build-debug/ directory
```

Write `app/index.m`:

```xml
<template>
    <div #id="app">
        <h1 #id="title">Hello Magic!</h1>
    </div>
</template>
<script code="global">
    const { $app, $title } = $id();
    $title.textContent = "Welcome to Magic";
</script>
<css scope="#id:app">
    h1 { color: #31A9FF; }
</css>
```

---

## 🏗️ Compiler Pipeline (7 steps)

```
magic build / magic run
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  Step 1  Config parsing   examine_BuildConfig │
  │  Step 2  File scanning    scan                  │
  │  Step 3  Directory init   initDir               │
  │  Step 4  File classify    classify              │
  │  Step 5  Core compile     compile               │
  │  Step 6  Code generation  generate              │
  │  Step 7  Minify & optimize optimize            │
  └─────────────────────────────────────────┘
        │
        ▼
  build-debug/index.html  (preview via dev server)
```


| Step        | Key Points                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. config   | Parse `build.toml` → `BuildConfig`, merge `extends`, parse `app.xml`, macro replace `${name}` etc., call `onConfigParsed` hook                                                                       |
| 2. scan     | Call `filtrationFile()` to scan source. Windows: Rust binary. Other platforms: TS fallback. Create `Source` objects, load SQLite cache and compare hashes                                        |
| 3. initdir  | Create `{out}-{model}/` + `.magic/` output dirs (e.g. `build-debug/` + `.magic/`) |
| 4. classify | Group by extension: `.m` → compile queue, others → copy to output (only changed files)                                                                                                             |
| 5. compile  | **Core**: `node-html-parser` → extract `<import>` / `<template>` / `<script>` (8 types) / `<css>` (scope + default-theme) → Babel AST + macro replace → PostCSS processing → emit `MDataOutput` |
| 6. generate | Render HTML/JS/CSS output, write `index.html` (inject CSP + reload.js), batch-write SQLite cache                                                                                                    |
| 7. optimize | Minify (JS/CSS/HTML, gated by `optimize['min-code']`) + file merging + SourceMap                                                                                                                    |

Full details in [doc/](./doc/) (12 in-depth guides).

---

## 🔧 Tech Stack

- Runtime: [Bun](https://bun.sh) (~1.3+) · TypeScript
- JS parsing: [@babel/parser](https://babeljs.io) + @babel/traverse + @babel/generator + @babel/types
- HTML parsing: [node-html-parser](https://www.npmjs.com/package/node-html-parser)
- CSS: [postcss](https://postcss.org) + [lightningcss](https://lightningcss.dev) (cross-compile) + css-shorthand-expand
- Code formatting: [prettier](https://prettier.io)
- HTML minification: [html-minifier-terser](https://www.npmjs.com/package/html-minifier-terser)
- WebSocket: [ws](https://www.npmjs.com/package/ws) (dev server reload push)
- File scanning: [fast-glob](https://www.npmjs.com/package/fast-glob) + Rust `bin/usn-scan/` (Windows acceleration, pure std lib zero deps)
- MIME: [mime-types](https://www.npmjs.com/package/mime-types)
- Database: SQLite (via `bun:sqlite` built-in)
- IPC: HTTP `GET /__magic/reload` endpoint (build → dev server)
- Lint / Tests: [eslint](https://eslint.org) + typescript-eslint + `bun test` + [happy-dom](https://github.com/capricorn86/happy-dom)

---

## 📄 License

MIT © [SQJM](https://github.com/SQJM)
