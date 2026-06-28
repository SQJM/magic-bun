import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PRESETS: Record<string, {
  description: string;
  files: Record<string, string>;
}> = {
  'todo': {
    description: '待办事项应用',
    files: {
      'build.toml': `# 配置
[config]
name = "{{name}}"
src = "app"
main = "index"
version = "1.0.0"
description = "{{description}}"
author = "{{author}}"
license = "MIT"

# 构建配置
[build]
out = "build"
model = "debug"
incremental = true
module = false
module-src = "{{name}}-module"
module-out = "build-module"

[build.import]
module = []

[build.exclude]
file = []
dir = []

[build.optimize]
out-default-theme = true
remove-unused = false

[build.optimize.min-code]
js = false
css = false
html = false

[build.output]
source-map = false
chunk-size = 1024

`,
      'app/app.xml': `<app lang="zh">
    <title>待办事项</title>
    <import>
    </import>
</app>
`,
      'app/index.m': `<import root="">
</import>

<template>
    <div #id="view">
        <h1>待办事项</h1>
        <input #id="input" type="text" placeholder="添加新任务..." />
        <button #id="addBtn" @click="addTodo">添加</button>
        <ul #id="list">
        </ul>
    </div>
</template>

<script code="global">
    const { $view, $input, $addBtn, $list } = $id();
    const todos = [];

    function renderList() {
        $list.innerHTML = '';
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            li.style.textDecoration = todo.done ? 'line-through' : 'none';
            li.innerHTML = \`<span>\${todo.text}</span>
                <button data-index="\${index}" class="toggle">\${todo.done ? '撤销' : '完成'}</button>
                <button data-index="\${index}" class="delete">删除</button>\`;
            $list.appendChild(li);
        });

        $list.querySelectorAll('.toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                todos[idx].done = !todos[idx].done;
                renderList();
            });
        });

        $list.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                todos.splice(idx, 1);
                renderList();
            });
        });
    }

    function addTodo() {
        const text = $input.value.trim();
        if (text) {
            todos.push({ text, done: false });
            $input.value = '';
            renderList();
        }
    }
</script>

<script code="event">
</script>

<script code="component-event">
    created = () => {}
    destroy = () => {}
    visibleChange = (visible) => {}
</script>

<css scope="#id:view">
    & { padding: 16px; font-family: sans-serif; }
    h1 { color: #333; }
    input { padding: 8px; width: 200px; margin-right: 8px; }
    button { padding: 8px 16px; cursor: pointer; }
    ul { list-style: none; padding: 0; margin-top: 16px; }
    li { padding: 8px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 8px; }
    li span { flex: 1; }
    .toggle, .delete { padding: 4px 8px; font-size: 12px; }
    .delete { color: red; }
</css>
`
    }
  },
  'blog': {
    description: '博客',
    files: {
      'build.toml': `# 配置
[config]
name = "{{name}}"
src = "app"
main = "index"
version = "1.0.0"
description = "{{description}}"
author = "{{author}}"
license = "MIT"

# 构建配置
[build]
out = "build"
model = "debug"
incremental = true
module = false
module-src = "{{name}}-module"
module-out = "build-module"

[build.import]
module = []

[build.exclude]
file = []
dir = []

[build.optimize]
out-default-theme = true
remove-unused = false

[build.optimize.min-code]
js = false
css = false
html = false

[build.output]
source-map = false
chunk-size = 1024

`,
      'app/app.xml': `<app lang="zh">
    <title>我的博客</title>
    <import>
    </import>
</app>
`,
      'app/index.m': `<import root="">
</import>

<template>
    <div #id="view">
        <header #id="header">
            <h1>我的博客</h1>
            <nav>
                <a href="#" @click="showHome">首页</a>
                <a href="#" @click="showAbout">关于</a>
            </nav>
        </header>
        <main #id="main">
            <div #id="posts"></div>
        </main>
        <footer #id="footer">
            <p>&copy; {{year}} 我的博客. Powered by Magic.</p>
        </footer>
    </div>
</template>

<script code="global">
    const { $view, $header, $main, $footer, $posts } = $id();

    const articles = [
        { title: 'Magic 框架入门', date: '{{year}}-01-15', summary: '本文介绍 Magic 框架的基本概念和使用方法.' },
        { title: '如何使用组件', date: '{{year}}-02-20', summary: '了解如何在 Magic 中创建和使用自定义组件.' },
        { title: '构建与部署', date: '{{year}}-03-10', summary: '将 Magic 项目构建为生产就绪的应用.' }
    ];

    function renderPosts() {
        $posts.innerHTML = '';
        articles.forEach(article => {
            const card = document.createElement('article');
            card.className = 'post-card';
            card.innerHTML = \`<h2>\${article.title}</h2>
                <time>\${article.date}</time>
                <p>\${article.summary}</p>\`;
            $posts.appendChild(card);
        });
    }

    function showHome() {
        $main.innerHTML = '<div #id="posts"></div>';
        renderPosts();
    }

    function showAbout() {
        $main.innerHTML = '<div class="about"><h2>关于我</h2><p>这是一个使用 Magic 框架构建的博客.</p></div>';
    }
</script>

<script code="event">
    created = () => { renderPosts(); }
</script>

<script code="component-event">
    created = () => {}
    destroy = () => {}
    visibleChange = (visible) => {}
</script>

<css scope="#id:view">
    & { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 16px; }
    header { border-bottom: 2px solid #333; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    nav a { margin-left: 16px; color: #333; text-decoration: none; cursor: pointer; }
    nav a:hover { text-decoration: underline; }
    .post-card { border: 1px solid #eee; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .post-card h2 { margin: 0 0 8px 0; color: #333; }
    .post-card time { color: #999; font-size: 14px; }
    .post-card p { color: #666; margin-top: 8px; }
    footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; color: #999; }
    .about { text-align: center; padding: 32px; }
</css>
`
    }
  },
  'spa': {
    description: '单页应用',
    files: {
      'build.toml': `# 配置
[config]
name = "{{name}}"
src = "app"
main = "index"
version = "1.0.0"
description = "{{description}}"
author = "{{author}}"
license = "MIT"

# 构建配置
[build]
out = "build"
model = "debug"
incremental = true
module = false
module-src = "{{name}}-module"
module-out = "build-module"

[build.import]
module = []

[build.exclude]
file = []
dir = []

[build.optimize]
out-default-theme = true
remove-unused = false

[build.optimize.min-code]
js = false
css = false
html = false

[build.output]
source-map = false
chunk-size = 1024

`,
      'app/app.xml': `<app lang="zh">
    <title>{{name}}</title>
    <import>
    </import>
</app>
`,
      'app/index.m': `<import root="">
</import>

<template>
    <div #id="view">
        <nav #id="nav">
            <button @click="navigate('home')">首页</button>
            <button @click="navigate('about')">关于</button>
            <button @click="navigate('contact')">联系</button>
        </nav>
        <div #id="content"></div>
    </div>
</template>

<script code="global">
    const { $view, $nav, $content } = $id();

    const pages = {
        home: '<h1>首页</h1><p>欢迎来到单页应用! 这是首页内容.</p>',
        about: '<h1>关于</h1><p>这是一个使用 Magic 框架构建的单页应用示例.</p>',
        contact: '<h1>联系</h1><form><label>姓名: <input type="text" /></label><br/><label>邮箱: <input type="email" /></label><br/><button type="submit">提交</button></form>'
    };

    let currentPage = 'home';

    function navigate(page) {
        if (pages[page]) {
            currentPage = page;
            $content.innerHTML = pages[page];
            highlightNav();
        }
    }

    function highlightNav() {
        const buttons = $nav.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.className = btn.textContent === (currentPage === 'home' ? '首页' : currentPage === 'about' ? '关于' : '联系') ? 'active' : '';
        });
    }
</script>

<script code="event">
    created = () => { navigate('home'); }
</script>

<script code="component-event">
    created = () => {}
    destroy = () => {}
    visibleChange = (visible) => {}
</script>

<css scope="#id:view">
    & { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 16px; }
    nav { display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 16px; }
    nav button { padding: 8px 16px; border: 1px solid #333; background: white; cursor: pointer; border-radius: 4px; }
    nav button.active { background: #333; color: white; }
    nav button:hover { background: #eee; }
    nav button.active:hover { background: #555; }
    #content { padding: 16px; }
    form label { display: block; margin-bottom: 8px; }
    form input { padding: 4px 8px; margin-left: 8px; }
    form button { margin-top: 8px; padding: 8px 16px; }
</css>
`
    }
  }
};

export function generatePreset(name: string, targetDir: string): void {
  const preset = PRESETS[name];
  if (!preset) {
    const available = Object.keys(PRESETS).join(', ');
    throw new Error(`未知的预置模板 [${name}].可用: ${available}`);
  }

  for (const [filePath, content] of Object.entries(preset.files)) {
    const fullPath = join(targetDir, filePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('\\') !== -1 ? fullPath.lastIndexOf('\\') : fullPath.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }
}
