/**
 * Music Director — the track library.
 *
 * The library is every PlaylistSound in the world plus Data/music-director/library.json, which holds
 * what Foundry doesn't know: which game each file comes from, a clean title, and its length. That file
 * is shared by every world. On first run it's created by guessing each track's game from its file name.
 */
import { guessGame, seriesFor } from "./autotag.js";
export const MOD = "music-director";
const LIB_DIR = "music-director";
const LIB_FILE = "library.json";

export const L = {
  lib: { version: 1, games: {}, tracks: {} },
  tracks: new Map(),          // key -> track
  source: null,
  saveTimer: null,
  saving: false,
};

export const keyOf = (path) => {
  const last = String(path ?? "").split("/").pop();
  try { return decodeURIComponent(last); } catch { return last; }
};

/** A readable title from a filename, for tracks the library hasn't seen. */
export function cleanTitle(file) {
  let n = String(file).replace(/\.[A-Za-z0-9]+$/, "").replace(/\s*\[[A-Za-z0-9_-]{11}\]/, "");
  if (!n.includes(" ") && /[-_]/.test(n)) {
    n = n.replace(/[-_]+/g, " ").split(" ").map((w) => (w === w.toUpperCase() ? w : w[0]?.toUpperCase() + w.slice(1))).join(" ");
  }
  n = n.replace(/_/g, " ").replace(/^\s*\d{1,3}(-\d{1,3})?\.\s*-?\s*/, "").replace(/\s{2,}/g, " ").trim();
  return n || file;
}

