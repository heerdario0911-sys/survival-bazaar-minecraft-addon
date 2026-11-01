import { world, system, ItemStack, ItemTypes, CommandPermissionLevel, CustomCommandStatus, Player, PlayerPermissionLevel } from "@minecraft/server";
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
  { id: "survivalbazaar:modern_sofa", name: "Modernes Sofa", buy: 25, sell: 9 },
  { id: "survivalbazaar:flat_tv", name: "Flachbildfernseher", buy: 33, sell: 12 },
  { id: "survivalbazaar:wall_mirror", name: "Wandspiegel", buy: 13, sell: 5 },
  { id: "survivalbazaar:coffee_table", name: "Couchtisch", buy: 10, sell: 3 },
  { id: "survivalbazaar:modern_chair", name: "Moderner Sessel", buy: 15, sell: 5 },
  { id: "survivalbazaar:double_bed", name: "Doppelbett", buy: 28, sell: 10 },
  { id: "survivalbazaar:fridge", name: "Kühlschrank", buy: 30, sell: 10 }
,
  { id: "survivalbazaar:dining_table", name: "Esstisch", buy: 32, sell: 12 }
  ,{ id: "survivalbazaar:wardrobe", name: "Kleiderschrank", buy: 48, sell: 18 }
  ,{ id: "survivalbazaar:bookshelf", name: "Modernes Bücherregal", buy: 28, sell: 10 }
  ,{ id: "survivalbazaar:floor_lamp", name: "Stehlampe", buy: 20, sell: 7 }
  ,{ id: "survivalbazaar:armchair", name: "Polstersessel", buy: 24, sell: 9 }
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
  if (technical.test(raw) || raw.endsWith("_spawn_egg") || raw === "mob_spawner") continue;
  // Nur Einträge, die Bedrock als echtes Inventar-Item anlegen kann.
  try { new ItemStack(id, 1); } catch { continue; }
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
   const label = items.length > 12 ? "Artikel " + page + "/" + Math.ceil(items.length / 12) : "Alle Artikel";
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

