<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 自定义页面与静态托管 · Custom Pages

Create **custom-routed pages**（about/privacy etc., non-post content）and **static HTML hosting** with `{{ snippet }}` data-placeholder replacement. Routing follows a **first-registered principle**：system-reserved and later-plugin routes automatically override, with real-time conflict hints on the list page.

创建可自定义路由的**页面**（个人介绍、隐私政策等非文章内容），以及可上传 HTML 文件的**静态托管**（带 `{{ snippet }}` 数据占位符替换）。路由遵循**先注册原则**：系统保留路由与后续插件路由自动覆盖，列表页实时提示冲突。

> Independent plugin repository for LinearPress **custom-pages**. A plugin is a Cordis plugin function — install on demand, disable/uninstall cleanly.
> 本仓库是 LinearPress 插件 **custom-pages** 的独立仓库。

## Why Plugins? / 插件化的优势

- **Route dispatch without touching core** —— dispatch is a first-registered middleware; occupied paths `next()` out — later registrants can always override.
  **路由分发不动核心**——先注册原则，后注册方永远可以覆盖。
- **No post-table occupation** —— pages store separately；never enter the post list or permalink namespace.
  **不占文章表**。
- **Editor compatible** —— with modern-editor installed the page editor switches to the visual editor（format-compatible）.
  **编辑器兼容**。

## Features / 功能

- **Pages / 页面**：block content with built-in editor; visual editor when modern-editor is present；user-defined routes.
- **Static hosting / 静态托管**：upload HTML；injected `runtime.js` replaces `{{ snippet }}` placeholders in-browser；scripts may call `window.LinearPressStatic`.
- **First-registered principle / 先注册原则**：dispatch middleware yields when a path is taken；list page shows real-time conflicts（⚠ plugin-occupied / 🚫 system-reserved）.
- **Instant effect / 立即生效**：reads the DB per request — no restart for create/edit/delete.

## Static Data Placeholders / 静态数据占位符

Data API：`GET /api/custom-pages/data`（`site` / `recentPosts` / `pages` / `now`）.

```html
<h1>{{ site.siteName }}</h1>
{{# recentPosts }}
  <a href="{{ url }}">{{ title }}</a>
{{/ recentPosts }}
```

In page scripts：`LinearPressStatic.get('site.siteName')` / `get('recentPosts')` / `replace()` / `reload()`.

## Route Conflict Rules / 路由冲突规则

| Scenario / 场景 | Behavior / 行为 | Indicator / 提示 |
| --- | --- | --- |
| System-reserved（core /admin /api /plugins /posts permalink zones） | yields to the system route | 🚫 system-reserved |
| Already registered by another plugin | yields to that plugin | ⚠ plugin-occupied |
| Duplicate with an existing page/static | save rejected（unique index） | — |

## Permissions / 权限

Pages：`page:manage|create|edit|delete`；Static：`static:manage|create|edit|delete`（assignable per group）.

## Install & Develop / 安装与开发

```bash
# Option 1 — workspace sync（工作区同步）
cd base && sh scripts/sync-plugins.sh custom-pages

# Option 2 — clone into runtime dir（目录名必须等于插件 id）
git clone https://github.com/Averithen/linearpress-custom-pages src/plugins/custom-pages
```

## Local Development / 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone https://github.com/Averithen/linearpress-custom-pages LinearPress/Plugins/custom-pages
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh custom-pages
npm run dev
```

## Directory / 目录结构

```text
custom-pages/
├── plugin.json            Manifest（8 permissions）
├── index.ts               entry：front-end dispatch + page/static admin routes + data API
├── src/
│   ├── store.ts           custom_pages table access
│   └── render.ts          block rendering（modern-editor compatible）
├── views/
│   ├── web/page.ejs       page template
│   └── admin/             page/static lists & editors
└── public/                runtime.js & styles
```

## Contribute & Release / 贡献与发布

- conventional commits；`cd base && npm run typecheck` before commit
- Version：`git tag v1.0.0 && git push --tags`
- License：MIT（LICENSE）