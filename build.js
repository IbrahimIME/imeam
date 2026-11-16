// Builds the site: copies site/ to dist/, generates pages from content/ and expands these placeholders:
//   <site-header home="index.html" logo="ime" cta-href="#contact" cta="Get a quote">…menu links…</site-header>
//   <site-footer></site-footer>
//   <site-resources limit="6"></site-resources>   the newest featured resources as cards
//   <site-materials></site-materials>             the materials catalogue grid
//   <site-printers></site-printers>               the printer cards
//   <site-count of="materials|printers"></site-count>
// Partials live in partials/. {{name}} in a partial or template is replaced by the value of that name,
// {{menu}} by the element's inner HTML, {{logo}} by partials/logo-<logo>.svg and {{ime45}} by partials/ime45.svg.
// <!--if:name-->…<!--/if:name--> in a template is dropped when that value is empty.
// Content is the JSON Decap CMS writes to content/<collection>/ (see site/admin/config.yml):
//   resources → resources.html plus one <page>-<slug>.html per entry with an article body
//   printers  → cards, plus printer-<slug>.html from templates/printer.html when "Product page" is on
//   materials → the materials.html grid
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'site');
const OUT = path.join(ROOT, 'dist');
const PARTIALS = path.join(ROOT, 'partials');
const TEMPLATES = path.join(ROOT, 'templates');
const CONTENT = path.join(ROOT, 'content');

// Must match the collection folders in site/admin/config.yml
const TYPES = [
  { dir: 'case-studies', page: 'case-study', label: 'Case studies', one: 'Case study' },
  { dir: 'webinars', page: 'webinar', label: 'Webinars', one: 'Webinar' },
  { dir: 'blog', page: 'blog', label: 'Blog', one: 'Blog', more: 'More blog posts' },
  { dir: 'ebooks', page: 'ebook', label: 'eBooks', one: 'eBook' },
  { dir: 'white-papers', page: 'white-paper', label: 'White papers', one: 'White paper' },
  { dir: 'videos', page: 'video', label: 'Videos', one: 'Video' },
  { dir: 'spec-sheets', page: 'spec-sheet', label: 'Spec sheets', one: 'Spec sheet' },
  { dir: 'safety-data-sheets', page: 'sds', label: 'Safety data sheets', one: 'Safety data sheet' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Must match the technology and filter options of the printers and materials collections
const TECH = { fdm: 'FDM', polyjet: 'PolyJet', p3: 'P3 DLP', saf: 'SAF', sla: 'SLA' };
const PRINTER_FILTERS = ['production', 'tooling', 'prototyping', 'medical', 'dental', 'design', 'education'];
const FORM_OPTIONS = ['Production parts', 'Tooling, jigs & fixtures', 'Prototyping'];

const partial = name => fs.readFileSync(path.join(PARTIALS, name), 'utf8').replace(/\r?\n$/, '');

const attrs = str => {
  const out = {};
  for (const m of str.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};

const fill = (tpl, vars, file) => tpl
  .replace(/<!--if:([\w-]+)-->([\s\S]*?)<!--\/if:\1-->/g, (_, k, inner) => (vars[k] ? inner : ''))
  .replace(/\{\{([\w-]+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`${file}: missing value for {{${k}}}`);
    return vars[k];
  });

const shared = logo => ({ logo: partial(`logo-${logo}.svg`), ime45: partial('ime45.svg') });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// CMS paths are root-absolute (/assets/uploads/…); pages sit at the site root, so make them relative.
// Anything that isn't http(s), mailto/tel, an anchor or a site path is rejected.
function url(u, where) {
  u = String(u ?? '').trim();
  if (!u) return '';
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) throw new Error(`${where}: unsafe URL "${u}"`);
  return u.replace(/^\/+/, '');
}

// For url('…') inside a style attribute: quotes, brackets and spaces would end the CSS string
const cssUrl = u => u.replace(/['"()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));

const list = v => (Array.isArray(v) ? v.filter(Boolean) : []);

// Published entries of one collection folder: the JSON plus its slug (file name) and path for error messages
function readEntries(dirName, required) {
  const dir = path.join(CONTENT, dirName);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const where = `content/${dirName}/${f}`;
    const e = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const slug = f.slice(0, -5);
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${where}: file name must be lowercase letters, digits and dashes`);
    if (!e.draft && !e[required]) throw new Error(`${where}: missing ${required}`);
    return { ...e, slug, where };
  }).filter(e => !e.draft);
}

/* ---------- resources ---------- */

function loadResources() {
  const items = [];
  for (const type of TYPES) {
    for (const e of readEntries(type.dir, 'title')) {
      const { where, slug } = e;
      const date = e.date ? String(e.date).slice(0, 10) : '';
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${where}: date must be YYYY-MM-DD`);
      items.push({
        ...e, type, date,
        image: url(e.image, where), file: url(e.file, where), link: url(e.link, where), video: url(e.video, where),
        page: e.body && String(e.body).trim() ? `${type.page}-${slug}.html` : '',
      });
    }
  }
  // newest first; undated last, by title
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title));
}

