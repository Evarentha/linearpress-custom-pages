<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 自定义页面与静态托管（custom-pages）

创建可自定义路由的**页面**（个人介绍、隐私政策等非文章内容），以及可上传 HTML 文件的**静态托管**
（带 `{{ snippet }}` 数据占位符替换）。路由遵循**先注册原则**：系统保留路由与后续插件路由自动覆盖，列表页实时提示冲突。

> 本仓库是 LinearPress 插件 **custom-pages** 的独立开发仓库。插件即 Cordis 插件函数，即插即用、可停用可卸载。

## 插件化的优势

- **路由分发不动核心**：前台分发是一个「最优先注册的中间件」，命中路由且未被占用时渲染页面/静态页；被占则 `next()` 让出——后注册方永远可以覆盖，无需改核心路由表。
- **不占文章表**：页面独立存储，不进文章列表、不占 permalink 命名空间。
- **编辑器兼容**：装 modern-editor 后页面编辑切换到可视化编辑器（内容格式完全兼容），插件侧渲染器输出一致。

## 功能

- **页面**：块结构内容，内置块编辑器；`modern-editor` 安装后自动切换可视化编辑器；路由由用户指定。
- **静态托管**：上传 HTML 文件，访问时注入的 `runtime.js` 浏览器端替换 `{{ snippet }}` 占位符；页面脚本可调 `window.LinearPressStatic` 取数。
- **先注册原则**：分发中间件最早注册；同路径已被系统/插件注册时自动让出，列表页实时显示冲突提示（⚠ 已被插件占用 / 🚫 已被系统保留）。
- **立即生效**：前台按请求实时读库，创建/修改/删除页面无需重启。

## 静态数据占位符

数据 API：`GET /api/custom-pages/data`（返回 `site`、`recentPosts`、`pages`、`now`）。

```html
<h1>{{ site.siteName }}</h1>
{{# recentPosts }}
  <a href="{{ url }}">{{ title }}</a>
{{/ recentPosts }}
```

页面 `<script>` 内：`LinearPressStatic.get('site.siteName')` / `get('recentPosts')` / `replace()` / `reload()`。

## 路由冲突规则

| 场景 | 行为 | 列表提示 |
| --- | --- | --- |
| 路径已被系统保留（core /admin /api /plugins /posts 固定链接区等） | 分发器让出 | 🚫 系统保留 |
| 路径已被其他插件注册 | 分发器让出 | ⚠ 插件占用 |
| 路径与既有页面/静态托管重复 | 保存被拒绝（唯一索引） | — |

## 权限

`page:manage|create|edit|delete` 与 `static:manage|create|edit|delete`，在「权限组」按组授权。

## 安装与开发

```bash
# 方式一：工作区同步
cd base
sh scripts/sync-plugins.sh custom-pages

# 方式二：克隆到运行目录（目录名必须等于插件 id）
git clone https://git.linearteam.top/moyuzj/linearpress-custom-pages src/plugins/custom-pages

# 改完重新同步并启动
npm run typecheck && npm run dev
```

## 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone https://git.linearteam.top/moyuzj/linearpress-custom-pages LinearPress/Plugins/custom-pages
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh custom-pages
npm run dev
```

## 目录结构

```text
custom-pages/
├── plugin.json            # Manifest（8 项权限）
├── index.ts               # 入口：前台分发中间件 + 页面/静态托管后台路由 + 数据 API
├── src/
│   ├── store.ts           # custom_pages 表数据访问
│   └── render.ts          # 块渲染（含 modern-editor 兼容）
├── views/
│   ├── web/page.ejs       # 页面模板
│   └── admin/             # 页面/静态托管列表与编辑器
└── public/                # runtime.js 与样式
```

## 贡献与发布

- conventional commits；提交前 `cd base && npm run typecheck`
- 版本：`git tag v1.0.0 && git push --tags`
- License：MIT（见仓库 LICENSE）