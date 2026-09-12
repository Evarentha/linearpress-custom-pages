/*
 * Custom Page Content Renderer
 *
 * Renders custom page content blocks into HTML for the front end.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>custom-pages content renderer.</p>
 *
 * <p>Page content shares the content_json block structure with posts:</p>
 * <ul>
 * <li>The built-in editor produces plain blocks (paragraph / heading /
 * blockquote / image / custom-html, and so on).</li>
 * <li>When modern-editor is installed, pages can be edited with the visual
 * editor, producing LP-MODERN-BLOCK:: base64 marker blocks (the same format
 * modern-editor stores).</li>
 * </ul>
 *
 * <p>This renderer supports both formats, and its rendering logic stays
 * isomorphic with modern-editor's server-side rendering so the same content
 * yields identical output on post pages and custom pages.</p>
 *
 * @since 1.0.0
 */

import type { Block } from '../../../types/index.js';

const MARKER = 'LP-MODERN-BLOCK::';

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));

function readMarker(value: unknown): Record<string, unknown> | undefined {
  const raw = String(value ?? '');
  if (!raw.startsWith(MARKER)) return undefined;
  try { return JSON.parse(Buffer.from(raw.slice(MARKER.length), 'base64').toString('utf8')) as Record<string, unknown>; } catch { return undefined; }
}

const allowedTags = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'SPAN', 'BR', 'CODE', 'MARK', 'FONT']);
const allowedStyles = new Set(['color', 'background-color', 'font-size', 'text-decoration-line', 'text-decoration-style', 'font-weight', 'font-style']);

