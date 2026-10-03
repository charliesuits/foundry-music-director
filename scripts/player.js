/**
 * Music Director — playback.
 *
 * Everything plays through two small playlists the module owns ("♪ Music Director" on the music
 * channel and "♪ Music Director: Ambience" on the environment channel), so every player hears it and
 * each player's own Music / Environment volume sliders still apply. They're soundboard-mode
 * playlists: Foundry fades the old track out and the new one in, and nothing auto-advances unless
 * the GM has a shuffle or set list running.
 */
import { MOD, L, ambienceTypes } from "./library.js";

export const P = {
  pool: null,          // remaining keys for shuffle / set list
  poolMode: null,      // "shuffle" | "setlist"
  poolLabel: "",
  poolAll: null,       // the full shuffle pool, for reshuffling
  preview: null,
  previewKey: null,
  listeners: new Set(),
  volTimer: {},
};

const MODES = () => CONST.PLAYLIST_MODES;
const cs = (k) => game.settings.get(MOD, k);
export const emit = () => { for (const f of P.listeners) try { f(); } catch (e) { console.error(e); } };

export function directorPlaylist(layer) {
  return game.playlists.find((p) => p.getFlag(MOD, "role") === layer) ?? null;
}

async function ensureDirector(layer) {
  const fade = Number(cs("fadeMs")) || 0;
  let pl = directorPlaylist(layer);
  if (!pl) {
    pl = await Playlist.create({
      name: layer === "music" ? "♪ Music Director" : "♪ Music Director: Ambience",
      mode: MODES().DISABLED,
      channel: layer === "music" ? "music" : "environment",
      fade, sorting: "m",
      flags: { [MOD]: { role: layer } },
    });
  } else if (pl.fade !== fade || pl.mode !== MODES().DISABLED) {
    await pl.update({ fade, mode: MODES().DISABLED });
  }
  return pl;
}

/** The sound currently playing (or paused) on a layer. */
export function current(layer) {
  const pl = directorPlaylist(layer);
  if (!pl) return { sound: null, paused: false };
  const playing = pl.sounds.find((s) => s.playing);
  if (playing) return { sound: playing, paused: false };
  const paused = pl.sounds.find((s) => s.pausedTime);
  return { sound: paused ?? null, paused: !!paused };
}

export function trackOf(sound) {
  if (!sound) return null;
  const key = sound.getFlag(MOD, "key");
  return (key && L.tracks.get(key)) ?? [...L.tracks.values()].find((t) => t.path === sound.path) ?? null;
}

/** Which layer a track belongs on, given the type filter in use when it was clicked. */
export function layerFor(track, activeTypes = new Set()) {
  const amb = ambienceTypes();
  const active = [...activeTypes].map((t) => t.toLowerCase());
  if (active.length) return active.every((t) => amb.has(t)) ? "ambience" : "music";
  const types = [...track.types].map((t) => t.toLowerCase());
  return types.length && types.every((t) => amb.has(t)) ? "ambience" : "music";
}

export function layerVolume(layer) {
  try { return Number(localStorage.getItem(`${MOD}.vol.${layer}`) ?? 0.5); } catch { return 0.5; }
}

/** Play a track. Crossfades out whatever was on that layer. */
export async function play(track, { layer = "music", keepPool = false } = {}) {
  if (!game.user.isGM || !track?.path) return;
  if (!keepPool && layer === "music") clearPool();
  const pl = await ensureDirector(layer);
  const vol = layerVolume(layer);
  let snd = pl.sounds.find((s) => s.path === track.path);
  if (!snd) {
    [snd] = await pl.createEmbeddedDocuments("PlaylistSound", [{
      name: track.title, path: track.path, volume: vol, repeat: layer === "ambience",
      flags: { [MOD]: { key: track.key } },
    }]);
  }
  const updates = [{ _id: snd.id, playing: true, pausedTime: null, volume: vol, flags: { [MOD]: { lastPlayed: Date.now() } } }];
  for (const s of pl.sounds) if (s.id !== snd.id && (s.playing || s.pausedTime)) updates.push({ _id: s.id, playing: false, pausedTime: null });
  await pl.update({ playing: true, sounds: updates });
  if (layer === "music" && cs("stopOthers")) await stopOutsideMusic();
  pushRecent(track.key);
  trim(pl);
  emit();
}

/** Stop music-channel sounds playing from ordinary playlists, so music never doubles up. */
async function stopOutsideMusic() {
  for (const p of game.playlists) {
    if (p.getFlag(MOD, "role")) continue;
    const on = p.sounds.filter((s) => s.playing && ((s.channel || p.channel) === "music"));
    if (!on.length) continue;
    const stillPlaying = p.sounds.some((s) => s.playing && !on.includes(s));
    await p.update({ playing: stillPlaying, sounds: on.map((s) => ({ _id: s.id, playing: false, pausedTime: null })) });
  }
}

/** Keep the director playlists small. */
async function trim(pl) {
  const max = 40;
  if (pl.sounds.size <= max) return;
  const old = pl.sounds.filter((s) => !s.playing && !s.pausedTime)
    .sort((a, b) => (a.getFlag(MOD, "lastPlayed") ?? 0) - (b.getFlag(MOD, "lastPlayed") ?? 0))
    .slice(0, pl.sounds.size - max);
  if (old.length) await pl.deleteEmbeddedDocuments("PlaylistSound", old.map((s) => s.id));
}

