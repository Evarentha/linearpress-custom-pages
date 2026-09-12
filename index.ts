/*
 * Custom Pages Plugin Entry
 *
 * Entry point of the Custom Pages plugin: custom pages plus static hosting.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>custom-pages: custom pages plus static hosting.</p>
 *
 * <p>Design highlights:</p>
 * <ol>
 * <li>The front route is a "dispatch middleware" registered earliest in the
 * activate stage (first-registration principle): on each request it reads
 * the custom_pages table live and, on a hit, checks the registered route
 * table. If the same path has already been registered by the system (core)
 * or a later plugin, it yields (next()) so the other handler takes over,
 * letting later plugins and system routes override this page; the list view
 * shows the conflict accordingly.</li>
 * <li>Page data is read per request, so creating, editing, or deleting
 * routes takes effect immediately without a restart.</li>
 * <li>Pages use the built-in block editor; once modern-editor is installed,
 * the page edit view switches to the visual editor (reusing modern-editor's
 * marker-block format and this plugin's renderer, with identical output).</li>
 * <li>Static hosting: upload an HTML file, runtime.js is injected on save,
 * and the browser replaces {{snippet}} placeholders with live data; the
 * page's own scripts can call the window.LinearPressStatic API to fetch
 * data.</li>
 * </ol>
 *
 * @since 1.0.0
 */

import type { Context } from 'cordis';
import type { Request, RequestHandler, Response } from 'express';
import type { RegisteredRoute } from '../../types/plugin.js';
import { postUrl } from '../../core/permalinks.js';
import { checkPermission, requireAuth } from '../../services/permission.service.js';
import { renderPageHtml } from './src/render.js';
import {
  computeRouteConflict,
  ensureSchema,
  findById,
  findByRoute,
  findPublishedByRoute,
  listByKind,
  normalizeRoute,
  removeById,
  savePage,
  saveStatic,
  type CustomPageRow,
  type PageKind,
  type PageStatus,
  type RouteConflictKind
} from './src/store.js';

const PAGE_HOME = '/admin/pages';
const STATIC_HOME = '/admin/static';
const DATA_URL = '/api/custom-pages/data';

function param(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? '' : (value ?? ''); }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : '操作失败'; }

const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res, next) => {
  void Promise.resolve(fn(req, res)).catch((error) => {
    console.error('[custom-pages] handler error:', error);
    if (!res.headersSent) res.status(400).render('error', { title: '操作失败', message: messageOf(error) });
    else next(error);
  });
};