function safeText(value: unknown): string {
  return String(value ?? '')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#0?39|#x27|#\d+|#x[\da-f]+);)/gi, '&amp;')
    .replace(/[<>"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!))
    .replace(/\r?\n/g, '<br>');
}

function rich(value: unknown): string {
  const raw = String(value ?? '');
  if (!/<[a-z][^>]*>/i.test(raw)) return safeText(raw);
  return raw.replace(/<!--([\s\S]*?)-->|<\/?([a-z][\w-]*)([^>]*)>/gi, (full, _comment: string, tag: string, attrs: string) => {
    if (!tag) return '';
    const upper = tag.toUpperCase();
    if (upper === 'BR') return '<br>';
    if (!allowedTags.has(upper)) return '';
    if (full.startsWith('</')) return `</${upper === 'FONT' ? 'span' : tag.toLowerCase()}>`;
    const styleRules: string[] = [];
    const styleMatch = attrs.match(/\sstyle\s*=\s*["']([^"']*)["']/i);
    if (styleMatch) styleRules.push(styleMatch[1]);
    if (upper === 'FONT') {
      const color = attrs.match(/\scolor\s*=\s*["']?([#\w(),.%+-]+)["']?/i)?.[1];
      if (color) styleRules.push(`color:${color}`);
    }
    const style = styleRules.join(';').split(';').map((rule) => rule.trim()).filter((rule) => {
      const [property, ...parts] = rule.split(':');
      const valuePart = parts.join(':').trim();
      return allowedStyles.has(property.trim().toLowerCase()) && /^[#\w (),.%+-]+$/.test(valuePart);
    }).join(';');
    const outputTag = upper === 'FONT' ? 'span' : tag.toLowerCase();
    return style ? `<${outputTag} style="${esc(style)}">` : `<${outputTag}>`;
  });
}

function safeHref(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '#') return '#';
  if (/^https?:\/\//i.test(raw)) return esc(raw);
  if (/^\/[^^]/.test(raw) || raw.startsWith('./')) return esc(raw);
  return '#';
}

function blockText(block: Record<string, unknown>): string { return rich(block.contentHtml ?? block.content); }

function renderModern(block: Record<string, unknown>): string | undefined {
  const type = String(block.type ?? 'paragraph');
  if (type === 'paragraph') return `<p>${blockText(block)}</p>`;
  if (type === 'heading') { const level = Math.min(6, Math.max(1, Number(block.level) || 2)); return `<h${level}>${blockText(block)}</h${level}>`; }
  if (type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    const items = Array.isArray(block.itemsHtml) ? block.itemsHtml.map((item) => `<li>${rich(item)}</li>`).join('') : String(block.items ?? '').split('\n').filter(Boolean).map((item) => `<li>${safeText(item)}</li>`).join('');
    return `<${tag}>${items}</${tag}>`;
  }
  if (type === 'quote' || type === 'blockquote') return `<blockquote><p>${blockText(block)}</p>${block.cite ? `<cite>${safeText(block.cite)}</cite>` : ''}</blockquote>`;
  if (type === 'code') return `<pre><code>${safeText(block.content)}</code></pre>`;
  if (type === 'details' || type === 'collapse') return `<details ${block.open ? 'open' : ''}><summary>${rich(block.summaryHtml ?? block.summary ?? '展开详情')}</summary><div>${blockText(block)}</div></details>`;
  if (type === 'math') return `<div class="lp-modern-math">${safeText(block.content)}</div>`;
  if (type === 'pre') return `<pre>${safeText(block.content)}</pre>`;
  if (type === 'citation' || type === 'poem') return `<figure class="lp-modern-${type}"><blockquote>${blockText(block).replace(/\n/g, '<br>')}</blockquote>${block.source ? `<figcaption>${safeText(block.source)}</figcaption>` : ''}</figure>`;
  if (type === 'table') {
    const cells = Array.isArray(block.cells) ? block.cells as unknown[][] : undefined;
    const rows = cells
      ? cells.map((row, rowIndex) => `<tr>${row.map((cell) => `<${rowIndex === 0 ? 'th' : 'td'}>${rich(cell)}</${rowIndex === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')
      : String(block.rows ?? '').split('\n').filter(Boolean).map((row) => `<tr>${row.split('|').map((cell) => `<td>${safeText(cell.trim())}</td>`).join('')}</tr>`).join('');
    return `<table><tbody>${rows}</tbody></table>`;
  }
  if (type === 'audio') return `<audio controls src="${esc(block.src)}"></audio>`;
  if (type === 'video') return `<video controls src="${esc(block.src)}"></video>`;
  if (type === 'icon') return `<span class="lp-modern-icon" aria-label="${esc(block.label)}">${safeText(block.icon || '✦')}</span>`;
  if (type === 'button') return `<p class="lp-modern-buttons">${(Array.isArray(block.buttonsHtml) ? block.buttonsHtml : String(block.buttons ?? '按钮').split('\n')).map((item) => `<a href="${safeHref(block.href)}">${rich(item)}</a>`).join('')}</p>`;
  if (type === 'columns') {
    const columns = Array.isArray(block.columns) ? block.columns.slice(0, 3) : [
      { type: 'paragraph', contentHtml: block.leftHtml ?? block.left ?? '' },
      { type: 'paragraph', contentHtml: block.rightHtml ?? block.right ?? '' }
    ];
    return `<div class="lp-modern-columns lp-modern-columns-${Math.max(1, columns.length)}">${columns.map((child) => `<div class="lp-modern-column">${renderStored((child || { type: 'paragraph' }) as Record<string, unknown>)}</div>`).join('')}</div>`;
  }
  if (type === 'spacer') return `<div class="lp-modern-spacer" style="height:${Math.max(8, Math.min(400, Number(block.size) || 48))}px"></div>`;
  if (type === 'image') return `<figure><img src="${esc(block.src)}" alt="${esc(block.alt)}"></figure>`;
  return undefined;
}

function renderStored(block: Record<string, unknown>): string {
  if (String(block.type ?? '') === 'custom-html') {
    const decoded = readMarker(block.content);
    if (decoded) return renderModern(decoded) ?? renderStored(decoded);
    return String(block.content ?? '');
  }
  return renderModern(block) ?? fallbackBlock(block);
}

function fallbackBlock(block: Record<string, unknown>): string {
  const type = String(block.type ?? '');
  if (type === 'blockquote') return `<blockquote>${safeText(block.content)}</blockquote>`;
  if (type === 'image') return `<figure><img src="${esc(block.src)}" alt="${esc(block.alt ?? '')}"></figure>`;
  return String(block.content ?? '');
}

/** 渲染整份页面内容（现代标记块 + 普通块混合）。 */
export function renderPageHtml(contentJson: unknown): string {
  let blocks: unknown;
  try { blocks = typeof contentJson === 'string' ? JSON.parse(contentJson) : contentJson; }
  catch { blocks = []; }
  if (!Array.isArray(blocks)) return '';
  return blocks.map((block) => renderStored((block || {}) as Record<string, unknown>)).join('\n');
}

export { MARKER, readMarker, renderModern, renderStored };
export type { Block };