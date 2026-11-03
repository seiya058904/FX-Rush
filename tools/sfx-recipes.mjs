// What to look for on Freesound for each game sound (names match SOUNDS in src/engine/audio.js).
// group: A = physical sounds the synth does worst, B = magic / sci-fi, decided by listening.
// dur: accepted source length (s); trim: longest length in the game (s); must: name + tags must match;
// ban: extra exclusions on top of BAN in tools/sfx.mjs; transient: needs a sharp attack and one clear event.
// stereo keeps the source's width, for the few big moments; everything else is mono (the game pans it).

export const RECIPES = {
  // ---- A: physical
  swing: { group: "A", queries: ["sword swing", "sword whoosh", "blade swoosh", "weapon swing", "melee swing"], dur: [0.1, 1.5], trim: 0.28, must: /swing|whoosh|swoosh|swish|slash/ },
  hit: { group: "A", queries: ["sword hit flesh", "melee impact", "punch impact", "flesh hit", "sword stab"], dur: [0.05, 1.2], trim: 0.22, transient: true, must: /hit|impact|punch|stab|slash|thud|flesh|blade/ },
  crit: { group: "A", queries: ["sword metal hit", "metal impact ring", "blade clang", "sword clash"], dur: [0.1, 2], trim: 0.45, transient: true, must: /sword|metal|clang|clash|blade/ },
  heavy: { group: "A", queries: ["heavy impact", "heavy hit thud", "body slam impact", "hammer impact heavy", "cinematic hit"], dur: [0.15, 3], trim: 0.6, transient: true, must: /impact|hit|slam|thud|hammer|punch/, ban: /cabbage|pipe|head/ },
  kill: { group: "A", queries: ["monster death", "creature die", "goblin death", "flesh squish", "gore splat"], dur: [0.1, 1.5], trim: 0.3, must: /death|die|dying|squish|splat|gore|kill/, voice: true, ban: /heart/ },
  hurt: { group: "A", queries: ["pain grunt", "male hurt grunt", "damage grunt", "ugh pain"], dur: [0.1, 1.2], trim: 0.35, must: /pain|hurt|grunt|damage|ugh/, voice: true },
  land: { group: "A", queries: ["jump landing", "land thud", "body fall thud", "footstep landing"], dur: [0.05, 1], trim: 0.18, transient: true, must: /land|thud|fall|footstep/, ban: /ice|metal|crack/ },
  whoosh: { group: "A", queries: ["whoosh", "fast swoosh", "air swish"], dur: [0.1, 1.5], trim: 0.35, must: /whoosh|swoosh|swish/ },
  shoot: { group: "A", queries: ["pistol shot", "rifle gunshot", "gun shot short", "handgun fire"], dur: [0.05, 2], trim: 0.25, transient: true, must: /pistol|rifle|gun|shot/, gun: true, ban: /zap|laser/ },
  explode: { group: "A", queries: ["explosion short", "small explosion", "grenade explosion"], dur: [0.3, 4], trim: 1, must: /explosion|explode|grenade|blast|boom/, gun: true },
  bigboom: { group: "A", queries: ["big explosion", "massive explosion", "huge explosion boom"], dur: [1, 8], trim: 2.2, stereo: true, must: /explosion|explode|boom|blast/, gun: true, ban: /laser|rocket/ },
  thunder: { group: "A", queries: ["thunder strike", "lightning strike", "thunder crack close"], dur: [0.6, 8], trim: 1.8, stereo: true, must: /thunder|lightning/, ban: /finger|snap|8.?bit/ },
  fire: { group: "A", queries: ["fire burst", "flame whoosh", "fireball", "fire ignite"], dur: [0.3, 4], trim: 0.9, must: /fire|flame/, ban: /fire ?work|fire ?alarm|fire ?truck|gun|campfire|fireplace/ },
  ice: { group: "A", queries: ["ice crack", "freeze spell", "ice magic", "frost spell"], dur: [0.15, 3], trim: 0.6, must: /ice|freez|frost/, ban: /\bdice\b|\brice\b|\bslice\b|\bvoice\b|ice ?cream/ },
  shatter: { group: "A", queries: ["ice shatter", "glass shatter", "glass break small", "crystal break"], dur: [0.15, 3], trim: 0.55, transient: true, must: /shatter|break|crystal|smash/ },
  earth: { group: "A", queries: ["rock impact", "earth rumble debris", "stone crumble", "boulder impact"], dur: [0.25, 4], trim: 0.8, must: /rock|earth|stone|boulder|debris|rumble/, ban: /flashlight|plastic|metal|icy|rock ?(music|band|guitar)/ },
  zap: { group: "A", queries: ["electric zap", "electricity spark", "electric shock"], dur: [0.1, 2], trim: 0.3, must: /zap|electr|spark|shock/ },
  roar: { group: "A", queries: ["monster roar", "dragon roar", "beast roar", "large creature growl"], dur: [0.7, 5], trim: 1.6, stereo: true, must: /roar|growl/, voice: true },

  // ---- B: magic and sci-fi, replaced only if the audition says so
  missile: { group: "B", queries: ["missile launch", "rocket launch short", "magic projectile"], dur: [0.15, 2.5], trim: 0.35, must: /missile|rocket|projectile/ },
  laser: { group: "B", queries: ["laser shot", "sci fi laser", "laser beam"], dur: [0.08, 2], trim: 0.3, must: /laser/ },
  poison: { group: "B", queries: ["acid sizzle", "bubbling liquid", "poison gas hiss"], dur: [0.2, 3], trim: 0.5, must: /acid|bubbl|poison|sizzl|hiss/ },
  portal: { group: "B", queries: ["portal open", "teleport", "magic portal"], dur: [0.3, 4], trim: 0.8, must: /portal|teleport/, ban: /door|closet|squeak/ },
  spawn: { group: "B", queries: ["monster spawn", "summon magic", "materialize", "creature appear", "dark magic appear"], dur: [0.15, 3], trim: 0.45, must: /spawn|summon|materiali|appear/ },
  shield: { group: "B", queries: ["energy shield", "force field hit", "magic shield"], dur: [0.1, 3], trim: 0.5, must: /shield|force.?field/ },
  vortex: { group: "B", queries: ["black hole", "vortex whoosh", "suction wind", "wormhole", "energy implosion"], dur: [0.6, 5], trim: 1.5, stereo: true, must: /black.?hole|vortex|suction|wormhole|implo/ },
  rush: { group: "B", queries: ["power up charge", "energy charge riser", "riser whoosh"], dur: [0.3, 3], trim: 0.9, must: /power.?up|charge|riser/ },
  chest: { group: "B", queries: ["chest open", "treasure chest", "wooden chest creak"], dur: [0.2, 3], trim: 0.7, must: /chest/, ban: /coin|door|switch|item|chest ?(pain|cough|breath|beat)/ },
  jump: { group: "B", queries: ["jump swoosh", "cloth jump", "game jump"], dur: [0.05, 1], trim: 0.15, must: /jump/, ban: /chop|text.?message|slime/ },
  magic: { group: "B", queries: ["magic spell cast", "spell casting", "magic sparkle"], dur: [0.1, 2.5], trim: 0.4, must: /magic|spell|sparkle/, ban: /button|menu|ui|achievement|jingle/ },
  holy: { group: "B", queries: ["holy spell", "heavenly shimmer", "angelic choir short", "magic chime"], dur: [0.25, 4], trim: 0.7, must: /holy|heaven|angel|chime/, voice: true, ban: /finger|button|ui/ },

  // ---- C: cues the owner flagged in the audition
  xp: { group: "C", queries: ["xp pickup", "experience orb", "item pickup short", "collect blip", "soft pickup"], dur: [0.03, 1], trim: 0.14, must: /pick.?up|xp|experience|orb|collect|blip/, ban: /truck|car\b|phone/ },
  card: { group: "C", queries: ["card flip", "card deal", "playing card slide", "card shuffle single"], dur: [0.05, 1.5], trim: 0.22, must: /card/, ban: /credit|sd.?card|sound.?card|reader|cardboard|swipe/ },
};

// Left to the synth unless the owner flags one in the audition: chiptune cues that suit the pixel style.
export const KEEP = ["coin", "ui", "select", "levelup", "heal", "combo", "warn", "stage", "victory", "defeat"];
