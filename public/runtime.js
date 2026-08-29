/*
 * Author: LinearPress Team
 * custom-pages 静态托管运行时。
 *
 * 作用（被静态页面注入引用）：
 *  1. 访问时请求 /api/custom-pages/data 获取动态数据；
 *  2. 将 HTML 中的 {{ 路径 }} 占位符替换为数据值（支持 {{# 路径 }}…{{/ 路径 }} 循环）；
 *  3. 暴露 window.LinearPressStatic：页面自身的 <script> 可直接调用其接口取数。
 *
 * 占位符示例：
 *   {{ site.siteName }}
 *   {{# recentPosts }}<a href="{{ url }}">{{ title }}</a>{{/ recentPosts }}
 */
(() => {
  const DATA_URL = '/api/custom-pages/data';
  let data = {};

  function lookupPath(root, path) {
    const parts = String(path || '').split('.').filter(Boolean);
    let current = root;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }

  function format(value) {
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  // 在给定根节点内做占位符替换（循环优先于单值，避免嵌套误匹配）。
  function replaceIn(root) {
    const source = root ? root.innerHTML : document.body.innerHTML;
    const loopPattern = /\{\{#\s*([\w.-]+)\s*\}\}(?:\r?\n)?([\s\S]*?)(?:\r?\n)?\{\{\/\s*\1\s*\}\}/g;
    const valuePattern = /\{\{\s*([\w.-]+)\s*\}\}/g;
    const output = source
      .replace(loopPattern, (match, key, inner) => {
        const list = lookupPath(data, key);
        if (!Array.isArray(list)) return '';
        return list.map((item) => inner.replace(valuePattern, (m, p) => escapeHtml(format(lookupPath(item, p))))).join('');
      })
      .replace(valuePattern, (m, key) => escapeHtml(format(lookupPath(data, key))));
    if (root) root.innerHTML = output;
    else document.body.innerHTML = output;
  }

  function init() {
    fetch(DATA_URL, { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        data = (json && typeof json === 'object') ? json : {};
        window.LinearPressStatic = {
          data,
          getAll: () => data,
          get: (path) => lookupPath(data, path),
          replace: () => replaceIn(document.body),
          reload: init
        };
        replaceIn(document.body);
      })
      .catch(() => {
        // 数据不可用时保留占位符原样，仅暴露空接口。
        window.LinearPressStatic = { data: {}, getAll: () => ({}), get: () => '', replace: () => {} };
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();