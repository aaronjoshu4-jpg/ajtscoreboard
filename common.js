/* AJT Tennis Club — shared front-end library. Same components render on TV, control laptop and spectator phones. */
(function () {
  'use strict';
  const E = window.TennisEngine;
  const App = (window.App = {});
  let offset = 0, es = null, connected = false, role = 'viewer', courtId = '', lastView = null;

  App.view = null;
  App.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = App.esc;
  App.now = () => Date.now() + offset;
  App.mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  App.clockTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* ---------- connection ---------- */
  function apply(v) {
    if (!v || v.empty) { App.view = v; if (App.onState) App.onState(v, lastView); return; }
    offset = v.now - Date.now();
    const prev = lastView; lastView = App.view = v;
    if (App.onState) App.onState(v, prev);
  }
  /* ---------- cloud (Netlify) mode: no live stream, so poll the API; set by window.AJT_CLOUD in the cloud build ---------- */
  const CLOUD = !!window.AJT_CLOUD; let ready = Promise.resolve();
  if (CLOUD) {
    const m = /[?&]code=([^&]*)/.exec(location.search);   // share link:  /live?code=XXXX  logs the guest in, then hides the code
    if (m) ready = fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: decodeURIComponent(m[1].replace(/\+/g, ' ')) }) })
      .then(() => { const u = new URL(location.href); u.searchParams.delete('code'); history.replaceState(null, '', u.pathname + u.search + u.hash); }).catch(() => {});
    document.addEventListener('click', (e) => {   // export downloads need the control PIN
      const a = e.target && e.target.closest && e.target.closest('a[href^="/api/export/"]'); if (!a) return;
      e.preventDefault(); const pin = localStorage.getItem('ajt_pin') || prompt('Control PIN?');
      if (pin) { localStorage.setItem('ajt_pin', pin); location.href = a.getAttribute('href').split('?')[0] + '?pin=' + encodeURIComponent(pin); }
    });
  }
  App.connect = function (o) {
    role = o.role || 'viewer'; courtId = o.court || ''; App.onState = o.onState; App.onStatus = o.onStatus;
    if (CLOUD) {
      const staff = role === 'umpire' || role === 'control';
      const every = staff ? 1500 : (role === 'tv' ? 2000 : 4000);
      const poll = async () => {
        try {
          const pin = localStorage.getItem('ajt_pin'); const h = {}; if (staff && pin) h['x-pin'] = pin;
          const r = await fetch('/api/state' + (staff ? '' : '?c=1'), { cache: 'no-store', headers: h });
          if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return; }
          let j; try { j = await r.json(); } catch (x) { throw new Error('The scoreboard server did not answer (error ' + r.status + '). Open /api/health to see why.'); }
          if (!r.ok) throw new Error((j && j.error) || ('Server error ' + r.status) + ' — open /api/health to see why.');
          connected = true; if (App.onStatus) App.onStatus(true); apply(j);
        } catch (e) {
          connected = false; if (App.onStatus) App.onStatus(false);
          const msg = e && e.message; if (msg && !/Failed to fetch|NetworkError|Load failed/i.test(msg) && Date.now() - (poll.last || 0) > 20000) { poll.last = Date.now(); App.toast(msg, 'err'); }
        }
      };
      ready.then(() => { poll(); setInterval(poll, every); });
      return;
    }
    const open = () => {
      es = new EventSource(`/api/events?role=${encodeURIComponent(role)}&court=${encodeURIComponent(courtId)}`);
      es.addEventListener('state', (e) => { connected = true; if (App.onStatus) App.onStatus(true); apply(JSON.parse(e.data)); });
      es.onerror = () => { connected = false; if (App.onStatus) App.onStatus(false); };
    };
    open();
    setInterval(async () => { // fallback poll if the stream is down
      if (connected) return;
      try { const r = await fetch('/api/state', { cache: 'no-store' }); apply(await r.json()); } catch (e) { /* offline */ }
    }, 3000);
    setInterval(() => { // restart a dead stream
      if (!connected && es && es.readyState === 2) { es.close(); open(); }
    }, 5000);
  };
  App.send = async function (action, retried) {
    action.opId = uid(); action.role = role;
    const pin = localStorage.getItem('ajt_pin'); if (pin) action.pin = pin;
    try {
      const r = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) });
      const j = await r.json();
      if (j.state) apply(j.state);
      if (!j.ok) {
        if (j.needPin && !retried) { const p = prompt('Control PIN?'); if (p) { localStorage.setItem('ajt_pin', p); return App.send(action, true); } }
        App.toast(j.error || 'Something went wrong', 'err');
      }
      return j;
    } catch (e) { App.toast('Not connected — action NOT saved', 'err'); return { ok: false }; }
  };

  /* ---------- ui helpers ---------- */
  App.toast = function (msg, kind) {
    let box = document.querySelector('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 4200 : 1800);
  };
  App.modal = function (o) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><h2>${esc(o.title || '')}</h2><div class="mb">${o.body || ''}</div><div class="row"></div></div>`;
    const row = bg.querySelector('.row'); const close = () => bg.remove();
    (o.buttons || [{ label: 'Close', cls: 'k' }]).forEach((b) => {
      const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.label;
      el.onclick = async () => { if (b.fn) { const r = await b.fn(bg); if (r === false) return; } close(); }; row.appendChild(el);
    });
    bg.addEventListener('click', (e) => { if (e.target === bg && !o.sticky) close(); });
    document.body.appendChild(bg); if (o.onMount) o.onMount(bg); return close;
  };
  setInterval(() => {
    document.querySelectorAll('[data-ends]').forEach((el) => { el.textContent = App.mmss(+el.dataset.ends - App.now()); });
  }, 200);

  /* ---------- decorations (inline SVG, offline) ---------- */
  App.deco = {
    ghost: (c = '#fff') => `<svg viewBox="0 0 64 80" width="100%" height="100%"><path d="M32 4C16 4 8 17 8 32v40l8-7 8 7 8-7 8 7 8-7 8 7V32C56 17 48 4 32 4z" fill="${c}"/><ellipse cx="24" cy="32" rx="4.5" ry="6" fill="#1a0634"/><ellipse cx="42" cy="32" rx="4.5" ry="6" fill="#1a0634"/><ellipse cx="33" cy="47" rx="5" ry="6.5" fill="#1a0634"/></svg>`,
    bat: (c = '#1a0634') => `<svg viewBox="0 0 90 40" width="100%" height="100%"><path d="M45 14c-3-6-6-8-9-8 2 4 1 7-1 9C28 9 14 8 2 16c8 0 13 3 15 9 3-3 7-4 11-2 3 2 5 6 7 10 2-2 3-5 4-9 1 4 2 7 4 9 2-4 4-8 7-10 4-2 8-1 11 2 2-6 7-9 15-9C76 8 62 9 55 15c-2-2-3-5-1-9-3 0-6 2-9 8z" fill="${c}"/></svg>`,
    pumpkin: () => `<svg viewBox="0 0 64 56" width="100%" height="100%"><path d="M30 8c0-4 3-6 6-6" stroke="#6fd11a" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="32" rx="17" ry="20" fill="#ff7a14"/><ellipse cx="44" cy="32" rx="17" ry="20" fill="#ff7a14"/><ellipse cx="32" cy="32" rx="12" ry="22" fill="#ffa53d"/><path d="M20 28l5 7h-10zM44 28l5 7H39zM22 44q10 8 20 0-10 3-20 0z" fill="#1a0634"/></svg>`,
    web: (c = 'rgba(255,255,255,.35)') => `<svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" stroke="${c}" stroke-width="1.2"><path d="M0 0L120 0M0 0L0 120M0 0L110 70M0 0L70 110M0 0L120 30M0 0L30 120"/><path d="M22 0Q18 18 0 22M45 0Q38 38 0 45M70 0Q58 58 0 70M95 0Q78 78 0 95"/></svg>`,
    zig: (a = '#ff7a14', b = '#9dff2e') => `<svg viewBox="0 0 400 800" width="100%" height="100%" preserveAspectRatio="none"><polygon points="0,0 400,260 250,330 400,520 190,540 330,800 0,800" fill="#0b0612"/><polyline points="0,40 360,270 220,340 380,520 170,550 300,790" fill="none" stroke="${a}" stroke-width="14" stroke-linejoin="miter"/><polyline points="0,80 330,285 200,350 350,520 160,560 270,780" fill="none" stroke="${b}" stroke-width="8" stroke-linejoin="miter"/></svg>`
  };

  /* ---------- player faces ---------- */
  const initials = (n) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  const hue = (n) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  App.avatar = function (name, size) {
    const k = String(name).trim().toLowerCase(); const p = App.view && App.view.players && App.view.players[k];
    const sz = size || '1.6em';
    if (p && p.photo) return `<span class="av" style="--s:${sz}"><img src="${esc(p.photo)}" alt="" loading="lazy"></span>`;
    return `<span class="av ini" style="--s:${sz};--h:${hue(name)}"><i>${esc(initials(name) || '?')}</i></span>`;
  };
  App.sideNames = (str) => String(str).split('/').map((s) => s.trim()).filter(Boolean);
  App.sideAvatars = (str, size) => `<span class="avs">${App.sideNames(str).slice(0, 2).map((n) => App.avatar(n, size)).join('')}</span>`;
  App.dispName = (n) => { const p = App.view && App.view.players && App.view.players[String(n).trim().toLowerCase()]; return p ? p.name : n; };
  App.sideLabel = (str) => App.sideNames(str).map(App.dispName).join(' / ');

  /* photo upload: square-crop + shrink in the browser so files stay tiny */
  App.uploadPhoto = function (name, file) {
    return new Promise((resolve) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = async () => {
        const S = 320, c = document.createElement('canvas'); c.width = c.height = S;
        const m = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 3 > 0 ? Math.max(0, (img.height - m) / 3) : 0, m, m, 0, 0, S, S);
        URL.revokeObjectURL(url);
        c.toBlob(async (blob) => {
          try {
            const r = await fetch('/api/photo?name=' + encodeURIComponent(name), { method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-pin': localStorage.getItem('ajt_pin') || '' }, body: blob });
            const j = await r.json(); if (j.state) apply(j.state); if (!j.ok) App.toast(j.error || 'Upload failed', 'err'); resolve(j.ok);
          } catch (e) { App.toast('Upload failed', 'err'); resolve(false); }
        }, 'image/jpeg', 0.86);
      };
      img.onerror = () => { App.toast('Could not read that image', 'err'); resolve(false); };
      img.src = url;
    });
  };

  /* ---------- scoreboard components ---------- */
  App.statRowsHTML = function (m) {
    return `<div class="stats">${E.statRows(m).map((r) => {
      const tot = r.a + r.b; const pa = tot ? (100 * r.a) / tot : 50;
      return `<div class="srow"><span class="va">${esc(r.fa)}</span><div class="mid"><div class="lab">${esc(r.label)}</div><div class="bar"><i class="ba" style="width:${pa}%"></i><i class="bb" style="width:${100 - pa}%"></i></div></div><span class="vb">${esc(r.fb)}</span></div>`;
    }).join('')}</div>`;
  };
  App.gameLogHTML = function (m) {
    if (!m.gameLog || !m.gameLog.length) return '';
    return `<div class="glog">GAMES ${m.gameLog.map((g) => `<i class="w${g.w}${g.brk ? ' brk' : ''}${g.sd ? ' sd' : ''}" title="${esc(m.names[g.w])}${g.brk ? ' (break)' : ''}${g.sd ? ' (sudden death)' : ''}">${g.n}</i>`).join('')}<span style="margin-left:.6em;opacity:.7">white ring = break · red ring = sudden death</span></div>`;
  };
  function faceoff(m) {
    return `<div class="faceoff"><div class="fo a">${App.sideAvatars(m.names[0], '6.2em')}<b>${esc(App.sideLabel(m.names[0]))}</b></div><div class="x">vs</div><div class="fo b">${App.sideAvatars(m.names[1], '6.2em')}<b>${esc(App.sideLabel(m.names[1]))}</b></div></div>`;
  }
  App.faceoff = faceoff;
  App.sbHTML = function (m) {
    const live = m.status === 'live', fin = m.status === 'finished';
    const row = (s) => {
      const cls = ['sbrow', 's' + s]; if (live && m.server === s) cls.push('serving');
      if (fin && m.winner === s) cls.push('win'); if (fin && m.winner !== s && m.winner !== -1) cls.push('lose');
      return `<div class="${cls.join(' ')}"><span class="ball"></span><span class="pname">${App.sideAvatars(m.names[s], '1.05em')}<span class="nm">${esc(App.sideLabel(m.names[s]))}</span></span><span class="games">${m.games[s]}</span><span class="pts">${fin ? (m.winner === s ? '★' : '') : m.ptext[s]}</span></div>`;
    };
    return `<div class="sb"><div class="sbh"><span></span><span style="text-align:left">${fin ? 'FINAL' : 'PLAYER'}</span><span>GAMES</span><span>${fin ? '' : 'POINT'}</span></div>${row(0)}${row(1)}</div>`;
  };
  App.courtCard = function (c, o) {
    o = o || {}; const m = c.current, cfg = c.cfg, v = App.view, next = (v.queue[c.id] || [])[0];
    const st = m ? m.status : 'open';
    const chip = { live: '<span class="chip live">Live</span>', warmup: '<span class="chip warm">Warm-up</span>', ready: '<span class="chip warm">Get ready</span>', finished: '<span class="chip final">Final</span>', open: '<span class="chip open">Court open</span>' }[st];
    let body = '';
    if (!m) {
      body = `<div class="idle"><div class="h">COURT OPEN</div>${next ? `<div class="mut" style="margin:.5em 0 .2em;letter-spacing:.15em;font-weight:800">UP NEXT</div>${faceoff(next)}` : '<div class="mut" style="margin-top:.6em">No matches queued for this court yet</div>'}</div>`;
    } else if (st === 'warmup') {
      body = `<div class="bigmsg">${faceoff(m)}<div class="count" data-ends="${m.warmupEndsAt}">${App.mmss(m.warmupEndsAt - App.now())}</div><div class="tag o" style="font-size:1.1em">Warm-up</div></div>`;
    } else if (st === 'ready') {
      body = `<div class="bigmsg">${faceoff(m)}<div class="h" style="margin-top:.3em">GET READY</div><div class="mut">Umpire is about to start the match</div></div>`;
    } else {
      let sit = '';
      if (st === 'live') {
        if (m.sit) sit += `<span class="badge ${m.sit.kind}">${esc(m.sit.label)}${m.sit.side !== null && m.sit.kind !== 'sudden' ? ' · ' + esc(App.sideLabel(m.names[m.sit.side]).split('/')[0].trim()) : ''}</span>`;
        if (m.faultPending) sit += '<span class="badge fault">2ND SERVE</span>';
        sit += `<span class="mut" style="font-size:.8em;letter-spacing:.1em;font-weight:800">SERVING: ${esc(App.sideLabel(m.names[m.server]))}</span>`;
      } else {
        const w = m.winner; sit = `<div class="final-ribbon" style="width:100%"><span class="tag o">${w === -1 ? 'Match drawn' : esc(App.sideLabel(m.names[w])) + ' wins!'}</span>${m.endedBy === 'manual' ? '<span class="mut" style="margin-left:.6em;font-size:.8em">ended early</span>' : ''}</div>`;
      }
      body = App.sbHTML(m) + `<div class="sit">${sit}</div>` + App.gameLogHTML(m) + (o.compact ? '' : App.statRowsHTML(m));
    }
    return `<section class="court c${cfg.id}" data-court="${cfg.id}"><div class="ch"><span class="ctag">${esc(cfg.name)}</span><span class="clevel">${esc(cfg.level)}</span>${chip}<span class="cfmt">First to ${cfg.gamesTo} games · sudden death on 2nd deuce</span></div>${body}</section>`;
  };

  /* ---------- queue ---------- */
  App.queueList = function (cid, o) {
    o = o || {}; const q = (App.view.queue[cid] || []); const cs = App.view.courts[cid];
    if (!q.length) return '<div class="mut" style="padding:.6em">Nothing queued.</div>';
    return q.slice(0, o.limit || 99).map((m, i) => {
      const warm = m.warmup === true || (i === 0 && cs && cs.started === 0 && !cs.current);
      const ctrl = o.controls ? `<div class="acts"><button class="btn sm k" data-q="up" data-id="${m.id}">↑</button><button class="btn sm k" data-q="down" data-id="${m.id}">↓</button><button class="btn sm k" data-q="edit" data-id="${m.id}">Edit</button><button class="btn sm k" data-q="swap" data-id="${m.id}" title="Move to the other court">⇄</button><button class="btn sm d" data-q="del" data-id="${m.id}">✕</button></div>` : (warm ? '<span class="tag k" style="font-size:.7em">warm-up</span>' : '');
      return `<div class="qi${i === 0 ? ' first' : ''}"><div class="n">${i === 0 ? '▶' : i + 1}</div><div class="t">${App.sideAvatars(m.names[0], '1.7em')}<span class="a">${esc(App.sideLabel(m.names[0]))}</span><span class="x">vs</span>${App.sideAvatars(m.names[1], '1.7em')}<span class="b">${esc(App.sideLabel(m.names[1]))}</span></div>${ctrl}</div>`;
    }).join('');
  };

  /* ---------- rankings ---------- */
  App.rankTable = function (level, o) {
    o = o || {}; const rows = (App.view.rankings[level] || []).slice(0, o.limit || 10);
    if (!rows.length) return '<div class="mut" style="padding:.6em">No players yet.</div>';
    return `<table class="rk"><thead><tr><th>#</th><th>Player</th><th>W-L</th><th>GD</th><th>Streak</th><th>Form</th><th>PTS</th></tr></thead><tbody>${rows.map((r) =>
      `<tr class="r${r.rank}"><td class="rn">${r.rank}</td><td class="nm">${App.avatar(r.name, '1.1em')} ${esc(App.dispName(r.name))}</td><td>${r.W}-${r.L}${r.D ? '-' + r.D : ''}</td><td>${r.GD > 0 ? '+' : ''}${r.GD}</td><td>${r.streak ? '🔥' + r.streak : '–'}</td><td class="frm">${r.last.map((f) => `<span class="${f}">${f}</span>`).join('') || '–'}</td><td class="pt">${r.pts}</td></tr>`).join('')}</tbody></table>`;
  };

  /* ---------- awards ---------- */
  App.topPlayerCards = function () {
    const v = App.view; return Object.values(v.settings.courts).map((cfg) => {
      const tp = v.topPlayers && v.topPlayers[cfg.level];
      return `<div class="panel award c${cfg.id}"><div class="k">👑 Top player · ${esc(cfg.name)} · ${esc(cfg.level)}</div>${tp ? `<div style="display:flex;justify-content:center;margin:.4em 0">${App.avatar(tp.name, '5.2em')}</div><div class="v">${esc(App.dispName(tp.name))}</div><div class="s">${tp.W}W ${tp.L}L · ${tp.pts} pts · game diff ${tp.GD > 0 ? '+' : ''}${tp.GD}</div>` : '<div class="v tbd">To be decided…</div><div class="s">Leader appears after the first match</div>'}</div>`;
    }).join('');
  };
  App.dressedCards = function () {
    const d = (App.view.awards && App.view.awards.dressed) || {};
    const defs = [['spooky', '🎃 Spooky'], ['goofy', '🤪 Goofy'], ['legendary', '⚡ Legendary']];
    return defs.map(([k, label]) => `<div class="panel award"><div class="k">Best dressed · ${label}</div>${d[k] ? `<div style="display:flex;justify-content:center;margin:.3em 0">${App.avatar(d[k], '3.6em')}</div><div class="v">${esc(App.dispName(d[k]))}</div>` : '<div class="v tbd">Judging…</div>'}</div>`).join('');
  };
  App.raffleList = function () {
    const r = (App.view.awards && App.view.awards.raffle) || { prizes: [] };
    if (!r.prizes.length) return '<div class="mut" style="padding:.6em">Raffle prizes will be announced.</div>';
    return r.prizes.map((p) => `<div class="prize"><div><div class="b">${esc(p.brand || 'Prize')}</div><div>${esc(p.prize)}</div></div><div class="w ${p.winner ? '' : 'tbd'}">${p.winner ? esc(App.dispName(p.winner)) : 'to be drawn'}</div></div>`).join('');
  };

  /* ---------- dialogs shared by umpire + control ---------- */
  App.endMatchDialog = function (cid) {
    const c = App.view.courts[cid]; const m = c && c.current; if (!m || m.status !== 'live') return;
    const send = (w) => App.send({ type: 'end_match', court: cid, matchId: m.id, winner: w });
    const a = App.sideLabel(m.names[0]), b = App.sideLabel(m.names[1]);
    App.modal({
      title: 'End match now?',
      body: `<p style="margin:.2em 0 .8em">Current score <b>${m.games[0]}–${m.games[1]}</b> in games. Pick the result:</p>`,
      buttons: [
        { label: a + ' wins', cls: 'o', fn: () => { send(0); } },
        { label: b + ' wins', cls: 'g', fn: () => { send(1); } },
        { label: 'Draw', cls: 'c', fn: () => { send(-1); } },
        { label: 'Cancel', cls: 'k' }
      ]
    });
  };

  App.dotsHTML = (clients) => `<span class="dot ${clients.tv ? 'on' : ''}"></span> TV ${clients.tv || 0} &nbsp; <span class="dot ${clients.umpire1 ? 'on' : ''}"></span> Ump C1 &nbsp; <span class="dot ${clients.umpire2 ? 'on' : ''}"></span> Ump C2`;
})();
