import { world, system, ItemStack, ItemTypes, CommandPermissionLevel, CustomCommandStatus, Player } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

const CURRENCY = "€";
const STARTING_BALANCE_CENTS = 10000;
const formatMoney = cents => (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + CURRENCY;
const parseMoneyToCents = value => {
  let normalized = String(value).trim().replace(/€/g, "").replace(/\s/g, "");
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 100);
};
const ACCOUNTS_KEY = "bazaar:accounts";
const LISTINGS_KEY = "bazaar:listings";
const PRICES_KEY = "bazaar:prices";
const DIRECT_TRADES_KEY = "bazaar:direct_trades";

function isAdminOnlyItem(itemId) {
  const raw = String(itemId || "").replace(/^minecraft:/, "");
  return raw.endsWith("_spawn_egg") || raw === "mob_spawner" || raw === "spawner";
}

// Texturpfade für Item-Schaltflächen im Kauf-, Verkaufs- und Spielermarkt.
const CUSTOM_ITEM_ICONS = {
  "survivalbazaar:modern_sofa": "textures/blocks/sofa",
  "survivalbazaar:grandfather_clock": "textures/blocks/grandfather_clock",
  "survivalbazaar:hanging_guitar": "textures/blocks/hanging_guitar",
  "survivalbazaar:bar_counter": "textures/blocks/bar_counter",
  "survivalbazaar:bar_stool": "textures/blocks/bar_stool",
  "survivalbazaar:wall_shelf": "textures/blocks/wall_shelf",
  "survivalbazaar:potted_plant": "textures/blocks/potted_plant",
  "survivalbazaar:flat_tv": "textures/blocks/tv",
  "survivalbazaar:wall_mirror": "textures/blocks/mirror",
  "survivalbazaar:coffee_table": "textures/blocks/table",
  "survivalbazaar:modern_chair": "textures/blocks/chair",
  "survivalbazaar:double_bed": "textures/blocks/bed",
  "survivalbazaar:fridge": "textures/blocks/fridge",
  "survivalbazaar:dining_table": "textures/blocks/table",
  "survivalbazaar:wardrobe": "textures/blocks/fridge",
  "survivalbazaar:bookshelf": "textures/blocks/table",
  "survivalbazaar:floor_lamp": "textures/blocks/tv",
  "survivalbazaar:armchair": "textures/blocks/chair"
};
const BLOCK_ITEM_IDS = new Set((
  "dirt coarse_dirt rooted_dirt grass_block podzol mycelium mud clay sand red_sand gravel snow_block ice packed_ice blue_ice stone cobblestone mossy_cobblestone granite diorite andesite deepslate cobbled_deepslate tuff calcite dripstone_block bricks stone_bricks quartz_block obsidian crying_obsidian oak_log spruce_log birch_log jungle_log acacia_log dark_oak_log mangrove_log cherry_log bamboo_block crimson_stem warped_stem hay_block moss_block bone_block glass glass_pane glowstone sea_lantern lantern torch bookshelf flower_pot terracotta white_wool white_concrete white_concrete_powder wool concrete concrete_powder stained_glass stained_glass_pane carpet bed banner shulker_box candle stairs slab fence fence_gate door trapdoor button pressure_plate sign bamboo_mosaic stone_stairs stone_slab cobblestone_stairs cobblestone_slab stone_brick_stairs stone_brick_slab brick_stairs brick_slab quartz_stairs quartz_slab polished_andesite_stairs polished_andesite_slab polished_diorite_stairs polished_diorite_slab polished_granite_stairs polished_granite_slab iron_door iron_trapdoor ladder scaffolding chain iron_bars"
).split(/\s+/));
function itemIconPath(itemId) {
  if (CUSTOM_ITEM_ICONS[itemId]) return CUSTOM_ITEM_ICONS[itemId];
  const path = String(itemId).replace(/^minecraft:/, "");
  // Vanilla-Icons werden nicht mehr über vermutete Dateinamen geladen:
  // Bedrock nutzt je nach Gegenstand abweichende Atlasnamen. Diese sicheren
  // Bazaar-Kategorie-Icons verhindern fehlende/lila-schwarze Vorschauen.
  if (/(sword|bow|crossbow|trident|mace|arrow|shield|helmet|chestplate|leggings|boots|armor)/.test(path))
    return "textures/ui/icons/combat";
  if (/(beef|porkchop|chicken|mutton|rabbit|cod|salmon|fish|apple|carrot|potato|beetroot|melon|pumpkin|berries|bread|cookie|cake|pie|stew|kelp|honey|chorus_fruit)/.test(path))
    return "textures/ui/icons/food";
  if (/(seed|sapling|propagule|flower|mushroom|fungus|roots|vines|wheat|sugar_cane|cocoa|wart|kelp|bamboo|cactus|plant)/.test(path))
    return "textures/ui/icons/plants";
  if (/(log|wood|plank|stone|dirt|sand|gravel|brick|glass|wool|concrete|terracotta|ore|block|slab|stairs|fence|door|trapdoor|wall|torch|lantern)/.test(path))
    return "textures/ui/icons/blocks";
  if (/(ingot|nugget|raw_|diamond|emerald|quartz|coal|charcoal|scrap|shard|pearl|star|totem|shell|echo|bone|string|leather|feather|gunpowder|redstone|lapis)/.test(path))
    return "textures/ui/icons/materials";
  return "textures/ui/icons/misc";
}

const SHOP = [
  { id: "minecraft:bread", name: "Brot", buy: 8, sell: 3 },
  { id: "minecraft:torch", name: "Fackel", buy: 2, sell: 1 },
  { id: "minecraft:oak_log", name: "Eichenstamm", buy: 6, sell: 2 },
  { id: "minecraft:iron_ingot", name: "Eisenbarren", buy: 35, sell: 12 },
  { id: "minecraft:gold_ingot", name: "Goldbarren", buy: 55, sell: 20 },
  { id: "minecraft:diamond", name: "Diamant", buy: 250, sell: 90 },
  { id: "minecraft:arrow", name: "Pfeil", buy: 3, sell: 1 },
  { id: "minecraft:ender_pearl", name: "Enderperle", buy: 45, sell: 15 },
  // Moderne, eigens modellierte Möbel aus dem Survival Bazaar Resource Pack
  { id: "survivalbazaar:modern_sofa", name: "Sofa", buy: 25, sell: 9 },
  { id: "survivalbazaar:flat_tv", name: "Fernseher", buy: 33, sell: 12 },
  { id: "survivalbazaar:wall_mirror", name: "Wandspiegel", buy: 13, sell: 5 },
  { id: "survivalbazaar:coffee_table", name: "Couchtisch", buy: 10, sell: 3 },
  { id: "survivalbazaar:modern_chair", name: "Stuhl", buy: 15, sell: 5 },
  { id: "survivalbazaar:double_bed", name: "Doppelbett", buy: 28, sell: 10 },
  { id: "survivalbazaar:fridge", name: "Kühlschrank", buy: 30, sell: 10 }
,
  { id: "survivalbazaar:dining_table", name: "Esstisch", buy: 32, sell: 12 }
  ,{ id: "survivalbazaar:wardrobe", name: "Kleiderschrank", buy: 48, sell: 18 }
  ,{ id: "survivalbazaar:bookshelf", name: "Bücherregal", buy: 28, sell: 10 }
  ,{ id: "survivalbazaar:floor_lamp", name: "Stehlampe", buy: 20, sell: 7 }
  ,{ id: "survivalbazaar:armchair", name: "Sessel", buy: 24, sell: 9 }
  ,{ id: "survivalbazaar:grandfather_clock", name: "Standuhr", buy: 38, sell: 14 }
  ,{ id: "survivalbazaar:hanging_guitar", name: "Gitarre", buy: 29, sell: 10 }
  ,{ id: "survivalbazaar:bar_counter", name: "Bartisch", buy: 42, sell: 16 }
  ,{ id: "survivalbazaar:bar_stool", name: "Barhocker", buy: 18, sell: 6 }
  ,{ id: "survivalbazaar:wall_shelf", name: "Wandregal", buy: 16, sell: 6 }
  ,{ id: "survivalbazaar:potted_plant", name: "Topfpflanze", buy: 9, sell: 3 }
];

