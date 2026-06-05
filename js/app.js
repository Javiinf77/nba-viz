/* ============================================================
   NBA Salary Viz — app.js  ·  D3 v7
   ============================================================ */

// ── CONFIG ────────────────────────────────────────────────
const C = {
  era1: '#60a5fa', era2: '#c084fc', era3: '#fb923c',
  green: '#4ade80', red: '#f87171',
  pos: { PG: '#60a5fa', SG: '#34d399', SF: '#f59e0b', PF: '#f87171', C: '#a78bfa' },
  bg: '#0d1117', panel: '#161b22', border: '#30363d',
  text: '#e6edf3', muted: '#8b949e', accent: '#fb923c',
  m: { top: 30, right: 30, bottom: 50, left: 62 },
};
const ERAS = { era1: '2000–07', era2: '2008–15', era3: '2016–24' };
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_LABEL = { PG: 'Base', SG: 'Escolta', SF: 'Alero', PF: 'Ala-Pívot', C: 'Pívot' };

// ── STATE ─────────────────────────────────────────────────
let D = [];            // full dataset
let drawn = {};        // which sections have been drawn
let s2Era = 'all';
let s3Era = 'all';
let s4Era = 'all';

// ── HELPERS ───────────────────────────────────────────────
const fmt = {
  sal: d3.format('$,.0f'),
  salM: v => `$${(v / 1e6).toFixed(1)}M`,
  pct: d3.format('.1f'),
  r2: d3.format('.2f'),
  r0: d3.format('.0f'),
};

function getEra(season) {
  const y = +season.split('-')[0];
  return y < 2008 ? 'era1' : y < 2016 ? 'era2' : 'era3';
}

function eraColor(era) { return C[era] || C.accent; }

function tooltip(html) {
  const el = document.getElementById('tooltip');
  el.innerHTML = html;
  el.classList.add('visible');
}
function ttHide() { document.getElementById('tooltip').classList.remove('visible'); }
function ttMove(e) {
  const el = document.getElementById('tooltip');
  const x = e.clientX + 14, y = e.clientY - 8;
  const w = el.offsetWidth, ww = window.innerWidth;
  el.style.left = (x + w > ww ? x - w - 28 : x) + 'px';
  el.style.top = y + 'px';
}

function svgOf(id, h = 420) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  const W = el.clientWidth || 640;
  const H = h;
  return d3.select(`#${id}`).append('svg')
    .attr('width', W).attr('height', H);
}

function innerDims(id, h = 420, mr = C.m.right) {
  const el = document.getElementById(id);
  const W = (el.clientWidth || 640) - C.m.left - mr;
  const H = h - C.m.top - C.m.bottom;
  return { W, H };
}

function gTranslate(svg) {
  return svg.append('g').attr('transform', `translate(${C.m.left},${C.m.top})`);
}

function drawGrid(g, { W, H }, { xScale, yScale, nx = 5, ny = 5 }) {
  if (xScale) {
    g.append('g').attr('class', 'grid')
      .attr('transform', `translate(0,${H})`)
      .call(d3.axisBottom(xScale).ticks(nx).tickSize(-H).tickFormat(''));
  }
  if (yScale) {
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(yScale).ticks(ny).tickSize(-W).tickFormat(''));
  }
}

// ── DATA LOAD ─────────────────────────────────────────────
document.body.insertAdjacentHTML('beforeend', `
  <div id="loading"><div class="loader-bar"><div class="loader-fill"></div></div><span>Cargando dataset NBA…</span></div>
`);

// Re-classify region from country to fix mismatches in the pre-built CSV
function fixRegion(country) {
  if (!country || country === 'nan' || country.trim() === '') return null;
  const c = country.toLowerCase().trim();
  const us = new Set(['usa', 'united states', 'us', 'u.s.a.', 'united states of america']);
  if (us.has(c)) return 'USA';
  if (c === 'canada') return 'Canada';
  const europe = new Set([
    'spain','france','germany','italy','greece','serbia','croatia','slovenia',
    'lithuania','latvia','estonia','georgia','ukraine','russia','turkey',
    'czech republic','slovakia','poland','sweden','norway','denmark','finland',
    'switzerland','austria','belgium','netherlands','portugal','hungary',
    'romania','bulgaria','bosnia','montenegro','north macedonia','albania',
    'kosovo','israel','united kingdom','great britain','england','scotland',
    'ireland','wales','cyprus','malta','luxembourg','iceland','moldova',
    'belarus','north ireland','northern ireland','montenegro',
  ]);
  const latam = new Set([
    'brazil','argentina','venezuela','colombia','mexico','puerto rico',
    'dominican republic','cuba','haiti','jamaica','panama','peru','ecuador',
    'chile','uruguay','paraguay','bolivia','bahamas','saint lucia',
    'trinidad and tobago','barbados','guyana','suriname','nicaragua',
    'honduras','costa rica','el salvador','guatemala','belize',
    'antigua and barbuda','grenada','saint vincent and the grenadines',
    'cayman islands','virgin islands',
  ]);
  const africa = new Set([
    'nigeria','cameroon','senegal','democratic republic of the congo',
    'drc','dr congo','congo','republic of the congo','south africa','egypt',
    'ghana','ivory coast',"cote d'ivoire",'mali','gabon','guinea',
    'south sudan','sudan','ethiopia','kenya','morocco','algeria','tunisia',
    'angola','tanzania','mozambique','zimbabwe','namibia','botswana',
    'sierra leone','liberia','togo','benin','burkina faso','niger','chad',
    'madagascar','rwanda','uganda','zambia',
  ]);
  const asia = new Set([
    'china','japan','australia','new zealand','south korea','philippines',
    'india','iran','lebanon','taiwan','hong kong','indonesia','malaysia',
    'singapore','thailand','vietnam','kazakhstan','uzbekistan','georgia',
  ]);
  if (europe.has(c)) return 'Europe';
  if (latam.has(c)) return 'Latin America';
  if (africa.has(c)) return 'Africa';
  if (asia.has(c)) return 'Asia/Oceania';
  return 'Other International';
}