const CUSTOM_ITEM_ICONS = {
 "survivalbazaar:modern_sofa":"textures/blocks/sofa","survivalbazaar:flat_tv":"textures/blocks/tv",
 "survivalbazaar:wall_mirror":"textures/blocks/mirror","survivalbazaar:coffee_table":"textures/blocks/table",
 "survivalbazaar:modern_chair":"textures/blocks/chair","survivalbazaar:double_bed":"textures/blocks/bed",
 "survivalbazaar:fridge":"textures/blocks/fridge","survivalbazaar:dining_table":"textures/blocks/dining_table",
 "survivalbazaar:wardrobe":"textures/blocks/wardrobe","survivalbazaar:bookshelf":"textures/blocks/bookshelf",
 "survivalbazaar:floor_lamp":"textures/blocks/floor_lamp","survivalbazaar:armchair":"textures/blocks/armchair",
 "survivalbazaar:bar_counter":"textures/blocks/bar_counter","survivalbazaar:bar_stool":"textures/blocks/bar_stool",
 "survivalbazaar:grandfather_clock":"textures/blocks/grandfather_clock","survivalbazaar:hanging_guitar":"textures/blocks/hanging_guitar",
 "survivalbazaar:potted_plant":"textures/blocks/potted_plant","survivalbazaar:wall_shelf":"textures/blocks/wall_shelf","minecraft:mob_spawner":"textures/blocks/mob_spawner"
};
const VANILLA_ICON_ALIASES = {
 "cooked_beef":"beef_cooked","cooked_porkchop":"porkchop_cooked","cooked_chicken":"chicken_cooked",
 "cooked_mutton":"mutton_cooked","cooked_rabbit":"rabbit_cooked","golden_apple":"apple_golden",
 "enchanted_golden_apple":"apple_golden","baked_potato":"potato_baked","poisonous_potato":"potato_poisonous",
 "melon_slice":"melon","raw_iron":"iron_ore","raw_gold":"gold_ore","raw_copper":"copper_ore",
 "oak_log":"log_oak","spruce_log":"log_spruce","birch_log":"log_birch","jungle_log":"log_jungle",
 "acacia_log":"log_acacia","dark_oak_log":"log_big_oak","mangrove_log":"log_mangrove","cherry_log":"log_cherry",
 "oak_planks":"planks_oak","spruce_planks":"planks_spruce","birch_planks":"planks_birch",
 "jungle_planks":"planks_jungle","acacia_planks":"planks_acacia","dark_oak_planks":"planks_big_oak",
 "mangrove_planks":"planks_mangrove","cherry_planks":"planks_cherry",
 "oak_leaves":"leaves_oak","spruce_leaves":"leaves_spruce","birch_leaves":"leaves_birch",
 "jungle_leaves":"leaves_jungle","acacia_leaves":"leaves_acacia","dark_oak_leaves":"leaves_big_oak",
 "oak_sapling":"sapling_oak","spruce_sapling":"sapling_spruce","birch_sapling":"sapling_birch",
 "jungle_sapling":"sapling_jungle","acacia_sapling":"sapling_acacia","dark_oak_sapling":"sapling_big_oak"
};
function itemIconPath(id) {
 if (CUSTOM_ITEM_ICONS[id]) return CUSTOM_ITEM_ICONS[id];
 const raw=String(id).replace(/^minecraft:/,"");
 const alias=VANILLA_ICON_ALIASES[raw]||raw;
 const blockLike=catalogCategory(id)==="Blöcke und Baumaterial" ||
  /_block$|_log$|_wood$|_planks$|_ore$|_stone$|_bricks$|_wool$|_concrete$|_terracotta$|_glass$|_leaves$|_sapling$|_stairs$|_slab$|_fence$|_door$|_trapdoor$|_wall$|_bed$|_banner$|_carpet$|_candle$|_shulker_box$|^torch$|^lantern$|^flower_pot$|^scaffolding$|^ladder$|^chain$|^iron_bars$/.test(raw);
 return (blockLike?"textures/blocks/":"textures/items/")+alias;
}

async function openMain(player) {
  const money = balance(player);
  const form = new ActionFormData()
    .title("§l§6SURVIVAL BAZAAR")
    .body("§fDein Kontostand: §6" + formatMoney(money) + "\n§7Wähle einen Bereich.")
    .button("§aServer-Shop\n§7Items kaufen und verkaufen")
    .button("§bSpieler-Marktplatz\n§7Angebote anderer Spieler")
    .button("§eKontostand");
  form.button("§7Schließen");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === 0) return openShop(player);
  if (res.selection === 1) return openMarket(player);
  if (res.selection === 2) return tell(player, "Du besitzt §6" + formatMoney(balance(player)) + "§r.");
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
    .textField("Anzahl zum Warenkorb hinzufügen (1–64)", "z. B. 4", "1");
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
  for (const item of entries) form.button("§e" + item.name + "\n§7" + item.qty + " Stück – ändern / entfernen", itemIconPath(item.id));
  form.button("§aJetzt kaufen");
  form.button("§cWarenkorb abbrechen/leeren");
  form.button("§7Weiter einkaufen");
  const res = await form.show(player);
  if (res.canceled) return returnTo(player);
  if (res.selection < entries.length) {
    const item = entries[res.selection];
    const modal = new ModalFormData().title("§l§e" + item.name)
      .textField("Neue Menge (0 = entfernen, maximal 64)", "Anzahl", String(item.qty));
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
  for (const item of entries) {
    if (!addItem(player, item.id, item.qty)) {
      tell(player, "Kauf abgebrochen: " + item.name + " konnte nicht hinzugefügt werden.");
      return openBuyBasket(player, returnTo);
    }
  }
  setBalance(player.id, balance(player) - total);
  cart.clear();
  tell(player, "Einkauf abgeschlossen: " + entries.length + " verschiedene Items für " + formatMoney(total) + ".");
  return returnTo(player);
}

