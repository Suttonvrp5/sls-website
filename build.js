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

// Diagonal "Rented" / "Sold" ribbon shown across a villa's photo — on its
// card (villas.html, index.html) and on its own detail page — whenever
// staff set Status to something other than "Available" in /admin.
function statusRibbon(v) {
  const status = v.status;
  if (status !== 'Rented' && status !== 'Sold') return '';
  const cls = status === 'Sold' ? 'sold' : 'rented';
  return `<div class="status-ribbon ${cls}">${esc(status)}</div>`;
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
  return `<a href="${href}" class="${cls.join(' ')}" data-type="${dataType}"><div class="vimg" style="background-image:url('${esc(imageSrc)}')"></div><div class="vgrad"></div>${statusRibbon(v)}${saleBadge}<div class="vbody"><span class="vtag">${esc(v.area)} · ${esc(v.style)}</span><h3>${esc(v.name)}</h3><div class="vmeta">${metaBits.join('')}</div>${pills}</div></a>`;
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

// Plays the browser's own video player for a video file (uploaded in admin, or a direct https link).
function fileVideo(src, poster) {
  const type = /\.webm(\?|$)/i.test(src) ? 'video/webm' : 'video/mp4';
  return `<div class="vvideo"><video controls playsinline preload="metadata"${poster ? ` poster="${esc(poster)}"` : ''}><source src="${esc(src)}" type="${type}" />Your browser can't play this video.</video></div>`;
}

// Turns a pasted YouTube or Vimeo link into a safe, responsive embed.
// Returns '' for blank or unrecognised links, so a bad link never breaks a page.
function videoEmbed(url, title, poster) {
  const u = String(url || '').trim();
  if (!u) return '';
  let src = '';
  let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i))) {
    src = `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
  } else if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([A-Za-z0-9]+))?/i))) {
    src = `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ''}`;
  }
  if (!src) {
    // A direct link to a video file (.mp4 / .webm / .mov / .m4v) plays in the browser's own player
    if (/^https:\/\/[^\s"'<>]+\.(mp4|webm|mov|m4v)(\?[^\s"'<>]*)?$/i.test(u)) return fileVideo(u, poster);
    return '';
  }
  return `<div class="vvideo"><iframe src="${esc(src)}" title="${esc(title || 'Villa video tour')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