const fmtDate = d => { const [y, m, day] = d.split('-'); return `${+day} ${MONTHS[m - 1]} ${y}`; };
const meta = e => { const src = e.source || 'IME'; return e.date ? `${src} · ${fmtDate(e.date)}` : `${src} resource`; };
const isExternal = u => /^https?:\/\//i.test(u);

// Card link: the resource's own page, else its download, else its external link
function cardTarget(e) {
  if (e.page) return { href: e.page, ext: false };
  if (e.file) return { href: e.file, ext: true };
  if (e.link) return { href: e.link, ext: isExternal(e.link) };
  return null;
}

function card(e, extra = '') {
  const t = cardTarget(e);
  const tag = t ? 'a' : 'div';
  const href = t ? ` href="${esc(t.href)}"${t.ext ? ' target="_blank" rel="noopener"' : ''}` : '';
  const img = e.image ? `<div class="ph"><img loading="lazy" src="${esc(e.image)}" alt=""></div>` : '';
  const sum = extra && e.summary ? `<p>${esc(e.summary)}</p>` : '';
  return `<${tag} class="card rev${extra ? ' res' : ''}"${extra}${href}>${img}<div class="bd"><span class="k">${esc(e.type.one)}</span><h3>${esc(e.title)}</h3>${sum}<p>${esc(meta(e))}</p></div></${tag}>`;
}

function videoEmbed(v, title) {
  let m;
  if ((m = v.match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i)))
    return `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="${esc(title)}" allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy"></iframe>`;
  // Unlisted Vimeo links (vimeo.com/<id>/<hash>) only play with their hash
  if ((m = v.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:\/([\da-f]+))?/i)))
    return `<iframe src="https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ''}" title="${esc(title)}" allow="picture-in-picture; fullscreen" loading="lazy"></iframe>`;
  if (/\.(mp4|webm)(\?|$)/i.test(v)) return `<video src="${esc(v)}" controls preload="metadata" playsinline></video>`;
  return '';
}

const section = (id, tab, inner) =>
  `<div class="fe-anchor" id="${id}"></div><section class="fe" data-folder data-id="${id}" style="--i:0;--stock:#b7caf7;--ink:#06101f">
<a class="fe-tab" href="#${id}">${esc(tab)} <small>00</small></a>
<div class="fe-sheet"><div class="fe-inner"><div class="sec"><div class="wrap">
${inner}
</div></div></div><div class="fe-shade"></div></div></section><div class="fe-space"></div>`;

const FILTER_JS = `<script>(()=>{let t='all',q='';const g=document.getElementById('rf'),c=document.getElementById('rc'),em=document.getElementById('re');
function apply(){let n=0;document.querySelectorAll('#rgrid .res').forEach(it=>{const s=(t==='all'||it.dataset.t===t)&&(!q||it.dataset.n.includes(q));it.hidden=!s;if(s)n++});c.textContent=n+' shown';em.hidden=n>0;dispatchEvent(new Event('resize'))}
g.querySelectorAll('button.fbtn').forEach(b=>b.addEventListener('click',()=>{g.querySelectorAll('button.fbtn').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));t=b.dataset.f;apply()}));
document.getElementById('rs').addEventListener('input',e=>{q=e.target.value.trim().toLowerCase();apply()});
const h=location.hash.slice(1);const pre=g.querySelector(\`button[data-f="\${h}"]\`);if(pre)pre.click();})();</script>`;

