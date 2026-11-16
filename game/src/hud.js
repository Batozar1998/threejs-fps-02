// The DOM HUD: health, armour, ammo, money, timer, score, team rosters, killfeed, the
// crosshair that opens with spread, the buy menu, the minimap and the banners. It never
// touches the simulation; main.js pushes numbers in and reads button callbacks out.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'), play: $('play'),
    buy: $('buy'), buyGrid: $('buy-grid'), buyMoney: $('buy-money'), buyHint: $('buy-hint'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    health: $('health-num'), healthBar: $('health-bar'), armor: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    weaponName: $('weapon-name'), money: $('money-num'), timer: $('timer-num'),
    scoreA: $('score-a'), scoreB: $('score-b'), roundNum: $('round-num'),
    teamA: $('team-a'), teamB: $('team-b'), feed: $('killfeed'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    spike: $('spike'), spikeBar: $('spike-bar'), spikeText: $('spike-text'),
    vignette: $('vignette'), minimap: $('minimap'),
    prompt: $('prompt'), promptText: $('prompt-text'),
  };
  let hitTimer = 0;
  let last = {};
  let bannerTimer = 0;

  function setText(node, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  return {
    setHealth(hp, armor) {
      setText(el.health, 'hp', String(Math.max(0, Math.ceil(hp))));
      setText(el.armor, 'armor', String(armor));
      const pct = Math.max(0, Math.min(100, hp));
      if (last.hppct !== pct) {
        last.hppct = pct;
        el.healthBar.style.width = `${pct}%`;
        el.healthBar.classList.toggle('low', pct <= 30);
      }
    },
    setAmmo(mag, reserve, name, grenades) {
      setText(el.ammoMag, 'mag', String(mag));
      setText(el.ammoReserve, 'res', `/ ${reserve}`);
      setText(el.weaponName, 'wname', `${name}${grenades ? `  ·  ${grenades} frag` : ''}`);
      el.ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(value) { setText(el.money, 'money', String(value)); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(el.timer, 'timer', phase === 'buy' ? `BUY ${text}` : text);
      el.timer.classList.toggle('urgent', seconds <= 10 && phase === 'round');
    },
    setScore(a, b, round) {
      setText(el.scoreA, 'sa', String(a));
      setText(el.scoreB, 'sb', String(b));
      setText(el.roundNum, 'round', `ROUND ${round}`);
    },
    setTeams(attackers, defenders) {
      const render = (list, node, key) => {
        const html = list.map((p) => `<li class="${p.alive ? '' : 'dead'}"><span class="dot"></span>${p.name}<span class="hp">${p.alive ? p.hp : '✕'}</span></li>`).join('');
        if (last[key] !== html) { last[key] = html; node.innerHTML = html; }
      };
      render(attackers, el.teamA, 'ta');
      render(defenders, el.teamB, 'tb');
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      row.className = `feed-row ${killerTeam}`;
      row.innerHTML = `<b>${killer}</b> ${headshot ? '⌖' : '→'} <b>${victim}</b>`;
      el.feed.prepend(row);
      while (el.feed.children.length > 5) el.feed.lastChild.remove();
      setTimeout(() => row.classList.add('fade'), 4200);
      setTimeout(() => row.remove(), 5000);
    },
    hitMarker(killed, headshot) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', killed);
      el.hitmarker.classList.toggle('head', headshot);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill', 'head'), killed ? 260 : 110);
    },
    setSpread(px) {
      const v = Math.max(4, Math.min(26, px));
      if (last.spread === v) return;
      last.spread = v;
      el.crosshair.style.setProperty('--gap', `${v}px`);
    },
    hurtFlash() {
      el.vignette.classList.remove('hurt');
      void el.vignette.offsetWidth;
      el.vignette.classList.add('hurt');
    },
    banner(title, sub, ms = 2600) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
      el.banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { el.banner.hidden = true; }, ms);
    },
    hideBanner() { el.banner.hidden = true; },
    setSpike(status, frac, text) {
      if (status === 'none') { el.spike.hidden = true; return; }
      el.spike.hidden = false;
      el.spikeBar.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
      el.spikeText.textContent = text;
      el.spike.classList.toggle('danger', status === 'planted');
    },
    showPrompt(text) {
      el.prompt.hidden = false;
      el.promptText.textContent = text;
    },
    hidePrompt() { el.prompt.hidden = true; },
    showBuy(money, owned) {
      el.buy.hidden = false;
      el.buyMoney.textContent = `$${money}`;
      el.buyGrid.querySelectorAll('[data-buy]').forEach((btn) => {
        const id = btn.dataset.buy;
        btn.classList.toggle('owned', owned.includes(id));
        btn.disabled = owned.includes(id);
      });
    },
    hideBuy() { el.buy.hidden = true; },
    setBuyHint(text) { el.buyHint.textContent = text; },
    onBuy(handler) {
      el.buyGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-buy]');
        if (btn && !btn.disabled) handler(btn.dataset.buy);
      });
    },
    drawMinimap(dots, sites, bounds) {
      const ctx = el.minimap.getContext('2d');
      if (!ctx) return;
      const w = el.minimap.width;
      const h = el.minimap.height;
      const px = (x) => ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * w;
      const py = (z) => ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * h;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(20,16,12,0.72)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(242,232,213,0.35)';
      ctx.strokeRect(px(bounds.minX) + 1, py(bounds.minZ) + 1, px(bounds.maxX) - px(bounds.minX) - 2, py(bounds.maxZ) - py(bounds.minZ) - 2);
      ctx.font = 'bold 10px system-ui';
      for (const s of sites) {
        ctx.fillStyle = '#ff9a2e';
        ctx.fillText(s.label, px(s.x) - 3, py(s.z) - 5);
        ctx.strokeStyle = 'rgba(255,154,46,0.7)';
        ctx.strokeRect(px(s.x - s.half), py(s.z - s.half), px(s.x + s.half) - px(s.x - s.half), py(s.z + s.half) - py(s.z - s.half));
      }
      for (const d of dots) {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(px(d.x), py(d.z), d.you ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
        if (d.you) {
          ctx.strokeStyle = '#f2e8d5';
          ctx.beginPath();
          ctx.arc(px(d.x), py(d.z), 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
    showOverlay(mode, detail) {
      const texts = {
        start: ['EMBER YARD', 'A dusk freight yard. Your squad attacks: plant the spike on A or B, or wipe the Cinder crew. First to 7 rounds takes the yard.', 'Click to play'],
        paused: ['EMBER YARD', 'Paused. Click to resume.', 'Click to resume'],
        end: ['YARD TAKEN', detail || 'Match over.', 'Play again'],
        lost: ['YARD LOST', detail || 'Match over.', 'Play again'],
      };
      const [title, copy, action] = texts[mode];
      el.title.textContent = title;
      el.copy.textContent = copy;
      el.play.textContent = action;
      el.overlay.hidden = false;
      el.play.focus();
    },
    hideOverlay() { el.overlay.hidden = true; },
    onPlay(handler) { el.play.addEventListener('click', handler); },
  };
}