// Social share row (Facebook, WhatsApp, LinkedIn, copy link, native share on phones).
// Used on villa pages and journal articles. Needs the page's ABSOLUTE url.
function buildShareBlock(pageUrl, shareText, label) {
  const eu = encodeURIComponent;
  return `<div class="share-row">
        <span class="share-label">${esc(label)}</span>
        <div class="share-btns">
          <a href="https://www.facebook.com/sharer/sharer.php?u=${eu(pageUrl)}" target="_blank" rel="noopener" aria-label="Share on Facebook" title="Facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5H16l.5-3h-3V8.6c0-.9.3-1.5 1.6-1.5H16.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21z"/></svg></a>
          <a href="https://wa.me/?text=${eu(shareText + ' ' + pageUrl)}" target="_blank" rel="noopener" aria-label="Share on WhatsApp" title="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3zm0 1.7a7.3 7.3 0 1 1-3.8 13.5l-.3-.2-2.4.6.6-2.3-.2-.3A7.3 7.3 0 0 1 12 4.7zm-3 3.6c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 2.2.9 2.6.7 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3l-1.6-.8c-.2-.1-.4-.1-.6.1l-.7.9c-.1.2-.3.2-.5.1-.3-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4z"/></svg></a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${eu(pageUrl)}" target="_blank" rel="noopener" aria-label="Share on LinkedIn" title="LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.2 8.5H8V19H5.2zM6.6 4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM10 8.5h2.7v1.4c.4-.7 1.3-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V19H17v-5c0-1.2 0-2.7-1.7-2.7s-1.9 1.3-1.9 2.6V19H10z"/></svg></a>
          <button type="button" id="shareCopy" aria-label="Copy link" title="Copy link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></button>
          <button type="button" id="shareNative" aria-label="More sharing options" title="More" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg></button>
        </div>
        <span class="share-note" id="shareNote" aria-live="polite"></span>
      </div>
      <script>
        (function(){
          var url = ${JSON.stringify(pageUrl)}, title = ${JSON.stringify(shareText)};
          var note = document.getElementById('shareNote');
          function say(t){ note.textContent = t; setTimeout(function(){ note.textContent = ''; }, 2200); }
          document.getElementById('shareCopy').addEventListener('click', function(){
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(function(){ say('Link copied'); }, function(){ say(url); });
            } else { say(url); }
          });
          if (navigator.share) {
            var b = document.getElementById('shareNative');
            b.hidden = false;
            b.addEventListener('click', function(){ navigator.share({title: title, url: url}).catch(function(){}); });
          }
        })();
      </script>`;
}

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
    <button class="vslider-btn vslider-next" id="vsliderNext" aria-label="Next photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
    <div class="vslider-dots" id="vsliderDots">
      ${allImages.map((_, i) => `<button data-i="${i}" class="${i === 0 ? 'active' : ''}" aria-label="Go to photo ${i + 1}"></button>`).join('')}
    </div>
    <div class="vslider-count"><span id="vsliderCurrent">1</span> / ${allImages.length}</div>
  </div>
  <script>
    (function(){
      var track = document.getElementById('vsliderTrack');
      var dots = document.querySelectorAll('#vsliderDots button');
      var counter = document.getElementById('vsliderCurrent');
      var total = ${allImages.length};
      var i = 0;
      function go(n){
        i = (n + total) % total;
        track.style.transform = 'translateX(-' + (i * 100) + '%)';
        dots.forEach(function(d, idx){ d.classList.toggle('active', idx === i); });
        counter.textContent = i + 1;
      }
      document.getElementById('vsliderPrev').addEventListener('click', function(){ go(i - 1); });
      document.getElementById('vsliderNext').addEventListener('click', function(){ go(i + 1); });
      dots.forEach(function(d){ d.addEventListener('click', function(){ go(parseInt(d.dataset.i, 10)); }); });
      var startX = null;
      track.addEventListener('touchstart', function(e){ startX = e.touches[0].clientX; }, {passive:true});
      track.addEventListener('touchend', function(e){
        if (startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        startX = null;
      }, {passive:true});
    })();
  </script>`
    : `<div class="vslider"><div class="vslider-track"><img src="${esc(coverSrc)}" alt="${esc(v.name)}" /></div></div>`;

  // Social sharing: absolute page URL + cover image (social sites need full URLs)
  const SITE_URL = 'https://www.samuiluxurystays.com';
  const pageUrl = `${SITE_URL}/villas/${slug}.html`;
  const ogImage = !coverSrc ? '' : (/^(https?:)?\/\//i.test(coverSrc) ? coverSrc : SITE_URL + coverSrc);
  const shareText = `${v.name} — ${v.area}, Koh Samui`;
  const shareBlock = buildShareBlock(pageUrl, shareText, 'Share this villa');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link rel="icon" type="image/png" href="../assets/img/favicon.png" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(v.name)} — ${esc(v.area)} | Samui Luxury Stays</title>
<meta name="description" content="${esc(v.name)}: a ${esc(v.bedrooms)}-bedroom ${esc(v.style)} villa in ${esc(v.area)}, Koh Samui, managed by Samui Luxury Stays." />
<link rel="canonical" href="https://www.samuiluxurystays.com/villas/${esc(slug)}.html" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#0B1F3A" />
<meta property="og:site_name" content="Samui Luxury Stays" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(v.name)} — ${esc(v.area)}, Koh Samui" />
<meta property="og:description" content="${esc(v.feature || `${v.bedrooms}-bedroom ${v.style} villa in ${v.area}, Koh Samui`)}" />
<meta property="og:url" content="${esc(pageUrl)}" />
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(v.name)} — ${esc(v.area)}, Koh Samui" />
${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}" />` : ''}
${SITE_HEAD}
</head>
<body>

${SITE_HEADER}