function resourcesPage(items) {
  const count = dir => items.filter(e => e.type.dir === dir).length;
  const btns = [`<button class="fbtn" aria-pressed="true" data-f="all">All</button>`]
    .concat(TYPES.map(t => `<button class="fbtn" aria-pressed="false" data-f="${t.dir}">${esc(t.label)} <small>${count(t.dir)}</small></button>`)).join('');
  const cards = items.map(e => card(e, ` data-t="${e.type.dir}" data-n="${esc(`${e.title} ${e.summary || ''} ${e.source || ''}`.toLowerCase())}"`)).join('');
  const inner = `<div class="head"><div><div class="eyebrow">Resources</div><h1 class="h2">Learn, compare, decide.</h1></div><p class="lead">Case studies, webinars, articles, guides, spec sheets and safety data sheets from IME and Stratasys.</p></div>
<div class="filters" id="rf">${btns}<input class="fbtn" id="rs" type="search" placeholder="Search resources…" aria-label="Search resources" style="min-width:220px;border-radius:999px;padding:8px 14px;background:var(--bg);color:var(--fg)"><span class="count" id="rc">${items.length} shown</span></div>
<div class="grid g3" id="rgrid">${cards}</div><p class="res-empty" id="re"${items.length ? ' hidden' : ''}>No resources here yet.</p>`;
  return {
    title: 'Resources · IME Additive Manufacturing',
    description: 'Case studies, webinars, blog posts, eBooks, white papers, videos, spec sheets and safety data sheets on Stratasys 3D printing from IME.',
    content: section('library', 'Resources', inner),
    scripts: FILTER_JS,
  };
}

function detailPage(e, markdown) {
  const btns = [];
  if (e.file) btns.push(`<a class="btn ar" href="${esc(e.file)}" target="_blank" rel="noopener">Download PDF </a>`);
  if (e.link) btns.push(`<a class="btn${e.file ? ' ghost' : ''}" href="${esc(e.link)}"${isExternal(e.link) ? ' target="_blank" rel="noopener"' : ''}>Read more ↗</a>`);
  btns.push(`<a class="btn ghost" href="resources.html#${e.type.dir}">${esc(e.type.more || `More ${e.type.label}`)}</a>`);
  const vid = e.video && videoEmbed(e.video, e.title);
  if (e.video && !vid) btns.splice(btns.length - 1, 0, `<a class="btn ghost" href="${esc(e.video)}" target="_blank" rel="noopener">Watch video ↗</a>`);
  const inner = `<div class="kline">${esc(e.type.one)}<i></i></div><h1 class="h2">${esc(e.title)}</h1><p class="res-meta">${esc(meta(e))}</p>
${e.summary ? `<p class="lead">${esc(e.summary)}</p>` : ''}<div class="ctas">${btns.join('')}</div>
${vid ? `<div class="res-video">${vid}</div>` : e.image ? `<figure class="res-cover"><img src="${esc(e.image)}" alt=""></figure>` : ''}
<div class="prose">${markdown(e.body, e.where)}</div>`;
  return {
    title: `${esc(e.title)} · IME Additive Manufacturing`,
    description: esc(e.summary || `${e.type.one} from IME Additive Manufacturing.`),
    content: section('top', e.type.one, inner),
    scripts: '',
  };
}

/* ---------- standalone pages (content/pages → <file name>.html, e.g. privacy-policy.html) ---------- */

function standalonePage(e, markdown) {
  const inner = `<h1 class="h2">${esc(e.title)}</h1>${e.updated ? `<p class="res-meta">Last updated ${esc(fmtDate(e.updated))}</p>` : ''}
<div class="prose">${markdown(e.body, e.where)}</div>`;
  return {
    title: `${esc(e.title)} · IME Additive Manufacturing`,
    description: esc(e.summary || e.title),
    content: section('top', e.title, inner),
    scripts: '',
  };
}

/* ---------- materials ---------- */

const techOf = (e, allowed = TECH) => {
  if (!allowed[e.technology]) throw new Error(`${e.where}: unknown technology "${e.technology}"`);
  return e.technology;
};
const techOrder = t => Object.keys(TECH).indexOf(t);

function loadMaterials() {
  return readEntries('materials', 'name')
    .map(e => ({ ...e, technology: techOf(e), tags: list(e.tags) }))
    .sort((a, b) => techOrder(a.technology) - techOrder(b.technology) || a.name.localeCompare(b.name));
}

const materialCard = m =>
  `<div class="card hov mat" data-t="${m.technology}" data-n="${esc(m.name.toLowerCase())}"><div class="bd" style="padding:16px"><span class="k">${TECH[m.technology]}</span><h3 style="font-size:1rem">${esc(m.name)}</h3>
<div class="meta">${m.tags.map(t => `<span class="chip" style="font-size:.7rem;padding:4px 8px">${esc(t)}</span>`).join('')}</div></div></div>`;

/* ---------- printers ---------- */