// Verkaufs-Katalog: mehrstufige Kategorien, jedes Item einzeln verkaufbar.
// Preise sind Euro pro Stück und können später angepasst werden.
const SELL_CATEGORIES = [
  { name: "Kampf", groups: [
    { name: "Boss-Drops", items: [
      ["minecraft:nether_star","Netherstern",100],["minecraft:dragon_egg","Drachenei",500],["minecraft:dragon_breath","Drachenatem",12],["minecraft:shulker_shell","Shulkerschale",15],["minecraft:totem_of_undying","Totem der Unsterblichkeit",40],["minecraft:echo_shard","Echoscherbe",8],["minecraft:heart_of_the_sea","Herz des Meeres",30]
    ]},
    { name: "Waffen", items: [
      ["minecraft:wooden_sword","Holzschwert",2],["minecraft:stone_sword","Steinschwert",4],["minecraft:iron_sword","Eisenschwert",12],["minecraft:golden_sword","Goldschwert",8],["minecraft:diamond_sword","Diamantschwert",45],["minecraft:netherite_sword","Netheritschwert",120],["minecraft:bow","Bogen",12],["minecraft:crossbow","Armbrust",15],["minecraft:trident","Dreizack",60],["minecraft:mace","Streitkolben",80]
    ]},
    { name: "Rüstungen", items: [
      ["minecraft:leather_helmet","Lederhelm",4],["minecraft:leather_chestplate","Lederjacke",7],["minecraft:leather_leggings","Lederhose",6],["minecraft:leather_boots","Lederstiefel",4],
      ["minecraft:copper_helmet","Kupferhelm",8],["minecraft:copper_chestplate","Kupferbrustplatte",14],["minecraft:copper_leggings","Kupferhose",12],["minecraft:copper_boots","Kupferstiefel",8],
      ["minecraft:chainmail_helmet","Kettenhaube",12],["minecraft:chainmail_chestplate","Kettenrüstung",22],["minecraft:chainmail_leggings","Kettenhose",18],["minecraft:chainmail_boots","Kettenstiefel",12],
      ["minecraft:iron_helmet","Eisenhelm",15],["minecraft:iron_chestplate","Eisenbrustplatte",25],["minecraft:iron_leggings","Eisenhose",22],["minecraft:iron_boots","Eisenstiefel",15],
      ["minecraft:golden_helmet","Goldhelm",12],["minecraft:golden_chestplate","Goldbrustplatte",20],["minecraft:golden_leggings","Goldhose",17],["minecraft:golden_boots","Goldstiefel",12],
      ["minecraft:diamond_helmet","Diamanthelm",55],["minecraft:diamond_chestplate","Diamantbrustplatte",90],["minecraft:diamond_leggings","Diamanthose",80],["minecraft:diamond_boots","Diamantstiefel",55],
      ["minecraft:netherite_helmet","Netherithelm",130],["minecraft:netherite_chestplate","Netheritbrustplatte",200],["minecraft:netherite_leggings","Netherithose",180],["minecraft:netherite_boots","Netheritstiefel",130]
    ]}
  ]},
  { name: "Blöcke", groups: [
    { name: "Erde und Natur", items: [
      ["minecraft:dirt","Erde",1],["minecraft:coarse_dirt","Grobe Erde",1],["minecraft:rooted_dirt","Bewurzelte Erde",2],["minecraft:grass_block","Grasblock",2],["minecraft:podzol","Podsol",2],["minecraft:mycelium","Myzel",3],["minecraft:mud","Schlamm",2],["minecraft:clay","Ton",3],["minecraft:sand","Sand",1],["minecraft:red_sand","Roter Sand",2],["minecraft:gravel","Kies",1],["minecraft:snow_block","Schneeblock",2],["minecraft:ice","Eis",2],["minecraft:packed_ice","Packeis",5],["minecraft:blue_ice","Blaueis",12]
    ]},
    { name: "Stein und Ziegel", items: [
      ["minecraft:stone","Stein",2],["minecraft:cobblestone","Bruchstein",1],["minecraft:mossy_cobblestone","Bemooster Bruchstein",3],["minecraft:granite","Granit",2],["minecraft:diorite","Diorit",2],["minecraft:andesite","Andesit",2],["minecraft:deepslate","Tiefenschiefer",3],["minecraft:cobbled_deepslate","Bruchtiefenschiefer",2],["minecraft:tuff","Tuff",2],["minecraft:calcite","Kalzit",3],["minecraft:dripstone_block","Tropfsteinblock",3],["minecraft:bricks","Ziegel",5],["minecraft:stone_bricks","Steinziegel",3],["minecraft:quartz_block","Quarzblock",8],["minecraft:obsidian","Obsidian",10],["minecraft:crying_obsidian","Weinender Obsidian",15]
    ]},
    { name: "Holz und Pflanzenblöcke", items: [
      ["minecraft:oak_log","Eichenstamm",3],["minecraft:spruce_log","Fichtenstamm",3],["minecraft:birch_log","Birkenstamm",3],["minecraft:jungle_log","Tropenstamm",3],["minecraft:acacia_log","Akazienstamm",3],["minecraft:dark_oak_log","Schwarzeichenstamm",3],["minecraft:mangrove_log","Mangrovenstamm",4],["minecraft:cherry_log","Kirschstamm",4],["minecraft:bamboo_block","Bambusblock",3],["minecraft:crimson_stem","Karmesinstiel",4],["minecraft:warped_stem","Wirrstiel",4],["minecraft:hay_block","Heuballen",3],["minecraft:moss_block","Moosblock",3],["minecraft:bone_block","Knochenblock",4]
    ]},
    { name: "Glas und Deko", items: [
      ["minecraft:glass","Glas",2],["minecraft:glass_pane","Glasscheibe",1],["minecraft:glowstone","Glowstone",5],["minecraft:sea_lantern","Seelaterne",8],["minecraft:lantern","Laterne",5],["minecraft:torch","Fackel",1],["minecraft:bookshelf","Bücherregal",8],["minecraft:flower_pot","Blumentopf",3],["minecraft:terracotta","Keramik",3],["minecraft:white_wool","Weiße Wolle",2],["minecraft:white_concrete","Weißer Beton",2],["minecraft:white_concrete_powder","Weißer Trockenbeton",2]
    ]}
  ]},
  { name: "Essen", groups: [
    { name: "Fleisch und Fisch", items: [
      ["minecraft:beef","Rohes Rindfleisch",2],["minecraft:cooked_beef","Steak",4],["minecraft:porkchop","Rohes Schweinefleisch",2],["minecraft:cooked_porkchop","Gebratenes Schweinefleisch",4],["minecraft:chicken","Rohes Hühnchen",2],["minecraft:cooked_chicken","Gebratenes Hühnchen",4],["minecraft:mutton","Rohes Hammelfleisch",2],["minecraft:cooked_mutton","Gebratenes Hammelfleisch",4],["minecraft:rabbit","Rohes Kaninchen",2],["minecraft:cooked_rabbit","Gebratenes Kaninchen",4],["minecraft:cod","Roher Kabeljau",2],["minecraft:cooked_cod","Gebratener Kabeljau",4],["minecraft:salmon","Roher Lachs",3],["minecraft:cooked_salmon","Gebratener Lachs",5],["minecraft:tropical_fish","Tropenfisch",3],["minecraft:pufferfish","Kugelfisch",5]
    ]},
    { name: "Obst und Gemüse", items: [
      ["minecraft:apple","Apfel",2],["minecraft:golden_apple","Goldener Apfel",25],["minecraft:enchanted_golden_apple","Verzauberter goldener Apfel",250],["minecraft:carrot","Karotte",2],["minecraft:golden_carrot","Goldene Karotte",8],["minecraft:potato","Kartoffel",2],["minecraft:baked_potato","Ofenkartoffel",3],["minecraft:beetroot","Rote Bete",2],["minecraft:melon_slice","Melonenscheibe",1],["minecraft:pumpkin","Kürbis",3],["minecraft:sweet_berries","Süßbeeren",2],["minecraft:glow_berries","Leuchtbeeren",3],["minecraft:chorus_fruit","Chorusfrucht",4]
    ]},
    { name: "Backwaren und Sonstiges", items: [
      ["minecraft:bread","Brot",3],["minecraft:cookie","Keks",1],["minecraft:cake","Kuchen",10],["minecraft:pumpkin_pie","Kürbiskuchen",5],["minecraft:mushroom_stew","Pilzsuppe",5],["minecraft:rabbit_stew","Kaninchenragout",7],["minecraft:beetroot_soup","Rote-Bete-Suppe",5],["minecraft:dried_kelp","Getrockneter Seetang",1],["minecraft:honey_bottle","Honigflasche",4]
    ]}
  ]},
  { name: "Pflanzen und Landwirtschaft", groups: [
    { name: "Samen und Feldfrüchte", items: [
      ["minecraft:wheat_seeds","Weizensamen",1],["minecraft:wheat","Weizen",2],["minecraft:beetroot_seeds","Rote-Bete-Samen",1],["minecraft:melon_seeds","Melonensamen",2],["minecraft:pumpkin_seeds","Kürbiskerne",2],["minecraft:carrot","Karotte",2],["minecraft:potato","Kartoffel",2],["minecraft:sugar_cane","Zuckerrohr",2],["minecraft:cocoa_beans","Kakaobohnen",2],["minecraft:nether_wart","Netherwarze",4],["minecraft:kelp","Seetang",1],["minecraft:sea_pickle","Seegurke",2],["minecraft:bamboo","Bambus",2],["minecraft:cactus","Kaktus",2]
    ]},
    { name: "Setzlinge und Blumen", items: [
      ["minecraft:oak_sapling","Eichensetzling",2],["minecraft:spruce_sapling","Fichtensetzling",2],["minecraft:birch_sapling","Birkensetzling",2],["minecraft:jungle_sapling","Tropenbaumsetzling",3],["minecraft:acacia_sapling","Akaziensetzling",2],["minecraft:dark_oak_sapling","Schwarzeichensetzling",3],["minecraft:mangrove_propagule","Mangrovensprössling",3],["minecraft:cherry_sapling","Kirschsetzling",3],["minecraft:allium","Zierlauch",2],["minecraft:blue_orchid","Blaue Orchidee",2],["minecraft:cornflower","Kornblume",2],["minecraft:poppy","Mohn",1],["minecraft:dandelion","Löwenzahn",1],["minecraft:torchflower","Fackelblume",5],["minecraft:pitcher_plant","Kannenpflanze",5]
    ]},
    { name: "Pilze und Netherpflanzen", items: [
      ["minecraft:brown_mushroom","Brauner Pilz",2],["minecraft:red_mushroom","Roter Pilz",2],["minecraft:crimson_fungus","Karmesinpilz",3],["minecraft:warped_fungus","Wirrpilz",3],["minecraft:crimson_roots","Karmesinwurzeln",2],["minecraft:warped_roots","Wirrwurzeln",2],["minecraft:nether_sprouts","Nethersprossen",2],["minecraft:weeping_vines","Weinende Ranken",2],["minecraft:twisting_vines","Verdrehte Ranken",2],["minecraft:shroomlight","Pilzlicht",5]
    ]}
  ]},
  { name: "Herstellung und Materialien", groups: [
    { name: "Erze und Barren", items: [
      ["minecraft:coal","Kohle",2],["minecraft:charcoal","Holzkohle",2],["minecraft:raw_iron","Roheisen",4],["minecraft:iron_ingot","Eisenbarren",6],["minecraft:raw_copper","Rohkupfer",3],["minecraft:copper_ingot","Kupferbarren",4],["minecraft:raw_gold","Rohgold",5],["minecraft:gold_ingot","Goldbarren",8],["minecraft:diamond","Diamant",25],["minecraft:emerald","Smaragd",18],["minecraft:lapis_lazuli","Lapislazuli",3],["minecraft:quartz","Netherquarz",3],["minecraft:amethyst_shard","Amethystscherbe",5],["minecraft:netherite_scrap","Netherit-Schrott",40],["minecraft:netherite_ingot","Netheritbarren",150]
    ]},
    { name: "Werkstoffe", items: [
      ["minecraft:stick","Stock",1],["minecraft:flint","Feuerstein",2],["minecraft:string","Faden",2],["minecraft:leather","Leder",4],["minecraft:feather","Feder",2],["minecraft:bone","Knochen",2],["minecraft:bone_meal","Knochenmehl",1],["minecraft:ink_sac","Tintenbeutel",2],["minecraft:glow_ink_sac","Leuchttintenbeutel",4],["minecraft:slime_ball","Schleimball",5],["minecraft:blaze_rod","Lohenrute",8],["minecraft:blaze_powder","Lohenstaub",4],["minecraft:gunpowder","Schwarzpulver",3],["minecraft:ender_pearl","Enderperle",8],["minecraft:ender_eye","Enderauge",12],["minecraft:prismarine_shard","Prismarinscherbe",3],["minecraft:prismarine_crystals","Prismarinkristall",4],["minecraft:honeycomb","Honigwabe",3]
    ]},
    { name: "Redstone und Mechanik", items: [
      ["minecraft:redstone","Redstone-Staub",2],["minecraft:redstone_torch","Redstone-Fackel",2],["minecraft:repeater","Redstone-Verstärker",5],["minecraft:comparator","Redstone-Komparator",6],["minecraft:piston","Kolben",6],["minecraft:sticky_piston","Klebriger Kolben",8],["minecraft:observer","Beobachter",7],["minecraft:hopper","Trichter",8],["minecraft:dispenser","Werfer",6],["minecraft:dropper","Spender",5],["minecraft:lever","Hebel",1],["minecraft:target","Zielblock",5],["minecraft:daylight_detector","Tageslichtsensor",5]
    ]}
  ]},
  { name: "Werkzeuge", groups: [
    { name: "Spitzhacken", items: [["minecraft:wooden_pickaxe","Holzspitzhacke",2],["minecraft:stone_pickaxe","Steinspitzhacke",4],["minecraft:iron_pickaxe","Eisenspitzhacke",12],["minecraft:golden_pickaxe","Goldspitzhacke",8],["minecraft:diamond_pickaxe","Diamantspitzhacke",45],["minecraft:netherite_pickaxe","Netheritspitzhacke",120]]},
    { name: "Äxte", items: [["minecraft:wooden_axe","Holzaxt",2],["minecraft:stone_axe","Steinaxt",4],["minecraft:iron_axe","Eisenaxt",12],["minecraft:golden_axe","Goldaxt",8],["minecraft:diamond_axe","Diamantaxt",45],["minecraft:netherite_axe","Netheritaxt",120]]},
    { name: "Schaufeln und Hacken", items: [["minecraft:wooden_shovel","Holzschaufel",2],["minecraft:stone_shovel","Steinschaufel",3],["minecraft:iron_shovel","Eisenschaufel",8],["minecraft:golden_shovel","Goldschaufel",6],["minecraft:diamond_shovel","Diamantschaufel",25],["minecraft:netherite_shovel","Netheritschaufel",70],["minecraft:wooden_hoe","Holzhacke",2],["minecraft:stone_hoe","Steinhacke",3],["minecraft:iron_hoe","Eisenhacke",8],["minecraft:golden_hoe","Goldhacke",6],["minecraft:diamond_hoe","Diamanthacke",25],["minecraft:netherite_hoe","Netherithacke",70],["minecraft:shears","Schere",5],["minecraft:fishing_rod","Angel",5],["minecraft:flint_and_steel","Feuerzeug",5]]}
  ]},
  { name: "Sonstiges", groups: [
    { name: "Transport", items: [["minecraft:rail","Schiene",2],["minecraft:powered_rail","Antriebsschiene",5],["minecraft:minecart","Lore",10],["minecraft:chest_minecart","Trichterlore",18],["minecraft:boat","Boot",5],["minecraft:saddle","Sattel",20],["minecraft:lead","Leine",5],["minecraft:elytra","Elytren",100]]},
    { name: "Mob-Drops", items: [["minecraft:rotten_flesh","Verrottetes Fleisch",1],["minecraft:spider_eye","Spinnenauge",2],["minecraft:fermented_spider_eye","Fermentiertes Spinnenauge",4],["minecraft:ghast_tear","Ghastträne",12],["minecraft:magma_cream","Magmacreme",5],["minecraft:phantom_membrane","Phantomhaut",8],["minecraft:nautilus_shell","Nautilusschale",8],["minecraft:rabbit_hide","Kaninchenfell",2],["minecraft:rabbit_foot","Hasenpfote",8],["minecraft:armadillo_scute","Gürteltier-Hornschild",5],["minecraft:turtle_scute","Schildkrötenhornschild",8]]},
    { name: "Musik und Sammlerstücke", items: [["minecraft:music_disc_13","Schallplatte 13",15],["minecraft:music_disc_cat","Schallplatte Cat",15],["minecraft:music_disc_pigstep","Schallplatte Pigstep",40],["minecraft:music_disc_otherside","Schallplatte Otherside",30],["minecraft:banner","Banner",5],["minecraft:painting","Gemälde",5],["minecraft:decorated_pot","Verzierter Krug",8]]}
  ]}
];


 
// Zusätzliche Vanilla-Bau- und Dekorationsartikel: Farbvarianten und
// herstellbare Holz-/Steinbauteile werden automatisch in Kauf- und Verkauf
// übernommen.
const COLORS = [
  ["white", "Weiß"], ["orange", "Orange"], ["magenta", "Magenta"], ["light_blue", "Hellblau"],
  ["yellow", "Gelb"], ["lime", "Hellgrün"], ["pink", "Rosa"], ["gray", "Grau"],
  ["light_gray", "Hellgrau"], ["cyan", "Türkis"], ["purple", "Lila"], ["blue", "Blau"],
  ["brown", "Braun"], ["green", "Grün"], ["red", "Rot"], ["black", "Schwarz"]
];
const colorItems = [];
for (const [colorId, colorName] of COLORS) {
  const variants = [
    ["wool", "Wolle", 2], ["concrete", "Beton", 3], ["concrete_powder", "Trockenbeton", 2],
    ["terracotta", "Keramik", 3], ["stained_glass", "Buntglas", 3],
    ["stained_glass_pane", "Buntglasscheibe", 2], ["carpet", "Teppich", 1],
    ["bed", "Bett", 8], ["banner", "Banner", 5], ["shulker_box", "Shulkerkiste", 30],
    ["candle", "Kerze", 3]
  ];
  for (const [suffix, label, price] of variants) {
    colorItems.push([`minecraft:${colorId}_${suffix}`, `${colorName} ${label}`, price]);
  }
}
const woodTypes = [
  ["oak", "Eiche"], ["spruce", "Fichte"], ["birch", "Birke"], ["jungle", "Tropenholz"],
  ["acacia", "Akazie"], ["dark_oak", "Schwarzeiche"], ["mangrove", "Mangrove"],
  ["cherry", "Kirsche"], ["bamboo", "Bambus"], ["crimson", "Karmesin"], ["warped", "Wirrholz"]
];
const woodParts = [];
for (const [woodId, woodName] of woodTypes) {
  const parts = [
    ["stairs", "Treppe", 3], ["slab", "Stufe", 2], ["fence", "Zaun", 3],
    ["fence_gate", "Zauntor", 4], ["door", "Tür", 5], ["trapdoor", "Falltür", 4],
    ["button", "Knopf", 1], ["pressure_plate", "Druckplatte", 2], ["sign", "Schild", 3]
  ];
  for (const [suffix, label, price] of parts) {
    woodParts.push([`minecraft:${woodId}_${suffix}`, `${woodName} ${label}`, price]);
  }
  if (woodId === "bamboo") {
    woodParts.push(["minecraft:bamboo_mosaic", "Bambusmosaik", 3]);
    woodParts.push(["minecraft:bamboo_mosaic_stairs", "Bambusmosaiktreppe", 4]);
    woodParts.push(["minecraft:bamboo_mosaic_slab", "Bambusmosaikstufe", 2]);
  }
}
const stoneParts = [
  ["minecraft:stone_stairs", "Steintreppe", 3], ["minecraft:stone_slab", "Steinstufe", 2],
  ["minecraft:cobblestone_stairs", "Bruchsteintreppe", 2], ["minecraft:cobblestone_slab", "Bruchsteinstufe", 1],
  ["minecraft:stone_brick_stairs", "Steinziegeltreppe", 4], ["minecraft:stone_brick_slab", "Steinziegelstufe", 2],
  ["minecraft:brick_stairs", "Ziegeltreppe", 5], ["minecraft:brick_slab", "Ziegelstufe", 3],
  ["minecraft:quartz_stairs", "Quarztreppe", 8], ["minecraft:quartz_slab", "Quarzstufe", 4],
  ["minecraft:polished_andesite_stairs", "Polierte Andesittreppe", 3], ["minecraft:polished_andesite_slab", "Polierte Andesitstufe", 2],
  ["minecraft:polished_diorite_stairs", "Polierte Diorittreppe", 3], ["minecraft:polished_diorite_slab", "Polierte Dioritstufe", 2],
  ["minecraft:polished_granite_stairs", "Polierte Granittreppe", 3], ["minecraft:polished_granite_slab", "Polierte Granitstufe", 2],
  ["minecraft:glass", "Glas", 2], ["minecraft:glass_pane", "Glasscheibe", 1],
  ["minecraft:iron_door", "Eisentür", 8], ["minecraft:iron_trapdoor", "Eisenfalltür", 6],
  ["minecraft:ladder", "Leiter", 2], ["minecraft:scaffolding", "Gerüst", 2],
  ["minecraft:chain", "Kette", 3], ["minecraft:iron_bars", "Eisengitter", 3]
];
SELL_CATEGORIES.push({ name: "Bauen und Dekoration", groups: [
  { name: "Alle Farbvarianten", items: colorItems },
  { name: "Holzbauteile", items: woodParts },
  { name: "Stein und Bauteile", items: stoneParts }
]});