async function openBuyShop(player) {
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
  const modal = new ModalFormData().title("§l§bGEGENSTÄNDE SUCHEN")
    .textField("Suchbegriff (Name oder ID)", "z. B. Diamant, Eiche, minecraft:stone", "");
  const res = await modal.show(player);
  if (res.canceled) return openBuyShop(player);
  const query = String(res.formValues?.[0] ?? "").trim().toLocaleLowerCase("de-DE");
  if (!query) { tell(player, "Bitte gib einen Suchbegriff ein."); return openBuySearch(player); }
  return showBuySearchResults(player, query, 0);
}

async function showBuySearchResults(player, query, page) {
  const matches = allBuyEntries().filter(item =>
    item.name.toLocaleLowerCase("de-DE").includes(query) ||
    item.id.toLowerCase().includes(query) ||
    item.category.toLocaleLowerCase("de-DE").includes(query) ||
    item.group.toLocaleLowerCase("de-DE").includes(query)
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
  const form = new ActionFormData().title("§l§cITEMS VERKAUFEN").body("§7Wähle eine Hauptkategorie.");
  for (const category of SELL_CATEGORIES) form.button("§e" + category.name);
  form.button("§7Zurück");
  const res = await form.show(player);
  if (res.canceled || res.selection === SELL_CATEGORIES.length) return openShop(player);
  const category = SELL_CATEGORIES[res.selection];
  if (category) return openSellSubcategories(player, category);
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

async function openSellItems(player, category, group) {
  const form = new ActionFormData().title("§l§c" + group.name.toUpperCase())
    .body("§7Wähle einen Gegenstand zum Verkaufen. Die Vorschau zeigt das Item-Symbol.");
  const owned = group.items.map(([id]) => countItem(player, id));
  for (let i=0;i<group.items.length;i++) {
    const [id,name,basePrice]=group.items[i];
    form.button(name+"\n§c"+formatMoney(getPriceCents(id,"sell",basePrice))+" / Stück §8| §7Besitz: "+owned[i],itemIconPath(id));
  }
  form.button("§7Zurück");
  const res=await form.show(player);
  if(res.canceled||res.selection===group.items.length) return openSellSubcategories(player,category);
  const entry=group.items[res.selection];
  if(entry) return chooseSellQuantity(player,entry,category,group);
  return openSellItems(player,category,group);
}
async function chooseSellQuantity(player,entry,category,group,returnTo=()=>openSellItems(player,category,group)) {
  const [id,name,basePrice]=entry;
  const owned=countItem(player,id);
  if(owned<1){tell(player,"Du besitzt diesen Gegenstand nicht.");return returnTo();}
  const modal=new ModalFormData().title("§l§c"+name)
    .textField("Anzahl (Besitz: "+owned+") – "+formatMoney(getPriceCents(id,"sell",basePrice))+" / Stück","z. B. 1","1");
  const res=await modal.show(player);
  if(res.canceled)return returnTo();
  const qty=Math.floor(Number(res.formValues?.[0]));
  if(!Number.isInteger(qty)||qty<1||qty>owned){tell(player,"Ungültige Menge. Du besitzt "+owned+".");return chooseSellQuantity(player,entry,category,group,returnTo);}
  if(!removeItems(player,id,qty)){tell(player,"Gegenstand konnte nicht entnommen werden.");return returnTo();}
  const total=getPriceCents(id,"sell",basePrice)*qty;
  setBalance(player.id,balance(player)+total);
  tell(player,qty+"× "+name+" verkauft für "+formatMoney(total)+".");
  return returnTo();
}


function adminSpecialItems() {
 const found=[];
 try {
  for(const t of ItemTypes.getAll()) {
   const id=t?.id;
   if(typeof id!=="string"||!id.startsWith("minecraft:")) continue;
   const raw=id.slice(10);
   if(!(raw.endsWith("_spawn_egg")||raw==="mob_spawner")) continue;
   try { new ItemStack(id,1); } catch { continue; }
   const name=raw==="mob_spawner"?"Mob-Spawner":catalogLabel(id);
   found.push([id,name,raw==="mob_spawner"?2500:100]);
  }
 } catch {}
 if(!found.some(x=>x[0]==="minecraft:mob_spawner")) found.push(["minecraft:mob_spawner","Mob-Spawner",2500]);
 return found.sort((a,b)=>a[1].localeCompare(b[1],"de"));
}
async function openAdminSpecialItems(player, side) {
 const entries=adminSpecialItems();
 const title=side==="buy"?"ADMIN-SHOP: SPAWN-EIER":"ADMIN-VERKAUF: SPAWN-EIER";
 const form=new ActionFormData().title("§l§d"+title)
  .body("§7Diese Gegenstände sind ausschließlich in der Admin-Verwaltung verfügbar.\n§7Wähle ein Item aus.");
 for(const [id,name,price] of entries) {
  const cents=getPriceCents(id,side,price);
  form.button(name+"\n§6"+formatMoney(cents)+" / Stück",itemIconPath(id));
 }
 form.button("§7Zurück");
 const res=await form.show(player);
 if(res.canceled||res.selection===entries.length) return openAdminMenu(player);
 const entry=entries[res.selection];
 if(!entry)return openAdminSpecialItems(player,side);
 if(side==="buy") return chooseBuyQuantity(player,entry,()=>openAdminSpecialItems(player,"buy"));
 return chooseSellQuantity(player,entry,{name:"Admin-Sonderartikel",groups:[]},{name:"Spawn-Eier und Spawner",items:entries},()=>openAdminSpecialItems(player,"sell"));
}

async function openAdminMenu(player) {
  const form = new ActionFormData().title("§l§cBAZAAR-ADMIN")
    .body("§7Preise werden dauerhaft in den Weltdaten gespeichert.")
    .button("§aKaufpreise bearbeiten\n§7Server-Shop")
    .button("§eVerkaufspreise bearbeiten\n§7Verkaufskatalog")
    .button("§dAdmin-Shop: Spawn-Eier & Spawner kaufen")
    .button("§cAdmin-Verkauf: Spawn-Eier & Spawner verkaufen")
    .button("§7Schließen");
  const res = await form.show(player);
  if (res.canceled || res.selection === 4) return;
  if (res.selection === 0) return openAdminBuyPrices(player);
  if (res.selection === 1) return openAdminSellCategories(player);
  if (res.selection === 2) return openAdminSpecialItems(player, "buy");
  if (res.selection === 3) return openAdminSpecialItems(player, "sell");
}

async function editPrice(player, itemId, itemName, side, currentCents, returnTo) {
  const modal = new ModalFormData().title("Preis bearbeiten")
    .textField(itemName + " – " + (side === "buy" ? "Kaufpreis" : "Verkaufspreis") + " in Euro (€)", "z. B. 12,50 €", formatMoney(currentCents));
  const res = await modal.show(player);
  if (res.canceled) return returnTo();
  const cents = parseMoneyToCents(res.formValues?.[0]);
  if (!Number.isInteger(cents) || cents < 0 || cents > 100000000) {
    tell(player, "Ungültiger Preis. Bitte z. B. 12,50 eingeben (0 bis 1.000.000 €).");
    return editPrice(player, itemId, itemName, side, currentCents, returnTo);
  }
  setPriceCents(itemId, side, cents);
  tell(player, (side === "buy" ? "Kaufpreis" : "Verkaufspreis") + " für " + itemName + " auf " + formatMoney(cents) + " gesetzt.");
  return returnTo();
}

async function openAdminBuyPrices(player) {
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
    form.button(name + "\n§a" + formatMoney(getPriceCents(id, "buy", basePrice)));
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
  const offers = listings().filter(x => x && x.id && x.sellerId !== player.id);
  const form = new ActionFormData().title("§l§bSPIELER-MARKTPLATZ")
    .body("§7Angebote anderer Spieler. Dein Guthaben: §6" + formatMoney(balance(player)));
  for (const offer of offers.slice(0, 25)) form.button(offer.itemName + " ×" + offer.amount + "\n§6" + formatMoney(offer.price) + " §8| §7von " + offer.sellerName, itemIconPath(offer.itemId));
  form.button("§aEigenes Item anbieten");
  form.button("Zurück");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === offers.slice(0,25).length) return createListing(player);
  if (res.selection === offers.slice(0,25).length + 1) return openMain(player);
  const offer = offers[res.selection];
  if (!offer) return openMarket(player);
  const confirm = new MessageFormData().title("Angebot kaufen").body(offer.amount + "× " + offer.itemName + " von " + offer.sellerName + " für " + formatMoney(offer.price) + " kaufen?")
    .button1("Kaufen").button2("Abbrechen");
  const c = await confirm.show(player);
  if (c.canceled || c.selection !== 0) return openMarket(player);
  const current = listings();
  const idx = current.findIndex(x => x.id === offer.id);
  if (idx < 0) { tell(player, "Dieses Angebot ist nicht mehr verfügbar."); return openMarket(player); }
  if (balance(player) < offer.price) { tell(player, "Du hast nicht genug Guthaben."); return openMarket(player); }
  if (!addItem(player, offer.itemId, offer.amount)) { tell(player, "Dein Inventar ist voll."); return openMarket(player); }
  setBalance(player.id, balance(player) - offer.price);
  setBalance(offer.sellerId, (accounts()[offer.sellerId] ?? 0) + offer.price);
  current.splice(idx, 1);
  writeJson(LISTINGS_KEY, current);
  tell(player, "Angebot gekauft. " + formatMoney(offer.price) + " wurden überwiesen.");
  return openMarket(player);
}
async function createListing(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const held = inv?.getItem(player.selectedSlotIndex);
  if (!held) { tell(player, "Halte das Item, das du anbieten möchtest, in der Hand."); return openMarket(player); }
  const itemId = held.typeId;
  const itemName = held.nameTag || itemId.replace("minecraft:", "").replaceAll("_", " ");
  const modal = new ModalFormData().title("Item anbieten")
    .textField("Anzahl (max. 64)", "z. B. 1", String(held.amount))
    .textField("Gesamtpreis in Euro (€)", "z. B. 12,50 €", "10,00 €");
  const res = await modal.show(player);
  if (res.canceled) return openMarket(player);
  const amount = Math.floor(Number(res.formValues?.[0]));
  const price = parseMoneyToCents(res.formValues?.[1]);
  if (!Number.isInteger(amount) || amount < 1 || amount > held.amount || amount > 64 || !Number.isInteger(price) || price < 1) {
    tell(player, "Ungültige Anzahl oder Preis."); return openMarket(player);
  }
  if (!removeItems(player, itemId, amount)) { tell(player, "Item konnte nicht entnommen werden."); return openMarket(player); }
  const all = listings();
  all.push({ id: String(Date.now()) + "-" + player.id, sellerId: player.id, sellerName: player.name, itemId, itemName, amount, price });
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

  // Admin command: Minecraft also exposes the short chat alias /admin.
  // Keep exactly one registration to avoid duplicate command conflicts.
  customCommandRegistry.registerCommand(
    {
      name: "survivalbazaar:admin",
      description: "Öffnet die geschützte Admin-Verwaltung des Survival Bazaar.",
      // Permission is checked below against the actual player role. This avoids
      // Bedrock's command parser rejecting valid Xbox operators before callback.
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Dieser Befehl kann nur von Spielern verwendet werden." };
      }
      try {
        if (player.playerPermissionLevel < PlayerPermissionLevel.Operator) {
          return { status: CustomCommandStatus.Failure, message: "Nur Operatoren dürfen /admin verwenden. Stelle deine Spielerberechtigung auf Operator." };
        }
      } catch (error) {
        return { status: CustomCommandStatus.Failure, message: "Operator-Berechtigung konnte nicht geprüft werden." };
      }
      system.run(() => {
        openAdminMenu(player).catch((error) => {
          console.warn("[SurvivalBazaar] Admin-Menü konnte nicht geöffnet werden:", error);
          tell(player, "Admin-Menü konnte nicht geöffnet werden. Bitte versuche es erneut.");
        });
      });
      return { status: CustomCommandStatus.Success, message: "Admin-Verwaltung wird geöffnet." };
    }
  );
});