<section class="phero" style="min-height:38vh">
  <div class="phero-bg" style="background-image:url('${esc(coverSrc)}')"></div>
  <div class="phero-overlay"></div>
  ${statusRibbon(v)}
  <div class="wrap">
    <div class="crumb"><a href="../index.html">Home</a> &nbsp;/&nbsp; <a href="../villas.html">Villas</a> &nbsp;/&nbsp; ${esc(v.name)}</div>
    <h1>${esc(v.name)}</h1>
    <p class="psub">${esc(v.area)} · ${esc(v.style)} · ${esc(v.bedrooms)} Bedrooms${isForSale && priceStr ? ` · <span style="color:var(--gold)">${priceStr}</span>` : ''}</p>
  </div>
</section>

<section class="pad" style="padding-bottom:0">
  <div class="wrap">
    ${sliderBlock}
    ${videoEmbed(v.video_url, v.name + ' — video tour', coverSrc) || (v.video_file && /\.(mp4|webm|mov|m4v)$/i.test(String(v.video_file).trim()) ? fileVideo(resolveImg(String(v.video_file).trim()), coverSrc) : '')}
  </div>
</section>

<section class="pad">
  <div class="wrap vdetail-grid">
    <div class="reveal">
      <span class="eyebrow">About This Villa</span>
      <div class="chip-row" style="margin-bottom:16px">${typeBadges}</div>
      <h2>${esc(v.feature)}</h2>
      <div class="vdesc">${paras || '<p>More detail on this villa is coming soon — enquire below and our team will send you the full listing.</p>'}</div>
      ${chips}
      ${isForSale ? `<div class="a-callout" style="margin-top:30px"><b>${priceStr ? priceStr : 'Price on request'}</b><p>${v.ownership_structure ? `Ownership structure: ${esc(v.ownership_structure)}.` : ''} Contact us for full details, viewings and next steps.</p></div>` : ''}
      <div style="margin-top:40px">
        <span class="eyebrow">Location</span>
        <h3 style="font-weight:400;color:var(--navy);margin:10px 0 20px">${esc(v.area)}, Koh Samui</h3>
        ${mapBlock}
      </div>
    </div>
    <div class="vdetail-card reveal" data-d="1">
      <h4>Interested in ${esc(v.name)}?</h4>
      <p>${isForSale && !isRental ? 'Get in touch and our team will send full purchase details, ownership information and next steps.' : 'Get in touch and our team will send full availability, rates and everything else you need.'}</p>
      <a href="../contact.html" class="btn btn-navy" style="width:100%;justify-content:center">${isForSale && !isRental ? 'Enquire About Purchase' : 'Enquire Now'} <span class="arr">→</span></a>
      ${shareBlock}
    </div>
  </div>
</section>

${floorplansSection}

<section class="cta-band">
  <div class="wrap reveal"><span class="eyebrow center">Explore More</span><h2>See more of our <em>villa collection.</em></h2><p>${esc(v.name)} is one of several distinguished homes we manage across Koh Samui.</p><a href="../villas.html" class="btn btn-gold">View All Villas <span class="arr">→</span></a></div>
</section>