// Einkaufskatalog: übernimmt alle Gegenstände aus dem Verkaufskatalog,
// berechnet standardmäßig einen Einkaufspreis von 2× Verkaufspreis und
// ergänzt die festen Server-Shop-Preise sowie die Möbel.
const BUY_PRICE_OVERRIDES = Object.fromEntries(SHOP.map(item => [item.id, item.buy]));
const BUY_CATEGORIES = SELL_CATEGORIES.map(category => ({
  name: category.name,
  groups: category.groups.map(group => ({
    name: group.name,
    items: group.items.map(([id, name, sellPrice]) => [
      id, name, BUY_PRICE_OVERRIDES[id] ?? sellPrice * 2
    ])
  }))
}));
const buySeen = new Set();
for (const category of BUY_CATEGORIES) {
  for (const group of category.groups) {
    group.items = group.items.filter(([id]) => {
      if (buySeen.has(id)) return false;
      buySeen.add(id);
      return true;
    });
  }
  category.groups = category.groups.filter(group => group.items.length > 0);
}
BUY_CATEGORIES.push({
  name: "Möbel und Einrichtung",
  groups: [{
    name: "Moderne Möbel",
    items: SHOP.filter(item => item.id.startsWith("survivalbazaar:"))
      .map(item => [item.id, item.name, item.buy])
  }]
});

SELL_CATEGORIES.push({
  name: "Möbel und Einrichtung",
  groups: [{
    name: "Moderne Möbel",
    items: SHOP.filter(item => item.id.startsWith("survivalbazaar:"))
      .map(item => [item.id, item.name, item.sell])
  }]
});


