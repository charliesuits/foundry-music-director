/**
 * Music Director — entry point: settings, open buttons, hooks.
 */
import { MOD, L, loadLibrary, buildTracks } from "./library.js";
import * as PL from "./player.js";
import { MusicDirector } from "./app.js";

Hooks.once("init", () => {
  const S = (k, o) => game.settings.register(MOD, k, o);
  S("detached", { name: "Open in its own window", hint: "Pop Music Director straight out into a separate window when it opens.", scope: "client", config: true, type: Boolean, default: true });
  S("openOnReady", { name: "Open when the world loads", scope: "client", config: true, type: Boolean, default: false });
  S("fadeMs", { name: "Crossfade (milliseconds)", hint: "How long the old track fades out and the new one fades in.", scope: "world", config: true, type: Number, default: 2500, range: { min: 0, max: 10000, step: 250 } });
  S("stopOthers", { name: "Stop other music when a track starts", hint: "Also fades out music started from the normal Playlists tab, so two songs never overlap.", scope: "world", config: true, type: Boolean, default: true });
  S("ambienceTypes", { name: "Ambience playlists", hint: "Playlist/folder names whose tracks play on the ambience layer, under the music (comma-separated).", scope: "world", config: true, type: String, default: "Ambiance, Ambience, Ambient, Atmosphere, Environment", onChange: () => MusicDirector.refresh(true) });
  S("excludePlaylists", { name: "Playlists that aren't types", hint: "Playlists to ignore as filter types (comma-separated). Their tracks still appear.", scope: "world", config: true, type: String, default: "All", onChange: () => MusicDirector.refresh(true) });
  S("musicRoot", { name: "Music folder", hint: "Folder inside Data that 'Rescan music folder' reads. Sub-folder names become types.", scope: "world", config: true, type: String, default: "Music" });
  S("libraryPath", { scope: "world", config: false, type: String, default: "" });
  S("favorites", { scope: "client", config: false, type: Array, default: [] });
  S("recent", { scope: "client", config: false, type: Array, default: [] });
  S("setlist", { scope: "world", config: false, type: Array, default: [] });

  game.keybindings.register(MOD, "open", {
    name: "Open Music Director", editable: [{ key: "KeyM", modifiers: ["Alt"] }], restricted: true,
    onDown: () => { MusicDirector.open(); return true; },
  });

  // Know when a Music Director track finishes on its own, to keep a shuffle / set list going.
  const proto = CONFIG.Playlist.documentClass.prototype;
  const original = proto._onSoundEnd;
  proto._onSoundEnd = async function (sound) {
    const r = await original.call(this, sound);
    try {
      if (this.getFlag(MOD, "role") === "music" && game.users.activeGM?.id === game.user.id) PL.onTrackEnd(sound);
    } catch (e) { console.error("Music Director |", e); }
    return r;
  };
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  await loadLibrary();
  game.modules.get(MOD).api = { open: () => MusicDirector.open(), library: L, player: PL, reload: async () => { await loadLibrary(); MusicDirector.refresh(); } };
  if (game.settings.get(MOD, "openOnReady")) MusicDirector.open();
});

/* Keep the window in sync with what's playing. */
let tNow = null, tFull = null;
const soon = () => { clearTimeout(tNow); tNow = setTimeout(() => PL.emit(), 60); };
const rebuild = () => { clearTimeout(tFull); tFull = setTimeout(() => MusicDirector.refresh(true), 400); };
Hooks.on("updatePlaylistSound", soon);
Hooks.on("updatePlaylist", soon);
for (const h of ["createPlaylistSound", "deletePlaylistSound", "createPlaylist", "deletePlaylist"]) {
  Hooks.on(h, (doc) => { const pl = doc.documentName === "Playlist" ? doc : doc.parent; if (!pl?.getFlag?.(MOD, "role")) rebuild(); else soon(); });
}

/* A button at the top of the Playlists sidebar. */
Hooks.on("renderPlaylistDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const el = html instanceof HTMLElement ? html : html?.[0];
  const target = el?.querySelector(".header-actions") ?? el?.querySelector(".directory-header");
  if (!target || target.querySelector(".md-open")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "md-open";
  b.innerHTML = `<i class="fa-solid fa-music"></i> Music Director`;
  b.addEventListener("click", (e) => { e.preventDefault(); MusicDirector.open(); });
  target.append(b);
});

/* Hide the module's own two playlists from the sidebar list — they're managed for you. */
Hooks.on("renderPlaylistDirectory", (app, html) => {
  const el = html instanceof HTMLElement ? html : html?.[0];
  for (const p of game.playlists.filter((p) => p.getFlag(MOD, "role"))) {
    el?.querySelector(`[data-entry-id="${p.id}"], [data-document-id="${p.id}"]`)?.classList.add("md-hidden-playlist");
  }
});