function safeDecode(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }
function coerceRequestPath(raw: string): string {
  let path = safeDecode(raw).split(/[?#]/)[0] ?? '';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path.toLocaleLowerCase();
}
function statusOf(value: unknown): PageStatus { return String(value) === 'published' ? 'published' : 'draft'; }
function parseBlocks(value: unknown): unknown { try { const parsed = JSON.parse(String(value ?? '[]')); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function conflictOf(rows: CustomPageRow[], routes: RegisteredRoute[]): Record<number, RouteConflictKind> {
  const map: Record<number, RouteConflictKind> = {};
  for (const row of rows) {
    const conflict = computeRouteConflict(row.route, routes);
    if (conflict) map[row.id] = conflict;
  }
  return map;
}

const CONFLICT_TEXT: Record<RouteConflictKind, string> = {
  plugin: '该路由已被插件占用，请修改路由',
  system: '该路由已被系统保留，请修改路由'
};

function injectStaticRuntime(html: string): string {
  const tag = '<script src="/plugins/custom-pages/runtime.js?v=1.0.0" defer></script>';
  const lower = html.toLowerCase();
  const bodyEnd = lower.lastIndexOf('</body>');
  if (bodyEnd !== -1) return `${html.slice(0, bodyEnd)}${tag}${html.slice(bodyEnd)}`;
  const htmlEnd = lower.lastIndexOf('</html>');
  if (htmlEnd !== -1) return `${html.slice(0, htmlEnd)}${tag}${html.slice(htmlEnd)}`;
  return `${html}${tag}`;
}

export default async function customPages(context: Context): Promise<void> {
  const { web, hooks } = context.linearpress;
  const db = context.databaseService;

  await ensureSchema(db);

  // 侧边栏“页面”父级菜单 + 两个二级菜单（页面 / 静态托管）。
  context.admin.registerMenu({
    title: '页面',
    link: PAGE_HOME,
    icon: '📄',
    children: [
      { title: '页面', link: PAGE_HOME },
      { title: '静态托管', link: STATIC_HOME }
    ]
  });

  // ---------------------------------------------------------------- 前台分发
  // 先注册原则：分发中间件最早执行；命中路由但已被系统/插件占用时 yield。
  web.middleware((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const rawPath = String(req.path ?? '/');
    if (rawPath === '/' || rawPath.startsWith('/admin') || rawPath.startsWith('/plugins') || rawPath.startsWith('/css/') || rawPath.startsWith('/js/') || rawPath.startsWith('/uploads') || rawPath === '/favicon.ico') return next();
    const path = coerceRequestPath(rawPath);
    void (async () => {
      const row = await findPublishedByRoute(db, path);
      if (!row) return next();
      // 已被系统或其他插件占用：让出（后注册方生效）。
      if (computeRouteConflict(row.route, web.getRoutes())) return next();
      if (row.kind === 'page') {
        const html = renderPageHtml(row.content_json);
        return void res.render('web/page', { title: row.title, page: row, html });
      }
      res.set('X-Content-Type-Options', 'nosniff');
      return void res.type('html').send(injectStaticRuntime(row.html ?? ''));
    })().catch(next);
  });

  // ---------------------------------------------------------------- 页面管理
  web.register('get', PAGE_HOME, requireAuth, checkPermission('page:manage'), wrap(async (_req, res) => {
    const rows = await listByKind(db, 'page');
    res.render('admin/pages', { title: '页面', items: rows, conflicts: conflictOf(rows, web.getRoutes()), notice: _req.query.notice ?? '' });
  }));

  const blankPageEditor: RequestHandler = wrap(async (_req, res) => {
    res.render('admin/page-edit', { title: '新建页面', page: null, blocks: [], modernEditor: await modernEditorEnabled(context) });
  });
  web.register('get', `${PAGE_HOME}/new`, requireAuth, checkPermission('page:create'), blankPageEditor);

  const editPageEditor: RequestHandler = wrap(async (req, res) => {
    const row = await findById(db, Number(param(req.params.id)));
    if (!row || row.kind !== 'page') return void res.status(404).render('error', { title: '未找到', message: '页面不存在或已被删除。' });
    res.render('admin/page-edit', { title: '编辑页面', page: row, blocks: parseBlocks(row.content_json), modernEditor: await modernEditorEnabled(context) });
  });
  web.register('get', `${PAGE_HOME}/:id/edit`, requireAuth, checkPermission('page:edit'), editPageEditor);

  web.register('post', `${PAGE_HOME}/save`, requireAuth, wrap(async (req, res) => {
    const id = Number(req.body.id) || undefined;
    const permission = id ? 'page:edit' : 'page:create';
    if (!await context.permissions.has(req.session.userId!, permission)) {
      return void res.status(403).render('error', { title: '权限不足', message: '你没有执行此操作的权限。' });
    }
    const route = normalizeRoute(req.body.route);
    const saved = await savePage(db, {
      id,
      title: String(req.body.title ?? ''),
      route,
      blocks: parseBlocks(req.body.content_json),
      htmlCache: renderPageHtml(parseBlocks(req.body.content_json)),
      status: statusOf(req.body.status),
      authorId: req.session.userId
    });
    res.redirect(`${PAGE_HOME}?notice=saved&id=${saved.id}`);
  }));

  web.register('post', `${PAGE_HOME}/:id/delete`, requireAuth, checkPermission('page:delete'), wrap(async (req, res) => {
    await removeById(db, Number(param(req.params.id)));
    res.redirect(`${PAGE_HOME}?notice=deleted`);
  }));

  // ---------------------------------------------------------------- 静态托管
  web.register('get', STATIC_HOME, requireAuth, checkPermission('static:manage'), wrap(async (_req, res) => {
    const rows = await listByKind(db, 'static');
    res.render('admin/static', { title: '静态托管', items: rows, conflicts: conflictOf(rows, web.getRoutes()), notice: _req.query.notice ?? '' });
  }));

  const blankStaticEditor: RequestHandler = wrap(async (req, res) => {
    const route = typeof req.query.route === 'string' ? normalizeRoute(req.query.route) : '';
    res.render('admin/static-edit', { title: '新建静态页面', entry: null, route });
  });
  web.register('get', `${STATIC_HOME}/new`, requireAuth, checkPermission('static:create'), blankStaticEditor);

  const editStaticEditor: RequestHandler = wrap(async (req, res) => {
    const row = await findById(db, Number(param(req.params.id)));
    if (!row || row.kind !== 'static') return void res.status(404).render('error', { title: '未找到', message: '静态页面不存在或已被删除。' });
    res.render('admin/static-edit', { title: '编辑静态页面', entry: row, route: row.route });
  });
  web.register('get', `${STATIC_HOME}/:id/edit`, requireAuth, checkPermission('static:edit'), editStaticEditor);

  web.register('post', `${STATIC_HOME}/save`, requireAuth, wrap(async (req, res) => {
    const id = Number(req.body.id) || undefined;
    const permission = id ? 'static:edit' : 'static:create';
    if (!await context.permissions.has(req.session.userId!, permission)) {
      return void res.status(403).render('error', { title: '权限不足', message: '你没有执行此操作的权限。' });
    }
    const route = normalizeRoute(req.body.route);
    const fileName = String(req.body.file_name ?? '').trim() || (id ? await findById(db, id).then((row) => row?.file_name ?? null) : null) || 'index.html';
    const html = String(req.body.html ?? '').trim();
    if (!html) throw new Error('请选择 HTML 文件或粘贴内容。');
    await saveStatic(db, { id, title: String(req.body.title ?? ''), route, fileName, html, status: statusOf(req.body.status), authorId: req.session.userId });
    res.redirect(`${STATIC_HOME}?notice=saved`);
  }));

  web.register('post', `${STATIC_HOME}/:id/delete`, requireAuth, checkPermission('static:delete'), wrap(async (req, res) => {
    await removeById(db, Number(param(req.params.id)));
    res.redirect(`${STATIC_HOME}?notice=deleted`);
  }));

  // ---------------------------------------------------------------- 静态数据 API
  web.register('get', DATA_URL, wrap(async (_req, res) => {
    res.json(await buildStaticData(context));
  }));

  // 视图辅助：前台页面模板可判断/读取自定义页面信息。
  hooks.on('site:locals', (locals: Record<string, unknown>) => ({
    ...locals,
    customPageRoute: (value: CustomPageRow | null | undefined) => value?.route ?? null
  }));

  context.logger.info(`activated (${(await listByKind(db, 'page')).length} pages, ${(await listByKind(db, 'static')).length} static)`);
}

async function modernEditorEnabled(context: Context): Promise<boolean> {
  try {
    const list = await context.plugins.list();
    return list.some((plugin: { id: string; enabled: number }) => plugin.id === 'modern-editor' && Number(plugin.enabled) === 1);
  } catch { return false; }
}

async function buildStaticData(context: Context): Promise<Record<string, unknown>> {
  const config = await context.config.get();
  const recentPosts = await context.posts.listPublished(10);
  const pages = (await listByKind(context.databaseService, 'page')).filter((row) => row.status === 'published');
  const format = String(config.permalink ?? '/posts/:slug');
  return {
    site: {
      siteName: config.siteName ?? '',
      siteTitle: config.siteTitle ?? '',
      siteSubtitle: config.siteSubtitle ?? '',
      siteDescription: config.siteDescription ?? '',
      url: config.primaryDomain ?? '',
      now: new Date().toISOString()
    },
    now: new Date().toISOString(),
    generatedAt: Date.now(),
    recentPosts: recentPosts.map((post: { id: number; title: string; slug: string; created_at: string }) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      url: postUrl(post, format),
      created_at: post.created_at
    })),
    pages: pages.map((row) => ({ id: row.id, title: row.title, route: row.route }))
  };
}

export { CONFLICT_TEXT, injectStaticRuntime, DATA_URL };