${SITE_FOOTER}
<script src="../assets/js/main.js"></script>
</body>
</html>
`;
}

function injectBetweenMarkers(html, startMarker, endMarker, content) {
  const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  if (!pattern.test(html)) {
    console.warn(`⚠️  Markers ${startMarker} / ${endMarker} not found — skipping injection.`);
    return html;
  }
  return html.replace(pattern, `${startMarker}\n${content}\n${endMarker}`);
}

// ---------- page content renderers (Home / About / Services / Relocation) ----------
// These turn the editable lists from content/pages/*.json back into the
// exact same markup the page used to have hard-coded, so staff can add,
// remove or re-word entries from /admin without ever touching a template.

function renderPillars(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((p, i) =>
    `<div class="pillar reveal" data-d="${(i % 4) + 1}"><div class="pn">${String(i + 1).padStart(2, '0')}</div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></div>`
  ).join('\n      ');
}

const HOME_SERVICE_META = [
  { anchor: 'management', icon: 'property-management' },
  { anchor: 'rentals', icon: 'villa-rentals' },
  { anchor: 'concierge', icon: 'concierge' },
  { anchor: 'housekeeping', icon: 'housekeeping' },
  { anchor: 'maintenance', icon: 'maintenance' },
  { anchor: 'poolgarden', icon: 'pool-garden' },
  { anchor: 'reporting', icon: 'owner-reporting' },
  { anchor: 'security', icon: 'security-checks' }
];
function renderServiceCardsHome(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((s, i) => {
    const meta = HOME_SERVICE_META[i] || HOME_SERVICE_META[HOME_SERVICE_META.length - 1];
    return `<a class="svc link reveal" data-d="${(i % 4) + 1}" href="services.html#${meta.anchor}"><div class="ico"><img src="assets/img/icons/${meta.icon}.png" alt="${esc(s.title)}" /></div><div class="svc-bot"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></a>`;
  }).join('\n      ');
}

function renderStats(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((s, i) =>
    `<div class="stat reveal" data-d="${(i % 4) + 1}"><b>${esc(s.prefix || '')}<em>${esc(s.number)}</em>${esc(s.suffix || '')}</b><span>${esc(s.label)}</span></div>`
  ).join('\n    ');
}

function renderTestimonialsScript(items) {
  if (!Array.isArray(items) || !items.length) return '';
  const data = items.map(t => ({ q: t.quote, a: t.author, r: t.role }));
  return `<script>window.SLS_TESTIMONIALS = ${JSON.stringify(data)};</script>`;
}

function renderTeam(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((m, i) => {
    const paras = String(m.bio || '').split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
    return `<div class="member reveal" data-d="${(i % 4) + 1}"><div class="mimg" style="background-image:url('${esc(m.photo)}')"></div><h4>${esc(m.name)}</h4><span>${esc(m.title)}</span>${paras}</div>`;
  }).join('\n      ');
}

const VALUE_ICONS = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19V5h16v14M8 19v-6h3v6m2 0v-9h3v9"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6L9 17l-5-5"/></svg>'
];
function renderValues(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((v, i) =>
    `<div class="value reveal" data-d="${(i % 4) + 1}"><div class="vi">${VALUE_ICONS[i % VALUE_ICONS.length]}</div><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p></div>`
  ).join('\n      ');
}

function renderServiceRows(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((s, i) => {
    const flip = i % 2 === 1 ? ' flip' : '';
    const bullets = Array.isArray(s.bullets) ? s.bullets.map(b => `<li>${esc(b)}</li>`).join('') : '';
    return `    <div class="srow${flip} reveal" id="${esc(s.anchor)}">
      <div class="srow-media" style="background-image:url('${esc(s.image)}')"></div>
      <div><div class="sn">${esc(s.label)}</div><h3>${esc(s.heading)}</h3><p>${esc(s.paragraph)}</p><ul>${bullets}</ul></div>
    </div>`;
  }).join('\n\n');
}

function renderPricingTiers(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((t, i) => {
    const isFeat = t.tag && t.tag.trim();
    const cls = isFeat ? 'ptier feat reveal' : 'ptier reveal';
    const tagHtml = isFeat ? `<div class="ptier-tag">${esc(t.tag)}</div>` : '';
    const features = Array.isArray(t.features) ? t.features.map(f => `<li>${esc(f)}</li>`).join('') : '';
    const btn = isFeat
      ? `<a href="#request" class="btn btn-gold">${esc(t.button_label || ('Choose ' + t.name))}</a>`
      : `<a href="#request" class="btn btn-dark-ghost" style="border:1px solid var(--navy);color:var(--navy)">${esc(t.button_label || ('Choose ' + t.name))}</a>`;
    return `      <div class="${cls}" data-d="${i + 1}">
        ${tagHtml}
        <div class="ptier-name">${esc(t.name)}</div>
        <div class="price">${esc(t.price)}<span> ${esc(t.price_suffix || '')}</span></div>
        <p class="ptier-desc">${esc(t.description)}</p>
        <ul>${features}</ul>
        ${btn}
      </div>`;
  }).join('\n\n');
}

function copyRecursive(src, dest, skip) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    if (skip && skip.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d, skip);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ---------- overview map (villas.html) ----------
function overviewMapScript(villas) {
  const points = villas
    .filter(v => v.location && typeof v.location.lat === 'number' && typeof v.location.lng === 'number')
    .map(v => ({
      lat: v.location.lat, lng: v.location.lng, name: v.name, area: v.area,
      slug: slugify(v._file)
    }));
  if (!points.length) return '';
  return `<script>