const DISPLAY_FURNITURE = {
  "survivalbazaar:modern_sofa": { entityId: "survivalbazaar:modern_sofa_display", seat: "sofa" },
  "survivalbazaar:modern_chair": { entityId: "survivalbazaar:modern_chair_display", seat: "chair" },
  "survivalbazaar:armchair": { entityId: "survivalbazaar:armchair_display", seat: "chair" },
  "survivalbazaar:bar_stool": { entityId: "survivalbazaar:bar_stool_display", seat: "stool" },
  "survivalbazaar:double_bed": { entityId: "survivalbazaar:double_bed_display", seat: "bed" },
  "survivalbazaar:flat_tv": { entityId: "survivalbazaar:flat_tv_display" },
  "survivalbazaar:fridge": { entityId: "survivalbazaar:fridge_display" }
};
const DISPLAY_FURNITURE_BY_ENTITY = Object.fromEntries(
  Object.entries(DISPLAY_FURNITURE).map(([blockId, config]) => [config.entityId, { ...config, blockId }])
);

function furnitureAnchorTag(location) {
  return "sb_anchor_" + location.x + "_" + location.y + "_" + location.z;
}

function spawnFurnitureDisplay(dimension, blockId, location, rotation = 0) {
  const config = DISPLAY_FURNITURE[blockId];
  if (!config) return undefined;
  const tag = furnitureAnchorTag(location);
  const nearby = dimension.getEntities({
    type: config.entityId,
    location: { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 },
    maxDistance: 4
  });
  const existing = nearby.find(entity => entity.hasTag(tag));
  if (existing) return existing;
  const entity = dimension.spawnEntity(config.entityId, {
    x: location.x + 0.5,
    y: location.y,
    z: location.z + 0.5
  });
  entity.addTag(tag);
  entity.setRotation({ x: 0, y: rotation });
  return entity;
}