d3.csv('data/nba_dataset.csv', row => {
  const per = +row.per, salPct = +row.salary_pct_cap, ws = +row.ws;
  if (!isFinite(per) || !isFinite(salPct) || per <= 0 || salPct <= 0) return null;
  const rawCountry = (row.country || '').trim();
  const region = rawCountry ? (fixRegion(rawCountry) || 'Unknown') : 'USA';
  const isIntl = region !== 'USA' && region !== 'Unknown';
  return {
    player_name: row.player_name,
    season: row.season,
    team: row.team,
    age: +row.age,
    position: row.position,
    region,
    is_international: isIntl,
    pts: +row.pts,
    per,
    ws,
    bpm: +row.bpm,
    vorp: +row.vorp,
    salary: +row.salary,
    salary_cap: +row.salary_cap,
    salary_pct_cap: salPct,
    value_index: +row.value_index,
    salary_vs_per: +row.salary_vs_per,
    pts_per_dollar: +row.pts_per_dollar,
    era: getEra(row.season),
  };
}).then(raw => {
  D = raw.filter(Boolean);
  document.getElementById('loading').classList.add('hidden');
  setTimeout(() => document.getElementById('loading').remove(), 600);
  init();
}).catch(err => {
  document.getElementById('loading').innerHTML = `<span style="color:#f87171">Error cargando datos: ${err.message}</span>`;
});

// ── INIT ──────────────────────────────────────────────────
function init() {
  heroCounters();
  setupNav();
  setupObserver();
  wireFilters();
}

// ── HERO COUNTERS ─────────────────────────────────────────
function heroCounters() {
  const seasons = [...new Set(D.map(d => d.season))];
  const players = [...new Set(D.map(d => d.player_name))];
  const maxSal = d3.max(D, d => d.salary);

  animCount('#h-seasons', 0, seasons.length, 800);
  animCount('#h-players', 0, players.length, 1000);
  setTimeout(() => {
    document.getElementById('h-maxsal').textContent = fmt.salM(maxSal);
  }, 1200);
}

function animCount(sel, from, to, dur) {
  const el = document.querySelector(sel);
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * ease).toLocaleString('es');
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── NAV DOTS ──────────────────────────────────────────────
function setupNav() {
  const dots = document.querySelectorAll('.dot');
  const sectionIds = ['s0','s1','s2','s3','s4','s5','s6','s7'];
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        const idx = sectionIds.indexOf(id);
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      }
    });
  }, { threshold: 0.5 });
  sectionIds.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
}

// ── INTERSECTION OBSERVER (draw on enter) ─────────────────
function setupObserver() {
  const DRAW = {
    s0: drawS0,
    s1: drawS1, s2: drawS2, s3: drawS3, s4: drawS4,
    s5: drawS5, s6: drawS6, s7: drawS7,
  };
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        e.target.classList.add('visible');
        if (!drawn[id] && DRAW[id]) { drawn[id] = true; DRAW[id](); }
      }
    });
  }, { threshold: 0.15 });
  Object.keys(DRAW).forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
}

// ── FILTER WIRING ─────────────────────────────────────────
function wireFilters() {
  wireEra('s2-filter', era => { s2Era = era; drawS2(); });
  wireEra('s3-filter', era => { s3Era = era; drawS3(); });
  wireEra('s4-filter', era => { s4Era = era; drawS4(); });

  const psearch = document.getElementById('player-search');
  if (psearch) psearch.addEventListener('input', () => drawS3());
}

