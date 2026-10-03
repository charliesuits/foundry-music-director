/**
 * Music Director — guess a track's game from its filename.
 *
 * Covers the common ways game soundtracks are named: a short tag at the end ("Battle 1 FF3",
 * "Forest Battle BG2", "Dawn TESV") or the game's name somewhere in the title. Only used on
 * Unsorted tracks; anything it can't place stays Unsorted for the GM to tag by hand.
 */
const SUFFIX = {
  FFT: "Final Fantasy Tactics", BG1: "Baldur's Gate", BG2: "Baldur's Gate II", BGIIEE: "Baldur's Gate II", BG3: "Baldur's Gate 3",
  FF1: "Final Fantasy", FF2: "Final Fantasy II", FF3: "Final Fantasy III", FF4: "Final Fantasy IV", FFIV: "Final Fantasy IV",
  FF5: "Final Fantasy V", FFV: "Final Fantasy V", FF6: "Final Fantasy VI", FFVI: "Final Fantasy VI", FF7: "Final Fantasy VII", FFVII: "Final Fantasy VII",
  FF8: "Final Fantasy VIII", FFVIII: "Final Fantasy VIII", FF9: "Final Fantasy IX", FFIX: "Final Fantasy IX", FFX: "Final Fantasy X", FF10: "Final Fantasy X",
  FFXII: "Final Fantasy XII", FF12: "Final Fantasy XII", FFXIII: "Final Fantasy XIII", FFXIV: "Final Fantasy XIV", FF14: "Final Fantasy XIV",
  FFXV: "Final Fantasy XV", FFXVI: "Final Fantasy XVI", FF16: "Final Fantasy XVI",
  WOW: "World of Warcraft", POE: "Pillars of Eternity", POE2: "Pillars of Eternity II", TESV: "The Elder Scrolls V: Skyrim", SKYRIM: "The Elder Scrolls V: Skyrim",
  TES3: "The Elder Scrolls III: Morrowind", TES4: "The Elder Scrolls IV: Oblivion", DOS: "Divinity: Original Sin", DOS2: "Divinity: Original Sin 2",
  ER: "Elden Ring", BOTW: "Zelda: Breath of the Wild", TOTK: "Zelda: Tears of the Kingdom", ZTOTK: "Zelda: Tears of the Kingdom", LBW: "Zelda: A Link Between Worlds",
  OOT: "Zelda: Ocarina of Time", DS1: "Dark Souls", DS2: "Dark Souls II", DS3: "Dark Souls III", BB: "Bloodborne",
  UNDERTALE: "Undertale", HEARTHSTONE: "Hearthstone", KH: "Kingdom Hearts", KH2: "Kingdom Hearts II", CT: "Chrono Trigger",
  TW3: "The Witcher 3", WITCHER3: "The Witcher 3", DAO: "Dragon Age: Origins", NWN: "Neverwinter Nights", IWD: "Icewind Dale", PST: "Planescape: Torment",
  GW2: "Guild Wars 2", ESO: "The Elder Scrolls Online", XC: "Xenoblade Chronicles", XC2: "Xenoblade Chronicles 2", XC3: "Xenoblade Chronicles 3",
};
const PATTERNS = [
  [/link between worlds/, "Zelda: A Link Between Worlds"], [/breath of the wild/, "Zelda: Breath of the Wild"], [/tears of the kingdom/, "Zelda: Tears of the Kingdom"],
  [/link to the past/, "Zelda: A Link to the Past"], [/ocarina of time/, "Zelda: Ocarina of Time"], [/majora/, "Zelda: Majora's Mask"], [/wind waker/, "Zelda: The Wind Waker"],
  [/twilight princess/, "Zelda: Twilight Princess"], [/hollow knight/, "Hollow Knight"], [/ori and the|blind forest|will of the wisps/, "Ori"],
  [/elden ring/, "Elden Ring"], [/dark souls (iii|3)/, "Dark Souls III"], [/dark souls (ii|2)/, "Dark Souls II"], [/dark souls/, "Dark Souls"], [/bloodborne/, "Bloodborne"],
  [/sekiro/, "Sekiro"], [/undertale|toby fox/, "Undertale"], [/deltarune/, "Deltarune"], [/chrono trigger/, "Chrono Trigger"], [/chrono cross/, "Chrono Cross"],
  [/resident evil/, "Resident Evil"], [/medievil/, "MediEvil"], [/final fantasy (vii|7)\b|ffvii/, "Final Fantasy VII"], [/final fantasy (viii|8)\b/, "Final Fantasy VIII"],
  [/final fantasy (ix|9)\b/, "Final Fantasy IX"], [/final fantasy (vi|6)\b/, "Final Fantasy VI"], [/final fantasy (xiv|14)\b/, "Final Fantasy XIV"],
  [/final fantasy (xvi|16)\b/, "Final Fantasy XVI"], [/final fantasy (x|10)\b/, "Final Fantasy X"], [/final fantasy tactics/, "Final Fantasy Tactics"],
  [/skyrim/, "The Elder Scrolls V: Skyrim"], [/morrowind/, "The Elder Scrolls III: Morrowind"], [/elder scrolls iv|oblivion (ost|soundtrack|remaster)/, "The Elder Scrolls IV: Oblivion"],
  [/witcher/, "The Witcher 3"], [/minecraft|c418/, "Minecraft"], [/baldur'?s gate 3|bg3/, "Baldur's Gate 3"], [/baldur'?s gate/, "Baldur's Gate"],
  [/world of warcraft/, "World of Warcraft"], [/hearthstone/, "Hearthstone"], [/guild wars 2/, "Guild Wars 2"], [/kingdom hearts/, "Kingdom Hearts"],
  [/persona \d/, "Persona"], [/xenoblade/, "Xenoblade Chronicles"], [/pok[eé]mon/, "Pokémon"], [/spyro/, "Spyro"], [/divinity/, "Divinity: Original Sin 2"],
  [/pillars of eternity/, "Pillars of Eternity"], [/dragon age/, "Dragon Age"], [/mass effect/, "Mass Effect"], [/\bhalo\b/, "Halo"], [/\bhades\b/, "Hades"],
  [/darkest dungeon/, "Darkest Dungeon"], [/genshin/, "Genshin Impact"], [/monster hunter/, "Monster Hunter"], [/dragon quest/, "Dragon Quest"],
  [/tabletop audio/, "Tabletop Audio"], [/critical role/, "Critical Role"], [/curse of strahd/, "Curse of Strahd"],
];
const SERIES = [["Final Fantasy", "Final Fantasy"], ["Zelda", "The Legend of Zelda"], ["Dark Souls", "Dark Souls"], ["Baldur's Gate", "Baldur's Gate"],
  ["The Elder Scrolls", "The Elder Scrolls"], ["Kingdom Hearts", "Kingdom Hearts"], ["Pillars of Eternity", "Pillars of Eternity"], ["Divinity", "Divinity"],
  ["Xenoblade", "Xenoblade Chronicles"]];

export function seriesFor(game) {
  for (const [pre, s] of SERIES) if (game.startsWith(pre)) return s;
  return null;
}

/** Returns a game name, or null if nothing matches. */
export function guessGame(fileName) {
  const name = String(fileName).replace(/\.[A-Za-z0-9]+$/, "");
  const words = name.trim().split(/\s+/);
  const last = (words.at(-1) ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (words.length > 1 && SUFFIX[last]) return SUFFIX[last];
  const low = name.toLowerCase().replace(/[_-]+/g, " ");
  for (const [re, g] of PATTERNS) if (re.test(low)) return g;
  return null;
}
