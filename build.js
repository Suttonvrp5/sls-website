/**
 * Samui Luxury Stays — static site build script
 * ------------------------------------------------
 * Plain Node.js, no npm dependencies. Reads villa listings from
 * content/villas/*.json (managed through the /admin CMS by staff),
 * injects generated HTML into villas.html and index.html between
 * marker comments, and copies everything else into _site/ unchanged.
 *
 * Run with: node build.js
 * Netlify runs this automatically on every publish (see netlify.toml).
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, 'content', 'villas');
const PAGES_DIR = path.join(ROOT, 'content', 'pages');
const SETTINGS_FILE = path.join(ROOT, 'content', 'settings.json');
const OUT_DIR = path.join(ROOT, '_site');

// ---------- helpers ----------
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadVillas() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json'));
  const villas = files.map(f => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8');
    try {
      const data = JSON.parse(raw);
      data._file = f;
      return data;
    } catch (e) {
      console.error(`⚠️  Skipping ${f} — invalid JSON: ${e.message}`);
      return null;
    }
  }).filter(Boolean);
  villas.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return villas;
}

function slugify(filename) {
  return filename.replace(/\.json$/i, '');
}

// Loads a JSON content file. Returns {} if missing, so a missing/not-yet-
// created page file never crashes the build — it just leaves that page's
// {{CMS:...}} tokens and markers untouched (falls back to whatever is
// already baked into the HTML template).
function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`⚠️  Skipping ${filePath} — invalid JSON: ${e.message}`);
    return {};
  }
}

// Replaces every {{CMS:key}} token in html with the (escaped) value of
// data[key], for simple single-value fields — page text, phone numbers,
// image URLs, form IDs. Used for both page-specific content and the
// site-wide settings pass. Leaves unknown tokens alone rather than
// erroring, so a field that hasn't been added to a page's JSON yet just
// shows its original template text.
function injectTokens(html, data) {
  if (!data) return html;
  return html.replace(/\{\{CMS:([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(data, key) ? esc(data[key]) : match;
  });
}

// Replaces the content between <!--CMS:key--> and <!--/CMS:key--> markers
// with the (escaped) value of data[key]. Used for text blocks that live
// inside visible page content rather than inside an HTML attribute.
function injectCommentFields(html, data) {
  if (!data) return html;
  return html.replace(/<!--CMS:([a-zA-Z0-9_]+)-->[\s\S]*?<!--\/CMS:\1-->/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return match;
    return `<!--CMS:${key}-->${esc(data[key])}<!--/CMS:${key}-->`;
  });
}

const CURRENCY_SYMBOLS = { USD: '$', THB: '฿', EUR: '€', GBP: '£' };
function formatPrice(amount, currency) {
  if (typeof amount !== 'number') return '';
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  return `${symbol}${amount.toLocaleString('en-US')}`;
}
function listingTypes(v) {
  return Array.isArray(v.listing_type) && v.listing_type.length ? v.listing_type : ['Rental'];
}

// Normalizes an uploaded image path so it works from ANY page depth
// (site root like villas.html, or one level deep like villas/<slug>.html).
// Full URLs (http/https/data:) and already-absolute paths (leading "/")
// are left alone; a bare relative path like "assets/img/villas/x.png"
// gets a leading "/" added so it always resolves from the site root,
// regardless of which folder the page referencing it lives in.
function resolveImg(src) {
  const s = (src || '').trim();
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s) || s.startsWith('/')) return s;
  return '/' + s;
}

function villaCard(v, opts) {
  opts = opts || {};
  const href = opts.href || 'contact.html';
  const cls = ['vcard', 'reveal'];
  if (opts.tall) cls.push('tall');
  const types = listingTypes(v);
  const dataType = types.map(t => t === 'For Sale' ? 'sale' : 'rental').join(' ');
  types.forEach(t => cls.push(t === 'For Sale' ? 'vc-sale' : 'vc-rental'));
  const imageSrc = resolveImg((v.image_url && v.image_url.trim()) ? v.image_url.trim() : (v.image || ''));
  const metaBits = [`<span>${esc(v.bedrooms)} Bedrooms</span>`, `<span>${esc(v.feature)}</span>`];
  const amenities = Array.isArray(v.amenities) ? v.amenities.slice(0, 3) : [];
  const pills = amenities.length
    ? `<div class="vpills">${amenities.map(a => `<span>${esc(a)}</span>`).join('')}</div>`
    : '';
  const forSale = types.includes('For Sale');
  const saleBadge = forSale
    ? `<div class="vsale-badge">${formatPrice(v.sale_price, v.sale_currency) || 'For Sale'}</div>`
    : '';
  return `<a href="${href}" class="${cls.join(' ')}" data-type="${dataType}"><div class="vimg" style="background-image:url('${esc(imageSrc)}')"></div><div class="vgrad"></div>${saleBadge}<div class="vbody"><span class="vtag">${esc(v.area)} · ${esc(v.style)}</span><h3>${esc(v.name)}</h3><div class="vmeta">${metaBits.join('')}</div>${pills}</div></a>`;
}

// ---------- villa detail page ----------
const SITE_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="../assets/css/styles.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>`;

const SITE_HEADER = `<header id="hdr" class="solid">
  <div class="wrap nav">
    <a href="../index.html" class="brand" aria-label="Samui Luxury Stays home"><img src="../assets/img/logo-icon-new.png" alt="Samui Luxury Stays" class="brand-logo" /><span class="brand-txt"><b>SAMUI LUXURY STAYS</b></span></a>
    <nav class="nav-links" id="menu">
      <a href="../index.html">Home</a>
      <a href="../services.html">Services</a>
      <a href="../villas.html" class="active">Villas</a>
      <a href="../relocation.html">Relocation</a>
      <a href="../journal.html">Journal</a>
      <a href="../about.html">About</a>
      <a href="../contact.html" class="nav-cta">Request a Consultation</a>
    </nav>
    <button class="burger" id="burger" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</header>`;

const SITE_FOOTER = `<footer>
  <div class="wrap">
    <div class="foot-top">
      <div class="foot-brand"><a href="../index.html" class="brand"><img src="../assets/img/logo-icon-new.png" alt="Samui Luxury Stays" class="brand-logo" /><span class="brand-txt"><b>SAMUI LUXURY STAYS</b></span></a><p>Luxury villa management for exceptional homes across Koh Samui, Thailand. Protecting your investment, elevating every stay.</p></div>
      <div class="foot-col"><h5>Services</h5><a href="../services.html#management">Property Management</a><a href="../services.html#rentals">Villa Rentals</a><a href="../services.html#concierge">Concierge</a><a href="../services.html#maintenance">Maintenance</a></div>
      <div class="foot-col"><h5>Company</h5><a href="../relocation.html">Relocation Search</a><a href="../index.html#why">Why Samui Luxury Stays</a><a href="../about.html">About Us</a><a href="../villas.html">Featured Villas</a><a href="../contact.html">Contact</a></div>
      <div class="foot-col"><h5>Visit</h5><a href="../contact.html">Bophut, Koh Samui</a><a href="../contact.html">Surat Thani 84320</a><a href="../contact.html">Thailand</a><a href="mailto:owners@samuiluxurystays.com">owners@samuiluxurystays.com</a></div>
    </div>
    <div class="foot-bot">
      <p>© <span id="year">2026</span> Samui Luxury Stays. All rights reserved.</p>
      <div class="foot-social">
        <a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>
        <a href="#" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 014 0v4"/></svg></a>
        <a href="mailto:owners@samuiluxurystays.com" aria-label="Email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></a>
      </div>
    </div>
  </div>
</footer>`;

function villaDetailPage(v, slug, allVillas) {
  const coverSrc = resolveImg((v.image_url && v.image_url.trim()) ? v.image_url.trim() : (v.image || ''));
  const galleryImgs = Array.isArray(v.gallery)
    ? v.gallery.map(g => {
        if (typeof g === 'string') return resolveImg(g) || null; // older/alternate CMS format: plain string
        return (g && typeof g.image === 'string') ? resolveImg(g.image) || null : null;
      }).filter(Boolean)
    : [];
  const allImages = [...new Set([coverSrc, ...galleryImgs].filter(Boolean))];
  const amenities = Array.isArray(v.amenities) ? v.amenities : [];
  const chips = amenities.length
    ? `<div class="chip-row">${amenities.map(a => `<span class="chip">${esc(a)}</span>`).join('')}</div>`
    : '';
  const paras = String(v.description || '')
    .split(/\n+/).filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`).join('');

  const types = listingTypes(v);
  const isForSale = types.includes('For Sale');
  const isRental = types.includes('Rental');
  const priceStr = formatPrice(v.sale_price, v.sale_currency);
  const typeBadges = types.map(t =>
    `<span class="chip" style="${t === 'For Sale' ? 'background:var(--gold);color:var(--navy);border-color:var(--gold)' : ''}">${esc(t)}</span>`
  ).join(' ');
  const hasLoc = v.location && typeof v.location.lat === 'number' && typeof v.location.lng === 'number';
  const mapBlock = hasLoc
    ? `<div class="villa-map" id="villaMap"></div>
    <script>
      (function(){
        var m = L.map('villaMap', {scrollWheelZoom:false}).setView([${v.location.lat}, ${v.location.lng}], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
        }).addTo(m);
        L.marker([${v.location.lat}, ${v.location.lng}]).addTo(m)
          .bindPopup(${JSON.stringify(`<b>${v.name}</b><br>${v.area}, Koh Samui`)});
      })();
    </script>`
    : `<div class="villa-map" style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.9rem;background:var(--grey)">Map location coming soon</div>`;

  // Floor plans — optional list of labelled images, opens full-size on click.
  const floorplans = Array.isArray(v.floorplans)
    ? v.floorplans.filter(fp => fp && fp.image)
    : [];
  const floorplansSection = floorplans.length
    ? `<section class="pad">
  <div class="wrap">
    <div class="head-row reveal"><span class="eyebrow">Layout</span><h2>Floor <em>plans.</em></h2></div>
    <div class="floorplan-grid" style="margin-top:36px">
      ${floorplans.map(fp => `<div class="floorplan-card reveal"><a href="${esc(resolveImg(fp.image))}" target="_blank" rel="noopener"><img src="${esc(resolveImg(fp.image))}" alt="${esc(fp.label || 'Floor plan')}" loading="lazy" /><div class="fp-label">${esc(fp.label || 'Floor Plan')}</div></a></div>`).join('\n      ')}
    </div>
  </div>
</section>`
    : '';

  // Picture slider — plain HTML/CSS/JS, no dependencies. Falls back to a
  // single static image automatically when there's only one photo.
  const sliderBlock = allImages.length > 1
    ? `<div class="vslider" id="vslider" data-index="0">
    <div class="vslider-track" id="vsliderTrack">
      ${allImages.map(src => `<img src="${esc(src)}" alt="${esc(v.name)}" loading="lazy" />`).join('\n      ')}
    </div>
    <button class="vslider-btn vslider-prev" id="vsliderPrev" aria-label="Previous photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
    <button class="vslider-btn vslider-next" id="vsliderNext" aria-label="Next photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