export async function pause(layer = "music") {
  const { sound, paused } = current(layer);
  if (!sound) return;
  if (paused) return resume(layer);
  await sound.update({ playing: false, pausedTime: sound.sound?.currentTime ?? 0 });
  emit();
}
export async function resume(layer = "music") {
  const { sound, paused } = current(layer);
  if (!sound || !paused) return;
  await sound.parent.playSound(sound);
  emit();
}
export async function stop(layer = "music") {
  const pl = directorPlaylist(layer);
  if (layer === "music") clearPool();
  if (pl) await pl.update({ playing: false, sounds: pl.sounds.filter((s) => s.playing || s.pausedTime).map((s) => ({ _id: s.id, playing: false, pausedTime: null })) });
  emit();
}
export async function toggleRepeat(layer = "music") {
  const { sound } = current(layer);
  if (sound) await sound.update({ repeat: !sound.repeat });
  emit();
}
export async function seek(layer, fraction) {
  const { sound } = current(layer);
  const dur = sound?.sound?.duration;
  if (!sound || !Number.isFinite(dur)) return;
  const t = Math.max(0, Math.min(dur - 1, dur * fraction));
  await sound.update({ playing: false, pausedTime: t });
  await sound.parent.playSound(sound);
}

export function setVolume(layer, v) {
  try { localStorage.setItem(`${MOD}.vol.${layer}`, String(v)); } catch { /* ignore */ }
  clearTimeout(P.volTimer[layer]);
  P.volTimer[layer] = setTimeout(() => {
    const { sound } = current(layer);
    if (sound) sound.update({ volume: v });
  }, 120);
}

/* ------------------------------------------------------------------ shuffle / set list */

function clearPool() { P.pool = null; P.poolMode = null; P.poolLabel = ""; P.poolAll = null; }

const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export async function startShuffle(keys, label) {
  if (!keys.length) return ui.notifications.warn("Nothing to shuffle — the filter is empty.");
  P.poolAll = [...keys];
  P.pool = shuffled(keys);
  P.poolMode = "shuffle";
  P.poolLabel = label;
  return next();
}

export async function startSetlist(keys, startKey) {
  if (!keys.length) return ui.notifications.warn("The set list is empty.");
  const i = Math.max(0, keys.indexOf(startKey));
  P.pool = keys.slice(i);
  P.poolAll = null;
  P.poolMode = "setlist";
  P.poolLabel = "Set list";
  return next();
}

export async function next() {
  if (!P.pool) return;
  if (!P.pool.length) {
    if (P.poolMode === "shuffle" && P.poolAll?.length) P.pool = shuffled(P.poolAll);
    else { clearPool(); emit(); return; }
  }
  let track = null;
  while (P.pool.length && !track) track = L.tracks.get(P.pool.shift());
  if (!track) { clearPool(); emit(); return; }
  return play(track, { layer: "music", keepPool: true });
}

/** Called (active GM only) when a director music track finishes on its own. */
export function onTrackEnd() {
  if (P.pool) setTimeout(() => next(), 250);
  else emit();
}

/* ------------------------------------------------------------------ preview (GM only) */

export async function preview(track) {
  const same = P.previewKey === track?.key;
  stopPreview();
  if (!track || same) return;
  P.previewKey = track.key;
  try {
    P.preview = await foundry.audio.AudioHelper.play({ src: track.path, volume: 0.7, loop: false, autoplay: true }, false);
    P.preview?.addEventListener?.("end", () => { if (P.previewKey === track.key) { P.preview = null; P.previewKey = null; emit(); } });
  } catch (e) { console.warn("Music Director | preview failed", e); P.previewKey = null; }
  emit();
}
export function stopPreview() {
  try { P.preview?.stop?.(); } catch { /* ignore */ }
  const had = !!P.previewKey;
  P.preview = null; P.previewKey = null;
  if (had) emit();
}

/* ------------------------------------------------------------------ favorites / recent / set list */

const getArr = (k) => { try { return foundry.utils.deepClone(game.settings.get(MOD, k)) ?? []; } catch { return []; } };
export const favorites = () => getArr("favorites");
export const recent = () => getArr("recent");
export const setlist = () => getArr("setlist");

export async function toggleFavorite(key) {
  const f = favorites();
  const i = f.indexOf(key);
  if (i >= 0) f.splice(i, 1); else f.unshift(key);
  await game.settings.set(MOD, "favorites", f);
  emit();
}
function pushRecent(key) {
  const r = recent().filter((k) => k !== key);
  r.unshift(key);
  game.settings.set(MOD, "recent", r.slice(0, 20));
}
export async function toggleSetlist(key) {
  const s = setlist();
  const i = s.indexOf(key);
  if (i >= 0) s.splice(i, 1); else s.push(key);
  await game.settings.set(MOD, "setlist", s);
  emit();
}
export async function moveInSetlist(key, beforeKey) {
  const s = setlist().filter((k) => k !== key);
  const i = beforeKey ? s.indexOf(beforeKey) : -1;
  if (i >= 0) s.splice(i, 0, key); else s.push(key);
  await game.settings.set(MOD, "setlist", s);
  emit();
}
export async function clearSetlist() {
  await game.settings.set(MOD, "setlist", []);
  emit();
}
