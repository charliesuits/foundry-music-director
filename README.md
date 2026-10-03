# Music Director

A faster, better-organised music panel for the GM, built for big libraries of game and film soundtracks. It works best popped out into its own window, and opens that way by default.

### Finding a track
- **Filter by playlist type.** Your playlists (Combat, Tavern, Dungeon…) become chips with counts. Ctrl-click to combine several.
- **Filter by game.** A side list grouped into Games / Anime, TV & Film / Artists / Ambience & Libraries, with series folded together, so clicking *Final Fantasy* selects every Final Fantasy game.
- **Search** titles, games and types at once. The counts update as you filter, so you can see what's left before you click.

### Playing
- **Click to play.** The current track fades out and the new one fades in, for everyone at the table.
- **An ambience layer.** Tracks from your ambience playlists play underneath the music, with their own volume. Shift-click to put any track on the other layer.
- **Shuffle** plays everything currently showing ("random Final Fantasy combat music") and keeps going when a track ends.
- **Headphone preview:** listen to a track yourself without the players hearing it.
- Pause, stop, loop, a progress bar you can click to jump around, and a volume slider for each layer.

### Keeping things organised
- **Favorites**, **Recent** (the last 20 played) and a per-world **Set list** you can drag to reorder and play in order.
- **Games are guessed from file names** the first time you open it (for example *Battle 1 FF3*, *Forest Battle BG2*, *Dawn TESV*, or the game's name in the title). Anything it can't place goes in **Unsorted**.
- **Tag mode (T):** select tracks and set their game, rename titles, and rename, merge or group games into series. Tags are saved once on the server and shared by every world.
- **Rescan music folder** picks up files you've added to your music folder (sub-folder names become types).

### Keyboard
`/` search · `↑ ↓` move · `Enter` play · `Space` pause · `N` next · `S` shuffle · `P` preview · `F` favorite · `A` set list · `T` tag mode · `?` all shortcuts. **Alt+M** opens the window.

### Settings
Crossfade length, whether to stop music started from the normal Playlists tab, which playlists count as ambience, which playlists aren't types (default: *All*), and your music folder.

It plays through two small playlists of its own (*♪ Music Director* on the Music channel and *♪ Music Director: Ambience* on the Environment channel), so players' own volume sliders still apply. Those two are hidden from the Playlists list. GM only.

## Installing

In Foundry, go to **Add-on Modules → Install Module**, paste this manifest URL and click **Install**:

```
https://github.com/charliesuits/foundry-music-director/releases/latest/download/module.json
```

Then enable it in your world under **Manage Modules**. Foundry will offer updates automatically when a new version is released.

Works with Foundry VTT v13 and v14.

## License

MIT