let FULL_CATALOG_READY = false;
const ITEM_LABELS_DE = {
 oak:"Eichen",spruce:"Fichten",birch:"Birken",jungle:"Tropen",acacia:"Akazien",dark_oak:"Schwarzeichen",mangrove:"Mangroven",cherry:"Kirsch",bamboo:"Bambus",pale_oak:"Hell Eichen",poplar:"Pappel",crimson:"Karmesin",warped:"Wirr",
 stone:"Stein",cobblestone:"Bruchstein",deepslate:"Tiefenschiefer",diamond:"Diamant",emerald:"Smaragd",iron:"Eisen",gold:"Gold",copper:"Kupfer",netherite:"Netherit",coal:"Kohle",redstone:"Redstone",quartz:"Quarz",
 apple:"Apfel",bread:"Brot",carrot:"Karotte",potato:"Kartoffel",wheat:"Weizen",pumpkin:"Kürbis",melon:"Melone",beetroot:"Rote Bete",fish:"Fisch",salmon:"Lachs",cod:"Kabeljau",chicken:"Huhn",beef:"Rind",porkchop:"Schweinefleisch",mutton:"Hammel",rabbit:"Kaninchen",cooked:"Gebraten",raw:"Roh",golden:"Goldene",enchanted:"Verzauberte",
 spawn:"Spawn",egg:"Ei",seeds:"Samen",seed:"Samen",sapling:"Setzling",log:"Stamm",planks:"Bretter",leaves:"Blätter",stairs:"Treppe",slab:"Stufe",fence:"Zaun",fence_gate:"Zauntor",door:"Tür",trapdoor:"Falltür",button:"Knopf",pressure_plate:"Druckplatte",sign:"Schild",hanging:"Hängend",
 wool:"Wolle",concrete:"Beton",terracotta:"Keramik",stained_glass:"Buntglas",stained_glass_pane:"Buntglasscheibe",carpet:"Teppich",bed:"Bett",shulker_box:"Shulkerkiste",candle:"Kerze",dye:"Farbstoff",flower:"Blume",tulip:"Tulpe",orchid:"Orchidee",poppy:"Mohn",dandelion:"Löwenzahn",mushroom:"Pilz",fungus:"Pilz",roots:"Wurzeln",vines:"Ranken",
 sword:"Schwert",pickaxe:"Spitzhacke",axe:"Axt",shovel:"Schaufel",hoe:"Hacke",helmet:"Helm",chestplate:"Brustplatte",leggings:"Hose",boots:"Stiefel",bow:"Bogen",crossbow:"Armbrust",trident:"Dreizack",mace:"Streitkolben",shield:"Schild",arrow:"Pfeil",armor:"Rüstung",
 ingot:"Barren",nugget:"Nugget",ore:"Erz",block:"Block",brick:"Ziegel",polished:"Poliert",chiseled:"Gemeißelt",cracked:"Rissig",smooth:"Glatt",wall:"Mauer",pillar:"Säule",torch:"Fackel",lantern:"Laterne",bucket:"Eimer",boat:"Boot",raft:"Floß",minecart:"Lore",rail:"Schiene",potion:"Trank",stew:"Eintopf",soup:"Suppe",cookie:"Keks",cake:"Kuchen",pie:"Pastete",pearl:"Perle",shard:"Splitter",crystal:"Kristall",shell:"Schale",heart:"Herz",star:"Stern",disc:"Schallplatte",music:"Musik",template:"Vorlage",trim:"Verzierung",banner:"Banner",painting:"Gemälde",head:"Kopf",skull:"Schädel",book:"Buch",paper:"Papier",map:"Karte",glass:"Glas",pane:"Scheibe",sand:"Sand",gravel:"Kies",dirt:"Erde",grass:"Gras",mud:"Schlamm",clay:"Ton",snow:"Schnee",ice:"Eis",water:"Wasser",lava:"Lava",coral:"Koralle",prismarine:"Prismarin",waxed:"Gewachst",exposed:"Freigelegt",weathered:"Verwittert",oxidized:"Oxidiert",resin:"Harz",sulfur:"Schwefel",cinnabar:"Zinnober"
};
function catalogLabel(id) {
 const raw=id.replace(/^minecraft:/,"");
 return raw.split("_").map(part=>ITEM_LABELS_DE[part]||(part.length<=2?part.toUpperCase():part[0].toUpperCase()+part.slice(1))).join(" ");
}
function catalogCategory(id) {
 const n=id.replace(/^minecraft:/,"");
 if(n.endsWith("_spawn_egg")) return "Kreaturen";
 if(/sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots|bow|crossbow|trident|mace|shield|shears|fishing_rod|flint_and_steel|carrot_on_a_stick|warped_fungus_on_a_stick|horse_armor|nautilus_armor|elytra/.test(n)) return "Waffen, Werkzeuge und Rüstung";
 if(/apple|bread|beef|porkchop|chicken|mutton|rabbit|cod|salmon|fish|potato|carrot|beetroot|melon_slice|pumpkin_pie|cookie|cake|stew|soup|berries|chorus_fruit|honey_bottle|dried_kelp|rotten_flesh/.test(n)) return "Essen und Trinken";
 if(/seed|sapling|propagule|flower|tulip|orchid|dandelion|poppy|allium|grass|fern|mushroom|fungus|roots|vines|cactus|sugar_cane|bamboo|kelp|seagrass|coral|leaves|azalea|crop|wart|lily|bush|wildflowers|eyeblossom/.test(n)) return "Pflanzen und Landwirtschaft";
 if(/ingot|nugget|ore|raw_|diamond|emerald|coal|charcoal|quartz|amethyst|lapis|redstone|copper|netherite|iron|gold|ancient_debris|scrap|shard|crystal|dust|powder|leather|string|feather|bone|slime|gunpowder|blaze|ender_pearl|prismarine|shell|scute|tear|membrane|star|echo|totem/.test(n)) return "Rohstoffe und Beute";
 if(/boat|raft|minecart|rail|saddle|lead|elytra|harness/.test(n)) return "Transport";
 if(/banner|painting|pottery|sherd|head|skull|music_disc|disc_fragment|armor_trim|flower_pot|candle|carpet|bed|glass|pane|wool|concrete|terracotta|shulker_box|cushion|shelf/.test(n)) return "Dekoration und Farben";
 if(/command_block|structure_block|structure_void|jigsaw|barrier|debug_stick|allow|deny|border_block|element_|chemistry|camera|portfolio|board|agent_|unknown|reserved|deprecated|moving_block|invisible_bedrock|info_update|client_request/.test(n)) return "Technische Gegenstände";
 return "Blöcke und Baumaterial";
}
function catalogSellPrice(id) {
 const n=id.replace(/^minecraft:/,"");
 if(/nether_star|dragon_egg|enchanted_golden_apple|elytra|netherite_ingot|totem_of_undying/.test(n)) return 100;
 if(/diamond|emerald|ancient_debris|netherite_scrap|shulker_shell|heart_of_the_sea|trident|mace/.test(n)) return 20;
 if(/ingot|ore|amethyst|prismarine|copper|gold|iron|redstone|lapis|quartz/.test(n)) return 5;
 return 2;
}
function buildCompleteCatalog() {
 if (FULL_CATALOG_READY) return;
 let all = [];
 try { all = ItemTypes.getAll(); } catch (error) {
  console.warn("[SurvivalBazaar] ItemTypes.getAll konnte nicht gelesen werden:", error);
 }
 if (!Array.isArray(all) || all.length === 0) {
  console.warn("[SurvivalBazaar] Vanilla-Katalog konnte nicht aufgebaut werden; erneuter Versuch beim nächsten Start.");
  return;
 }

 // Die alten, fest eingetragenen Listen werden vollständig verworfen.
 // Die einzige Quelle für Vanilla-Artikel ist die aktuelle Bedrock-Laufzeit.
 SELL_CATEGORIES.length = 0;
 BUY_CATEGORIES.length = 0;
 const grouped = new Map();
 const seen = new Set();
 const technical = /^(air|cave_air|void_air|moving_block|piston_arm_collision|bubble_column|end_gateway|end_portal|nether_portal|fire|soul_fire|portal|redstone_wire|trip_wire|cocoa|carrots|potatoes|wheat_crop|pumpkin_stem|melon_stem|attached_.*|.*_wall_sign|.*_standing_sign|.*_double_slab|.*_bed$|command_block.*|structure_block|structure_void|jigsaw|barrier|debug_stick|allow|deny|border_block|element_.*|chemistry_.*|camera|portfolio|board|agent_.*|unknown|reserved6|info_update.*|client_request.*)$/;

 for (const type of all) {
  const id = type?.id;
  if (typeof id !== "string" || !id.startsWith("minecraft:") || seen.has(id)) continue;
  const raw = id.slice("minecraft:".length);
  if (technical.test(raw)) continue;
  // Nur Einträge, die Bedrock als echtes Inventar-Item anlegen kann.
  try { new ItemStack(id, 1); } catch { continue; }
  const rawItemId = id.replace(/^minecraft:/, "");
  // Spawn-Eier und Mobspawner sind ausschließlich über /admin verfügbar.
  if (rawItemId.endsWith("_spawn_egg") || rawItemId === "mob_spawner" || rawItemId === "spawner") continue;
  const category = catalogCategory(id);
  if (category === "Technische Gegenstände") continue;
  if (!grouped.has(category)) grouped.set(category, []);
  const sellPrice = catalogSellPrice(id);
  grouped.get(category).push([id, catalogLabel(id), sellPrice]);
  seen.add(id);
 }

 // Eigene Möbel bleiben neben dem vollständigen Vanilla-Katalog erhalten.
 for (const furniture of SHOP.filter(item => item.id.startsWith("survivalbazaar:"))) {
  try {
   new ItemStack(furniture.id, 1);
   if (!grouped.has("Möbel und Einrichtung")) grouped.set("Möbel und Einrichtung", []);
   if (!seen.has(furniture.id)) grouped.get("Möbel und Einrichtung").push([furniture.id, furniture.name, furniture.sell]);
   seen.add(furniture.id);
  } catch (error) {
   console.warn("[SurvivalBazaar] Möbel-Item nicht verfügbar:", furniture.id);
  }
 }

 const categoryNames = [...grouped.keys()].sort((a, b) => a.localeCompare(b, "de"));
 for (const categoryName of categoryNames) {
  const items = grouped.get(categoryName).sort((a, b) => a[1].localeCompare(b[1], "de"));
  const sellGroups = [];
  const buyGroups = [];
  for (let i = 0; i < items.length; i += 12) {
   const page = Math.floor(i / 12) + 1;
   const firstLetter = value => {
    const letter = String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z]/i)?.[0];
    return letter ? letter.toLocaleUpperCase("de-DE") : "#";
   };
   const first = firstLetter(items[i][1]);
   const last = firstLetter(items[Math.min(i + 11, items.length - 1)][1]);
   const label = items.length > 12 ? "Artikel " + first + (first === last ? "" : "–" + last) : "Alle Artikel";
   const sellItems = items.slice(i, i + 12);
   sellGroups.push({ name: label, items: sellItems });
   buyGroups.push({
    name: label,
    items: sellItems.map(([id, name, sellPrice]) => {
     const fixed = SHOP.find(item => item.id === id);
     return [id, name, fixed ? fixed.buy : Math.max(sellPrice + 1, sellPrice * 2)];
    })
   });
  }
  if (sellGroups.length) SELL_CATEGORIES.push({ name: categoryName, groups: sellGroups });
  if (buyGroups.length) BUY_CATEGORIES.push({ name: categoryName, groups: buyGroups });
 }

 FULL_CATALOG_READY = true;
 const count = [...grouped.values()].reduce((sum, items) => sum + items.length, 0);
 console.warn("[SurvivalBazaar] Vollständiger Laufzeit-Katalog aufgebaut: " + count + " Items aus " + all.length + " registrierten ItemTypes.");
}

function readJson(key, fallback) {
  try {
    const raw = world.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeJson(key, value) {
  const raw = JSON.stringify(value);
  if (raw.length > 30000) throw new Error("Der Bazaar-Speicher ist voll.");
  world.setDynamicProperty(key, raw);
}
function accounts() { return readJson(ACCOUNTS_KEY, {}); }
function listings() { return readJson(LISTINGS_KEY, []); }
function priceOverrides() { return readJson(PRICES_KEY, {}); }
function getPriceCents(itemId, side, fallbackEuro) {
  const saved = priceOverrides()[itemId + ":" + side];
  return Number.isInteger(saved) && saved >= 0 ? saved : fallbackEuro * 100;
}
function setPriceCents(itemId, side, cents) {
  const data = priceOverrides();
  data[itemId + ":" + side] = Math.max(0, Math.round(cents));
  writeJson(PRICES_KEY, data);
}
function balance(player) {
  const data = accounts();
  if (typeof data[player.id] !== "number") {
    data[player.id] = STARTING_BALANCE_CENTS;
    writeJson(ACCOUNTS_KEY, data);
  }
  return data[player.id];
}
function setBalance(id, amount) {
  const data = accounts();
  data[id] = Math.max(0, Math.round(amount));
  writeJson(ACCOUNTS_KEY, data);
}
function tell(player, message) {
  try { player.sendMessage("§6[Bazaar] §r" + message); } catch {}
}
function canFitItem(player, typeId, amount) {
  return canFitItems(player, [{ id: typeId, qty: amount }]);
}
// Prüft mehrere verschiedene Waren gemeinsam. So werden freie Inventarplätze
// nicht mehrfach für unterschiedliche Artikel eingeplant.
function canFitItems(player, entries) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv || !Array.isArray(entries)) return false;
  try {
    const freeSlots = [];
    const matchingSpace = new Map();
    for (let i = 0; i < inv.size; i++) {
      const slot = inv.getItem(i);
      if (!slot) freeSlots.push(null);
      else matchingSpace.set(slot.typeId, (matchingSpace.get(slot.typeId) ?? 0) + Math.max(0, slot.maxAmount - slot.amount));
    }
    for (const entry of entries) {
      if (!Number.isInteger(entry.qty) || entry.qty < 1) return false;
      const sample = new ItemStack(entry.id, 1);
      const maxStack = sample.maxAmount;
      let remaining = entry.qty;
      const matching = matchingSpace.get(entry.id) ?? 0;
      const usedMatching = Math.min(remaining, matching);
      remaining -= usedMatching;
      matchingSpace.set(entry.id, matching - usedMatching);
      while (remaining > 0) {
        const slotIndex = freeSlots.findIndex(slot => slot === null);
        if (slotIndex < 0) return false;
        freeSlots[slotIndex] = entry.id;
        remaining -= maxStack;
      }
    }
    return true;
  } catch {
    return false;
  }
}
function addItem(player, typeId, amount) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv || !canFitItem(player, typeId, amount)) return false;
  try {
    const sample = new ItemStack(typeId, 1);
    const maxStack = sample.maxAmount;
    let remaining = amount;
    while (remaining > 0) {
      const stackAmount = Math.min(maxStack, remaining);
      const leftover = inv.addItem(new ItemStack(typeId, stackAmount));
      if (leftover) return false;
      remaining -= stackAmount;
    }
    return true;
  } catch {
    return false;
  }
}
function countItem(player, typeId) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return 0;
  let count = 0;
  for (let i = 0; i < inv.size; i++) {
    const item = inv.getItem(i);
    if (item?.typeId === typeId) count += item.amount;
  }
  return count;
}
function removeItems(player, typeId, amount) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv || countItem(player, typeId) < amount) return false;
  let left = amount;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const item = inv.getItem(i);
    if (item?.typeId !== typeId) continue;
    const take = Math.min(left, item.amount);
    if (take === item.amount) inv.setItem(i, undefined);
    else { item.amount -= take; inv.setItem(i, item); }
    left -= take;
  }
  return left === 0;
}
async function openMain(player) {
  buildCompleteCatalog();
  const money = balance(player);
  const cart = getBuyCart(player);
  const form = new ActionFormData()
    .title("§l§6SURVIVAL BAZAAR")
    .body("§6DEIN MARKT\n§7Wähle einen Bereich. Guthaben und Warenkorb bleiben hier immer direkt erreichbar.\n\n§eGUTHABEN: §a" + formatMoney(money) + "\n§eWARENKORB: §f" + cart.size + " Artikel – " + formatMoney(cartTotal(cart)));
  form.button("§a§lKAUFEN\n§7Server-Sortiment und Kategorien");
  form.button("§c§lVERKAUFEN\n§7Gegenstände aus deinem Inventar");
  form.button("§b§lSPIELER-MARKT\n§7Angebote anderer Spieler");
  form.button("§d§lMIT PERSON TAUSCHEN\n§7Direkten Handel vorbereiten");
  form.button("§e§lGUTHABEN\n§6" + formatMoney(money));
  form.button("§6§lWARENKORB\n§7" + cart.size + " Artikel – " + formatMoney(cartTotal(cart)));
  form.button("§7Schließen");
  const res = await form.show(player);
  if (res.canceled || res.selection === 6) return;
  if (res.selection === 0) return openBuyShop(player);
  if (res.selection === 1) return openSellCategories(player);
  if (res.selection === 2) return openMarket(player);
  if (res.selection === 3) return openDirectTradeInfo(player);
  if (res.selection === 4) return openBalancePanel(player);
  if (res.selection === 5) return openBuyBasket(player, openMain);
}
async function openBalancePanel(player) {
  const money = balance(player);
  const form = new ActionFormData().title("§l§eGUTHABEN")
    .body("§7Dein persönliches Bazaar-Konto\n\n§eAktueller Kontostand:\n§6§l" + formatMoney(money))
    .button("§7Zurück zum Hauptmenü");
  await form.show(player);
  return openMain(player);
}
function directTrades() { return readJson(DIRECT_TRADES_KEY, []); }
function saveDirectTrades(value) { writeJson(DIRECT_TRADES_KEY, value); }

