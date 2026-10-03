/**
 * Music Director — the window.
 *
 * Built to be popped out: everything lives inside the app's own element (no global dialogs, no
 * document-level listeners), so it works the same in the main window or a detached one.
 * The skeleton renders once; filters, the list and the now-playing bar update in place.
 */
import { MOD, L, gameMeta, setGame, renameGame, setCategory, setSeries, setTitle, rescan, buildTracks, autoTagUnsorted } from "./library.js";
import * as PL from "./player.js";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const fmt = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "");
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const CATEGORY_ORDER = ["Games", "Anime, TV & Film", "Artists & Albums", "Ambience & Libraries", "Unsorted"];

const VIEW_KEY = `${MOD}.view`;
function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}");
    return { search: "", view: v.view ?? "all", types: new Set(v.types ?? []), games: new Set(v.games ?? []), sort: v.sort ?? "title", collapsed: new Set(v.collapsed ?? []), tag: false };
  } catch { return { search: "", view: "all", types: new Set(), games: new Set(), sort: "title", collapsed: new Set(), tag: false }; }
}
function saveView(v) {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ view: v.view, types: [...v.types], games: [...v.games], sort: v.sort, collapsed: [...v.collapsed] })); } catch { /* ignore */ }
}

export class MusicDirector extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "music-director",
    classes: ["music-director"],
    window: { title: "Music Director", icon: "fa-solid fa-music", resizable: true },
    position: { width: 960, height: 720 },
  };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Music Director is for the GM.");
    const existing = foundry.applications.instances.get("music-director");
    if (existing?.rendered) { existing.bringToFront?.(); return existing; }
    const app = existing ?? new MusicDirector();
    let pos = {};
    try { pos = JSON.parse(localStorage.getItem(`${MOD}.pos`) ?? "{}"); } catch { /* ignore */ }
    const opts = { force: true, position: pos };
    if (game.settings.get(MOD, "detached")) opts.window = { detached: true };
    app.render(opts);
    return app;
  }

  static refresh(full = false) {
    const app = foundry.applications.instances.get("music-director");
    if (!app?.rendered) return;
    if (full) { buildTracks(); app.refreshAll(); } else app.refreshNow();
  }

  constructor(options) {
    super(options);
    this.v = loadView();
    this.cursor = null;
    this.selected = new Set();
    this.lastClicked = null;
    this.listKeys = [];
    this.onPlayer = () => this.refreshNow(true);
  }

  /* ---------------------------------------------------------------- skeleton */

  async _renderHTML() {
    return `<div class="md-root" tabindex="-1">
      <section class="md-now">
        <div class="md-layer md-music" data-layer="music"></div>
        <div class="md-layer md-amb" data-layer="ambience"></div>
      </section>
      <section class="md-bar">
        <div class="md-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="md-q" placeholder="Search titles, games, types…  ( / )" autocomplete="off" spellcheck="false"></div>
        <nav class="md-views">
          <button type="button" data-view="all">All</button>
          <button type="button" data-view="fav"><i class="fa-solid fa-star"></i><span> Favorites</span></button>
          <button type="button" data-view="set"><i class="fa-solid fa-list-ol"></i><span> Set list</span></button>
          <button type="button" data-view="recent"><i class="fa-solid fa-clock-rotate-left"></i><span> Recent</span></button>
        </nav>
        <button type="button" class="md-shuffle" data-act="shuffle" data-tooltip="Shuffle everything showing, and keep going (S)"><i class="fa-solid fa-shuffle"></i> Shuffle</button>
        <button type="button" class="md-icon md-gamesbtn" data-act="rail" data-tooltip="Games"><i class="fa-solid fa-gamepad"></i></button>
        <button type="button" class="md-icon md-tagbtn" data-act="tagmode" data-tooltip="Tag mode — set games and titles (T)"><i class="fa-solid fa-tags"></i></button>
        <button type="button" class="md-icon" data-act="menu" data-tooltip="More"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        <div class="md-menu" hidden>
          <button type="button" data-act="rescan"><i class="fa-solid fa-rotate"></i> Rescan music folder</button>
          <button type="button" data-act="autotag"><i class="fa-solid fa-wand-magic-sparkles"></i> Guess games for Unsorted</button>
          <button type="button" data-act="sort" data-sort="title"><i class="fa-solid fa-arrow-down-a-z"></i> Sort by title</button>
          <button type="button" data-act="sort" data-sort="game"><i class="fa-solid fa-gamepad"></i> Sort by game</button>
          <button type="button" data-act="sort" data-sort="dur"><i class="fa-solid fa-hourglass-half"></i> Sort by length</button>
          <button type="button" data-act="clearset"><i class="fa-solid fa-broom"></i> Clear set list</button>
          <button type="button" data-act="keys"><i class="fa-solid fa-keyboard"></i> Keyboard shortcuts</button>
        </div>
      </section>
      <section class="md-types"></section>
      <section class="md-body">
        <aside class="md-rail">
          <div class="md-railhead"><input type="search" class="md-gq" placeholder="Filter games…" autocomplete="off" spellcheck="false"></div>
          <div class="md-games"></div>
        </aside>
        <div class="md-main">
          <div class="md-list" role="listbox"></div>
          <div class="md-tagbar" hidden></div>
        </div>
      </section>
      <footer class="md-foot"></footer>
      <div class="md-keys" hidden>
        <h3>Keyboard</h3>
        <dl>
          <dt>/</dt><dd>Search</dd><dt>↑ ↓</dt><dd>Move</dd><dt>Enter</dt><dd>Play (Shift+Enter: other layer)</dd>
          <dt>Space</dt><dd>Pause / resume music</dd><dt>N</dt><dd>Next (shuffle / set list)</dd><dt>S</dt><dd>Shuffle what's showing</dd>
          <dt>P</dt><dd>Preview in your headphones only</dd><dt>F</dt><dd>Favorite</dd><dt>A</dt><dd>Add to / remove from set list</dd>
          <dt>T</dt><dd>Tag mode</dd><dt>X</dt><dd>Select (tag mode)</dd><dt>Esc</dt><dd>Clear search / stop preview</dd>
        </dl>
        <button type="button" data-act="keys">Close</button>
      </div>
    </div>`;
  }

  _replaceHTML(html, content) {
    if (this._built) return;
    content.innerHTML = html;
    this._built = true;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this._wired) { this.refreshAll(); return; }
    this._wired = true;
    const root = this.element.querySelector(".md-root");
    this.root = root;
    root.querySelector(".md-q").value = this.v.search;
    root.addEventListener("click", (e) => this.#onClick(e));
    root.addEventListener("dblclick", (e) => this.#onDblClick(e));
    root.addEventListener("input", (e) => this.#onInput(e));
    root.addEventListener("change", (e) => this.#onChange(e));
    root.addEventListener("keydown", (e) => this.#onKey(e));
    root.addEventListener("dragstart", (e) => this.#onDragStart(e));
    root.addEventListener("dragover", (e) => this.#onDragOver(e));
    root.addEventListener("drop", (e) => this.#onDrop(e));
    PL.P.listeners.add(this.onPlayer);
    this.timer = setInterval(() => this.#tick(), 500);
    this.refreshAll();
    setTimeout(() => root.querySelector(".md-q")?.focus(), 50);
  }

  async close(options) {
    try { localStorage.setItem(`${MOD}.pos`, JSON.stringify({ width: this.position.width, height: this.position.height, left: this.position.left, top: this.position.top })); } catch { /* ignore */ }
    clearInterval(this.timer);
    PL.P.listeners.delete(this.onPlayer);
    PL.stopPreview();
    this._built = false; this._wired = false;
    return super.close(options);
  }

  /* ---------------------------------------------------------------- data */

  baseList() {
    const T = L.tracks;
    if (this.v.view === "fav") return PL.favorites().map((k) => T.get(k)).filter(Boolean);
    if (this.v.view === "set") return PL.setlist().map((k) => T.get(k)).filter(Boolean);
    if (this.v.view === "recent") return PL.recent().map((k) => T.get(k)).filter(Boolean);
    return [...T.values()];
  }

  matchSearch(t) {
    const q = this.v.search.trim().toLowerCase();
    if (!q) return true;
    const hay = `${t.title} ${t.game} ${[...t.types].join(" ")} ${t.key}`.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  }
  matchTypes(t) { if (!this.v.types.size) return true; for (const ty of this.v.types) if (t.types.has(ty)) return true; return false; }
  matchGames(t) { return !this.v.games.size || this.v.games.has(t.game); }

  filtered() {
    let list = this.baseList().filter((t) => this.matchSearch(t) && this.matchTypes(t) && this.matchGames(t));
    if (this.v.view === "all" || this.v.view === "fav") {
      const by = this.v.sort;
      list.sort((a, b) => by === "game" ? (a.game.localeCompare(b.game) || a.title.localeCompare(b.title))
        : by === "dur" ? ((a.dur ?? 9e9) - (b.dur ?? 9e9)) : a.title.localeCompare(b.title));
    }
    return list;
  }

  filterLabel() {
    const parts = [];
    if (this.v.games.size) {
      const left = new Set(this.v.games), names = [];
      const bySeries = new Map();
      for (const t of L.tracks.values()) { const s = gameMeta(t.game).series; if (s) (bySeries.get(s) ?? bySeries.set(s, new Set()).get(s)).add(t.game); }
      for (const [s, gs] of bySeries) if ([...gs].every((g) => left.has(g))) { names.push(s); gs.forEach((g) => left.delete(g)); }
      names.push(...left);
      parts.push(names.join(" + "));
    }
    if (this.v.types.size) parts.push([...this.v.types].join(" + "));
    if (this.v.search) parts.push(`“${this.v.search}”`);
    if (this.v.view !== "all") parts.push({ fav: "Favorites", set: "Set list", recent: "Recent" }[this.v.view]);
    return parts.join(" · ") || "Everything";
  }

  /* ---------------------------------------------------------------- rendering parts */

  refreshAll() {
    if (!this.root) return;
    this.renderViews(); this.renderTypes(); this.renderGames(); this.renderList(); this.refreshNow(true); this.renderTagbar();
    saveView(this.v);
  }

  renderViews() {
    for (const b of this.root.querySelectorAll(".md-views [data-view]")) b.classList.toggle("active", b.dataset.view === this.v.view);
    this.root.querySelector(".md-tagbtn").classList.toggle("active", this.v.tag);
    this.root.classList.toggle("tagging", this.v.tag);
    const sb = this.root.querySelector(".md-shuffle");
    sb.innerHTML = this.v.view === "set" ? `<i class="fa-solid fa-play"></i> Play set list` : `<i class="fa-solid fa-shuffle"></i> Shuffle`;
    sb.dataset.tooltip = this.v.view === "set" ? "Play the set list in order, from the top" : "Shuffle everything showing, and keep going (S)";
  }

  renderTypes() {
    const counts = new Map();
    let total = 0;
    for (const t of this.baseList()) {
      if (!this.matchSearch(t) || !this.matchGames(t)) continue;
      total++;
      for (const ty of t.types) counts.set(ty, (counts.get(ty) ?? 0) + 1);
    }
    const order = game.playlists.filter((p) => !p.getFlag(MOD, "role")).map((p) => p.name);
    const names = [...new Set([...this.v.types, ...counts.keys()])].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
    });
    const chip = (name, n) => `<button type="button" class="md-chip ${this.v.types.has(name) ? "on" : ""} ${n ? "" : "zero"}" data-type="${esc(name)}">${esc(name)}<span>${n}</span></button>`;
    this.root.querySelector(".md-types").innerHTML =
      `<button type="button" class="md-chip ${this.v.types.size ? "" : "on"}" data-type="">All types<span>${total}</span></button>` +
      names.map((n) => chip(n, counts.get(n) ?? 0)).join("");
  }

  renderGames() {
    const counts = new Map();
    let total = 0;
    for (const t of this.baseList()) {
      if (!this.matchSearch(t) || !this.matchTypes(t)) continue;
      total++;
      counts.set(t.game, (counts.get(t.game) ?? 0) + 1);
    }
    const gq = this.root.querySelector(".md-gq").value.trim().toLowerCase();
    const allGames = new Set([...counts.keys(), ...this.v.games]);
    if (this.v.tag) for (const g of Object.keys(L.lib.games)) allGames.add(g);
    const byCat = new Map();
    for (const g of allGames) {
      if (gq && !g.toLowerCase().includes(gq) && !(gameMeta(g).series ?? "").toLowerCase().includes(gq)) continue;
      const m = gameMeta(g);
      const cat = m.category || "Games";
      if (!byCat.has(cat)) byCat.set(cat, new Map());
      const key = m.series || g;
      const grp = byCat.get(cat);
      if (!grp.has(key)) grp.set(key, { series: m.series, games: [] });
      grp.get(key).games.push(g);
    }
    const row = (g, indent) => {
      const n = counts.get(g) ?? 0;
      return `<div class="md-g ${this.v.games.has(g) ? "on" : ""} ${n ? "" : "zero"} ${indent ? "indent" : ""}" data-game="${esc(g)}" style="--h:${hue(g)}">
        <span class="md-dot"></span><span class="md-gname">${esc(g)}</span><span class="md-n">${n}</span>
        ${this.v.tag ? `<a class="md-gedit" data-act="gedit" data-game="${esc(g)}" data-tooltip="Rename, merge or regroup"><i class="fa-solid fa-pen"></i></a>` : ""}</div>`;
    };
    let html = `<div class="md-g md-allg ${this.v.games.size ? "" : "on"}" data-game=""><span class="md-gname">All games</span><span class="md-n">${total}</span></div>`;
    const cats = [...byCat.keys()].sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
    for (const cat of cats) {
      html += `<div class="md-cat">${esc(cat)}</div>`;
      const groups = [...byCat.get(cat).entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [name, grp] of groups) {
        if (grp.series && grp.games.length > 1) {
          const n = grp.games.reduce((s, g) => s + (counts.get(g) ?? 0), 0);
          const open = !this.v.collapsed.has(name) || !!gq;
          const allOn = grp.games.every((g) => this.v.games.has(g));
          html += `<div class="md-g md-series ${allOn ? "on" : ""} ${n ? "" : "zero"}" data-series="${esc(name)}" style="--h:${hue(name)}">
            <a class="md-twisty" data-act="twisty" data-series="${esc(name)}"><i class="fa-solid fa-caret-${open ? "down" : "right"}"></i></a>
            <span class="md-gname">${esc(name)}</span><span class="md-n">${n}</span></div>`;
          if (open) for (const g of grp.games.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) html += row(g, true);
        } else {
          for (const g of grp.games) html += row(g, false);
        }
      }
    }
    this.root.querySelector(".md-games").innerHTML = html;
  }

  renderList() {
    const list = this.filtered();
    this.listKeys = list.map((t) => t.key);
    if (this.cursor && !this.listKeys.includes(this.cursor)) this.cursor = null;
    const fav = new Set(PL.favorites());
    const set = new Set(PL.setlist());
    const nowM = PL.trackOf(PL.current("music").sound)?.key;
    const nowA = PL.trackOf(PL.current("ambience").sound)?.key;
    const tag = this.v.tag;
    const draggable = this.v.view === "set";
    const rows = list.map((t, i) => {
      const playing = t.key === nowM || t.key === nowA;
      return `<div class="md-row ${playing ? "playing" : ""} ${t.key === this.cursor ? "cursor" : ""} ${this.selected.has(t.key) ? "sel" : ""}" data-key="${esc(t.key)}" ${draggable ? 'draggable="true"' : ""}>
        ${tag ? `<span class="md-check"><i class="fa-${this.selected.has(t.key) ? "solid fa-square-check" : "regular fa-square"}"></i></span>` : ""}
        ${draggable ? `<span class="md-num">${i + 1}</span>` : ""}
        <button type="button" class="md-play" data-act="play" data-tooltip="Play (Shift: other layer)">${playing ? '<span class="md-eq"><i></i><i></i><i></i></span>' : '<i class="fa-solid fa-play"></i>'}</button>
        <div class="md-t"><span class="md-title">${esc(t.title)}</span><span class="md-types-sm">${esc([...t.types].join(" · "))}</span></div>
        <span class="md-game" style="--h:${hue(t.game)}" data-act="pickgame">${esc(t.game)}</span>
        <span class="md-dur">${fmt(t.dur)}</span>
        <span class="md-acts">
          <button type="button" class="md-icon ${PL.P.previewKey === t.key ? "on" : ""}" data-act="preview" data-tooltip="Preview — only you hear it (P)"><i class="fa-solid fa-headphones"></i></button>
          <button type="button" class="md-icon ${fav.has(t.key) ? "on fav" : ""}" data-act="fav" data-tooltip="Favorite (F)"><i class="fa-${fav.has(t.key) ? "solid" : "regular"} fa-star"></i></button>
          <button type="button" class="md-icon ${set.has(t.key) ? "on" : ""}" data-act="set" data-tooltip="${set.has(t.key) ? "Remove from set list" : "Add to set list"} (A)"><i class="fa-solid fa-${set.has(t.key) ? "list-check" : "list-ul"}"></i></button>
        </span>
      </div>`;
    }).join("");
    const empty = this.v.view === "set" ? "The set list is empty. Use the list button on any track to add it, then drag to reorder."
      : this.v.view === "fav" ? "No favorites yet — star a track." : this.v.view === "recent" ? "Nothing played yet." : "Nothing matches.";
    this.root.querySelector(".md-list").innerHTML = rows || `<div class="md-empty">${empty}</div>`;
    const dur = list.reduce((s, t) => s + (t.dur ?? 0), 0);
    this.root.querySelector(".md-foot").innerHTML =
      `<span>${list.length} track${list.length === 1 ? "" : "s"}${dur ? ` · ${Math.round(dur / 60)} min` : ""} · ${esc(this.filterLabel())}</span>
       <span class="md-hint">${PL.P.previewKey ? '<i class="fa-solid fa-headphones"></i> previewing — Esc to stop · ' : ""}Shift+click: play on the ${"other"} layer · ? for keys</span>`;
  }

  layerHTML(layer) {
    const { sound, paused } = PL.current(layer);
    const t = PL.trackOf(sound);
    const vol = PL.layerVolume(layer);
    const volInput = foundry.audio.AudioHelper.volumeToInput(vol);
    if (!sound) {
      return `<span class="md-lname">${layer === "music" ? '<i class="fa-solid fa-music"></i> Music' : '<i class="fa-solid fa-cloud-rain"></i> Ambience'}</span>
        <span class="md-idle">${layer === "music" ? "Nothing playing — click a track" : "None — Ambiance tracks play here, under the music"}</span>
        <input type="range" class="md-vol" data-layer="${layer}" min="0" max="1" step="0.01" value="${volInput}" data-tooltip="Volume for everyone">`;
    }
    const pool = layer === "music" && PL.P.poolMode ? `<span class="md-pool"><i class="fa-solid fa-${PL.P.poolMode === "shuffle" ? "shuffle" : "list-ol"}"></i> ${esc(PL.P.poolLabel)} · ${PL.P.pool?.length ?? 0} left</span>` : "";
    return `<span class="md-lname">${layer === "music" ? '<i class="fa-solid fa-music"></i>' : '<i class="fa-solid fa-cloud-rain"></i>'}</span>
      <div class="md-nowt">
        <div class="md-nowtitle">${paused ? '<i class="fa-solid fa-pause md-pausedi"></i> ' : '<span class="md-eq"><i></i><i></i><i></i></span> '}${esc(t?.title ?? sound.name)}
          ${t ? `<span class="md-game" style="--h:${hue(t.game)}">${esc(t.game)}</span>` : ""} ${pool}</div>
        ${layer === "music" ? `<div class="md-prog" data-act="seek"><div class="md-progfill"></div></div><span class="md-time"></span>` : ""}
      </div>
      <span class="md-ctl">
        <button type="button" class="md-icon" data-act="pause" data-layer="${layer}" data-tooltip="${paused ? "Resume" : "Pause"}${layer === "music" ? " (Space)" : ""}"><i class="fa-solid fa-${paused ? "play" : "pause"}"></i></button>
        ${layer === "music" ? `<button type="button" class="md-icon" data-act="next" ${PL.P.pool ? "" : "disabled"} data-tooltip="Next (N)"><i class="fa-solid fa-forward-step"></i></button>` : ""}
        <button type="button" class="md-icon" data-act="stop" data-layer="${layer}" data-tooltip="Stop (fades out)"><i class="fa-solid fa-stop"></i></button>
        <button type="button" class="md-icon ${sound.repeat ? "on" : ""}" data-act="repeat" data-layer="${layer}" data-tooltip="Loop this track"><i class="fa-solid fa-repeat"></i></button>
        ${t ? `<button type="button" class="md-icon" data-act="locate" data-key="${esc(t.key)}" data-tooltip="Show in list"><i class="fa-solid fa-location-crosshairs"></i></button>` : ""}
      </span>
      <input type="range" class="md-vol" data-layer="${layer}" min="0" max="1" step="0.01" value="${volInput}" data-tooltip="Volume for everyone">`;
  }

  refreshNow(alsoList = false) {
    if (!this.root) return;
    for (const layer of ["music", "ambience"]) {
      const el = this.root.querySelector(`.md-layer[data-layer="${layer}"]`);
      const sig = JSON.stringify([PL.current(layer).sound?.id, PL.current(layer).paused, PL.current(layer).sound?.repeat, PL.P.poolLabel, PL.P.pool?.length]);
      if (el.dataset.sig === sig && !alsoList) continue;
      if (el.contains(this.root.ownerDocument.activeElement) && this.root.ownerDocument.activeElement?.classList.contains("md-vol")) continue;
      el.dataset.sig = sig;
      el.innerHTML = this.layerHTML(layer);
      el.classList.toggle("idle", !PL.current(layer).sound);
    }
    if (alsoList) this.renderList();
    this.#tick();
  }

  renderTagbar() {
    const bar = this.root.querySelector(".md-tagbar");
    bar.hidden = !this.v.tag;
    if (!this.v.tag) return;
    const games = Object.keys(L.lib.games).sort();
    const n = this.selected.size;
    bar.innerHTML = `<span class="md-sel">${n} selected</span>
      <button type="button" data-act="selall">Select all showing</button>
      <button type="button" data-act="selnone" ${n ? "" : "disabled"}>Clear</button>
      <span class="md-sep"></span>
      <label>Game <input type="text" class="md-gameinput" list="md-gamelist" placeholder="Pick or type a new one"></label>
      <datalist id="md-gamelist">${games.map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
      <button type="button" class="md-primary" data-act="applygame" ${n ? "" : "disabled"}><i class="fa-solid fa-tag"></i> Apply to ${n}</button>
      <span class="md-tip">Click rows to select (Shift for a range). Double-click a title to rename it. ${L.saving ? "Saving…" : ""}</span>`;
  }

  #tick() {
    if (!this.root) return;
    const { sound } = PL.current("music");
    const s = sound?.sound;
    const fill = this.root.querySelector(".md-progfill");
    const time = this.root.querySelector(".md-time");
    if (!fill || !s) return;
    const cur = sound.pausedTime && !sound.playing ? sound.pausedTime : s.currentTime;
    const dur = s.duration;
    if (Number.isFinite(dur) && dur > 0) {
      fill.style.width = `${Math.min(100, (cur / dur) * 100)}%`;
      time.textContent = `${fmt(cur) || "0:00"} / ${fmt(dur)}`;
    }
  }

  /* ---------------------------------------------------------------- actions */

  trackFromEvent(e) {
    const row = e.target.closest(".md-row");
    return row ? L.tracks.get(row.dataset.key) : null;
  }

  async playTrack(t, otherLayer = false) {
    if (!t) return;
    let layer = PL.layerFor(t, this.v.types);
    if (otherLayer) layer = layer === "music" ? "ambience" : "music";
    this.cursor = t.key;
    if (this.v.view === "set" && layer === "music") return PL.startSetlist(PL.setlist(), t.key);
    await PL.play(t, { layer });
  }

  #onClick(e) {
    const a = e.target.closest("[data-act], [data-view], [data-type], [data-game], [data-series]");
    const menu = this.root.querySelector(".md-menu");
    if (!e.target.closest(".md-menu, [data-act='menu']")) menu.hidden = true;
    if (!a) {
      const row = e.target.closest(".md-row");
      if (row) this.#rowClick(row, e);
      return;
    }
    const act = a.dataset.act;
    if (a.dataset.view && !act) { this.v.view = a.dataset.view; this.selected.clear(); return this.refreshAll(); }
    if (a.dataset.type !== undefined && !act) return this.#toggleType(a.dataset.type, e);
    if (a.dataset.series !== undefined && !act) return this.#toggleSeries(a.dataset.series, e);
    if (a.dataset.game !== undefined && !act) return this.#toggleGame(a.dataset.game, e);
    const t = this.trackFromEvent(e);
    switch (act) {
      case "play": e.stopPropagation(); return this.playTrack(t, e.shiftKey);
      case "preview": return PL.preview(t).then(() => this.renderList());
      case "fav": return PL.toggleFavorite(t.key);
      case "set": return PL.toggleSetlist(t.key);
      case "pickgame": if (this.v.tag) { this.selected = new Set([t.key]); this.renderList(); this.renderTagbar(); this.root.querySelector(".md-gameinput")?.focus(); } else { this.v.games = new Set([t.game]); this.refreshAll(); } return;
      case "pause": return PL.pause(a.dataset.layer);
      case "stop": return PL.stop(a.dataset.layer);
      case "repeat": return PL.toggleRepeat(a.dataset.layer);
      case "next": return PL.next();
      case "locate": return this.#locate(a.dataset.key);
      case "seek": { const r = a.getBoundingClientRect(); return PL.seek("music", (e.clientX - r.left) / r.width); }
      case "shuffle": return this.#shuffle();
      case "rail": return this.root.classList.toggle("rail-open");
      case "tagmode": this.v.tag = !this.v.tag; this.selected.clear(); return this.refreshAll();
      case "menu": menu.hidden = !menu.hidden; return;
      case "sort": this.v.sort = a.dataset.sort; menu.hidden = true; return this.refreshAll();
      case "clearset": menu.hidden = true; return PL.clearSetlist();
      case "keys": menu.hidden = true; this.root.querySelector(".md-keys").hidden = !this.root.querySelector(".md-keys").hidden; return;
      case "rescan": menu.hidden = true; return this.#rescan();
      case "autotag": { menu.hidden = true; const n = autoTagUnsorted(); ui.notifications.info(n ? `Music Director: tagged ${n} track(s) from their file names.` : "Music Director: no more games could be guessed from file names."); return this.refreshAll(); }
      case "twisty": e.stopPropagation(); { const s = a.dataset.series; this.v.collapsed.has(s) ? this.v.collapsed.delete(s) : this.v.collapsed.add(s); return this.renderGames(); }
      case "gedit": e.stopPropagation(); return this.#editGame(a.dataset.game, a.closest(".md-g"));
      case "selall": this.listKeys.forEach((k) => this.selected.add(k)); this.renderList(); return this.renderTagbar();
      case "selnone": this.selected.clear(); this.renderList(); return this.renderTagbar();
      case "applygame": return this.#applyGame();
    }
  }

  #rowClick(row, e) {
    const key = row.dataset.key;
    if (this.v.tag) {
      if (e.shiftKey && this.lastClicked) {
        const a = this.listKeys.indexOf(this.lastClicked), b = this.listKeys.indexOf(key);
        for (const k of this.listKeys.slice(Math.min(a, b), Math.max(a, b) + 1)) this.selected.add(k);
      } else if (this.selected.has(key)) this.selected.delete(key);
      else this.selected.add(key);
      this.lastClicked = key;
      this.cursor = key;
      this.renderList(); this.renderTagbar();
      return;
    }
    this.cursor = key;
    this.playTrack(L.tracks.get(key), e.shiftKey);
  }

  #onDblClick(e) {
    if (!this.v.tag) return;
    const title = e.target.closest(".md-title");
    const row = e.target.closest(".md-row");
    if (!title || !row) return;
    const key = row.dataset.key;
    const input = this.root.ownerDocument.createElement("input");
    input.type = "text"; input.className = "md-titleedit"; input.value = L.tracks.get(key)?.title ?? "";
    title.replaceWith(input);
    input.focus(); input.select();
    const done = (save) => { if (save) setTitle(key, input.value); this.renderList(); };
    input.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") done(true); if (ev.key === "Escape") done(false); });
    input.addEventListener("blur", () => done(true), { once: true });
  }

  #toggleType(name, e) {
    if (!name) this.v.types.clear();
    else if (e.ctrlKey || e.metaKey || e.shiftKey) this.v.types.has(name) ? this.v.types.delete(name) : this.v.types.add(name);
    else this.v.types = this.v.types.has(name) && this.v.types.size === 1 ? new Set() : new Set([name]);
    this.refreshAll();
  }
  #toggleGame(name, e) {
    if (!name) this.v.games.clear();
    else if (e.ctrlKey || e.metaKey || e.shiftKey) this.v.games.has(name) ? this.v.games.delete(name) : this.v.games.add(name);
    else this.v.games = this.v.games.has(name) && this.v.games.size === 1 ? new Set() : new Set([name]);
    this.root.classList.remove("rail-open");
    this.refreshAll();
  }
  #toggleSeries(series, e) {
    const games = [...new Set([...L.tracks.values()].map((t) => t.game))].filter((g) => gameMeta(g).series === series);
    const allOn = games.every((g) => this.v.games.has(g));
    if (e.ctrlKey || e.metaKey || e.shiftKey) games.forEach((g) => (allOn ? this.v.games.delete(g) : this.v.games.add(g)));
    else this.v.games = allOn && this.v.games.size === games.length ? new Set() : new Set(games);
    this.refreshAll();
  }

  #shuffle() {
    if (this.v.view === "set") return PL.startSetlist(PL.setlist(), PL.setlist()[0]);
    const list = this.filtered().filter((t) => PL.layerFor(t, this.v.types) === "music");
    return PL.startShuffle(list.map((t) => t.key), this.filterLabel());
  }

  #locate(key) {
    const t = L.tracks.get(key);
    if (!t) return;
    if (!this.listKeys.includes(key)) { this.v.view = "all"; this.v.search = ""; this.v.types.clear(); this.v.games = new Set([t.game]); this.root.querySelector(".md-q").value = ""; this.refreshAll(); }
    this.cursor = key;
    this.renderList();
    this.root.querySelector(`.md-row[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "center" });
  }

  #applyGame() {
    const input = this.root.querySelector(".md-gameinput");
    const g = input?.value.trim();
    if (!g || !this.selected.size) return;
    setGame([...this.selected], g);
    ui.notifications.info(`Music Director: ${this.selected.size} track(s) → ${g}`);
    this.selected.clear();
    this.refreshAll();
  }

  #editGame(name, rowEl) {
    const m = gameMeta(name);
    const cats = [...new Set([...CATEGORY_ORDER, ...Object.values(L.lib.games).map((x) => x.category)])].filter(Boolean);
    const box = this.root.ownerDocument.createElement("div");
    box.className = "md-gform";
    box.innerHTML = `<label>Name <input type="text" class="gf-name" value="${esc(name)}"></label>
      <label>Series <input type="text" class="gf-series" value="${esc(m.series ?? "")}" placeholder="e.g. Final Fantasy"></label>
      <label>Group <select class="gf-cat">${cats.map((c) => `<option ${c === m.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <div><button type="button" class="gf-save md-primary">Save</button> <button type="button" class="gf-cancel">Cancel</button></div>
      <small>Renaming to an existing game merges them.</small>`;
    rowEl.after(box);
    box.querySelector(".gf-name").focus();
    box.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Escape") this.renderGames(); });
    box.querySelector(".gf-cancel").addEventListener("click", (ev) => { ev.stopPropagation(); this.renderGames(); });
    box.querySelector(".gf-save").addEventListener("click", (ev) => {
      ev.stopPropagation();
      const to = box.querySelector(".gf-name").value.trim() || name;
      if (to !== name) { renameGame(name, to); if (this.v.games.delete(name)) this.v.games.add(to); }
      setSeries(to, box.querySelector(".gf-series").value.trim());
      setCategory(to, box.querySelector(".gf-cat").value);
      this.refreshAll();
    });
  }

  async #rescan() {
    const foot = this.root.querySelector(".md-foot");
    foot.textContent = "Scanning music folder…";
    const r = await rescan((n) => { foot.textContent = `Scanning music folder… ${n} files`; });
    ui.notifications.info(`Music Director: scanned ${r.seen} files, ${r.added} new (tagged Unsorted).`);
    this.refreshAll();
  }

  #onInput(e) {
    if (e.target.classList.contains("md-q")) {
      this.v.search = e.target.value;
      clearTimeout(this._qt);
      this._qt = setTimeout(() => { this.renderTypes(); this.renderGames(); this.renderList(); }, 90);
    } else if (e.target.classList.contains("md-gq")) {
      this.renderGames();
    } else if (e.target.classList.contains("md-vol")) {
      PL.setVolume(e.target.dataset.layer, foundry.audio.AudioHelper.inputToVolume(Number(e.target.value)));
    }
  }
  #onChange() { /* reserved */ }

  /* ---------------------------------------------------------------- keyboard */

  #onKey(e) {
    const tgt = e.target;
    const inText = tgt.matches?.("input[type=text], input[type=search], textarea, select");
    const inSearch = tgt.classList?.contains("md-q");
    const k = e.key;
    if (k === "Escape") {
      if (PL.P.previewKey) { PL.stopPreview(); this.renderList(); }
      else if (inSearch && tgt.value) { tgt.value = ""; this.v.search = ""; this.refreshAll(); }
      else if (!this.root.querySelector(".md-keys").hidden) this.root.querySelector(".md-keys").hidden = true;
      else tgt.blur?.();
      e.preventDefault(); return;
    }
    if (k === "ArrowDown" || k === "ArrowUp") {
      if (inText && !inSearch) return;
      e.preventDefault();
      const i = this.listKeys.indexOf(this.cursor);
      const n = k === "ArrowDown" ? Math.min(this.listKeys.length - 1, i + 1) : Math.max(0, i - 1);
      this.cursor = this.listKeys[n] ?? null;
      for (const r of this.root.querySelectorAll(".md-row.cursor")) r.classList.remove("cursor");
      const row = this.root.querySelector(`.md-row[data-key="${CSS.escape(this.cursor ?? "")}"]`);
      row?.classList.add("cursor"); row?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (k === "Enter" && (inSearch || !inText)) {
      e.preventDefault();
      const key = this.cursor ?? this.listKeys[0];
      if (key) this.playTrack(L.tracks.get(key), e.shiftKey);
      return;
    }
    if (inText) return;
    if (e.ctrlKey && k.toLowerCase() === "f") { e.preventDefault(); this.root.querySelector(".md-q").focus(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cur = this.cursor && L.tracks.get(this.cursor);
    switch (k) {
      case "/": e.preventDefault(); this.root.querySelector(".md-q").focus(); this.root.querySelector(".md-q").select(); break;
      case " ": e.preventDefault(); PL.pause("music"); break;
      case "n": case "N": PL.next(); break;
      case "s": case "S": this.#shuffle(); break;
      case "p": case "P": if (cur) PL.preview(cur).then(() => this.renderList()); break;
      case "f": case "F": if (cur) PL.toggleFavorite(cur.key); break;
      case "a": case "A": if (cur) PL.toggleSetlist(cur.key); break;
      case "t": case "T": this.v.tag = !this.v.tag; this.selected.clear(); this.refreshAll(); break;
      case "x": case "X": if (this.v.tag && cur) { this.selected.has(cur.key) ? this.selected.delete(cur.key) : this.selected.add(cur.key); this.renderList(); this.renderTagbar(); } break;
      case "?": this.root.querySelector(".md-keys").hidden = !this.root.querySelector(".md-keys").hidden; break;
    }
  }

  /* ---------------------------------------------------------------- set list drag & drop */

  #onDragStart(e) {
    const row = e.target.closest(".md-row");
    if (!row || this.v.view !== "set") return;
    this._dragKey = row.dataset.key;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", row.dataset.key);
  }
  #onDragOver(e) {
    if (!this._dragKey || !e.target.closest(".md-list")) return;
    e.preventDefault();
    for (const r of this.root.querySelectorAll(".md-row.dropbefore")) r.classList.remove("dropbefore");
    e.target.closest(".md-row")?.classList.add("dropbefore");
  }
  async #onDrop(e) {
    if (!this._dragKey) return;
    e.preventDefault();
    const before = e.target.closest(".md-row")?.dataset.key ?? null;
    const key = this._dragKey;
    this._dragKey = null;
    if (before !== key) await PL.moveInSetlist(key, before);
  }
}
