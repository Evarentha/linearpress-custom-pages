/*
 * Author: LinearPress Team
 * custom-pages 插件数据层：页面 / 静态托管 的存取与路由冲突判定。
 *
 * 路由语义（先注册原则）：
 *  - custom-pages 的前台路由不是静态注册的，而是一个“分发中间件”，
 *    在激活阶段最早注册（普通路由挂载之前执行）。
 *  - 分发器在请求时检查“已注册路由表”：若同路径已被系统（core）或其他插件注册，
 *    则 yield（next()）交由对方处理 —— 后注册的插件与系统路由天然覆盖当前页面。
 *  - 冲突状态实时计算，列表页据此展示“已被插件占用 / 已被系统保留”。
 *  - 页面数据按请求实时读取数据库，因此新建/修改路由立即生效，无需重启。
 */

import type { RegisteredRoute } from '../../../types/plugin.js';

export type PageKind = 'page' | 'static';
export type PageStatus = 'draft' | 'published';
export type RouteConflictKind = 'system' | 'plugin';

export interface CustomPageRow {
  id: number;
  kind: PageKind;
  title: string;
  route: string;
  content_json: string | null;
  html_cache: string | null;
  file_name: string | null;
  html: string | null;
  status: PageStatus;
  author_id: number;
  created_at: string;
  updated_at: string | null;
}

export interface DatabaseLike {
  exec(sql: string): unknown;
  all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> | T[];
  get<T = unknown>(sql: string, ...params: unknown[]): Promise<T | undefined> | T | undefined;
  run(sql: string, ...params: unknown[]): Promise<{ lastInsertRowid?: number | bigint }> | { lastInsertRowid?: number | bigint };
}

/** 创建页面/静态托管表（幂等）。使用主数据库服务，跟随 MySQL 等驱动替换。 */
export async function ensureSchema(db: DatabaseLike): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS custom_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'page' CHECK(kind IN ('page','static')),
      title TEXT NOT NULL,
      route TEXT NOT NULL,
      content_json TEXT NOT NULL DEFAULT '[]',
      html_cache TEXT,
      file_name TEXT,
      html TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
      author_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
  `);
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_pages_route ON custom_pages(route);');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_custom_pages_kind_status ON custom_pages(kind, status);');
}

/**
 * 规范化用户输入的路由：
 *  - 必须非空并以 / 开头（自动补全）
 *  - 折叠重复斜杠、去除末尾斜杠、剥离查询串/锚点、转小写（Express 默认忽略大小写）
 *  - 不允许空白字符
 */
export function normalizeRoute(raw: unknown): string {
  let value = String(raw ?? '').trim();
  if (!value) throw new Error('路由不能为空');
  if (!value.startsWith('/')) value = `/${value}`;
  value = value.split(/[?#]/)[0]!;
  value = value.replace(/\/{2,}/g, '/');
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  if (/\s/.test(value)) throw new Error('路由不能包含空白字符');
  if (value.length > 200) throw new Error('路由过长（最多 200 字符）');
  return value.toLocaleLowerCase();
}

const SYSTEM_PREFIXES = ['/admin', '/api', '/plugins', '/css/', '/js/', '/uploads', '/assets'];
const PERMALINK_PREFIXES = ['/posts', '/post/', '/post-'];

/** 表内存储的路径与路由表路径做等价比较（Express 路由默认大小写不敏感）。 */
export function samePath(tablePath: string, route: string): boolean {
  const a = tablePath.toLowerCase();
  const b = route.toLowerCase();
  if (a === b) return true;
  const trimA = a.length > 1 && a.endsWith('/') ? a.slice(0, -1) : a;
  return trimA === b;
}

/**
 * 计算一个路由当前的占用状态：
 *  - 'system'：系统保留（core 已注册同路径 GET 路由，或命中系统保留前缀 / 文章固定链接前缀）
 *  - 'plugin'：其他插件已注册同路径 GET 路由（后注册插件将覆盖本插件分发）
 *  - null：可用
 */
export function computeRouteConflict(route: string, routes: RegisteredRoute[]): RouteConflictKind | null {
  const normalized = normalizeRouteForCheck(route);
  // 1) 系统核心已注册精确路由
  const coreClaimed = routes.some((r) => r.method === 'get' && r.pluginId === 'core' && samePath(r.path, normalized));
  if (coreClaimed) return 'system';
  // 2) 系统保留前缀（含未来系统更新可能登记的核心页面路由所在区域）
  if (SYSTEM_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return 'system';
  // 3) 文章固定链接区域（/posts/... /post/... /post-xxx-page.html）
  if (PERMALINK_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`) || normalized.startsWith(prefix))) return 'system';
  if (normalized === '/') return 'system';
  // 4) 其他插件已注册同路径
  const pluginClaimed = routes.some((r) => r.method === 'get' && r.pluginId !== 'core' && samePath(r.path, normalized));
  if (pluginClaimed) return 'plugin';
  return null;
}

