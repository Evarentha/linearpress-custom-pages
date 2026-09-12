# 自定义页面与静态托管（custom-pages）

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-custom-pages.svg)](https://www.npmjs.com/package/@evarentha/linearpress-custom-pages) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

本插件为 LinearPress 提供自定义页面与静态托管：在自选路由上发布非文章内容（关于页、隐私政策、着陆页等），不占用文章表，亦不进入固定链接命名空间。同时提供静态 HTML 托管：页面中的 `{{ 占位符 }}` 将在浏览器端替换为站内实时数据，使手写页面也能呈现站点名称或最新文章。

路由归属实时判定：若系统或其他插件已占用某路径，本插件将主动让出。页面保存即时生效，无须重启。

## 安装

```bash
git clone https://github.com/Evarentha/linearpress-custom-pages.git src/plugins/custom-pages
```

目录名必须与插件 id 一致，安装后需重启 LinearPress。也可以在 `base` 检出中执行 `sh scripts/sync-plugins.sh custom-pages`，或在后台插件页上传 ZIP、填写 npm 包名。modern-editor 为可选依赖：安装后页面编辑切换至可视化编辑器；未安装时使用内置块编辑器，两种方式的渲染结果完全一致。

## 页面

页面在 `/admin/pages` 管理，静态页在 `/admin/static` 管理，各自具有独立的编辑界面。每个条目包含标题、路由与草稿/发布状态，静态条目另保存上传的 HTML 文件。路由与本插件的其他条目重复时，保存将被拒绝（唯一路由索引）；路由与系统或其他插件冲突不视为错误，分发器将让出该路径，列表页以徽标标注路径归属（系统保留或插件占用），便于区分。

权限分为两组各四项，在后台权限组界面按组授予：`page:manage` / `create` / `edit` / `delete` 与 `static:manage` / `create` / `edit` / `delete`。

全部内容存储于单张 `custom_pages` 表：类型（page 或 static）、标题、路由、块内容或上传的 HTML、状态、作者、时间戳。前台按请求实时查询该表，因此保存立即生效；不写入文章表，页面不会出现在文章列表中。

## 静态页与占位符

上传 HTML 文件后即可在任意空闲路由上提供服务。系统注入的 `runtime.js` 在浏览器端替换占位符，替换值均经过 HTML 转义。数据来自 `GET /api/custom-pages/data`：站点配置、最近 10 篇文章及其固定链接、已发布的页面、当前时间戳。

```html
<h1>{{ site.siteName }}</h1>
{{# recentPosts }}
  <a href="{{ url }}">{{ title }}</a>
{{/ recentPosts }}
```

页面自身的 `<script>` 中可通过 `LinearPressStatic.get('site.siteName')`、`.get('recentPosts')`、`.replace()`、`.reload()` 获取相同数据。

## 路由机制

前台分发器以中间件形式运行，渲染之前先查询一份实时路由快照。系统保留路径（`/admin`、`/api`、`/plugins`、文章固定链接区域等）与其他插件注册的路由始终优先，分发器调用 `next()` 让出。这使得其他插件能够接管某条路径而无需修改核心路由表，也是安装或卸载任何插件都不会影响已存页面的原因。页面模板属于本插件，静态页即用户 HTML 加 `runtime.js`，两条路径均不依赖主题视图。

## 许可证

本项目以 GPL-3.0-or-later 许可发布，Copyright (C) 2026 Evarentha，完整文本见 [LICENSE](LICENSE)。