function wireEra(containerId, cb) {
  const btns = document.querySelectorAll(`#${containerId} .era-btn`);
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cb(btn.dataset.era);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// S0 — PIPELINE DIAGRAM
// ═══════════════════════════════════════════════════════════
function drawS0() {
  const el = document.getElementById('chart-s0');
  el.innerHTML = '';
  const W = el.clientWidth || 700;
  const H = 340;
  const svg = d3.select('#chart-s0').append('svg').attr('width', W).attr('height', H);

  // arrowhead marker
  svg.append('defs').append('marker')
    .attr('id', 'arr0').attr('viewBox', '0 0 8 8')
    .attr('refX', 7).attr('refY', 4)
    .attr('markerWidth', 5).attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path').attr('d', 'M0,0 L8,4 L0,8 Z')
    .attr('fill', C.muted);

  const BOX_W = Math.min(160, W * 0.22);
  const BOX_H = 56;
  const ROW_GAP = 22;
  const n = 3;
  const totalSrcH = n * BOX_H + (n - 1) * ROW_GAP;
  const startY = (H - totalSrcH) / 2;

  const cx0 = 16;
  const cx1 = cx0 + BOX_W + Math.max(60, W * 0.10);
  const cx2 = cx1 + BOX_W + Math.max(55, W * 0.09);
  const cx3 = cx2 + BOX_W + Math.max(55, W * 0.09);

  const procY = (H - BOX_H) / 2;

  const sources = [
    { name: 'Basketball-Ref', sub: 'Per Game + Advanced', tag: '01_scrape_bbref.py', color: C.era1 },
    { name: 'ESPN Salaries',  sub: '11.235 registros',   tag: '02_scrape_salaries.py', color: C.era3 },
    { name: 'NBA API',        sub: 'PlayerIndex',        tag: 'nba_api',               color: C.era2 },
  ];

  sources.forEach((src, i) => {
    const sy = startY + i * (BOX_H + ROW_GAP);
    const cy = sy + BOX_H / 2;

    // box
    const g = svg.append('g').attr('transform', `translate(${cx0},${sy})`);
    g.append('rect').attr('width', BOX_W).attr('height', BOX_H).attr('rx', 6)
      .attr('fill', 'none').attr('stroke', src.color).attr('stroke-width', 1.5).attr('stroke-opacity', .75);
    g.append('text').attr('x', 10).attr('y', 19)
      .attr('fill', src.color).attr('font-size', 11).attr('font-weight', 600)
      .attr('font-family', 'IBM Plex Mono').text(src.name);
    g.append('text').attr('x', 10).attr('y', 33)
      .attr('fill', C.muted).attr('font-size', 9.5).attr('font-family', 'IBM Plex Sans').text(src.sub);
    g.append('text').attr('x', 10).attr('y', 48)
      .attr('fill', src.color).attr('fill-opacity', .55).attr('font-size', 8)
      .attr('font-family', 'IBM Plex Mono').text(src.tag);

    // curved connector to proc box
    const ex = cx0 + BOX_W;
    const ey = cy;
    const px = cx1;
    const py = procY + BOX_H / 2;
    svg.append('path')
      .attr('d', `M${ex},${ey} C${ex + 35},${ey} ${px - 35},${py} ${px},${py}`)
      .attr('fill', 'none').attr('stroke', src.color).attr('stroke-opacity', .35)
      .attr('stroke-width', 1.5).attr('stroke-dasharray', '4,3');
  });

  // Processing box
  const pg = svg.append('g').attr('transform', `translate(${cx1},${procY})`);
  pg.append('rect').attr('width', BOX_W).attr('height', BOX_H).attr('rx', 6)
    .attr('fill', 'rgba(251,146,60,.07)').attr('stroke', C.accent).attr('stroke-width', 1.5).attr('stroke-opacity', .8);
  pg.append('text').attr('x', 10).attr('y', 19)
    .attr('fill', C.accent).attr('font-size', 11).attr('font-weight', 600)
    .attr('font-family', 'IBM Plex Mono').text('build_dataset.py');
  pg.append('text').attr('x', 10).attr('y', 33)
    .attr('fill', C.muted).attr('font-size', 9.5).attr('font-family', 'IBM Plex Sans').text('merge · dedup traded');
  pg.append('text').attr('x', 10).attr('y', 48)
    .attr('fill', C.muted).attr('font-size', 9).attr('font-family', 'IBM Plex Sans').text('compute KPIs · ≥20 GP');

  // Arrow proc → output
  svg.append('line')
    .attr('x1', cx1 + BOX_W + 3).attr('y1', procY + BOX_H / 2)
    .attr('x2', cx2 - 5).attr('y2', procY + BOX_H / 2)
    .attr('stroke', C.muted).attr('stroke-width', 2).attr('marker-end', 'url(#arr0)');

  // Output box
  const og = svg.append('g').attr('transform', `translate(${cx2},${procY})`);
  og.append('rect').attr('width', BOX_W).attr('height', BOX_H).attr('rx', 6)
    .attr('fill', 'rgba(96,165,250,.07)').attr('stroke', C.era1).attr('stroke-width', 1.5).attr('stroke-opacity', .8);
  og.append('text').attr('x', 10).attr('y', 19)
    .attr('fill', C.era1).attr('font-size', 11).attr('font-weight', 600)
    .attr('font-family', 'IBM Plex Mono').text('nba_dataset.csv');
  og.append('text').attr('x', 10).attr('y', 33)
    .attr('fill', C.muted).attr('font-size', 9.5).attr('font-family', 'IBM Plex Sans').text('8.139 rows · 37 cols');
  og.append('text').attr('x', 10).attr('y', 48)
    .attr('fill', C.muted).attr('font-size', 9).attr('font-family', 'IBM Plex Sans').attr('opacity', .7).text('2000-01 → 2023-24');

  // Derived metrics row — bottom of chart
  const metrics = [
    { name: 'salary_pct_cap', desc: '% cap · cross-era' },
    { name: 'value_index',    desc: 'WS / %cap' },
    { name: 'salary_vs_per',  desc: 'Δ percentiles' },
    { name: 'pts_per_dollar', desc: 'PTS / $M' },
  ];
  const metY = H - 68;
  const mW = (W - 40) / metrics.length;

  svg.append('text').attr('x', 20).attr('y', metY - 6)
    .attr('fill', C.muted).attr('font-size', 8.5).attr('font-family', 'IBM Plex Sans')
    .attr('opacity', .7).text('Métricas derivadas:');

  metrics.forEach((m, i) => {
    const mx = 20 + i * mW;
    svg.append('rect').attr('x', mx).attr('y', metY).attr('width', mW - 8).attr('height', 36)
      .attr('rx', 5).attr('fill', 'rgba(255,255,255,.03)')
      .attr('stroke', 'rgba(192,132,252,.25)').attr('stroke-width', 1);
    svg.append('text').attr('x', mx + (mW - 8) / 2).attr('y', metY + 15)
      .attr('text-anchor', 'middle').attr('fill', C.accent2)
      .attr('font-size', 10).attr('font-family', 'IBM Plex Mono').attr('font-weight', 600)
      .text(m.name);
    svg.append('text').attr('x', mx + (mW - 8) / 2).attr('y', metY + 28)
      .attr('text-anchor', 'middle').attr('fill', C.muted)
      .attr('font-size', 8.5).attr('font-family', 'IBM Plex Sans')
      .text(m.desc);
  });
}

// ═══════════════════════════════════════════════════════════
// S1 — SALARY CAP GROWTH + DISTRIBUTION
// ═══════════════════════════════════════════════════════════
function drawS1() {
  const H = 420;
  const { W } = innerDims('chart-s1', H);
  const svg = svgOf('chart-s1', H);
  const g = gTranslate(svg);

  const seasons = [...new Set(D.map(d => d.season))].sort();

  // Per-season: actual cap value + percentile distribution of salary_pct_cap
  const bySeason = seasons.map(s => {
    const rows = D.filter(d => d.season === s).map(d => d.salary_pct_cap).sort(d3.ascending);
    return {
      season: s,
      capM: D.find(d => d.season === s).salary_cap / 1e6,
      p10: d3.quantile(rows, .10),
      p25: d3.quantile(rows, .25),
      p50: d3.quantile(rows, .50),
      p75: d3.quantile(rows, .75),
      p90: d3.quantile(rows, .90),
    };
  });

  const xScale = d3.scaleBand().domain(seasons).range([0, W]).padding(0.2);
  const yMax = d3.max(bySeason, d => d.p90) * 1.1;
  const yScale = d3.scaleLinear().domain([0, yMax]).range([H - C.m.top - C.m.bottom, 0]).nice();

  drawGrid(g, { W, H: H - C.m.top - C.m.bottom }, { yScale, ny: 5 });

  // IQR boxes
  const bw = xScale.bandwidth();
  g.selectAll('.cap-box')
    .data(bySeason).enter().append('rect')
    .attr('class', 'cap-box')
    .attr('x', d => xScale(d.season))
    .attr('y', d => yScale(d.p75))
    .attr('width', bw)
    .attr('height', d => Math.max(0, yScale(d.p25) - yScale(d.p75)))
    .attr('fill', d => eraColor(getEra(d.season)))
    .attr('fill-opacity', 0.3)
    .attr('rx', 2);

  // Median line
  g.selectAll('.med-line')
    .data(bySeason).enter().append('line')
    .attr('class', 'med-line')
    .attr('x1', d => xScale(d.season)).attr('x2', d => xScale(d.season) + bw)
    .attr('y1', d => yScale(d.p50)).attr('y2', d => yScale(d.p50))
    .attr('stroke', d => eraColor(getEra(d.season)))
    .attr('stroke-width', 2);

  // Whiskers p10-p90
  g.selectAll('.whisker-top')
    .data(bySeason).enter().append('line')
    .attr('x1', d => xScale(d.season) + bw / 2).attr('x2', d => xScale(d.season) + bw / 2)
    .attr('y1', d => yScale(d.p90)).attr('y2', d => yScale(d.p75))
    .attr('stroke', d => eraColor(getEra(d.season))).attr('stroke-width', 1).attr('stroke-opacity', .5);

  g.selectAll('.whisker-bot')
    .data(bySeason).enter().append('line')
    .attr('x1', d => xScale(d.season) + bw / 2).attr('x2', d => xScale(d.season) + bw / 2)
    .attr('y1', d => yScale(d.p25)).attr('y2', d => yScale(d.p10))
    .attr('stroke', d => eraColor(getEra(d.season))).attr('stroke-width', 1).attr('stroke-opacity', .5);

  // Hover rects
  g.selectAll('.hover-rect')
    .data(bySeason).enter().append('rect')
    .attr('class', 'hover-rect')
    .attr('x', d => xScale(d.season))
    .attr('y', 0)
    .attr('width', bw)
    .attr('height', H - C.m.top - C.m.bottom)
    .attr('fill', 'transparent')
    .on('mouseover', (e, d) => {
      tooltip(`<strong>${d.season}</strong>
        <div class="tt-row"><span class="tt-label">Cap</span><span class="tt-val">$${fmt.r0(d.capM)}M</span></div>
        <div class="tt-row"><span class="tt-label">Mediana %cap</span><span class="tt-val">${fmt.pct(d.p50)}%</span></div>
        <div class="tt-row"><span class="tt-label">P75</span><span class="tt-val">${fmt.pct(d.p75)}%</span></div>
        <div class="tt-row"><span class="tt-label">P90</span><span class="tt-val">${fmt.pct(d.p90)}%</span></div>`);
      ttMove(e);
    })
    .on('mousemove', ttMove)
    .on('mouseout', ttHide);

  // X axis — show only every 4th season label
  const xAxis = d3.axisBottom(xScale)
    .tickValues(seasons.filter((_, i) => i % 4 === 0))
    .tickSize(4);
  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - C.m.top - C.m.bottom})`).call(xAxis);

  g.append('g').attr('class', 'axis').call(d3.axisLeft(yScale).ticks(5).tickFormat(v => v + '%'));

  // Axis labels
  g.append('text').attr('class', 'axis-label')
    .attr('transform', `translate(${-48},${(H - C.m.top - C.m.bottom) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').text('% del salary cap');

  // Era shading
  const eraBands = [
    { start: '2000-01', end: '2006-07', era: 'era1' },
    { start: '2007-08', end: '2015-16', era: 'era2' },
    { start: '2016-17', end: '2023-24', era: 'era3' },
  ];
  eraBands.forEach(b => {
    const x0 = xScale(b.start) || 0;
    const x1 = (xScale(b.end) || 0) + bw;
    g.insert('rect', ':first-child')
      .attr('x', x0).attr('y', 0)
      .attr('width', x1 - x0)
      .attr('height', H - C.m.top - C.m.bottom)
      .attr('fill', eraColor(b.era))
      .attr('fill-opacity', .04);
  });

  // Legend
  const legend = document.getElementById('s1-legend');
  legend.innerHTML = '';
  [['era1', '2000–07'], ['era2', '2008–15'], ['era3', '2016–24']].forEach(([era, label]) => {
    legend.insertAdjacentHTML('beforeend', `
      <div class="legend-item">
        <div class="legend-swatch" style="background:${eraColor(era)}"></div>
        <span>${label}</span>
      </div>`);
  });
}

// ═══════════════════════════════════════════════════════════
// S2 — SCATTER: salary_pct_cap vs PER
// ═══════════════════════════════════════════════════════════
function drawS2() {
  const H = 440;
  const { W } = innerDims('chart-s2', H);
  const svg = svgOf('chart-s2', H);
  const g = gTranslate(svg);

  let rows = s2Era === 'all' ? D : D.filter(d => d.era === s2Era);
  // Sample for performance: max 3000 random points
  if (rows.length > 3000) {
    const shuffled = [...rows].sort(() => Math.random() - .5);
    rows = shuffled.slice(0, 3000);
  }

  const xMax = Math.min(d3.max(rows, d => d.salary_pct_cap), 40);
  const yMax = Math.min(d3.max(rows, d => d.per), 45);
  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, W]).nice();
  const yScale = d3.scaleLinear().domain([0, yMax]).range([H - C.m.top - C.m.bottom, 0]).nice();

  drawGrid(g, { W, H: H - C.m.top - C.m.bottom }, { xScale, yScale });

  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - C.m.top - C.m.bottom})`).call(d3.axisBottom(xScale).ticks(6).tickFormat(v => v + '%'));
  g.append('g').attr('class', 'axis').call(d3.axisLeft(yScale).ticks(6));

  g.append('text').attr('class', 'axis-label')
    .attr('x', W / 2).attr('y', H - C.m.top - C.m.bottom + 40)
    .attr('text-anchor', 'middle').text('Salario como % del cap');
  g.append('text').attr('class', 'axis-label')
    .attr('transform', `translate(${-48},${(H - C.m.top - C.m.bottom) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').text('PER (Player Efficiency Rating)');

  // Dots
  g.selectAll('.dot-pt').data(rows).enter().append('circle')
    .attr('class', 'dot-pt')
    .attr('cx', d => xScale(d.salary_pct_cap))
    .attr('cy', d => yScale(d.per))
    .attr('r', 3)
    .attr('fill', d => s2Era === 'all' ? eraColor(d.era) : eraColor(d.era))
    .attr('fill-opacity', .55)
    .attr('stroke', 'none')
    .on('mouseover', (e, d) => {
      tooltip(`<strong>${d.player_name}</strong>
        <div class="tt-row"><span class="tt-label">Temporada</span><span class="tt-val">${d.season}</span></div>
        <div class="tt-row"><span class="tt-label">Equipo</span><span class="tt-val">${d.team}</span></div>
        <div class="tt-row"><span class="tt-label">PER</span><span class="tt-val">${fmt.pct(d.per)}</span></div>
        <div class="tt-row"><span class="tt-label">% cap</span><span class="tt-val">${fmt.pct(d.salary_pct_cap)}%</span></div>
        <div class="tt-row"><span class="tt-label">Salario</span><span class="tt-val">${fmt.salM(d.salary)}</span></div>`);
      ttMove(e);
    })
    .on('mousemove', ttMove)
    .on('mouseout', ttHide);

  // Regression line
  const xVals = rows.map(d => d.salary_pct_cap);
  const yVals = rows.map(d => d.per);
  const n = rows.length;
  const meanX = d3.mean(xVals), meanY = d3.mean(yVals);
  const slope = d3.sum(xVals.map((x, i) => (x - meanX) * (yVals[i] - meanY))) /
    d3.sum(xVals.map(x => (x - meanX) ** 2));
  const intercept = meanY - slope * meanX;
  const ssRes = d3.sum(yVals.map((y, i) => (y - (slope * xVals[i] + intercept)) ** 2));
  const ssTot = d3.sum(yVals.map(y => (y - meanY) ** 2));
  const r2 = 1 - ssRes / ssTot;

  g.append('line')
    .attr('x1', xScale(0)).attr('x2', xScale(xMax))
    .attr('y1', yScale(intercept)).attr('y2', yScale(slope * xMax + intercept))
    .attr('stroke', '#fff').attr('stroke-width', 1.5).attr('stroke-dasharray', '5,4').attr('stroke-opacity', .4);

  document.getElementById('s2-corr').textContent = `R² = ${fmt.r2(r2)} · correlación ${r2 < 0.1 ? 'débil' : r2 < 0.25 ? 'moderada' : 'fuerte'} (${rows.length.toLocaleString('es')} registros)`;
}

// ═══════════════════════════════════════════════════════════
// S3 — BARGAINS vs OVERPAID (lollipop)
// ═══════════════════════════════════════════════════════════
function drawS3() {
  const H = 500;
  const SIDE = 165; // symmetric margins so zero line stays centered
  const el3 = document.getElementById('chart-s3');
  el3.innerHTML = '';
  const W_full = el3.clientWidth || 640;
  const W = W_full - SIDE - SIDE;
  const svg = d3.select('#chart-s3').append('svg').attr('width', W_full).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${SIDE},${C.m.top})`);

  const search = (document.getElementById('player-search')?.value || '').toLowerCase().trim();
  let rows = s3Era === 'all' ? D : D.filter(d => d.era === s3Era);
  rows = rows.filter(d => isFinite(d.salary_vs_per));

  // Search highlight
  if (search) {
    rows = rows.filter(d => d.player_name.toLowerCase().includes(search));
    if (!rows.length) {
      g.append('text').attr('x', W / 2).attr('y', 100).attr('text-anchor', 'middle')
        .attr('fill', C.muted).attr('font-family', 'IBM Plex Sans').attr('font-size', 13)
        .text('No se encontró ningún jugador');
      return;
    }
    // Sort by salary_vs_per and take extremes
    rows.sort((a, b) => a.salary_vs_per - b.salary_vs_per);
  } else {
    // Top 12 bargains (most negative) + top 12 overpaid (most positive)
    rows.sort((a, b) => a.salary_vs_per - b.salary_vs_per);
    const bargains = rows.slice(0, 12);
    const overpaid = rows.slice(-12).reverse();
    rows = [...overpaid, { _sep: true }, ...bargains];
  }

  rows = rows.filter(d => !d._sep);
  const itemH = Math.max(14, Math.floor((H - C.m.top - C.m.bottom) / Math.min(rows.length, 24)));
  const visRows = rows.slice(0, Math.floor((H - C.m.top - C.m.bottom) / itemH));

  const absMax = d3.max(visRows, d => Math.abs(d.salary_vs_per)) || 1;
  const xScale = d3.scaleLinear().domain([-absMax * 1.1, absMax * 1.1]).range([0, W]).nice();
  const yScale = d3.scaleBand().domain(visRows.map((_, i) => i)).range([0, visRows.length * itemH]).padding(0.2);

  const totalH = visRows.length * itemH;

  drawGrid(g, { W, H: totalH }, { xScale, ny: 0 });

  // Zero line
  g.append('line')
    .attr('x1', xScale(0)).attr('x2', xScale(0))
    .attr('y1', 0).attr('y2', totalH)
    .attr('stroke', '#fff').attr('stroke-width', 1).attr('stroke-opacity', .3);

  // Lollipops
  visRows.forEach((d, i) => {
    const isBar = !search && i < 12;
    const col = d.salary_vs_per > 0 ? C.red : C.green;
    const cy = yScale(i) + yScale.bandwidth() / 2;

    g.append('line').attr('class', 'lollipop-line')
      .attr('x1', xScale(0)).attr('x2', xScale(d.salary_vs_per))
      .attr('y1', cy).attr('y2', cy)
      .attr('stroke', col).attr('stroke-opacity', .7);

    g.append('circle').attr('class', 'lollipop-circle')
      .attr('cx', xScale(d.salary_vs_per)).attr('cy', cy).attr('r', 5)
      .attr('fill', col)
      .on('mouseover', (e) => {
        tooltip(`<strong>${d.player_name}</strong>
          <div class="tt-row"><span class="tt-label">Temporada</span><span class="tt-val">${d.season}</span></div>
          <div class="tt-row"><span class="tt-label">Equipo</span><span class="tt-val">${d.team}</span></div>
          <div class="tt-row"><span class="tt-label">salary_vs_per</span><span class="tt-val">${fmt.r0(d.salary_vs_per)}</span></div>
          <div class="tt-row"><span class="tt-label">Salario</span><span class="tt-val">${fmt.salM(d.salary)}</span></div>
          <div class="tt-row"><span class="tt-label">PER</span><span class="tt-val">${fmt.pct(d.per)}</span></div>`);
        ttMove(e);
      })
      .on('mousemove', ttMove)
      .on('mouseout', ttHide);

    // Player name label
    const nameX = d.salary_vs_per > 0 ? xScale(d.salary_vs_per) + 8 : xScale(d.salary_vs_per) - 8;
    const shortName = d.player_name.length > 17 ? d.player_name.slice(0, 16) + '…' : d.player_name;
    g.append('text')
      .attr('x', nameX).attr('y', cy + 4)
      .attr('text-anchor', d.salary_vs_per > 0 ? 'start' : 'end')
      .attr('fill', C.text).attr('font-size', 10)
      .attr('font-family', 'IBM Plex Sans')
      .text(`${shortName} (${d.season.split('-')[0]})`);
  });

  g.append('g').attr('class', 'axis')
    .attr('transform', `translate(0,${totalH})`)
    .call(d3.axisBottom(xScale).ticks(6));

  // Labels
  g.append('text').attr('x', xScale(-absMax * .5)).attr('y', -10)
    .attr('text-anchor', 'middle').attr('fill', C.green)
    .attr('font-size', 11).attr('font-family', 'IBM Plex Sans').attr('font-weight', 600)
    .text('◀ Chollos');
  g.append('text').attr('x', xScale(absMax * .5)).attr('y', -10)
    .attr('text-anchor', 'middle').attr('fill', C.red)
    .attr('font-size', 11).attr('font-family', 'IBM Plex Sans').attr('font-weight', 600)
    .text('Sobrepagados ▶');
}

// ═══════════════════════════════════════════════════════════
// S4 — VALUE INDEX (horizontal bar chart)
// ═══════════════════════════════════════════════════════════
function drawS4() {
  const TOP_N = 20;
  const ITEM_H = 22;
  const H = TOP_N * ITEM_H + C.m.top + C.m.bottom + 20;
  const { W } = innerDims('chart-s4', H, 185);
  const svg = svgOf('chart-s4', H);
  const g = gTranslate(svg);

  let rows = s4Era === 'all' ? D : D.filter(d => d.era === s4Era);
  rows = rows.filter(d => d.ws >= 3 && isFinite(d.value_index) && d.value_index > 0);
  rows.sort((a, b) => b.value_index - a.value_index);
  const top = rows.slice(0, TOP_N);

  const xMax = d3.max(top, d => d.value_index) * 1.05;
  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, W]).nice();
  const yScale = d3.scaleBand().domain(top.map((_, i) => i)).range([0, TOP_N * ITEM_H]).padding(0.18);

  drawGrid(g, { W, H: TOP_N * ITEM_H }, { xScale });

  // Bars
  g.selectAll('.bar')
    .data(top).enter().append('rect')
    .attr('class', 'bar')
    .attr('x', 0)
    .attr('y', (_, i) => yScale(i))
    .attr('width', 0)
    .attr('height', yScale.bandwidth())
    .attr('fill', d => eraColor(d.era))
    .attr('rx', 3)
    .transition().duration(600).delay((_, i) => i * 25)
    .attr('width', d => xScale(d.value_index));

  // Hover rects (full width for easy hover)
  g.selectAll('.hover-bar')
    .data(top).enter().append('rect')
    .attr('x', 0).attr('y', (_, i) => yScale(i))
    .attr('width', W).attr('height', yScale.bandwidth())
    .attr('fill', 'transparent')
    .on('mouseover', (e, d) => {
      tooltip(`<strong>${d.player_name}</strong>
        <div class="tt-row"><span class="tt-label">Temporada</span><span class="tt-val">${d.season}</span></div>
        <div class="tt-row"><span class="tt-label">Equipo</span><span class="tt-val">${d.team}</span></div>
        <div class="tt-row"><span class="tt-label">Value Index</span><span class="tt-val">${fmt.r2(d.value_index)}</span></div>
        <div class="tt-row"><span class="tt-label">WS</span><span class="tt-val">${fmt.pct(d.ws)}</span></div>
        <div class="tt-row"><span class="tt-label">% cap</span><span class="tt-val">${fmt.pct(d.salary_pct_cap)}%</span></div>
        <div class="tt-row"><span class="tt-label">Salario</span><span class="tt-val">${fmt.salM(d.salary)}</span></div>`);
      ttMove(e);
    })
    .on('mousemove', ttMove)
    .on('mouseout', ttHide);

  // Name labels
  g.selectAll('.bar-label')
    .data(top).enter().append('text')
    .attr('class', 'bar-label')
    .attr('x', d => xScale(d.value_index) + 6)
    .attr('y', (_, i) => yScale(i) + yScale.bandwidth() / 2 + 4)
    .attr('fill', C.text).attr('font-size', 10).attr('font-family', 'IBM Plex Sans')
    .text(d => `${d.player_name} · ${d.season}`);

  g.append('g').attr('class', 'axis')
    .attr('transform', `translate(0,${TOP_N * ITEM_H})`)
    .call(d3.axisBottom(xScale).ticks(5));

  g.append('text').attr('class', 'axis-label')
    .attr('x', W / 2).attr('y', TOP_N * ITEM_H + 38)
    .attr('text-anchor', 'middle').text('Value Index (WS / % cap)');
}

// ═══════════════════════════════════════════════════════════
// S5 — POSITION INFLATION (multi-line)
// ═══════════════════════════════════════════════════════════
function drawS5() {
  const H = 420;
  const { W } = innerDims('chart-s5', H, 95);
  const svg = svgOf('chart-s5', H);
  const g = gTranslate(svg);

  const seasons = [...new Set(D.map(d => d.season))].sort();
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

  // Average salary_pct_cap by season × position
  const bySeasonPos = [];
  seasons.forEach(s => {
    positions.forEach(pos => {
      const rows = D.filter(d => d.season === s && d.position && d.position.includes(pos));
      if (rows.length < 3) return;
      bySeasonPos.push({ season: s, pos, val: d3.mean(rows, d => d.salary_pct_cap) });
    });
  });

  const xScale = d3.scalePoint().domain(seasons).range([0, W]).padding(.05);
  const yMax = d3.max(bySeasonPos, d => d.val) * 1.1;
  const yScale = d3.scaleLinear().domain([0, yMax]).range([H - C.m.top - C.m.bottom, 0]).nice();

  drawGrid(g, { W, H: H - C.m.top - C.m.bottom }, { xScale, yScale });

  const lineGen = d3.line()
    .x(d => xScale(d.season))
    .y(d => yScale(d.val))
    .curve(d3.curveMonotoneX)
    .defined(d => isFinite(d.val));

  positions.forEach(pos => {
    const posData = bySeasonPos.filter(d => d.pos === pos);
    if (!posData.length) return;

    g.append('path')
      .datum(posData)
      .attr('class', 'line-path')
      .attr('d', lineGen)
      .attr('stroke', C.pos[pos])
      .attr('stroke-opacity', .85);

    // Last point label
    const last = posData[posData.length - 1];
    if (last) {
      g.append('text')
        .attr('x', xScale(last.season) + 6)
        .attr('y', yScale(last.val) + 4)
        .attr('fill', C.pos[pos])
        .attr('font-size', 11)
        .attr('font-family', 'IBM Plex Sans')
        .attr('font-weight', 600)
        .text(POS_LABEL[pos] || pos);
    }

    // Hover dots
    g.selectAll(`.dot-${pos}`)
      .data(posData).enter().append('circle')
      .attr('cx', d => xScale(d.season))
      .attr('cy', d => yScale(d.val))
      .attr('r', 4)
      .attr('fill', C.pos[pos])
      .attr('fill-opacity', 0)
      .on('mouseover', (e, d) => {
        tooltip(`<strong>${POS_LABEL[pos] || pos} — ${d.season}</strong>
          <div class="tt-row"><span class="tt-label">Media %cap</span><span class="tt-val">${fmt.pct(d.val)}%</span></div>`);
        ttMove(e);
        d3.select(e.currentTarget).attr('fill-opacity', 1);
      })
      .on('mousemove', ttMove)
      .on('mouseout', e => { ttHide(); d3.select(e.currentTarget).attr('fill-opacity', 0); });
  });

  g.append('g').attr('class', 'axis')
    .attr('transform', `translate(0,${H - C.m.top - C.m.bottom})`)
    .call(d3.axisBottom(xScale).tickValues(seasons.filter((_, i) => i % 4 === 0)).tickSize(4));
  g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(v => v + '%'));
  g.append('text').attr('class', 'axis-label')
    .attr('transform', `translate(${-48},${(H - C.m.top - C.m.bottom) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').text('Salario medio (% cap)');

  // Legend
  const legend = document.getElementById('s5-legend');
  legend.innerHTML = '';
  positions.forEach(pos => {
    legend.insertAdjacentHTML('beforeend', `
      <div class="legend-item">
        <div class="legend-swatch" style="background:${C.pos[pos]}"></div>
        <span>${POS_LABEL[pos] || pos}</span>
      </div>`);
  });
}

// ═══════════════════════════════════════════════════════════
// S6 — TEAM RANKINGS
// ═══════════════════════════════════════════════════════════
function drawS6() {
  const skipTeams = new Set(['TOT', '2TM', '3TM', '4TM', '5TM']);
  const teams = [...new Set(D.map(d => d.team))].filter(t => t && !skipTeams.has(t));
  const teamData = teams.map(team => {
    const rows = D.filter(d => d.team === team && d.ws >= 2 && isFinite(d.value_index) && d.value_index > 0);
    return { team, vi: d3.mean(rows, d => d.value_index) || 0, n: rows.length };
  }).filter(d => d.n >= 20);

  teamData.sort((a, b) => b.vi - a.vi);
  const top = teamData.slice(0, 30);

  const ITEM_H = 18;
  const H = top.length * ITEM_H + C.m.top + C.m.bottom + 20;
  const { W } = innerDims('chart-s6', H);
  const svg = svgOf('chart-s6', H);
  const g = gTranslate(svg);

  const midVI = d3.median(top, d => d.vi);
  const xMax = d3.max(top, d => d.vi) * 1.05;
  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, W]).nice();
  const yScale = d3.scaleBand().domain(top.map((_, i) => i)).range([0, top.length * ITEM_H]).padding(.15);

  drawGrid(g, { W, H: top.length * ITEM_H }, { xScale });

  g.selectAll('.bar')
    .data(top).enter().append('rect')
    .attr('class', 'bar')
    .attr('x', 0).attr('y', (_, i) => yScale(i))
    .attr('width', 0).attr('height', yScale.bandwidth())
    .attr('fill', d => d.vi >= midVI ? C.green : C.accent)
    .attr('rx', 3)
    .transition().duration(600).delay((_, i) => i * 20)
    .attr('width', d => xScale(d.vi));

  g.selectAll('.hover-bar')
    .data(top).enter().append('rect')
    .attr('x', 0).attr('y', (_, i) => yScale(i))
    .attr('width', W).attr('height', yScale.bandwidth())
    .attr('fill', 'transparent')
    .on('mouseover', (e, d) => {
      tooltip(`<strong>${d.team}</strong>
        <div class="tt-row"><span class="tt-label">Value Index medio</span><span class="tt-val">${fmt.r2(d.vi)}</span></div>
        <div class="tt-row"><span class="tt-label">Registros</span><span class="tt-val">${d.n}</span></div>`);
      ttMove(e);
    })
    .on('mousemove', ttMove)
    .on('mouseout', ttHide);

  g.selectAll('.bar-label')
    .data(top).enter().append('text')
    .attr('x', d => xScale(d.vi) + 5)
    .attr('y', (_, i) => yScale(i) + yScale.bandwidth() / 2 + 4)
    .attr('fill', C.text).attr('font-size', 10).attr('font-family', 'IBM Plex Sans')
    .text(d => `${d.team}  ${fmt.r2(d.vi)}`);

  g.append('g').attr('class', 'axis')
    .attr('transform', `translate(0,${top.length * ITEM_H})`)
    .call(d3.axisBottom(xScale).ticks(5));

  g.append('text').attr('class', 'axis-label')
    .attr('x', W / 2).attr('y', top.length * ITEM_H + 38)
    .attr('text-anchor', 'middle').text('Value Index medio (24 temporadas)');
}