(function(){
  var pts = ${JSON.stringify(points)};
  var map = L.map('villasMap', {scrollWheelZoom:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
  }).addTo(map);
  var bounds = [];
  pts.forEach(function(p){
    var m = L.marker([p.lat, p.lng]).addTo(map);
    m.bindPopup('<b>' + p.name + '</b><br>' + p.area + '<br><a href="villas/' + p.slug + '.html">View villa \u2192</a>');
    bounds.push([p.lat, p.lng]);
  });
  if (bounds.length > 1) { map.fitBounds(bounds, {padding:[30,30]}); }
  else if (bounds.length === 1) { map.setView(bounds[0], 12); }
})();
</script>`;
}

// ---------- build ----------
function build() {
  console.log('Building Samui Luxury Stays…');

  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Copy everything except source/config files we don't want shipped as-is
  copyRecursive(ROOT, OUT_DIR, [
    '_site', 'node_modules', 'content', 'build.js',
    'package.json', 'package-lock.json', 'netlify.toml', '.git', '.gitignore',
    'CMS_SETUP.md'
  ]);

  // 2. Copy admin + content along so Decap CMS can read/write them via the Git Gateway
  copyRecursive(path.join(ROOT, 'admin'), path.join(OUT_DIR, 'admin'));
  copyRecursive(CONTENT_DIR, path.join(OUT_DIR, 'content', 'villas'));
  if (fs.existsSync(PAGES_DIR)) copyRecursive(PAGES_DIR, path.join(OUT_DIR, 'content', 'pages'));
  if (fs.existsSync(SETTINGS_FILE)) {
    fs.mkdirSync(path.join(OUT_DIR, 'content'), { recursive: true });
    fs.copyFileSync(SETTINGS_FILE, path.join(OUT_DIR, 'content', 'settings.json'));
  }

  // 3. Load villa data
  const villas = loadVillas();
  const featured = villas.filter(v => v.featured);
  console.log(`Found ${villas.length} villas (${featured.length} featured).`);

  // 4. Generate an individual detail page for every villa
  const villasOutDir = path.join(OUT_DIR, 'villas');
  fs.mkdirSync(villasOutDir, { recursive: true });
  villas.forEach(v => {
    const slug = slugify(v._file);
    const html = villaDetailPage(v, slug, villas);
    fs.writeFileSync(path.join(villasOutDir, `${slug}.html`), html);
  });
  console.log(`Generated ${villas.length} villa detail pages.`);

  // 5. Inject into villas.html (all villas — cards now link to their own page)
  const villasPath = path.join(OUT_DIR, 'villas.html');
  if (fs.existsSync(villasPath)) {
    let html = fs.readFileSync(villasPath, 'utf8');
    const cards = villas.map(v =>
      villaCard(v, { href: `villas/${slugify(v._file)}.html` })
    ).join('\n      ');
    html = injectBetweenMarkers(html, '<!-- ALL_VILLAS:START -->', '<!-- ALL_VILLAS:END -->', '      ' + cards);
    html = injectBetweenMarkers(html, '<!-- VILLAS_MAP_SCRIPT:START -->', '<!-- VILLAS_MAP_SCRIPT:END -->', overviewMapScript(villas));
    fs.writeFileSync(villasPath, html);
  }

  // 6. Inject into index.html (featured villas — link to their own page, first gets the "tall" card)
  const indexPath = path.join(OUT_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    const cards = featured.map((v, i) =>
      villaCard(v, { href: `villas/${slugify(v._file)}.html`, tall: i === 0 })
    ).join('\n      ');
    html = injectBetweenMarkers(html, '<!-- FEATURED_VILLAS:START -->', '<!-- FEATURED_VILLAS:END -->', '      ' + cards);
    fs.writeFileSync(indexPath, html);
  }

  // 7. Editable page content — Home / About / Services / Contact / Relocation.
  // Each page's {{CMS:field}} tokens and <!--CMS:field--> text blocks are
  // filled from content/pages/<page>.json, and the repeating sections
  // (pillars, service cards, stats, testimonials, team, values, service
  // rows, pricing tiers) are regenerated from their JSON arrays.
  function applyPageContent(file, data, markerFillers) {
    const filePath = path.join(OUT_DIR, file);
    if (!fs.existsSync(filePath)) return;
    let html = fs.readFileSync(filePath, 'utf8');
    html = injectTokens(html, data);
    html = injectCommentFields(html, data);
    (markerFillers || []).forEach(({ start, end, render, key }) => {
      html = injectBetweenMarkers(html, start, end, render(data[key]));
    });
    fs.writeFileSync(filePath, html);
  }

  const homeData = loadJSON(path.join(PAGES_DIR, 'home.json'));
  applyPageContent('index.html', homeData, [
    { start: '<!-- PILLARS:START -->', end: '<!-- PILLARS:END -->', key: 'pillars', render: renderPillars },
    { start: '<!-- SERVICE_CARDS:START -->', end: '<!-- SERVICE_CARDS:END -->', key: 'service_cards', render: renderServiceCardsHome },
    { start: '<!-- STATS:START -->', end: '<!-- STATS:END -->', key: 'stats', render: renderStats },
    { start: '<!-- TESTIMONIALS_DATA:START -->', end: '<!-- TESTIMONIALS_DATA:END -->', key: 'testimonials', render: renderTestimonialsScript }
  ]);

  const aboutData = loadJSON(path.join(PAGES_DIR, 'about.json'));
  applyPageContent('about.html', aboutData, [
    { start: '<!-- TEAM:START -->', end: '<!-- TEAM:END -->', key: 'team', render: renderTeam },
    { start: '<!-- VALUES:START -->', end: '<!-- VALUES:END -->', key: 'values', render: renderValues },
    { start: '<!-- STATS:START -->', end: '<!-- STATS:END -->', key: 'stats', render: renderStats }
  ]);

  const servicesData = loadJSON(path.join(PAGES_DIR, 'services.json'));
  applyPageContent('services.html', servicesData, [
    { start: '<!-- SERVICE_ROWS:START -->', end: '<!-- SERVICE_ROWS:END -->', key: 'services', render: renderServiceRows }
  ]);

  const contactData = loadJSON(path.join(PAGES_DIR, 'contact.json'));
  applyPageContent('contact.html', contactData, []);

  const relocationData = loadJSON(path.join(PAGES_DIR, 'relocation.json'));
  applyPageContent('relocation.html', relocationData, [
    { start: '<!-- PRICING_TIERS:START -->', end: '<!-- PRICING_TIERS:END -->', key: 'pricing', render: renderPricingTiers }
  ]);

  // 8. Site-wide settings (phone, email, Formspree ID, social links) — applied
  // as a final pass across every page in _site, so the footer's Instagram
  // and LinkedIn links stay consistent everywhere, including villa and
  // journal pages that don't otherwise go through the page-content system.
  const settings = loadJSON(SETTINGS_FILE);
  function walkHtmlFiles(dir, fn) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkHtmlFiles(full, fn);
      else if (entry.name.endsWith('.html')) fn(full);
    }
  }
  walkHtmlFiles(OUT_DIR, (filePath) => {
    let html = fs.readFileSync(filePath, 'utf8');
    // Journal articles: add a share row just before the "Back to the Journal" link.
    const base = path.basename(filePath);
    if (/^journal-.+\.html$/.test(base) && !html.includes('share-row') && html.includes('<div class="a-back">')) {
      const pageUrl = `https://www.samuiluxurystays.com/${base}`;
      const t = (html.match(/<title>([^<]*?)(?:\s*\|[^<]*)?<\/title>/) || [])[1] || 'Samui Luxury Stays';
      html = html.replace('<div class="a-back">', `<div class="wrap" style="max-width:720px;margin:0 auto 10px">${buildShareBlock(pageUrl, t.replace(/&amp;/g, '&'), 'Share this article')}</div>\n\n<div class="a-back">`);
    }
    const updated = injectTokens(html, settings);
    if (updated !== html) fs.writeFileSync(filePath, updated);
  });

  console.log('Build complete →', OUT_DIR);
}

build();