async function openDirectTradeInfo(player) {
  const all = directTrades().filter(t => t && t.id);
  const incoming = all.filter(t => t.buyerId === player.id);
  const outgoing = all.filter(t => t.sellerId === player.id);
  const form = new ActionFormData().title("§l§dDIREKTER SPIELERHANDEL")
    .body("§7Handel direkt mit einer Person aus dieser Welt. Beide Spieler müssen online sein.\n\n§eEingehende Angebote: §f" + incoming.length + "\n§eDeine offenen Angebote: §f" + outgoing.length);
  form.button("§aAngebot an Spieler erstellen");
  for (const trade of incoming.slice(0, 12)) {
    form.button("§eAngebot von " + trade.sellerName + "\n§f" + trade.amount + "× " + trade.itemName + " – §6" + formatMoney(trade.price));
  }
  for (const trade of outgoing.slice(0, 8)) {
    form.button("§cEigenes Angebot zurücknehmen\n§7" + trade.amount + "× " + trade.itemName + " an " + trade.buyerName);
  }
  form.button("§7Zurück zum Hauptmenü");
  const res = await form.show(player);
  if (res.canceled || res.selection === 1 + incoming.slice(0, 12).length + outgoing.slice(0, 8).length) return openMain(player);
  if (res.selection === 0) return createDirectTrade(player);
  if (res.selection >= 1 && res.selection <= incoming.slice(0, 12).length) {
    return reviewDirectTrade(player, incoming[res.selection - 1]);
  }
  const ownIndex = res.selection - 1 - incoming.slice(0, 12).length;
  const ownTrade = outgoing.slice(0, 8)[ownIndex];
  if (ownTrade) {
    saveDirectTrades(directTrades().filter(t => t.id !== ownTrade.id));
    tell(player, "Dein direktes Handelsangebot wurde zurückgenommen.");
  }
  return openDirectTradeInfo(player);
}

async function createDirectTrade(player) {
  const targets = world.getAllPlayers().filter(p => p.id !== player.id);
  if (!targets.length) {
    tell(player, "Außer dir ist gerade kein anderer Spieler online.");
    return openDirectTradeInfo(player);
  }
  const choose = new ActionFormData().title("§l§dHANDELSPARTNER")
    .body("§7Wähle den Spieler, dem du ein persönliches Angebot machen möchtest.");
  for (const target of targets) choose.button(target.name);
  choose.button("§7Abbrechen");
  const selected = await choose.show(player);
  if (selected.canceled || selected.selection === targets.length) return openDirectTradeInfo(player);
  const buyer = targets[selected.selection];
  if (!buyer) return openDirectTradeInfo(player);

  const inv = player.getComponent("minecraft:inventory")?.container;
  const held = inv?.getItem(player.selectedSlotIndex);
  if (!held) {
    tell(player, "Halte zuerst den Gegenstand in der Hand, den du anbieten möchtest.");
    return openDirectTradeInfo(player);
  }
  const modal = new ModalFormData().title("§l§dHANDELSANGEBOT")
    .textField("Anzahl (du besitzt " + countItem(player, held.typeId) + ")", "z. B. 4", { defaultValue: String(held.amount) })
    .textField("Preis in Coins (€), den " + buyer.name + " zahlen soll", "z. B. 12,50", { defaultValue: "10,00" });
  const data = await modal.show(player);
  if (data.canceled) return openDirectTradeInfo(player);
  const amount = Number(String(data.formValues?.[0] ?? "").trim());
  const price = parseMoneyToCents(data.formValues?.[1]);
  const owned = countItem(player, held.typeId);
  if (!Number.isInteger(amount) || amount < 1 || amount > owned || amount > 64 ||
      !Number.isSafeInteger(price) || price < 0 || price > 100000000) {
    tell(player, "Ungültige Menge oder ungültiger Preis. Erlaubt sind 1 bis 64 Items und 0 bis 1.000.000 €.");
    return openDirectTradeInfo(player);
  }
  const active = directTrades();
  if (active.some(t => t.sellerId === player.id && t.buyerId === buyer.id && t.itemId === held.typeId)) {
    tell(player, "Für diesen Spieler und Gegenstand hast du bereits ein offenes Angebot.");
    return openDirectTradeInfo(player);
  }
  const trade = {
    id: String(Date.now()) + "-" + player.id,
    sellerId: player.id, sellerName: player.name,
    buyerId: buyer.id, buyerName: buyer.name,
    itemId: held.typeId, itemName: held.nameTag || held.typeId.replace("minecraft:", "").replaceAll("_", " "),
    amount, price, createdAt: Date.now()
  };
  active.push(trade);
  try { saveDirectTrades(active); }
  catch (error) { tell(player, "Angebot konnte nicht gespeichert werden: " + (error?.message ?? String(error))); return openDirectTradeInfo(player); }
  tell(player, "Dein Angebot an " + buyer.name + " wurde gesendet.");
  tell(buyer, "Du hast ein persönliches Bazaar-Handelsangebot von " + player.name + " erhalten. Öffne /market → Mit Person tauschen.");
  return openDirectTradeInfo(player);
}

async function reviewDirectTrade(player, trade) {
  const seller = world.getAllPlayers().find(p => p.id === trade.sellerId);
  const form = new ActionFormData().title("§l§eHANDELSANGEBOT")
    .body("§7Angebot von §f" + trade.sellerName + "\n\n§eDu erhältst: §f" + trade.amount + "× " + trade.itemName +
      "\n§eDu bezahlst: §6" + formatMoney(trade.price) +
      "\n\n§7Anbieter gerade online: " + (seller ? "§aJa" : "§cNein") +
      "\n§7Dein Guthaben: §6" + formatMoney(balance(player)));
  form.button("§aAnnehmen");
  form.button("§cAblehnen");
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return openDirectTradeInfo(player);
  if (res.selection === 1) {
    saveDirectTrades(directTrades().filter(t => t.id !== trade.id));
    if (seller) tell(seller, player.name + " hat dein Handelsangebot abgelehnt.");
    tell(player, "Handelsangebot abgelehnt.");
    return openDirectTradeInfo(player);
  }
  if (!seller) {
    tell(player, "Der Anbieter muss online sein, damit der Handel sicher abgeschlossen werden kann.");
    return openDirectTradeInfo(player);
  }
  const current = directTrades();
  const liveTrade = current.find(t => t.id === trade.id && t.buyerId === player.id);
  if (!liveTrade) {
    tell(player, "Dieses Angebot ist nicht mehr verfügbar.");
    return openDirectTradeInfo(player);
  }
  if (balance(player) < liveTrade.price) {
    tell(player, "Du hast nicht genug Coins für dieses Angebot.");
    return openDirectTradeInfo(player);
  }
  if (countItem(seller, liveTrade.itemId) < liveTrade.amount) {
    tell(player, "Der Anbieter besitzt die angebotene Menge nicht mehr. Das Angebot wurde entfernt.");
    saveDirectTrades(current.filter(t => t.id !== liveTrade.id));
    return openDirectTradeInfo(player);
  }
  if (!canFitItem(player, liveTrade.itemId, liveTrade.amount)) {
    tell(player, "Dein Inventar hat nicht genug Platz.");
    return openDirectTradeInfo(player);
  }
  if (!removeItems(seller, liveTrade.itemId, liveTrade.amount)) {
    tell(player, "Die Ware konnte beim Anbieter nicht entnommen werden.");
    return openDirectTradeInfo(player);
  }
  if (!addItem(player, liveTrade.itemId, liveTrade.amount)) {
    addItem(seller, liveTrade.itemId, liveTrade.amount);
    tell(player, "Die Ware konnte nicht übertragen werden. Es wurde nichts berechnet.");
    return openDirectTradeInfo(player);
  }
  const buyerBalanceBefore = balance(player);
  const sellerBalanceBefore = balance(seller);
  try {
    setBalance(player.id, buyerBalanceBefore - liveTrade.price);
    setBalance(seller.id, sellerBalanceBefore + liveTrade.price);
    saveDirectTrades(current.filter(t => t.id !== liveTrade.id));
  } catch (error) {
    // Rollback: Ware und Kontostände werden wiederhergestellt, wenn das
    // Speichern des abgeschlossenen Handels fehlschlägt.
    removeItems(player, liveTrade.itemId, liveTrade.amount);
    addItem(seller, liveTrade.itemId, liveTrade.amount);
    try {
      setBalance(player.id, buyerBalanceBefore);
      setBalance(seller.id, sellerBalanceBefore);
    } catch {}
    tell(player, "Handel konnte nicht sicher gespeichert werden. Ware und Guthaben wurden zurückgesetzt.");
    tell(seller, "Handel konnte nicht sicher gespeichert werden. Ware und Guthaben wurden zurückgesetzt.");
    return openDirectTradeInfo(player);
  }
  tell(player, "Handel abgeschlossen: " + liveTrade.amount + "× " + liveTrade.itemName + " erhalten für " + formatMoney(liveTrade.price) + ".");
  tell(seller, player.name + " hat dein Angebot angenommen. Du hast " + formatMoney(liveTrade.price) + " erhalten.");
  return openDirectTradeInfo(player);
}
async function openShop(player) {
  const form = new ActionFormData().title("§l§aSERVER-SHOP")
    .body("§7Wähle, ob du Items kaufen oder verkaufen möchtest.")
    .button("§aItems kaufen\n§7Server-Sortiment")
    .button("§cItems verkaufen\n§7Nach Kategorien sortiert")
    .button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return openMain(player);
  if (res.selection === 0) return openBuyShop(player);
  return openSellCategories(player);
}