function loadPrinters() {
  return readEntries('printers', 'name').map(e => {
    const filters = list(e.applications);
    const bad = filters.find(f => !PRINTER_FILTERS.includes(f));
    if (bad) throw new Error(`${e.where}: unknown filter "${bad}"`);
    return {
      ...e, technology: techOf(e), applications: filters, image: url(e.image, e.where),
      alt: e.image_alt || `Stratasys ${e.name} 3D printer`,
      product: e.page && e.page.enabled ? e.page : null,
      page: e.page && e.page.enabled ? `printer-${e.slug}.html` : '',
    };
  }).sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.name.localeCompare(b.name));
}

// Homepage card, or the shorter card in a product page's "Compare" row
function printerCard(p, compare = false) {
  const open = p.page ? `<a class="card rev" href="${p.page}"` : '<div class="card hov rev"';
  const close = p.page ? '</a>' : '</div>';
  const img = p.image ? `<div class="ph white"><img loading="lazy" src="${esc(p.image)}" alt="${esc(p.alt)}"></div>` : '';
  const head = `<span class="k">${TECH[p.technology]}</span><h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p>`;
  if (compare) return `${open}>${img}<div class="bd">${head}</div>${close}`;
  const meta = (p.new ? '<span class="tag new">New to IME site</span>' : '') + (p.page ? '<span class="chip ss">Product page →</span>' : '');
  return `${open} data-t="${esc([p.technology, ...p.applications].join(' '))}">${img}\n<div class="bd">${head}<div class="meta">${meta}</div></div>${close}`;
}