function repairFurnitureNearPlayer(player) {
  try {
    const dimension = player.dimension;
    const center = player.location;
    const existing = new Set();
    for (const config of Object.values(DISPLAY_FURNITURE_BY_ENTITY)) {
      for (const entity of dimension.getEntities({ type: config.entityId, location: center, maxDistance: 18 })) {
        const tag = entity.getTags().find(value => value.startsWith("sb_anchor_"));
        if (tag) existing.add(config.entityId + "|" + tag);
      }
    }
    const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
    for (let x = cx - 8; x <= cx + 8; x++) {
      for (let y = cy - 3; y <= cy + 4; y++) {
        for (let z = cz - 8; z <= cz + 8; z++) {
          try {
            const block = dimension.getBlock({ x, y, z });
            const config = block && DISPLAY_FURNITURE[block.typeId];
            if (!config) continue;
            const tag = furnitureAnchorTag({ x, y, z });
            const key = config.entityId + "|" + tag;
            if (existing.has(key)) continue;
            const entity = dimension.spawnEntity(config.entityId, { x: x + 0.5, y, z: z + 0.5 });
            entity.addTag(tag);
            existing.add(key);
          } catch {}
        }
      }
    }
  } catch (error) {
    console.warn("[SurvivalBazaar] Möbel-Reparatur übersprungen:", error);
  }
}

