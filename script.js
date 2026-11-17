/* Grezly.app — interaksi
   1. Peta kontur hidup (marching squares + Perlin noise)
   2. Tema terang/gelap
   3. Reveal saat scroll, spotlight kartu, demo mini tiap aplikasi */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- Theme ---------------- */
  const root = document.documentElement;
  $('#themeBtn').addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('grezly-theme', next); } catch (e) {}
    const m = $('meta[name="theme-color"]');
    if (m) m.content = next === 'light' ? '#ece4d0' : '#0c1210';
    readColors();
    if (reduce) frame(0);
  });

  /* ---------------- Perlin noise 3D ---------------- */
  const perm = new Uint8Array(512);
  (() => {
    const p = Array.from({ length: 256 }, (_, i) => i);
    let s = 20240611;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y, z) => {
    h &= 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  function noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
           lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
           lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }

  /* ---------------- Contour map ---------------- */
  const hero = $('#hero');
  const canvas = $('#topo');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, field = null, CELL = 14;
  const LEVELS = 18;
  let cLow = '', cHi = '';
  const mouse = { x: -9999, y: -9999, sx: -9999, sy: -9999, active: false };

  function readColors() {
    const cs = getComputedStyle(root);
    const t = cs.getPropertyValue('--topo').trim();
    const h = cs.getPropertyValue('--topo-hi').trim();
    const light = root.getAttribute('data-theme') === 'light';
    cLow = `rgba(${t}, ${light ? 0.2 : 0.14})`;
    cHi = `rgba(${h}, ${light ? 0.75 : 0.62})`;
  }

  function resize() {
    const r = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CELL = W < 640 ? 12 : 14;
    cols = Math.ceil(W / CELL) + 1;
    rows = Math.ceil(H / CELL) + 1;
    field = new Float32Array(cols * rows);
    if (reduce) frame(0);
  }

  // fixed "summit" so rings always have a focal point on the right
  function summit() {
    const portrait = W < 760;
    return portrait ? { x: W * 0.72, y: H * 0.22, s: W * 0.5 } : { x: W * 0.74, y: H * 0.42, s: Math.min(W, 1500) * 0.2 };
  }

  function sample(px, py, t, sm) {
    const nx = px / 520, ny = py / 520;
    let v = noise(nx, ny, t) * 0.62 + noise(nx * 2.1 + 9, ny * 2.1 + 3, t * 1.4) * 0.26 + noise(nx * 4.3 + 4, ny * 4.3 + 8, t * 1.9) * 0.09;
    v = v * 0.5 + 0.5;
    const dx = px - sm.x, dy = py - sm.y;
    v += Math.exp(-(dx * dx + dy * dy) / (2 * sm.s * sm.s)) * 0.42;
    if (mouse.active) {
      const mx = px - mouse.sx, my = py - mouse.sy;
      v += Math.exp(-(mx * mx + my * my) / (2 * 150 * 150)) * 0.28;
    }
    return v;
  }

  function frame(time) {
    if (!field) return;
    const t = time * 0.00007;
    const sm = summit();
    for (let j = 0, k = 0; j < rows; j++) {
      const py = j * CELL;
      for (let i = 0; i < cols; i++, k++) field[k] = sample(i * CELL, py, t, sm);
    }
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    for (let li = 0; li < LEVELS; li++) {
      const l = 0.2 + li * (0.78 / LEVELS);
      const major = li % 4 === 0;
      ctx.beginPath();
      for (let j = 0; j < rows - 1; j++) {
        const y = j * CELL;
        for (let i = 0; i < cols - 1; i++) {
          const k = j * cols + i;
          const a = field[k], b = field[k + 1], d = field[k + cols], c = field[k + cols + 1];
          const idx = (a > l ? 8 : 0) | (b > l ? 4 : 0) | (c > l ? 2 : 0) | (d > l ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x = i * CELL;
          const tx = x + ((l - a) / (b - a)) * CELL, ty = y;            // top
          const rx = x + CELL, ry = y + ((l - b) / (c - b)) * CELL;     // right
          const bx = x + ((l - d) / (c - d)) * CELL, by = y + CELL;     // bottom
          const lx = x, ly = y + ((l - a) / (d - a)) * CELL;            // left
          switch (idx) {
            case 1: case 14: seg(lx, ly, bx, by); break;
            case 2: case 13: seg(bx, by, rx, ry); break;
            case 3: case 12: seg(lx, ly, rx, ry); break;
            case 4: case 11: seg(tx, ty, rx, ry); break;
            case 5: seg(tx, ty, rx, ry); seg(lx, ly, bx, by); break;
            case 6: case 9: seg(tx, ty, bx, by); break;
            case 7: case 8: seg(tx, ty, lx, ly); break;
            case 10: seg(tx, ty, lx, ly); seg(bx, by, rx, ry); break;
          }
        }
      }
      ctx.strokeStyle = major ? cHi : cLow;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.stroke();
    }
  }
  function seg(x1, y1, x2, y2) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }

  // readout (elevation at cursor)
  const roX = $('#roX'), roY = $('#roY'), roE = $('#roE');
  function updateReadout(time) {
    if (!W) return;
    const px = mouse.active ? mouse.sx : summit().x;
    const py = mouse.active ? mouse.sy : summit().y;
    const v = sample(px, py, time * 0.00007, summit());
    roX.textContent = (px / W).toFixed(2);
    roY.textContent = (py / H).toFixed(2);
    roE.textContent = Math.round(180 + v * 2300).toLocaleString('id-ID');
  }

  let running = true, last = 0;
  function loop(time) {
    requestAnimationFrame(loop);
    if (!running || document.hidden) return;
    if (time - last < 33) return; // ~30fps
    last = time;
    if (mouse.active) {
      mouse.sx += (mouse.x - mouse.sx) * 0.12;
      mouse.sy += (mouse.y - mouse.sy) * 0.12;
    }
    frame(time);
    updateReadout(time);
  }

  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    if (!mouse.active) { mouse.sx = mouse.x; mouse.sy = mouse.y; }
    mouse.active = true;
  });
  hero.addEventListener('pointerleave', () => { mouse.active = false; });

  readColors();
  resize();
  new ResizeObserver(resize).observe(hero);
  if (reduce) { frame(0); updateReadout(0); }
  else {
    new IntersectionObserver(([en]) => { running = en.isIntersecting; }).observe(hero);
    requestAnimationFrame(loop);
  }

  /* ---------------- Reveal on scroll ---------------- */
  const revealEls = $$('[data-reveal]');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
      if (en.target.classList.contains('c-bandha')) countUp();
      if (en.target.classList.contains('c-mail')) mailDemo();
      if (en.target.classList.contains('c-kuncung')) notchDemo();
      if (en.target.classList.contains('c-amalio')) salatDemo();
    });
  }, { threshold: 0.18 });
  revealEls.forEach((el) => io.observe(el));

  /* ---------------- Card spotlight ---------------- */
  $$('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ---------------- Demo: Bandha count-up ---------------- */
  function countUp() {
    const el = $('#bandhaNum');
    const target = +el.dataset.count;
    if (reduce) return;
    const t0 = performance.now(), dur = 1800;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * e).toLocaleString('id-ID');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------- Demo: Kuncung notch ---------------- */
  function notchDemo() {
    const n = $('#notch'), ico = $('#nIco'), txt = $('#nTxt'), ext = $('#nExt');
    const states = [
      { i: '♪', t: 'Lirik tersinkron', e: '0:42', w: 280 },
      { i: '◐', t: 'Maghrib 17.52', e: '−0:18', w: 260 },
      { i: '▲', t: 'IHSG 7.412', e: '+0,8%', w: 240 },
      { i: '✦', t: 'Tanya asisten AI', e: '⏎', w: 290 },
      null,
    ];
    let k = 0;
    const apply = (s) => {
      if (!s) { n.classList.remove('open', 'big'); n.style.width = ''; return; }
      n.classList.remove('open');
      ico.textContent = s.i; txt.textContent = s.t; ext.textContent = s.e;
      n.classList.add('big');
      n.style.width = Math.min(s.w, n.parentElement.clientWidth - 40) + 'px';
      n.classList.add('open');
    };
    const tick = () => { apply(states[k % states.length]); k++; };
    tick();
    if (!reduce) setInterval(tick, 2600);
    n.parentElement.addEventListener('pointerenter', () => { k = 0; tick(); });
  }

  /* ---------------- Demo: Tempmail ---------------- */
  function mailDemo() {
    const addr = $('#addrText'), inbox = $('#inbox');
    const names = ['kopi7q2x', 'rehat93k', 'tmp48zna', 'demo05mx'];
    const mails = [
      { a: 'V', s: 'Kode verifikasi: 482913', f: 'no-reply@layanan.id' },
      { a: 'S', s: 'Selamat datang di komunitas', f: 'halo@komunitas.co' },
      { a: 'K', s: 'Konfirmasi pendaftaran Anda', f: 'daftar@acara.id' },
    ];
    let n = 0;
    const addMail = (m) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="av">${m.a}</span><div><strong></strong><small></small></div>`;
      $('strong', li).textContent = m.s; $('small', li).textContent = m.f;
      inbox.appendChild(li);
    };
    if (reduce) { addr.textContent = names[0] + '@grezly.app'; mails.forEach(addMail); return; }
    (async function run() {
      for (;;) {
        const full = names[n++ % names.length] + '@grezly.app';
        addr.textContent = '';
        for (const ch of full) { addr.textContent += ch; await wait(55); }
        await wait(700);
        for (const m of mails) { addMail(m); await wait(850); }
        await wait(3200);
        $$('li', inbox).forEach((li) => li.classList.add('out'));
        await wait(500);
        inbox.innerHTML = '';
        await wait(300);
      }
    })();
  }

  /* ---------------- Demo: Amalio ---------------- */
  function salatDemo() {
    const items = $$('#salat li'), cnt = $('#iCount');
    if (reduce) { items.forEach((li) => li.classList.add('on')); cnt.textContent = items.length; return; }
    (async function run() {
      for (;;) {
        await wait(900);
        let c = 0;
        for (const li of items) { li.classList.add('on'); cnt.textContent = ++c; await wait(650); }
        await wait(3000);
        items.forEach((li) => li.classList.remove('on'));
        cnt.textContent = 0;
      }
    })();
  }

  $('#yr').textContent = new Date().getFullYear();
})();