// Values for templates/printer.html. Optional parts render as '' and their sections drop out via <!--if:…-->.
function printerPage(p, printers) {
  const g = p.product, where = p.where, tech = TECH[p.technology];
  const [facts, features, benefits, specs, apps] = [g.facts, g.features, g.benefits, g.specs, g.applications].map(list);
  const svc = arr => arr.map(x => `<div class="svc rev"><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div>`).join('');
  const spec = url(g.spec_sheet, where);
  const featureImage = url(g.feature_image, where);
  let compare = list(g.compare).map(s => printers.find(x => x.slug === s)).filter(x => x && x !== p);
  if (!compare.length) compare = printers.filter(x => x !== p && x.technology === p.technology).slice(0, 3);
  const options = list(g.form_options).length ? list(g.form_options) : FORM_OPTIONS;
  return {
    title: esc(`${g.page_title || `${p.name} ${tech}`} · IME Additive Manufacturing`),
    description: esc(g.description || p.summary),
    name: esc(p.name),
    video: esc(url(g.video, where)),
    'hero-image': esc(cssUrl(url(g.hero_image, where) || p.image)),
    strip: `<i></i>${tech}` + (g.category ? `<i></i>${esc(g.category)}` : ''),
    eyebrow: esc(g.eyebrow || `Stratasys ${p.name} · ${tech}`),
    headline: esc(g.headline || p.name) + (g.headline_em ? ` <em>${esc(g.headline_em)}</em>` : ''),
    lead: esc(g.lead || p.summary),
    'spec-cta': spec ? `<a class="btn ghost" href="${esc(spec)}" target="_blank" rel="noopener">Spec sheet ↗</a>` : '',
    facts: (facts.length ? `<div class="facts rev">${facts.map(f => `<div><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join('')}</div>` : '')
      + (g.footnote ? `\n<p style="font-size:.74rem;color:var(--dim);margin-top:14px">${esc(g.footnote)}</p>` : ''),
    'has-features': features.length || benefits.length || featureImage ? '1' : '',
    'features-heading': esc(g.features_heading || `Why the ${p.name}`),
    features: features.length ? `<div class="grid" style="gap:10px;margin-top:20px">${svc(features)}</div>` : '',
    'feature-media': featureImage
      ? `<div class="media-frame rev"><img src="${esc(featureImage)}" alt="${esc(g.feature_image_alt)}" style="width:100%;height:100%;object-fit:cover">${g.feature_caption ? `<span class="cap">${esc(g.feature_caption)}</span>` : ''}</div>\n` : '',
    benefits: benefits.length ? `<div class="eyebrow ss" style="margin-top:32px">Benefits</div><div class="grid g2" style="margin-top:12px">${svc(benefits)}</div>` : '',
    'has-specs': specs.length ? '1' : '',
    'specs-heading': esc(g.specs_heading || `${p.name} at a glance`),
    'spec-btn': spec ? `\n<a class="btn ss" href="${esc(spec)}" target="_blank" rel="noopener">Download spec sheet ↗</a>` : '',
    specs: specs.map(s => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join(''),
    'has-applications': apps.length ? '1' : '',
    'applications-image': esc(cssUrl(url(g.applications_image, where))),
    'applications-heading': esc(g.applications_heading || `What teams make with the ${p.name}.`),
    'applications-text': esc(g.applications_text),
    applications: `<div class="grid g3">${apps.map(a => `<div class="card hov rev">${a.image ? `<div class="ph"><img loading="lazy" src="${esc(url(a.image, where))}" alt=""></div>` : ''}<div class="bd"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div></div>`).join('')}</div>`,
    compare: compare.map(x => printerCard(x, true)).join(''),
    'compare-heading': esc(g.compare_heading || `Other ${tech} systems`),
    'pricing-heading': esc(g.pricing_heading || `Get ${p.name} pricing and expert guidance.`),
    'pricing-text': esc(g.pricing_text || 'Talk to a specialist about your application. We’ll walk through pricing and a test print of your own part at AMIC.'),
    'form-options': options.map(o => `<option>${esc(o)}</option>`).join(''),
  };
}

// Markdown → HTML. Editors are signed-in staff, but raw HTML is still escaped and links/images go through url();
// an unsafe link in an article is dropped with a warning rather than failing the whole build.
async function markdownRenderer() {
  const { Marked } = await import('marked');
  let where = '';
  const safe = u => { try { return url(u, where); } catch (err) { console.warn(`warning: ${err.message} (link removed)`); return '#'; } };
  const md = new Marked({
    gfm: true,
    renderer: { html: t => esc(t.text) },
    walkTokens: t => { if (t.type === 'link' || t.type === 'image') t.href = safe(t.href); },
  });
  return (body, file) => { where = file; return md.parse(String(body || '')); };
}

/* ---------- pages ---------- */

function render(html, file, { items, materials, printers }) {
  const header = partial('header.html');
  const footer = partial('footer.html');
  const counts = { materials: materials.length, printers: printers.length };
  return html
    .replace(/<site-resources\b([^>]*)><\/site-resources>/g, (_, a) => {
      const limit = parseInt(attrs(a).limit, 10) || 6;
      return `<div class="grid g3">${items.filter(e => e.featured).slice(0, limit).map(e => card(e)).join('')}</div>`;
    })
    .replace(/<site-materials><\/site-materials>/g, () => `<div class="grid g4" id="mgrid">${materials.map(materialCard).join('')}</div>`)
    .replace(/<site-printers><\/site-printers>/g, () => printers.map(p => printerCard(p)).join(''))
    .replace(/<site-count of="(\w+)"><\/site-count>/g, (_, k) => {
      if (!(k in counts)) throw new Error(`${file}: unknown <site-count of="${k}">`);
      return counts[k];
    })
    .replace(/<site-header\b([^>]*)>([\s\S]*?)<\/site-header>/g, (_, a, menu) => {
      const v = { home: 'index.html', logo: 'ime', ...attrs(a) };
      return fill(header, { ...v, ...shared(v.logo), menu }, file);
    })
    .replace(/<site-footer\b[^>]*><\/site-footer>/g, () => fill(footer, shared('ime'), file));
}

async function main() {
  const data = { items: loadResources(), materials: loadMaterials(), printers: loadPrinters() };
  const markdown = await markdownRenderer();
  const template = name => fs.readFileSync(path.join(TEMPLATES, name), 'utf8');
  const frame = template('page.html'), printerTpl = template('printer.html');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true });

  const pages = { 'resources.html': [frame, resourcesPage(data.items)] };
  const add = (file, tpl, vars) => {
    if (pages[file]) throw new Error(`${file}: two entries generate the same page`);
    pages[file] = [tpl, vars];
  };
  for (const e of data.items) if (e.page) add(e.page, frame, detailPage(e, markdown));
  for (const p of data.printers) if (p.page) add(p.page, printerTpl, printerPage(p, data.printers));
  for (const e of readEntries('pages', 'title')) if (!e.draft) add(`${e.slug}.html`, frame, standalonePage(e, markdown));
  for (const [file, [tpl, vars]] of Object.entries(pages)) {
    if (fs.existsSync(path.join(OUT, file))) throw new Error(`${file}: generated page would overwrite a page in site/`);
    fs.writeFileSync(path.join(OUT, file), fill(tpl, vars, file));
  }

  for (const file of fs.readdirSync(OUT).filter(f => f.endsWith('.html'))) {
    const p = path.join(OUT, file);
    const html = render(fs.readFileSync(p, 'utf8'), file, data);
    if (/<site-[a-z]+\b/.test(html)) throw new Error(`${file}: unexpanded placeholder`);
    fs.writeFileSync(p, html);
    console.log(`built ${file}`);
  }
  console.log(`${data.items.length} resources, ${data.materials.length} materials, ${data.printers.length} printers`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