world.afterEvents.playerPlaceBlock.subscribe(event => {
  const blockId = event.block.typeId;
  if (!DISPLAY_FURNITURE[blockId]) return;
  const location = {
    x: Math.floor(event.block.location.x),
    y: Math.floor(event.block.location.y),
    z: Math.floor(event.block.location.z)
  };
  const rotation = event.player.getRotation().y;
  system.run(() => {
    try {
      if (event.dimension.getBlock(location)?.typeId !== blockId) return;
      spawnFurnitureDisplay(event.dimension, blockId, location, rotation);
    } catch (error) {
      tell(event.player, "Das Möbelmodell konnte nicht geladen werden. Bitte platziere den Gegenstand erneut.");
      console.warn("[SurvivalBazaar] Möbel konnte nicht gespawnt werden:", error);
    }
  });
});

world.afterEvents.playerBreakBlock.subscribe(event => {
  const blockId = event.brokenBlockPermutation.type.id;
  const config = DISPLAY_FURNITURE[blockId];
  if (!config) return;
  const location = {
    x: Math.floor(event.block.location.x),
    y: Math.floor(event.block.location.y),
    z: Math.floor(event.block.location.z)
  };
  const tag = furnitureAnchorTag(location);
  system.run(() => {
    try {
      const nearby = event.dimension.getEntities({
        type: config.entityId,
        location: { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 },
        maxDistance: 4
      });
      for (const entity of nearby) if (entity.hasTag(tag)) entity.remove();
    } catch (error) {
      console.warn("[SurvivalBazaar] Möbelmodell konnte nicht entfernt werden:", error);
    }
  });
});



