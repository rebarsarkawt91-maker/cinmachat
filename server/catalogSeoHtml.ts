import type { CatalogSeoMetadata } from '../src/lib/catalogSeo';

export const escapeSeoHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Same HTML for visitors and crawlers; React replaces the readable fallback. */
export function renderCatalogHtml(template: string, seo: CatalogSeoMetadata,
  links: { href: string; title: string }[] = []): string {
  const escape = escapeSeoHtml;
  let html = template.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');
  html = html.replace(/<meta\b[^>]*(?:name|property)=["'](?:description|keywords|og:title|og:description|og:image|og:url|og:type|twitter:card|twitter:title|twitter:description|twitter:image)["'][^>]*>/gi, '');
  html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '');
  html = html.replace(/<script\b[^>]*id=["']cinemachat-movie-jsonld["'][^>]*>[\s\S]*?<\/script>/gi, '');
  const json = JSON.stringify(seo.schema).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const meta = `<title>${escape(seo.title)}</title>
    <meta name="description" content="${escape(seo.description)}">
    <link rel="canonical" href="${escape(seo.canonical)}">
    <meta property="og:title" content="${escape(seo.title)}">
    <meta property="og:description" content="${escape(seo.description)}">
    <meta property="og:url" content="${escape(seo.canonical)}">
    <meta property="og:image" content="${escape(seo.image)}">
    <meta property="og:type" content="${seo.kind === 'Movie' ? 'video.movie' : seo.kind === 'TVEpisode' ? 'video.episode' : 'website'}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escape(seo.title)}">
    <meta name="twitter:description" content="${escape(seo.description)}">
    <meta name="twitter:image" content="${escape(seo.image)}">
    <script id="cinemachat-movie-jsonld" type="application/ld+json">${json}</script>`;
  html = html.replace('</head>', () => `${meta}\n</head>`);
  const safeLinks = links.filter(link => {
    try { return new URL(link.href).origin === new URL(seo.canonical).origin; } catch { return false; }
  });
  const body = `<main dir="rtl" lang="ckb" style="max-width:960px;margin:auto;padding:32px;color:white;background:#090909;font-family:system-ui;line-height:1.8">
    <nav><a href="/" style="color:#ef4444">سینەما چات</a></nav>
    <h1>${escape(seo.heading)}</h1><p>${escape(seo.description)}</p>
    ${safeLinks.length ? `<nav aria-label="فیلم و دراماکانی پەیوەندیدار"><ul>${safeLinks.map(link => `<li><a style="color:#f5f5f5" href="${escape(link.href)}">${escape(link.title)}</a></li>`).join('')}</ul></nav>` : ''}
    </main>`;
  return html.replace(/<div\s+id=["']root["']\s*>\s*<\/div>/, () => `<div id="root">${body}</div>`);
}
