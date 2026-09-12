# Custom Pages & Static Hosting

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-custom-pages.svg)](https://www.npmjs.com/package/@evarentha/linearpress-custom-pages) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

This LinearPress plugin publishes non-article content (an about page, a privacy policy, a landing page) on routes you choose, without touching the posts table or the permalink namespace. It also hosts static HTML pages whose `{{ placeholder }}` markers get replaced with live site data in the browser, so a hand-written page can still show the site name or the latest posts.

Route ownership is checked live: if the system or another plugin has claimed a path, this plugin steps aside. Page saves take effect immediately, no restart.

## Install

```bash
git clone https://github.com/Evarentha/linearpress-custom-pages.git src/plugins/custom-pages
```

The directory name must equal the plugin id. Restart afterwards, or sync from the `base` checkout (`sh scripts/sync-plugins.sh custom-pages`), or upload the ZIP / npm name from the admin Plugins page. modern-editor is optional: with it, page editing switches to the visual editor; without it, the built-in block editor is used, and rendering output is identical either way.

## Pages

Pages are managed at `/admin/pages`, static pages at `/admin/static`, each with its own editor screens. Every entry carries a title, a route, and a draft or published status; static entries also hold the uploaded HTML file. A route duplicating another entry of yours is rejected on save (unique route index). A route colliding with the system or another plugin is not an error: the dispatcher yields, and the list badges the path so you can tell system-reserved from plugin-occupied.

Permissions come in two groups of four, granted per group in the admin UI: `page:manage` / `create` / `edit` / `delete` and `static:manage` / `create` / `edit` / `delete`.

Everything lives in one table, `custom_pages`: kind (page or static), title, route, the block content or the uploaded HTML, status, author, timestamps. The front end queries it per request, which is why saves are visible immediately. Nothing is written to the posts table, so pages never show up in article lists.

## Static pages and placeholders

Upload an HTML file and serve it at any free route. An injected `runtime.js` replaces placeholders in the browser, with values HTML-escaped. The data comes from `GET /api/custom-pages/data`: the site config, the 10 most recent posts with their permalink URLs, the published pages, and the current timestamp.

```html
<h1>{{ site.siteName }}</h1>
{{# recentPosts }}
  <a href="{{ url }}">{{ title }}</a>
{{/ recentPosts }}
```

Inside the page's own `<script>`, the same data is reachable through `LinearPressStatic.get('site.siteName')`, `.get('recentPosts')`, `.replace()`, and `.reload()`.

## How routing works

The front-end dispatcher runs as a middleware, but before rendering anything it consults a live snapshot of registered routes. Reserved system paths (`/admin`, `/api`, `/plugins`, the post permalink area, among others) and routes registered by other plugins always win; the dispatcher calls `next()` and yields. That is how another plugin can take over a path without anyone patching the core route table, and it is why installing or removing plugins never breaks saved pages here. The page template belongs to this plugin and static pages are your HTML plus `runtime.js`, so neither path depends on theme views.

## License

GPL-3.0-or-later, Copyright (C) 2026 Evarentha. See LICENSE.