const BUY_CARTS = new Map();
function getBuyCart(player) {
  if (!BUY_CARTS.has(player.id)) BUY_CARTS.set(player.id, new Map());
  return BUY_CARTS.get(player.id);
}
function cartTotal(cart) {
  let total = 0;
  for (const item of cart.values()) total += getPriceCents(item.id, "buy", item.basePrice) * item.qty;
  return total;
}
async function addToBuyCart(player, entry, qty, returnTo) {
  const [id, name, basePrice] = entry;
  if (!Number.isInteger(qty) || qty < 1 || qty > 64) {
    tell(player, "Bitte eine Anzahl von 1 bis 64 eingeben.");
    return returnTo();
  }
  const cart = getBuyCart(player);
  const current = cart.get(id)?.qty ?? 0;
  if (current + qty > 64) {
    tell(player, "Pro Gegenstand sind höchstens 64 Stück im Warenkorb erlaubt.");
    return returnTo();
  }
  cart.set(id, { id, name, basePrice, qty: current + qty });
  tell(player, qty + "× " + name + " zum Warenkorb hinzugefügt.");
  return openBuyBasket(player, returnTo);
}
async function chooseBuyQuantity(player, entry, returnTo) {
  const [id, name] = entry;
  const modal = new ModalFormData().title("§l§a" + name)
    .textField("Anzahl zum Warenkorb hinzufügen (1–64)", "z. B. 4", { defaultValue: "1" });
  const res = await modal.show(player);
  if (res.canceled) return returnTo();
  const qty = Number(String(res.formValues?.[0] ?? "").trim());
  return addToBuyCart(player, entry, qty, returnTo);
}
async function openBuyBasket(player, returnTo = openBuyShop) {
  const cart = getBuyCart(player);
  const entries = [...cart.values()];
  const form = new ActionFormData().title("§l§6WARENKORB")
    .body(entries.length
      ? "§7Dein Warenkorb:\n" + entries.map((item, i) => "§f" + (i + 1) + ". " + item.qty + "× " + item.name + " – " + formatMoney(getPriceCents(item.id, "buy", item.basePrice) * item.qty)).join("\n") + "\n\n§7Gesamt: §6" + formatMoney(cartTotal(cart))
      : "§7Dein Warenkorb ist leer.");
  for (const item of entries) form.button("§e" + item.name + "\n§7" + item.qty + " Stück – ändern / entfernen");
  form.button("§aJetzt kaufen");
  form.button("§cWarenkorb abbrechen/leeren");
  form.button("§7Weiter einkaufen");
  const res = await form.show(player);
  if (res.canceled) return returnTo(player);
  if (res.selection < entries.length) {
    const item = entries[res.selection];
    const modal = new ModalFormData().title("§l§e" + item.name)
      .textField("Neue Menge (0 = entfernen, maximal 64)", "Anzahl", { defaultValue: String(item.qty) });
    const edit = await modal.show(player);
    if (edit.canceled) return openBuyBasket(player, returnTo);
    const qty = Number(String(edit.formValues?.[0] ?? "").trim());
    if (!Number.isInteger(qty) || qty < 0 || qty > 64) {
      tell(player, "Ungültige Menge. Erlaubt sind 0 bis 64.");
      return openBuyBasket(player, returnTo);
    }
    if (qty === 0) cart.delete(item.id);
    else item.qty = qty;
    return openBuyBasket(player, returnTo);
  }
  if (res.selection === entries.length) return checkoutBuyBasket(player, returnTo);
  if (res.selection === entries.length + 1) {
    cart.clear();
    tell(player, "Warenkorb wurde geleert.");
    return returnTo(player);
  }
  return returnTo(player);
}
async function checkoutBuyBasket(player, returnTo) {
  const cart = getBuyCart(player);
  const entries = [...cart.values()];
  if (!entries.length) { tell(player, "Dein Warenkorb ist leer."); return openBuyBasket(player, returnTo); }
  const total = cartTotal(cart);
  if (balance(player) < total) {
    tell(player, "Nicht genug Euro. Warenkorb-Gesamtpreis: " + formatMoney(total) + ".");
    return openBuyBasket(player, returnTo);
  }
  if (!canFitItems(player, entries)) {
    tell(player, "Nicht genug gemeinsamer Inventarplatz für deinen gesamten Warenkorb. Bitte ändere die Mengen.");
    return openBuyBasket(player, returnTo);
  }
  const added = [];
  try {
    for (const item of entries) {
      if (!addItem(player, item.id, item.qty)) throw new Error(item.name + " konnte nicht hinzugefügt werden.");
      added.push(item);
    }
    setBalance(player.id, balance(player) - total);
  } catch (error) {
    for (const item of added.reverse()) removeItems(player, item.id, item.qty);
    tell(player, "Kauf abgebrochen. Alle bereits hinzugefügten Waren wurden zurückgesetzt: " + (error?.message ?? String(error)));
    return openBuyBasket(player, returnTo);
  }
  cart.clear();
  tell(player, "Einkauf abgeschlossen: " + entries.length + " verschiedene Items für " + formatMoney(total) + ".");
  return returnTo(player);
}

async function openBuyShop(player) {
  buildCompleteCatalog();
  const cart = getBuyCart(player);
  const form = new ActionFormData().title("§l§aITEMS KAUFEN")
    .body("§7Wähle eine Kategorie oder suche direkt im gesamten Katalog.\n§7Warenkorb: §e" + cart.size + " verschiedene Items – " + formatMoney(cartTotal(cart)))
    .button("§b🔎 Gegenstände suchen\n§7Alle Kaufartikel durchsuchen")
    .button("§6🛒 Warenkorb öffnen");
  for (const category of BUY_CATEGORIES) form.button("§e" + category.name);
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === BUY_CATEGORIES.length + 2) return openShop(player);
  if (res.selection === 0) return openBuySearch(player);
  if (res.selection === 1) return openBuyBasket(player, openBuyShop);
  const category = BUY_CATEGORIES[res.selection - 2];
  if (category) return openBuyGroups(player, category);
  return openBuyShop(player);
}

function allBuyEntries() {
  const entries = [];
  const seen = new Set();
  for (const category of BUY_CATEGORIES) {
    for (const group of category.groups) {
      for (const [id, name, basePrice] of group.items) {
        if (seen.has(id)) continue;
        seen.add(id);
        entries.push({ id, name, basePrice, category: category.name, group: group.name });
      }
    }
  }
  return entries;
}

async function openBuySearch(player) {
  buildCompleteCatalog();
  const modal = new ModalFormData().title("§l§bGEGENSTÄNDE SUCHEN")
    .textField("Suchbegriff (Name oder ID)", "z. B. Diamant, Eiche, minecraft:stone", { defaultValue: "" });
  const res = await modal.show(player);
  if (res.canceled) return openBuyShop(player);
  const query = String(res.formValues?.[0] ?? "").trim().toLocaleLowerCase("de-DE");
  if (!query) { tell(player, "Bitte gib einen Suchbegriff ein."); return openBuySearch(player); }
  return showBuySearchResults(player, query, 0);
}

const WOOD_FAMILIES = ["oak","spruce","birch","jungle","acacia","dark_oak","mangrove","cherry","bamboo","crimson","warped","pale_oak"];
function isWoodRelatedCatalogItem(item) {
  const raw = item.id.replace(/^minecraft:/, "");
  if (WOOD_FAMILIES.some(type =>
    raw.startsWith(type + "_") ||
    raw.startsWith("stripped_" + type + "_") ||
    raw.includes("_" + type + "_")
  )) return true;
  return /^(wooden_|stick$|bowl$|chest$|trapped_chest$|crafting_table$|barrel$|bookshelf$|lectern$|jukebox$|note_block$|ladder$|scaffolding$|composter$|cartography_table$|fletching_table$|smithing_table$|loom$|campfire$|soul_campfire$|chest_boat$)/.test(raw);
}
function normalizeSearchText(value) {
  return String(value ?? "").toLocaleLowerCase("de-DE").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
async function showBuySearchResults(player, query, page) {
  const normalizedQuery = normalizeSearchText(query);
  const woodQuery = ["holz", "wood", "wooden", "bretter", "planks", "holzblock", "holzblöcke"].some(term => normalizedQuery.includes(normalizeSearchText(term)));
  const matches = allBuyEntries().filter(item =>
    normalizeSearchText(item.name).includes(normalizedQuery) ||
    normalizeSearchText(item.id).includes(normalizedQuery) ||
    normalizeSearchText(item.category).includes(normalizedQuery) ||
    normalizeSearchText(item.group).includes(normalizedQuery) ||
    (woodQuery && isWoodRelatedCatalogItem(item))
  );
  if (!matches.length) {
    tell(player, "Keine Gegenstände für „" + query + "“ gefunden.");
    return openBuySearch(player);
  }
  const pageSize = 30;
  const start = page * pageSize;
  const shown = matches.slice(start, start + pageSize);
  const form = new ActionFormData().title("§l§bSUCHERGEBNISSE")
    .body("§7Suchbegriff: §f" + query + "\n§7Treffer: §f" + matches.length + " §8| §7Seite " + (page + 1) + "/" + Math.ceil(matches.length / pageSize) + "\n§7Warenkorb: §e" + getBuyCart(player).size + " Items – " + formatMoney(cartTotal(getBuyCart(player))));
  for (const item of shown) {
    form.button(item.name + "\n§a" + formatMoney(getPriceCents(item.id, "buy", item.basePrice)) + " §8| §7" + item.category, itemIconPath(item.id));
  }
  if (start + pageSize < matches.length) form.button("§eWeitere Ergebnisse");
  form.button("§6🛒 Warenkorb öffnen");
  form.button("§bNeue Suche");
  form.button("§7Zurück zu Kategorien");
  const res = await form.show(player);
  if (res.canceled) return openBuyShop(player);
  if (res.selection < shown.length) {
    const item = shown[res.selection];
    return purchaseBuyEntry(player, [item.id, item.name, item.basePrice], () => showBuySearchResults(player, query, page));
  }
  let action = res.selection - shown.length;
  if (start + pageSize < matches.length) {
    if (action === 0) return showBuySearchResults(player, query, page + 1);
    action--;
  }
  if (action === 0) return openBuyBasket(player, () => showBuySearchResults(player, query, page));
  if (action === 1) return openBuySearch(player);
  return openBuyShop(player);
}

async function openBuyGroups(player, category) {
  const cart = getBuyCart(player);
  const form = new ActionFormData().title("§l§e" + category.name.toUpperCase())
    .body("§7Wähle einen Unterbereich.\n§7Warenkorb: §e" + cart.size + " Items – " + formatMoney(cartTotal(cart)));
  for (const group of category.groups) form.button(group.name);
  form.button("§6🛒 Warenkorb öffnen");
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === category.groups.length + 1) return openBuyShop(player);
  if (res.selection === category.groups.length) return openBuyBasket(player, () => openBuyGroups(player, category));
  const group = category.groups[res.selection];
  if (group) return openBuyItems(player, category, group);
  return openBuyGroups(player, category);
}

async function openBuyItems(player, category, group) {
  const cart = getBuyCart(player);
  const form = new ActionFormData().title("§l§a" + group.name.toUpperCase())
    .body("§7Wähle einen Gegenstand, um eine Menge hinzuzufügen.\n§7Warenkorb: §e" + cart.size + " Items – " + formatMoney(cartTotal(cart)));
  for (const [id, name, basePrice] of group.items) {
    const inCart = cart.get(id)?.qty ?? 0;
    form.button(name + "\n§a" + formatMoney(getPriceCents(id, "buy", basePrice)) + " / Stück" + (inCart ? " §e| Im Korb: " + inCart : ""), itemIconPath(id));
  }
  form.button("§6🛒 Warenkorb öffnen");
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === group.items.length + 1) return openBuyGroups(player, category);
  if (res.selection === group.items.length) return openBuyBasket(player, () => openBuyItems(player, category, group));
  const entry = group.items[res.selection];
  if (entry) return chooseBuyQuantity(player, entry, () => openBuyItems(player, category, group));
  return openBuyItems(player, category, group);
}

async function purchaseBuyEntry(player, entry, returnTo) {
  return chooseBuyQuantity(player, entry, returnTo);
}

async function openSellCategories(player) {
  buildCompleteCatalog();
  const form = new ActionFormData().title("§l§cITEMS VERKAUFEN")
    .body("§7Wähle eine Kategorie oder suche direkt im gesamten Verkaufskatalog.")
    .button("§b🔎 Gegenstände suchen\n§7Alle Verkaufsartikel durchsuchen");
  for (const category of SELL_CATEGORIES) form.button("§e" + category.name);
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === SELL_CATEGORIES.length + 1) return openShop(player);
  if (res.selection === 0) return openSellSearch(player);
  const category = SELL_CATEGORIES[res.selection - 1];
  if (category) return openSellSubcategories(player, category);
  return openSellCategories(player);
}