const furnitureTvStates = new Map();

function getFridgeContainer(entity) {
  try {
    return entity.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}

function openFridgeTransfer(player, entity, direction) {
  try {
    const fridge = getFridgeContainer(entity);
    const playerInventory = player.getComponent("minecraft:inventory")?.container;
    if (!fridge || !playerInventory) {
      tell(player, "Der Kühlschrank-Inhalt konnte nicht geöffnet werden.");
      return;
    }
    const source = direction === "deposit" ? playerInventory : fridge;
    const target = direction === "deposit" ? fridge : playerInventory;
    const entries = [];
    for (let slot = 0; slot < source.size; slot++) {
      const stack = source.getItem(slot);
      if (stack) entries.push({ slot, label: stack.amount + "x " + stack.typeId.replace("minecraft:", "").replace(/_/g, " ") });
    }
    if (!entries.length) {
      tell(player, direction === "deposit" ? "Dein Inventar enthält keine Gegenstände zum Einlagern." : "Der Kühlschrank ist leer.");
      return;
    }
    const form = new ModalFormData()
      .title(direction === "deposit" ? "§l§aKÜHLSCHRANK – EINLAGERN" : "§l§eKÜHLSCHRANK – ENTNEHMEN")
      .dropdown("Gegenstand auswählen", entries.map(entry => entry.label), 0);
    form.show(player).then(result => {
      if (result.canceled || !player.isValid || !entity.isValid) return;
      const selected = entries[Number(result.formValues?.[0] ?? 0)];
      if (!selected) return;
      const current = source.getItem(selected.slot);
      if (!current) return;
      const moving = current.clone();
      const leftover = target.addItem(moving);
      if (leftover) {
        source.setItem(selected.slot, leftover);
        tell(player, "Es war nicht genug Platz vorhanden. Der Rest bleibt im Ausgangsinventar.");
      } else {
        source.setItem(selected.slot, undefined);
        tell(player, direction === "deposit" ? "Gegenstand im Kühlschrank eingelagert." : "Gegenstand aus dem Kühlschrank entnommen.");
      }
      system.run(() => openFridgeMenu(player, entity));
    }).catch(error => {
      console.warn("[SurvivalBazaar] Kühlschrank-Menü fehlgeschlagen:", error);
      tell(player, "Das Kühlschrank-Menü konnte nicht geöffnet werden.");
    });
  } catch (error) {
    console.warn("[SurvivalBazaar] Kühlschrank-Transfer fehlgeschlagen:", error);
    tell(player, "Der Kühlschrank konnte gerade nicht benutzt werden.");
  }
}

function openFridgeMenu(player, entity) {
  if (!player.isValid || !entity.isValid) return;
  const form = new ActionFormData()
    .title("§l§aKÜHLSCHRANK")
    .body("§7Dein persönlicher Stauraum mit 27 Plätzen.")
    .button("§aGegenstände einlagern")
    .button("§eGegenstände entnehmen")
    .button("§cSchließen");
  form.show(player).then(result => {
    if (result.canceled) return;
    if (result.selection === 0) openFridgeTransfer(player, entity, "deposit");
    else if (result.selection === 1) openFridgeTransfer(player, entity, "withdraw");
  }).catch(error => {
    console.warn("[SurvivalBazaar] Kühlschrank-Menü fehlgeschlagen:", error);
    tell(player, "Das Kühlschrank-Menü konnte nicht geöffnet werden.");
  });
}

world.afterEvents.playerInteractWithEntity.subscribe(event => {
  const player = event.player;
  const entity = event.target;
  const config = DISPLAY_FURNITURE_BY_ENTITY[entity.typeId];
  if (!config) return;
  system.run(() => {
    try {
      if (!player.isValid || !entity.isValid) return;
      if (config.seat) {
        const rideable = entity.getComponent("minecraft:rideable");
        const added = rideable?.addRider(player) ?? false;
        if (!added) {
          tell(player, "Der Sitzplatz ist gerade belegt oder konnte nicht benutzt werden.");
          return;
        }
        if (config.seat === "bed") {
          const tag = entity.getTags().find(value => value.startsWith("sb_anchor_"));
          const match = tag?.match(/^sb_anchor_(-?\\d+)_(-?\\d+)_(-?\\d+)$/);
          if (match) {
            player.setSpawnPoint({
              x: Number(match[1]) + 0.5,
              y: Number(match[2]) + 0.5,
              z: Number(match[3]) + 0.5,
              dimension: player.dimension
            });
          }
          tell(player, "Du liegst jetzt im Doppelbett. Dein persönlicher Spawnpunkt wurde gesetzt. Zum Aufstehen springst du.");
        } else {
          tell(player, "Du sitzt jetzt auf dem Möbelstück. Zum Aufstehen springst du.");
        }
        return;
      }
      if (entity.typeId === "survivalbazaar:fridge_display") {
        openFridgeMenu(player, entity);
        return;
      }
      if (entity.typeId === "survivalbazaar:flat_tv_display") {
        const next = !furnitureTvStates.get(entity.id);
        furnitureTvStates.set(entity.id, next);
        player.onScreenDisplay.setActionBar(next ? "§eFernseher eingeschaltet." : "§7Fernseher ausgeschaltet.");
        return;
      }
      tell(player, "Dieses Möbelstück wurde benutzt.");
    } catch (error) {
      console.warn("[SurvivalBazaar] Möbel-Interaktion fehlgeschlagen:", error);
      tell(player, "Die Möbel-Interaktion ist fehlgeschlagen. Bitte versuche es erneut.");
    }
  });
});



world.afterEvents.playerSpawn.subscribe(ev => {
  if (ev.initialSpawn) {
    const p = ev.player;
    system.runTimeout(() => repairFurnitureNearPlayer(p), 60);
    system.runTimeout(() => {
      const money = balance(p);
      tell(p, "Willkommen! Dein Startguthaben: " + formatMoney(money) + ". Befehle: /market oder /shop; Admins: /admin.");
    }, 40);
  }
});
world.afterEvents.worldLoad.subscribe(() => {
  buildCompleteCatalog();
  // Initialisiert den globalen Speicher beim Laden der Welt.
  if (typeof world.getDynamicProperty(ACCOUNTS_KEY) !== "string") writeJson(ACCOUNTS_KEY, {});
  if (typeof world.getDynamicProperty(LISTINGS_KEY) !== "string") writeJson(LISTINGS_KEY, []);
  if (typeof world.getDynamicProperty(PRICES_KEY) !== "string") writeJson(PRICES_KEY, {});
});