function normalizeRouteForCheck(route: string): string {
  let value = String(route ?? '').trim();
  if (!value.startsWith('/')) value = `/${value}`;
  value = value.split(/[?#]/)[0]!;
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value.toLocaleLowerCase();
}

function rowOf(value: CustomPageRow | undefined): CustomPageRow | undefined { return value; }

export async function listByKind(db: DatabaseLike, kind: PageKind): Promise<CustomPageRow[]> {
  return (await db.all<CustomPageRow>('SELECT * FROM custom_pages WHERE kind=? ORDER BY created_at DESC', kind)).map(rowOf).filter((row): row is CustomPageRow => Boolean(row));
}

export async function findById(db: DatabaseLike, id: number): Promise<CustomPageRow | undefined> {
  return rowOf(await db.get<CustomPageRow>('SELECT * FROM custom_pages WHERE id=?', id));
}

export async function findByRoute(db: DatabaseLike, route: string): Promise<CustomPageRow | undefined> {
  return rowOf(await db.get<CustomPageRow>('SELECT * FROM custom_pages WHERE route=?', route));
}

export async function findPublishedByRoute(db: DatabaseLike, route: string): Promise<CustomPageRow | undefined> {
  return rowOf(await db.get<CustomPageRow>("SELECT * FROM custom_pages WHERE route=? AND status='published'", route));
}

async function assertRouteAvailable(db: DatabaseLike, route: string, excludeId?: number): Promise<void> {
  const existing = await findByRoute(db, route);
  if (existing && existing.id !== excludeId) throw new Error(`路由 ${route} 已被其他页面或静态托管使用，请更换。`);
}

export async function savePage(db: DatabaseLike, input: { id?: number; title: string; route: string; blocks: unknown; htmlCache: string; status: PageStatus; authorId?: number }): Promise<CustomPageRow> {
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('标题不能为空');
  const route = normalizeRoute(input.route);
  await assertRouteAvailable(db, route, input.id);
  const json = JSON.stringify(Array.isArray(input.blocks) ? input.blocks : []);
  if (input.id) {
    await db.run("UPDATE custom_pages SET title=?, route=?, content_json=?, html_cache=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", title, route, json, input.htmlCache, input.status, input.id);
    return (await findById(db, input.id))!;
  }
  const result = await db.run('INSERT INTO custom_pages(kind,title,route,content_json,html_cache,status,author_id) VALUES(?,?,?,?,?,?,?)', 'page', title, route, json, input.htmlCache, input.status, input.authorId ?? null);
  const id = Number(result.lastInsertRowid);
  return (await findById(db, id))!;
}

export async function saveStatic(db: DatabaseLike, input: { id?: number; title: string; route: string; fileName: string; html: string; status: PageStatus; authorId?: number }): Promise<CustomPageRow> {
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('标题不能为空');
  const route = normalizeRoute(input.route);
  await assertRouteAvailable(db, route, input.id);
  const html = String(input.html ?? '');
  if (!html.trim()) throw new Error('HTML 内容不能为空（请选择文件或粘贴内容）。');
  if (input.id) {
    await db.run('UPDATE custom_pages SET title=?, route=?, file_name=?, html=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', title, route, input.fileName, html, input.status, input.id);
    return (await findById(db, input.id))!;
  }
  const result = await db.run('INSERT INTO custom_pages(kind,title,route,file_name,html,status,author_id) VALUES(?,?,?,?,?,?,?)', 'static', title, route, input.fileName, html, input.status, input.authorId ?? null);
  const id = Number(result.lastInsertRowid);
  return (await findById(db, id))!;
}

export async function removeById(db: DatabaseLike, id: number): Promise<void> {
  await db.run('DELETE FROM custom_pages WHERE id=?', id);
}