function allSellEntries() {
  const entries = [];
  const seen = new Set();
  for (const category of SELL_CATEGORIES) {
    for (const group of category.groups) {
      for (const [id, name, basePrice] of group.items) {
        if (seen.has(id)) continue;
        seen.add(id);
        entries.push({ id, name, basePrice, category: category.name, group: group.name });
      }
    }
  }
  return entries;
}
async function openSellSearch(player) {
  buildCompleteCatalog();
  const modal = new ModalFormData().title("§l§bGEGENSTÄNDE SUCHEN")
    .textField("Suchbegriff (Name oder ID)", "z. B. Diamant, Eiche, minecraft:stone", { defaultValue: "" });
  const res = await modal.show(player);
  if (res.canceled) return openSellCategories(player);
  const query = String(res.formValues?.[0] ?? "").trim().toLocaleLowerCase("de-DE");
  if (!query) { tell(player, "Bitte gib einen Suchbegriff ein."); return openSellSearch(player); }
  return showSellSearchResults(player, query, 0);
}
async function showSellSearchResults(player, query, page) {
  const normalizedQuery = normalizeSearchText(query);
  const woodQuery = ["holz", "wood", "wooden", "bretter", "planks", "holzblock", "holzblöcke"].some(term => normalizedQuery.includes(normalizeSearchText(term)));
  const matches = allSellEntries().filter(item =>
    normalizeSearchText(item.name).includes(normalizedQuery) ||
    normalizeSearchText(item.id).includes(normalizedQuery) ||
    normalizeSearchText(item.category).includes(normalizedQuery) ||
    normalizeSearchText(item.group).includes(normalizedQuery) ||
    (woodQuery && isWoodRelatedCatalogItem(item))
  );
  if (!matches.length) {
    tell(player, "Keine Gegenstände für „" + query + "“ gefunden.");
    return openSellSearch(player);
  }
  const pageSize = 30;
  const start = page * pageSize;
  const shown = matches.slice(start, start + pageSize);
  const form = new ActionFormData().title("§l§cSUCHERGEBNISSE")
    .body("§7Suchbegriff: §f" + query + "\n§7Treffer: §f" + matches.length + " §8| §7Seite " + (page + 1) + "/" + Math.ceil(matches.length / pageSize));
  for (const item of shown) {
    const owned = countItem(player, item.id);
    form.button(item.name + "\n§c" + formatMoney(getPriceCents(item.id, "sell", item.basePrice)) + " / Stück §8| §7Besitz: " + owned, itemIconPath(item.id));
  }
  if (start + pageSize < matches.length) form.button("§eWeitere Ergebnisse");
  form.button("§bNeue Suche");
  form.button("§7Zurück zu Kategorien");
  const res = await form.show(player);
  if (res.canceled) return openSellCategories(player);
  if (res.selection < shown.length) {
    const item = shown[res.selection];
    return sellCatalogEntry(player, item, () => showSellSearchResults(player, query, page));
  }
  let action = res.selection - shown.length;
  if (start + pageSize < matches.length) {
    if (action === 0) return showSellSearchResults(player, query, page + 1);
    action--;
  }
  if (action === 0) return openSellSearch(player);
  return openSellCategories(player);
}
async function openSellSubcategories(player, category) {
  const form = new ActionFormData().title("§l§e" + category.name.toUpperCase()).body("§7Wähle einen Unterbereich.");
  for (const group of category.groups) form.button(group.name);
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === category.groups.length) return openSellCategories(player);
  const group = category.groups[res.selection];
  if (group) return openSellItems(player, category, group);
  return openSellSubcategories(player, category);
}

async function sellCatalogEntry(player, item, returnTo) {
  const { id, name, basePrice } = item;
  const owned = countItem(player, id);
  if (owned < 1) {
    tell(player, "Du besitzt keinen Gegenstand: " + name + ".");
    return returnTo();
  }
  const modal = new ModalFormData().title("§l§c" + name)
    .textField("Verkaufsmenge (Besitz: " + owned + ") – " + formatMoney(getPriceCents(id, "sell", basePrice)) + " pro Stück", "Anzahl", { defaultValue: String(owned) });
  const amountResult = await modal.show(player);
  if (amountResult.canceled) return returnTo();
  const raw = String(amountResult.formValues?.[0] ?? "0").trim();
  const qty = raw === "" ? 0 : Number(raw);
  if (!Number.isInteger(qty) || qty < 1 || qty > owned) {
    tell(player, "Ungültige Verkaufsmenge. Du besitzt " + owned + " " + name + ".");
    return returnTo();
  }
  if (countItem(player, id) < qty || !removeItems(player, id, qty)) {
    tell(player, "Nicht genügend " + name + " im Inventar.");
    return returnTo();
  }
  const total = getPriceCents(id, "sell", basePrice) * qty;
  setBalance(player.id, balance(player) + total);
  tell(player, "Verkauf abgeschlossen: " + qty + "× " + name + " für " + formatMoney(total) + ".");
  return returnTo();
}
async function openSellItems(player, category, group) {
  const form = new ActionFormData().title("§l§c" + group.name.toUpperCase())
    .body("§7Wähle einen Gegenstand zum Verkaufen.");
  for (const [id, name, basePrice] of group.items) {
    const owned = countItem(player, id);
    form.button(name + "\n§c" + formatMoney(getPriceCents(id, "sell", basePrice)) + " / Stück §8| §7Besitz: " + owned, itemIconPath(id));
  }
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === group.items.length) return openSellSubcategories(player, category);
  const entry = group.items[res.selection];
  if (!entry) return openSellItems(player, category, group);
  const [id, name, basePrice] = entry;
  return sellCatalogEntry(player, { id, name, basePrice }, () => openSellItems(player, category, group));
}
async function openAdminMenu(player) {
  const form = new ActionFormData().title("§l§cBAZAAR-ADMIN")
    .body("§7Spawn-Eier und Mobspawner sind nur hier verfügbar. Preise werden dauerhaft gespeichert.")
    .button("§aAdmin: Kaufen\n§7Spawn-Eier und Mobspawner")
    .button("§cAdmin: Verkaufen\n§7Spawn-Eier und Mobspawner")
    .button("§aKaufpreise bearbeiten\n§7Server-Shop")
    .button("§eVerkaufspreise bearbeiten\n§7Verkaufskatalog")
    .button("§7Schließen");
  const res = await form.show(player);
  if (res.canceled || res.selection === 4) return;
  if (res.selection === 0) return openAdminSpecialItems(player, "buy");
  if (res.selection === 1) return openAdminSpecialItems(player, "sell");
  if (res.selection === 2) return openAdminBuyPrices(player);
  if (res.selection === 3) return openAdminSellCategories(player);
}

function getAdminSpecialItems() {
  const result = [];
  let all = [];
  try { all = ItemTypes.getAll(); } catch {}
  const seen = new Set();
  for (const type of all) {
    const id = type?.id;
    if (typeof id !== "string" || !id.startsWith("minecraft:")) continue;
    const raw = id.slice("minecraft:".length);
    if (!raw.endsWith("_spawn_egg") && raw !== "mob_spawner" && raw !== "spawner") continue;
    if (seen.has(id)) continue;
    try { new ItemStack(id, 1); } catch { continue; }
    seen.add(id);
    const name = raw === "mob_spawner" || raw === "spawner" ? "Mobspawner" : catalogLabel(id);
    const basePrice = raw === "mob_spawner" || raw === "spawner" ? 5000 : 250;
    result.push([id, name, basePrice]);
  }
  return result.sort((a,b) => a[1].localeCompare(b[1], "de"));
}

async function openAdminSpecialItems(player, side) {
  const items = getAdminSpecialItems();
  if (!items.length) {
    tell(player, "Spawn-Eier oder Mobspawner wurden von dieser Bedrock-Version nicht als verfügbare Items gemeldet.");
    return openAdminMenu(player);
  }
  const title = side === "buy" ? "§l§aADMIN-KAUF" : "§l§cADMIN-VERKAUF";
  const form = new ActionFormData().title(title)
    .body("§7Nur über die Admin-Verwaltung verfügbar. §8(" + items.length + " Artikel)");
  for (const [id, name, basePrice] of items) {
    const price = getPriceCents(id, side, basePrice);
    const suffix = side === "buy" ? "" : " §8| §7Besitz: " + countItem(player, id);
    form.button(name + "\n" + (side === "buy" ? "§a" : "§c") + formatMoney(price) + " / Stück" + suffix, itemIconPath(id));
  }
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === items.length) return openAdminMenu(player);
  const [id, name, basePrice] = items[res.selection] ?? [];
  if (!id) return openAdminSpecialItems(player, side);
  if (side === "buy") return chooseBuyQuantity(player, [id, name, basePrice], () => openAdminSpecialItems(player, side));
  return sellCatalogEntry(player, { id, name, basePrice }, () => openAdminSpecialItems(player, side));
}

async function editPrice(player, itemId, itemName, side, currentCents, returnTo) {
  try {
    while (true) {
      const modal = new ModalFormData().title("Preis bearbeiten")
        .textField(
          itemName + " – " + (side === "buy" ? "Kaufpreis" : "Verkaufspreis") + " in Euro (€)",
          "z. B. 12,50",
          { defaultValue: formatMoney(currentCents) }
        );
      const res = await modal.show(player);
      if (res.canceled) return await returnTo();

      const rawValue = res.formValues?.[0];
      const cents = parseMoneyToCents(rawValue);
      if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000) {
        tell(player, "Ungültiger Preis. Bitte z. B. 12,50 eingeben (0 bis 1.000.000 €).");
        continue;
      }

      setPriceCents(itemId, side, cents);
      tell(player, (side === "buy" ? "Kaufpreis" : "Verkaufspreis") + " für " + itemName + " auf " + formatMoney(cents) + " gesetzt.");
      return await returnTo();
    }
  } catch (error) {
    tell(player, "Preis konnte nicht gespeichert werden: " + (error?.message ?? String(error)));
    try { return await returnTo(); } catch {}
  }
}

async function openAdminBuyPrices(player) {
  buildCompleteCatalog();
  const form = new ActionFormData().title("§l§aKAUFPREISE").body("§7Wähle eine Hauptkategorie.");
  for (const category of BUY_CATEGORIES) form.button(category.name);
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === BUY_CATEGORIES.length) return openAdminMenu(player);
  const category = BUY_CATEGORIES[res.selection];
  if (category) return openAdminBuyGroups(player, category);
  return openAdminBuyPrices(player);
}

async function openAdminBuyGroups(player, category) {
  const form = new ActionFormData().title("§l§e" + category.name.toUpperCase()).body("§7Wähle einen Unterbereich.");
  for (const group of category.groups) form.button(group.name);
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === category.groups.length) return openAdminBuyPrices(player);
  const group = category.groups[res.selection];
  if (group) return openAdminBuyItems(player, category, group);
  return openAdminBuyGroups(player, category);
}

async function openAdminBuyItems(player, category, group) {
  const form = new ActionFormData().title("§l§a" + group.name.toUpperCase()).body("§7Wähle einen Gegenstand.");
  for (const [id, name, basePrice] of group.items) {
    form.button(name + "\n§a" + formatMoney(getPriceCents(id, "buy", basePrice)), itemIconPath(id));
  }
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === group.items.length) return openAdminBuyGroups(player, category);
  const entry = group.items[res.selection];
  if (!entry) return openAdminBuyItems(player, category, group);
  const [id, name, basePrice] = entry;
  return editPrice(player, id, name, "buy", getPriceCents(id, "buy", basePrice), () => openAdminBuyItems(player, category, group));
}

async function openAdminSellCategories(player) {
  buildCompleteCatalog();
  const form = new ActionFormData().title("§l§eVERKAUFSPREISE").body("§7Wähle eine Hauptkategorie.");
  for (const category of SELL_CATEGORIES) form.button(category.name);
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === SELL_CATEGORIES.length) return openAdminMenu(player);
  const category = SELL_CATEGORIES[res.selection];
  if (category) return openAdminSellGroups(player, category);
  return openAdminSellCategories(player);
}

async function openAdminSellGroups(player, category) {
  const form = new ActionFormData().title("§l§e" + category.name.toUpperCase()).body("§7Wähle einen Unterbereich.");
  for (const group of category.groups) form.button(group.name);
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === category.groups.length) return openAdminSellCategories(player);
  const group = category.groups[res.selection];
  if (group) return openAdminSellItems(player, category, group);
  return openAdminSellGroups(player, category);
}