// ═══════════════════════════════════════════════════════════
// S7 — INTERNATIONALIZATION (stacked area)
// ═══════════════════════════════════════════════════════════
function drawS7() {
  const H = 420;
  const { W } = innerDims('chart-s7', H);
  const svg = svgOf('chart-s7', H);
  const g = gTranslate(svg);

  const seasons = [...new Set(D.map(d => d.season))].sort();
  const regions = ['Europe', 'Canada', 'Latin America', 'Africa', 'Asia/Oceania', 'Other International'];
  const regionColors = {
    'Europe': '#60a5fa',
    'Canada': '#f43f5e',
    'Latin America': '#4ade80',
    'Africa': '#f59e0b',
    'Asia/Oceania': '#c084fc',
    'Other International': '#94a3b8',
  };

  // % of players per region per season (only among players with known country)
  const stackData = seasons.map(s => {
    const allRows = D.filter(d => d.season === s);
    const total = allRows.length;
    const obj = { season: s };
    regions.forEach(r => {
      obj[r] = allRows.filter(d => d.region === r).length / total * 100;
    });
    return obj;
  });

  const stack = d3.stack().keys(regions).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
  const series = stack(stackData);

  const xScale = d3.scalePoint().domain(seasons).range([0, W]).padding(.05);
  const yScale = d3.scaleLinear().domain([0, d3.max(series[series.length - 1], d => d[1]) * 1.1]).range([H - C.m.top - C.m.bottom, 0]).nice();

  drawGrid(g, { W, H: H - C.m.top - C.m.bottom }, { yScale });

  const areaGen = d3.area()
    .x(d => xScale(d.data.season))
    .y0(d => yScale(d[0]))
    .y1(d => yScale(d[1]))
    .curve(d3.curveMonotoneX);

  series.forEach(s => {
    g.append('path')
      .datum(s)
      .attr('class', 'area-path')
      .attr('d', areaGen)
      .attr('fill', regionColors[s.key])
      .attr('fill-opacity', 0.75);
  });

  // Hover line
  const hoverLine = g.append('line')
    .attr('stroke', '#fff').attr('stroke-width', 1).attr('stroke-opacity', .5)
    .attr('y1', 0).attr('y2', H - C.m.top - C.m.bottom)
    .style('display', 'none');

  const hoverRect = g.append('rect')
    .attr('x', 0).attr('y', 0).attr('width', W).attr('height', H - C.m.top - C.m.bottom)
    .attr('fill', 'transparent')
    .on('mousemove', function(e) {
      const [mx] = d3.pointer(e);
      const seasonIdx = Math.round(mx / (W / (seasons.length - 1)));
      const s = seasons[Math.max(0, Math.min(seasonIdx, seasons.length - 1))];
      const d = stackData.find(r => r.season === s);
      if (!d) return;
      hoverLine.attr('x1', xScale(s)).attr('x2', xScale(s)).style('display', null);
      const intlTotal = regions.reduce((acc, r) => acc + (d[r] || 0), 0);
      tooltip(`<strong>${s}</strong>
        ${regions.filter(r => d[r] > 0.1).map(r => `<div class="tt-row"><span class="tt-label" style="color:${regionColors[r]}">${r}</span><span class="tt-val">${fmt.pct(d[r])}%</span></div>`).join('')}
        <div class="tt-row"><span class="tt-label">Total intl.</span><span class="tt-val">${fmt.pct(intlTotal)}%</span></div>`);
      ttMove(e);
    })
    .on('mouseout', () => { ttHide(); hoverLine.style('display', 'none'); });

  g.append('g').attr('class', 'axis')
    .attr('transform', `translate(0,${H - C.m.top - C.m.bottom})`)
    .call(d3.axisBottom(xScale).tickValues(seasons.filter((_, i) => i % 4 === 0)).tickSize(4));
  g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(v => v + '%'));
  g.append('text').attr('class', 'axis-label')
    .attr('transform', `translate(${-48},${(H - C.m.top - C.m.bottom) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').text('% del total de jugadores');

  // Legend
  const legend = document.getElementById('s7-legend');
  legend.innerHTML = '';
  regions.forEach(r => {
    legend.insertAdjacentHTML('beforeend', `
      <div class="legend-item">
        <div class="legend-swatch" style="background:${regionColors[r]}"></div>
        <span>${r}</span>
      </div>`);
  });
}