/** Where files are stored: The Forge uses its own storage; everyone else uses the Data folder. */
export const storageSource = () => (globalThis.ForgeVTT?.usingTheForge ? "forgevtt" : "data");
const urlOf = (p) => (/^https?:\/\//.test(p) ? p : foundry.utils.getRoute(p));

export async function loadLibrary() {
  const saved = game.settings.get(MOD, "libraryPath");
  const tryUrls = [...new Set([saved, `${LIB_DIR}/${LIB_FILE}`].filter(Boolean))];
  for (const url of tryUrls) {
    try {
      const r = await fetch(urlOf(url) + (url.includes("?") ? "&" : "?") + `t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) continue;
      const lib = await r.json();
      if (lib?.tracks) { L.lib = lib; L.source = url; break; }
    } catch { /* try the next one */ }
  }
  L.lib.games ??= {};
  L.lib.tracks ??= {};
  buildTracks();
  // First run: guess games from file names so the list isn't all "Unsorted".
  if (!L.source && game.user.isGM && L.tracks.size) {
    const n = autoTagUnsorted();
    if (n) ui.notifications.info(`Music Director: guessed the game for ${n} of ${L.tracks.size} tracks from their file names. Fix or add the rest in tag mode.`);
  }
}

/** Guess the game for every Unsorted track. Returns how many were tagged. */
export function autoTagUnsorted() {
  const byGame = new Map();
  for (const t of L.tracks.values()) {
    if (t.game !== "Unsorted") continue;
    const g = guessGame(t.key);
    if (g) (byGame.get(g) ?? byGame.set(g, []).get(g)).push(t.key);
  }
  let n = 0;
  for (const [g, keys] of byGame) {
    setGame(keys, g);
    if (!L.lib.games[g].series) L.lib.games[g].series = seriesFor(g);
    n += keys.length;
  }
  return n;
}

const listSetting = (k) => String(game.settings.get(MOD, k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const ambienceTypes = () => new Set(listSetting("ambienceTypes").map((s) => s.toLowerCase()));

/** Merge library entries with the playlists actually in this world. */
export function buildTracks() {
  const excluded = new Set(listSetting("excludePlaylists").map((s) => s.toLowerCase()));
  const tracks = new Map();
  for (const [key, t] of Object.entries(L.lib.tracks)) {
    tracks.set(key, { key, path: t.path, title: t.title || cleanTitle(key), game: t.game || "Unsorted", types: new Set(t.types ?? []), dur: t.dur ?? null, volume: 0.5, inWorld: false });
  }
  for (const pl of game.playlists ?? []) {
    if (pl.getFlag(MOD, "role")) continue;
    const typeName = excluded.has(pl.name.toLowerCase()) ? null : pl.name;
    for (const s of pl.sounds) {
      if (!s.path) continue;
      const key = keyOf(s.path);
      let t = tracks.get(key);
      if (!t) {
        t = { key, path: s.path, title: cleanTitle(key), game: "Unsorted", types: new Set(), dur: null, volume: s.volume ?? 0.5, inWorld: true, isNew: true };
        tracks.set(key, t);
      }
      t.inWorld = true;
      if (typeName) t.types.add(typeName);
      if (typeof s.volume === "number") t.volume = s.volume;
    }
  }
  L.tracks = tracks;
  return tracks;
}

export function gameMeta(name) {
  return L.lib.games[name] ?? { category: name === "Unsorted" ? "Unsorted" : "Games", series: null };
}

/** Write the library back to the Data folder (GM only, debounced). */
export function scheduleSave() {
  clearTimeout(L.saveTimer);
  L.saveTimer = setTimeout(saveNow, 1200);
}

export async function saveNow() {
  clearTimeout(L.saveTimer);
  if (!game.user.isGM) return;
  const FP = foundry.applications.apps.FilePicker.implementation;
  L.lib.updated = new Date().toISOString();
  const file = new File([JSON.stringify(L.lib)], LIB_FILE, { type: "application/json" });
  L.saving = true;
  const src = storageSource();
  try {
    let res;
    try { res = await FP.upload(src, LIB_DIR, file, {}, { notify: false }); }
    catch { res = null; }
    if (!res?.path && res?.status !== "success") {
      try { await FP.createDirectory(src, LIB_DIR, {}); } catch { /* exists */ }
      res = await FP.upload(src, LIB_DIR, file, {}, { notify: false });
    }
    L.source = res?.path || `${LIB_DIR}/${LIB_FILE}`;
    if (game.settings.get(MOD, "libraryPath") !== L.source) await game.settings.set(MOD, "libraryPath", L.source);
  } catch (e) {
    console.error("Music Director | save failed", e);
    ui.notifications.error("Music Director couldn't save its library (see console).");
  } finally { L.saving = false; }
}

function libEntry(t) {
  return (L.lib.tracks[t.key] ??= { path: t.path, title: t.title, game: t.game, types: [...t.types], dur: t.dur });
}

/** Assign a game to tracks. */
export function setGame(keys, gameName) {
  gameName = String(gameName ?? "").trim() || "Unsorted";
  for (const k of keys) {
    const t = L.tracks.get(k);
    if (!t) continue;
    t.game = gameName;
    libEntry(t).game = gameName;
  }
  L.lib.games[gameName] ??= { category: gameName === "Unsorted" ? "Unsorted" : "Games", series: null };
  scheduleSave();
}

export function setTitle(key, title) {
  const t = L.tracks.get(key);
  if (!t || !title?.trim()) return;
  t.title = title.trim();
  libEntry(t).title = t.title;
  scheduleSave();
}

/** Rename (or merge) a game everywhere. */
export function renameGame(from, to) {
  to = String(to ?? "").trim();
  if (!to || to === from) return;
  for (const t of L.tracks.values()) if (t.game === from) { t.game = to; libEntry(t).game = to; }
  for (const e of Object.values(L.lib.tracks)) if (e.game === from) e.game = to;
  if (!L.lib.games[to]) L.lib.games[to] = { ...(L.lib.games[from] ?? { category: "Games", series: null }) };
  delete L.lib.games[from];
  scheduleSave();
}

export function setCategory(gameName, category) {
  (L.lib.games[gameName] ??= { category: "Games", series: null }).category = category;
  scheduleSave();
}
export function setSeries(gameName, series) {
  (L.lib.games[gameName] ??= { category: "Games", series: null }).series = series || null;
  scheduleSave();
}

/** Walk the music folder for files the library doesn't know yet. Folder names become types. */
export async function rescan(progress) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  const root = game.settings.get(MOD, "musicRoot") || "Music";
  const exts = /\.(mp3|ogg|oga|flac|wav|webm|m4a|opus|aac)$/i;
  const excluded = new Set(listSetting("excludePlaylists").map((s) => s.toLowerCase()));
  let added = 0, seen = 0;
  const walk = async (dir, typeName) => {
    let res;
    try { res = await FP.browse(storageSource(), dir); } catch (e) { console.warn("Music Director | can't browse", dir, e); return; }
    for (const f of res.files ?? []) {
      if (!exts.test(f)) continue;
      seen++;
      const key = keyOf(f);
      let e = L.lib.tracks[key];
      if (!e) { e = L.lib.tracks[key] = { path: f, title: cleanTitle(key), game: "Unsorted", types: [], dur: null }; added++; }
      if (typeName && !excluded.has(typeName.toLowerCase()) && !e.types.includes(typeName)) e.types.push(typeName);
      if (!e.path || e.path.includes("/All/")) e.path = f;
    }
    progress?.(seen);
    for (const d of res.dirs ?? []) await walk(d, keyOf(d));
  };
  await walk(root, null);
  buildTracks();
  if (added) await saveNow();
  return { added, seen };
}