async function openAdminSellItems(player, category, group) {
  const form = new ActionFormData().title("§l§c" + group.name.toUpperCase())
    .body("§7Wähle den Gegenstand, dessen Verkaufspreis du ändern möchtest.");
  for (const [id, name, basePrice] of group.items) form.button(name + "\n§c" + formatMoney(getPriceCents(id, "sell", basePrice)), itemIconPath(id));
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === group.items.length) return openAdminSellGroups(player, category);
  const entry = group.items[res.selection];
  if (!entry) return openAdminSellItems(player, category, group);
  const [id, name, basePrice] = entry;
  return editPrice(player, id, name, "sell", getPriceCents(id, "sell", basePrice), () => openAdminSellItems(player, category, group));
}

async function openMarket(player) {
  const allOffers = listings().filter(x => x && x.id);
  const offers = allOffers.filter(x => x.sellerId !== player.id && !isAdminOnlyItem(x.itemId));
  const ownCount = allOffers.filter(x => x.sellerId === player.id).length;
  const form = new ActionFormData().title("§l§bSPIELER-MARKTPLATZ")
    .body("§7Angebote anderer Spieler. Dein Guthaben: §6" + formatMoney(balance(player)));
  for (const offer of offers.slice(0, 23)) {
    const hasDiscount = Number(offer.discountThreshold) > 0 && Number(offer.discountPercent) > 0;
    const discountLine = hasDiscount ? "\n§a" + offer.discountPercent + "% Rabatt ab " + offer.discountThreshold + " Stück" : "";
    form.button(offer.itemName + " ×" + offer.amount + "\n§6" + formatMoney(offer.price) + " §8| §7von " + offer.sellerName + discountLine, itemIconPath(offer.itemId));
  }
  form.button("§aEigenes Item anbieten");
  form.button("§eMeine Angebote (" + ownCount + ")");
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection < Math.min(offers.length, 23)) {
    const offer = offers[res.selection];
    if (!offer) return openMarket(player);
    const discountApplies = Number(offer.discountThreshold) > 0 &&
      Number(offer.discountPercent) > 0 && offer.amount >= offer.discountThreshold;
    const discountPercent = discountApplies ? Math.min(90, Math.max(0, Number(offer.discountPercent))) : 0;
    const finalPrice = Math.max(1, Math.round(offer.price * (100 - discountPercent) / 100));
    const discountText = discountPercent ? "\n§aMengenrabatt: " + discountPercent + "% (du sparst " + formatMoney(offer.price - finalPrice) + ")" : "";
    const confirm = new MessageFormData().title("Angebot kaufen")
      .body(offer.amount + "× " + offer.itemName + " von " + offer.sellerName + " für " + formatMoney(finalPrice) + " kaufen?" + discountText)
      .button1("Kaufen").button2("Abbrechen");
    const c = await confirm.show(player);
    if (c.canceled || c.selection !== 0) return openMarket(player);
    const current = listings();
    const idx = current.findIndex(x => x.id === offer.id);
    if (idx < 0) { tell(player, "Dieses Angebot ist nicht mehr verfügbar."); return openMarket(player); }
    if (balance(player) < finalPrice) { tell(player, "Du hast nicht genug Guthaben."); return openMarket(player); }
    if (!canFitItem(player, offer.itemId, offer.amount)) { tell(player, "Dein Inventar ist voll."); return openMarket(player); }
    const buyerBalanceBefore = balance(player);
    const sellerBalanceBefore = accounts()[offer.sellerId] ?? 0;
    if (!addItem(player, offer.itemId, offer.amount)) { tell(player, "Dein Inventar ist voll."); return openMarket(player); }
    current.splice(idx, 1);
    try {
      setBalance(player.id, buyerBalanceBefore - finalPrice);
      setBalance(offer.sellerId, sellerBalanceBefore + finalPrice);
      writeJson(LISTINGS_KEY, current);
    } catch (error) {
      removeItems(player, offer.itemId, offer.amount);
      try {
        setBalance(player.id, buyerBalanceBefore);
        setBalance(offer.sellerId, sellerBalanceBefore);
        writeJson(LISTINGS_KEY, listings());
      } catch {}
      tell(player, "Kauf konnte nicht sicher gespeichert werden. Ware und Guthaben wurden zurückgesetzt.");
      return openMarket(player);
    }
    tell(player, "Angebot gekauft. " + formatMoney(finalPrice) + " wurden überwiesen.");
    return openMarket(player);
  }
  if (res.selection === Math.min(offers.length, 23)) return createListing(player);
  if (res.selection === Math.min(offers.length, 23) + 1) return openMyListings(player);
  return openMain(player);
}
async function openMyListings(player) {
  const own = listings().filter(x => x && x.id && x.sellerId === player.id);
  const form = new ActionFormData().title("§l§eMEINE ANGEBOTE")
    .body(own.length ? "§7Wähle ein Angebot aus, das du zurücknehmen möchtest. Die Ware wird dir zurückgegeben." : "§7Du hast momentan keine aktiven Angebote.");
  for (const offer of own.slice(0, 25)) {
    const hasDiscount = Number(offer.discountThreshold) > 0 && Number(offer.discountPercent) > 0;
    const discountLine = hasDiscount ? "\n§a" + offer.discountPercent + "% Rabatt ab " + offer.discountThreshold + " Stück" : "";
    form.button(offer.itemName + " ×" + offer.amount + "\n§6" + formatMoney(offer.price) + discountLine, itemIconPath(offer.itemId));
  }
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === own.slice(0, 25).length) return openMarket(player);
  const offer = own[res.selection];
  if (!offer) return openMyListings(player);
  const confirm = new MessageFormData().title("Angebot zurücknehmen")
    .body(offer.amount + "× " + offer.itemName + " zurücknehmen und ins Inventar legen?")
    .button1("Zurücknehmen").button2("Abbrechen");
  const c = await confirm.show(player);
  if (c.canceled || c.selection !== 0) return openMyListings(player);
  const current = listings();
  const idx = current.findIndex(x => x.id === offer.id && x.sellerId === player.id);
  if (idx < 0) { tell(player, "Dieses Angebot ist nicht mehr verfügbar."); return openMyListings(player); }
  if (!canFitItem(player, offer.itemId, offer.amount)) {
    tell(player, "Dein Inventar hat nicht genug Platz. Räume zuerst etwas frei.");
    return openMyListings(player);
  }
  current.splice(idx, 1);
  try {
    writeJson(LISTINGS_KEY, current);
    if (!addItem(player, offer.itemId, offer.amount)) {
      const restored = listings();
      restored.push(offer);
      writeJson(LISTINGS_KEY, restored);
      tell(player, "Die Ware konnte nicht zurückgegeben werden. Das Angebot wurde wiederhergestellt.");
      return openMyListings(player);
    }
  } catch {
    tell(player, "Das Angebot konnte nicht zurückgenommen werden.");
    return openMyListings(player);
  }
  tell(player, "Angebot zurückgenommen. " + offer.amount + "× " + offer.itemName + " sind wieder in deinem Inventar.");
  return openMyListings(player);
}
async function createListing(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const held = inv?.getItem(player.selectedSlotIndex);
  if (!held) { tell(player, "Halte das Item, das du anbieten möchtest, in der Hand."); return openMarket(player); }
  const itemId = held.typeId;
  if (isAdminOnlyItem(itemId)) { tell(player, "Spawn-Eier und Mobspawner sind dem Admin-Kauf und -Verkauf vorbehalten."); return openMarket(player); }
  const itemName = held.nameTag || itemId.replace("minecraft:", "").replaceAll("_", " ");
  const modal = new ModalFormData().title("Item anbieten")
    .textField("Anzahl (max. 64)", "z. B. 1", { defaultValue: String(held.amount) })
    .textField("Gesamtpreis in Euro (€)", "z. B. 12,50 €", { defaultValue: "10,00 €" })
    .textField("Mengenrabatt ab Stück (0 = kein Rabatt)", "z. B. 16", { defaultValue: "0" })
    .textField("Rabatt in Prozent (0–90)", "z. B. 10", { defaultValue: "0" });
  const res = await modal.show(player);
  if (res.canceled) return openMarket(player);
  const amount = Math.floor(Number(res.formValues?.[0]));
  const price = parseMoneyToCents(res.formValues?.[1]);
  const discountThreshold = Math.floor(Number(res.formValues?.[2]));
  const discountPercent = Math.floor(Number(res.formValues?.[3]));
  if (!Number.isInteger(amount) || amount < 1 || amount > held.amount || amount > 64 ||
      !Number.isInteger(price) || price < 1 ||
      !Number.isInteger(discountThreshold) || discountThreshold < 0 || discountThreshold > amount ||
      !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 90 ||
      ((discountThreshold === 0) !== (discountPercent === 0))) {
    tell(player, "Ungültige Anzahl, Preis oder Rabatt. Für keinen Rabatt beide Rabattfelder auf 0 setzen.");
    return openMarket(player);
  }
  if (!removeItems(player, itemId, amount)) { tell(player, "Item konnte nicht entnommen werden."); return openMarket(player); }
  const all = listings();
  all.push({ id: String(Date.now()) + "-" + player.id, sellerId: player.id, sellerName: player.name, itemId, itemName, amount, price, discountThreshold, discountPercent });
  try { writeJson(LISTINGS_KEY, all); tell(player, "Dein Angebot wurde eingestellt."); }
  catch { addItem(player, itemId, amount); tell(player, "Marktplatz voll – Item zurückgegeben."); }
  return openMarket(player);
}
// Eigene Chat-Befehle. Bedrock registriert zusätzlich kurze Chat-Aliase.
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "survivalbazaar:market",
      description: "Öffnet den Survival Bazaar mit Spieler-Marktplatz und Kontostand.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Dieser Befehl kann nur von Spielern verwendet werden." };
      }
      system.run(() => openMain(player).catch((error) => tell(player, "Bazaar-Fehler: " + (error?.message ?? String(error)))));
      return { status: CustomCommandStatus.Success };
    }
  );


  customCommandRegistry.registerCommand(
    {
      name: "survivalbazaar:shop",
      description: "Öffnet direkt den Server-Shop.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Dieser Befehl kann nur von Spielern verwendet werden." };
      }
      system.run(() => openShop(player).catch((error) => tell(player, "Shop-Fehler: " + (error?.message ?? String(error)))));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "survivalbazaar:admin",
      description: "Öffnet die Admin-Verwaltung des Survival Bazaar (nur für Operatoren).",
      permissionLevel: CommandPermissionLevel.Admin,
      cheatsRequired: false
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Dieser Befehl kann nur von Spielern verwendet werden." };
      }
      system.run(() => openAdminMenu(player).catch(() => tell(player, "Admin-Menü konnte nicht geöffnet werden.")));
      return { status: CustomCommandStatus.Success };
    }
  );
});
world.afterEvents.playerSpawn.subscribe(ev => {
  if (ev.initialSpawn) {
    const p = ev.player;
    system.runTimeout(() => {
      const money = balance(p);
      tell(p, "Willkommen! Dein Startguthaben: " + formatMoney(money) + ". Befehle: /survivalbazaar:market oder /survivalbazaar:shop; Admins: /survivalbazaar:admin.");
    }, 40);
  }
});
world.afterEvents.worldLoad.subscribe(() => {
  buildCompleteCatalog();
  // Initialisiert den globalen Speicher beim Laden der Welt.
  if (typeof world.getDynamicProperty(ACCOUNTS_KEY) !== "string") writeJson(ACCOUNTS_KEY, {});
  if (typeof world.getDynamicProperty(LISTINGS_KEY) !== "string") writeJson(LISTINGS_KEY, []);
  if (typeof world.getDynamicProperty(PRICES_KEY) !== "string") writeJson(PRICES_KEY, {});
  if (typeof world.getDynamicProperty(DIRECT_TRADES_KEY) !== "string") writeJson(DIRECT_TRADES_KEY, []);
});