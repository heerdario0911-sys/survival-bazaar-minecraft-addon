import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  world
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const AUTHORIZED_ADMINS = new Set(["Skillet8736", "Kiwi175031"]);
const ADMIN_COMMAND = "survivalbazaar:admin";
const PRICE_PROPERTY = "sb_admin_prices_v1";
const BALANCE_PREFIX = "sb_admin_coins_";
const PAGE_SIZE = 8;

const PRICE_ITEMS = [
  ["Oak Log", "minecraft:oak_log"], ["Spruce Log", "minecraft:spruce_log"],
  ["Birch Log", "minecraft:birch_log"], ["Jungle Log", "minecraft:jungle_log"],
  ["Acacia Log", "minecraft:acacia_log"], ["Dark Oak Log", "minecraft:dark_oak_log"],
  ["Mangrove Log", "minecraft:mangrove_log"], ["Cherry Log", "minecraft:cherry_log"],
  ["Oak Planks", "minecraft:oak_planks"], ["Cobblestone", "minecraft:cobblestone"],
  ["Stone", "minecraft:stone"], ["Deepslate", "minecraft:deepslate"],
  ["Coal", "minecraft:coal"], ["Charcoal", "minecraft:charcoal"],
  ["Iron Ingot", "minecraft:iron_ingot"], ["Gold Ingot", "minecraft:gold_ingot"],
  ["Copper Ingot", "minecraft:copper_ingot"], ["Diamond", "minecraft:diamond"],
  ["Emerald", "minecraft:emerald"], ["Lapis Lazuli", "minecraft:lapis_lazuli"],
  ["Redstone Dust", "minecraft:redstone"], ["Quartz", "minecraft:quartz"],
  ["Netherite Ingot", "minecraft:netherite_ingot"], ["Obsidian", "minecraft:obsidian"],
  ["Glass", "minecraft:glass"], ["Sand", "minecraft:sand"],
  ["Gravel", "minecraft:gravel"], ["Dirt", "minecraft:dirt"],
  ["Grass Block", "minecraft:grass_block"], ["Clay", "minecraft:clay"],
  ["Wheat", "minecraft:wheat"], ["Bread", "minecraft:bread"],
  ["Cooked Beef", "minecraft:cooked_beef"], ["Cooked Porkchop", "minecraft:cooked_porkchop"],
  ["Cooked Chicken", "minecraft:cooked_chicken"], ["Golden Apple", "minecraft:golden_apple"],
  ["Enchanted Golden Apple", "minecraft:enchanted_golden_apple"], ["Carrot", "minecraft:carrot"],
  ["Potato", "minecraft:potato"], ["Apple", "minecraft:apple"],
  ["String", "minecraft:string"], ["Leather", "minecraft:leather"],
  ["Bone", "minecraft:bone"], ["Gunpowder", "minecraft:gunpowder"],
  ["Slimeball", "minecraft:slime_ball"], ["Ender Pearl", "minecraft:ender_pearl"],
  ["Blaze Rod", "minecraft:blaze_rod"], ["Ghast Tear", "minecraft:ghast_tear"],
  ["Rotten Flesh", "minecraft:rotten_flesh"], ["Arrow", "minecraft:arrow"],
  ["Bow", "minecraft:bow"], ["Crossbow", "minecraft:crossbow"],
  ["Shield", "minecraft:shield"], ["Trident", "minecraft:trident"],
  ["Fishing Rod", "minecraft:fishing_rod"], ["Elytra", "minecraft:elytra"],
  ["Lead", "minecraft:lead"], ["Name Tag", "minecraft:name_tag"],
  ["Saddle", "minecraft:saddle"], ["Chest", "minecraft:chest"],
  ["Hopper", "minecraft:hopper"], ["Anvil", "minecraft:anvil"],
  ["Furnace", "minecraft:furnace"], ["Crafting Table", "minecraft:crafting_table"],
  ["Bookshelf", "minecraft:bookshelf"], ["Enchantment Table", "minecraft:enchanting_table"],
  ["Ender Chest", "minecraft:ender_chest"], ["Shulker Box", "minecraft:shulker_box"]
];

const GIVE_ITEMS = [
  ...PRICE_ITEMS,
  ["Iron Sword", "minecraft:iron_sword"], ["Diamond Sword", "minecraft:diamond_sword"],
  ["Netherite Sword", "minecraft:netherite_sword"], ["Iron Pickaxe", "minecraft:iron_pickaxe"],
  ["Diamond Pickaxe", "minecraft:diamond_pickaxe"], ["Netherite Pickaxe", "minecraft:netherite_pickaxe"],
  ["Iron Helmet", "minecraft:iron_helmet"], ["Iron Chestplate", "minecraft:iron_chestplate"],
  ["Iron Leggings", "minecraft:iron_leggings"], ["Iron Boots", "minecraft:iron_boots"],
  ["Diamond Helmet", "minecraft:diamond_helmet"], ["Diamond Chestplate", "minecraft:diamond_chestplate"],
  ["Diamond Leggings", "minecraft:diamond_leggings"], ["Diamond Boots", "minecraft:diamond_boots"],
  ["Netherite Helmet", "minecraft:netherite_helmet"], ["Netherite Chestplate", "minecraft:netherite_chestplate"],
  ["Netherite Leggings", "minecraft:netherite_leggings"], ["Netherite Boots", "minecraft:netherite_boots"],
  ["Turtle Helmet", "minecraft:turtle_helmet"], ["Wolf Armor", "minecraft:wolf_armor"],
  ["Horse Armor (Iron)", "minecraft:iron_horse_armor"],
  ["Horse Armor (Gold)", "minecraft:golden_horse_armor"],
  ["Horse Armor (Diamond)", "minecraft:diamond_horse_armor"],
  ["Bundle", "minecraft:bundle"], ["Shulker Shell", "minecraft:shulker_shell"]
];

const ADMIN_ONLY_ITEMS = [
  ["Creeper Spawn Egg", "minecraft:creeper_spawn_egg"],
  ["Armadillo Spawn Egg", "minecraft:armadillo_spawn_egg"],
  ["Bat Spawn Egg", "minecraft:bat_spawn_egg"],
  ["Zombie Spawn Egg", "minecraft:zombie_spawn_egg"],
  ["Skeleton Spawn Egg", "minecraft:skeleton_spawn_egg"],
  ["Spider Spawn Egg", "minecraft:spider_spawn_egg"],
  ["Cave Spider Spawn Egg", "minecraft:cave_spider_spawn_egg"],
  ["Cod Spawn Egg", "minecraft:cod_spawn_egg"],
  ["Enderman Spawn Egg", "minecraft:enderman_spawn_egg"],
  ["Endermite Spawn Egg", "minecraft:endermite_spawn_egg"],
  ["Witch Spawn Egg", "minecraft:witch_spawn_egg"],
  ["Slime Spawn Egg", "minecraft:slime_spawn_egg"],
  ["Drowned Spawn Egg", "minecraft:drowned_spawn_egg"],
  ["Husk Spawn Egg", "minecraft:husk_spawn_egg"],
  ["Stray Spawn Egg", "minecraft:stray_spawn_egg"],
  ["Phantom Spawn Egg", "minecraft:phantom_spawn_egg"],
  ["Pillager Spawn Egg", "minecraft:pillager_spawn_egg"],
  ["Vindicator Spawn Egg", "minecraft:vindicator_spawn_egg"],
  ["Evoker Spawn Egg", "minecraft:evoker_spawn_egg"],
  ["Ravager Spawn Egg", "minecraft:ravager_spawn_egg"],
  ["Guardian Spawn Egg", "minecraft:guardian_spawn_egg"],
  ["Elder Guardian Spawn Egg", "minecraft:elder_guardian_spawn_egg"],
  ["Blaze Spawn Egg", "minecraft:blaze_spawn_egg"],
  ["Ghast Spawn Egg", "minecraft:ghast_spawn_egg"],
  ["Magma Cube Spawn Egg", "minecraft:magma_cube_spawn_egg"],
  ["Piglin Spawn Egg", "minecraft:piglin_spawn_egg"],
  ["Piglin Brute Spawn Egg", "minecraft:piglin_brute_spawn_egg"],
  ["Hoglin Spawn Egg", "minecraft:hoglin_spawn_egg"],
  ["Zoglin Spawn Egg", "minecraft:zoglin_spawn_egg"],
  ["Wither Skeleton Spawn Egg", "minecraft:wither_skeleton_spawn_egg"],
  ["Breeze Spawn Egg", "minecraft:breeze_spawn_egg"],
  ["Bogged Spawn Egg", "minecraft:bogged_spawn_egg"],
  ["Iron Golem Spawn Egg", "minecraft:iron_golem_spawn_egg"],
  ["Snow Golem Spawn Egg", "minecraft:snow_golem_spawn_egg"],
  ["Villager Spawn Egg", "minecraft:villager_spawn_egg"],
  ["Wandering Trader Spawn Egg", "minecraft:wandering_trader_spawn_egg"],
  ["Allay Spawn Egg", "minecraft:allay_spawn_egg"],
  ["Axolotl Spawn Egg", "minecraft:axolotl_spawn_egg"],
  ["Bee Spawn Egg", "minecraft:bee_spawn_egg"],
  ["Camel Spawn Egg", "minecraft:camel_spawn_egg"],
  ["Cat Spawn Egg", "minecraft:cat_spawn_egg"],
  ["Chicken Spawn Egg", "minecraft:chicken_spawn_egg"],
  ["Cow Spawn Egg", "minecraft:cow_spawn_egg"],
  ["Dolphin Spawn Egg", "minecraft:dolphin_spawn_egg"],
  ["Donkey Spawn Egg", "minecraft:donkey_spawn_egg"],
  ["Fox Spawn Egg", "minecraft:fox_spawn_egg"],
  ["Frog Spawn Egg", "minecraft:frog_spawn_egg"],
  ["Glow Squid Spawn Egg", "minecraft:glow_squid_spawn_egg"],
  ["Goat Spawn Egg", "minecraft:goat_spawn_egg"],
  ["Horse Spawn Egg", "minecraft:horse_spawn_egg"],
  ["Llama Spawn Egg", "minecraft:llama_spawn_egg"],
  ["Mooshroom Spawn Egg", "minecraft:mooshroom_spawn_egg"],
  ["Mule Spawn Egg", "minecraft:mule_spawn_egg"],
  ["Ocelot Spawn Egg", "minecraft:ocelot_spawn_egg"],
  ["Panda Spawn Egg", "minecraft:panda_spawn_egg"],
  ["Parrot Spawn Egg", "minecraft:parrot_spawn_egg"],
  ["Pig Spawn Egg", "minecraft:pig_spawn_egg"],
  ["Polar Bear Spawn Egg", "minecraft:polar_bear_spawn_egg"],
  ["Pufferfish Spawn Egg", "minecraft:pufferfish_spawn_egg"],
  ["Rabbit Spawn Egg", "minecraft:rabbit_spawn_egg"],
  ["Salmon Spawn Egg", "minecraft:salmon_spawn_egg"],
  ["Silverfish Spawn Egg", "minecraft:silverfish_spawn_egg"],
  ["Skeleton Horse Spawn Egg", "minecraft:skeleton_horse_spawn_egg"],
  ["Sheep Spawn Egg", "minecraft:sheep_spawn_egg"],
  ["Sniffer Spawn Egg", "minecraft:sniffer_spawn_egg"],
  ["Squid Spawn Egg", "minecraft:squid_spawn_egg"],
  ["Strider Spawn Egg", "minecraft:strider_spawn_egg"],
  ["Tadpole Spawn Egg", "minecraft:tadpole_spawn_egg"],
  ["Turtle Spawn Egg", "minecraft:turtle_spawn_egg"],
  ["Trader Llama Spawn Egg", "minecraft:trader_llama_spawn_egg"],
  ["Tropical Fish Spawn Egg", "minecraft:tropical_fish_spawn_egg"],
  ["Wolf Spawn Egg", "minecraft:wolf_spawn_egg"],
  ["Vex Spawn Egg", "minecraft:vex_spawn_egg"],
  ["Warden Spawn Egg", "minecraft:warden_spawn_egg"],
  ["Zombie Horse Spawn Egg", "minecraft:zombie_horse_spawn_egg"],
  ["Zombie Villager Spawn Egg", "minecraft:zombie_villager_spawn_egg"],
  ["Zombified Piglin Spawn Egg", "minecraft:zombified_piglin_spawn_egg"],
  ["Spawner", "minecraft:mob_spawner"]
];

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerCommand(
    {
      name: ADMIN_COMMAND,
      description: "Opens the private SurvivalBazaar admin panel.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Only a player can use this command." };
      }
      if (!isAuthorized(player)) {
        return { status: CustomCommandStatus.Failure, message: "Zugriff verweigert. Dieser Admin-Bereich ist nur für freigegebene Namen." };
      }
      system.run(() => showMainMenu(player));
      return { status: CustomCommandStatus.Success, message: "Opening SurvivalBazaar admin panel." };
    }
  );
});

function isAuthorized(player) {
  return player instanceof Player && AUTHORIZED_ADMINS.has(player.name);
}

function getPrices() {
  try {
    const raw = world.getDynamicProperty(PRICE_PROPERTY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePrices(prices) {
  world.setDynamicProperty(PRICE_PROPERTY, JSON.stringify(prices));
}

function balanceKey(player) {
  return BALANCE_PREFIX + player.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function getBalance(player) {
  const value = world.getDynamicProperty(balanceKey(player));
  return typeof value === "number" ? value : 0;
}

function setBalance(player, amount) {
  world.setDynamicProperty(balanceKey(player), amount);
}

function showMainMenu(player) {
  if (!isAuthorized(player)) return;
  const form = new ActionFormData()
    .title("§6SurvivalBazaar | Admin")
    .body("§7Angemeldet: §f" + player.name +
      "\n§aAdmin-System aktiv" +
      "\n\n§7Wähle eine Verwaltungsfunktion.")
    .button("§ePreise verwalten\n§8Preise für Items festlegen")
    .button("§bSpieler-Coins verwalten\n§8Guthaben online verwalten")
    .button("§aItems an Spieler geben\n§8Normale Gegenstände")
    .button("§cAdmin-Items\n§8Spawneier und Spawner")
    .button("§7Schließen");
  form.show(player).then((r) => {
    if (r.canceled) return;
    if (r.selection === 0) showPriceCatalog(player);
    if (r.selection === 1) showPlayerList(player, "coins");
    if (r.selection === 2) showPlayerList(player, "give");
    if (r.selection === 3) showPlayerList(player, "adminItems");
  }).catch((error) => player.sendMessage("§c[SurvivalBazaar] Admin-Menü-Fehler: " + (error?.message ?? String(error))));
}

function showSearchPrompt(player, title, onSearch) {
  const form = new ModalFormData()
    .title(title)
    .textField("Suchbegriff", "z. B. Holz, Diamant, Spawn-Ei", { defaultValue: "" });
  form.show(player).then((r) => {
    if (r.canceled) return;
    onSearch(String(r.formValues?.[0] ?? "").trim().toLowerCase());
  }).catch(() => player.sendMessage("§cSuchfenster konnte nicht geöffnet werden."));
}

function showPriceCatalog(player, page = 0, query = "") {
  if (!isAuthorized(player)) return;
  const filtered = PRICE_ITEMS.filter(([label, id]) => (label + " " + id).toLowerCase().includes(query));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const prices = getPrices();
  const start = current * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const form = new ActionFormData()
    .title("§6Preisverwaltung")
    .body("§7Suche: §f" + (query || "keine") + "\n§7Seite " + (current + 1) + "/" + pages +
      "\n§8Wähle ein Item, um seinen Coins-Preis festzulegen.");
  form.button("§bSuchen / Filter ändern");
  for (const [label, id] of slice) {
    const price = Number(prices[id] ?? 0);
    form.button("§f" + label + "\n§7Preis: §e" + price + " Coins");
  }
  if (current > 0) form.button("§eVorherige Seite");
  if (current < pages - 1) form.button("§eNächste Seite");
  form.button("§cZurück zum Admin-Menü");
  form.show(player).then((r) => {
    if (r.canceled) return;
    if (r.selection === 0) {
      showSearchPrompt(player, "Preis-Suche", (q) => showPriceCatalog(player, 0, q));
      return;
    }
    if (r.selection >= 1 && r.selection <= slice.length) {
      const [label, id] = slice[r.selection - 1];
      showPriceEditor(player, label, id, current, query);
      return;
    }
    let index = 1 + slice.length;
    if (current > 0 && r.selection === index++) return showPriceCatalog(player, current - 1, query);
    if (current < pages - 1 && r.selection === index++) return showPriceCatalog(player, current + 1, query);
    if (r.selection === index) showMainMenu(player);
  }).catch(() => player.sendMessage("§cPreisverwaltung konnte nicht geöffnet werden."));
}

function showPriceEditor(player, label, id, page, query) {
  const oldPrice = Number(getPrices()[id] ?? 0);
  const form = new ModalFormData()
    .title("Preis bearbeiten")
    .textField(label + " – Preis in Coins", "Nur ganze Zahlen ab 0", { defaultValue: String(oldPrice) });
  form.show(player).then((r) => {
    if (r.canceled) return showPriceCatalog(player, page, query);
    const value = Number(r.formValues?.[0]);
    if (!Number.isSafeInteger(value) || value < 0) {
      player.sendMessage("§cUngültiger Preis. Bitte eine ganze Zahl ab 0 eingeben.");
      return showPriceEditor(player, label, id, page, query);
    }
    const prices = getPrices();
    prices[id] = value;
    savePrices(prices);
    player.sendMessage("§aPreis gespeichert: " + label + " = " + value + " Coins.");
    showPriceCatalog(player, page, query);
  }).catch(() => player.sendMessage("§cPreisfenster konnte nicht geöffnet werden."));
}

function showPlayerList(player, mode) {
  if (!isAuthorized(player)) return;
  const players = world.getAllPlayers();
  if (players.length === 0) {
    player.sendMessage("§cKeine Spieler sind aktuell online.");
    return showMainMenu(player);
  }
  const form = new ActionFormData()
    .title(mode === "coins" ? "Spieler-Coins" : "Spieler auswählen")
    .body("§7Wähle einen aktuell online befindlichen Spieler.");
  for (const target of players) {
    form.button("§f" + target.name + (mode === "coins" ? "\n§e" + getBalance(target) + " Coins" : ""));
  }
  form.button("§cZurück");
  form.show(player).then((r) => {
    if (r.canceled) return;
    if (r.selection === players.length) return showMainMenu(player);
    const target = players[r.selection];
    if (!target) return;
    if (mode === "coins") showCoinEditor(player, target);
    if (mode === "give") showCatalogForPlayer(player, target, GIVE_ITEMS, "Gegenstände geben", false);
    if (mode === "adminItems") showCatalogForPlayer(player, target, ADMIN_ONLY_ITEMS, "§cAdmin-Items", true);
  }).catch(() => player.sendMessage("§cSpielerliste konnte nicht geöffnet werden."));
}

function showCoinEditor(admin, target) {
  if (!isAuthorized(admin)) return;
  const form = new ModalFormData()
    .title("Coins verwalten: " + target.name)
    .dropdown("Aktion", ["Coins hinzufügen", "Guthaben festlegen", "Coins abziehen"], 0)
    .textField("Betrag", "Ganze Zahl ab 0", { defaultValue: "100" });
  form.show(admin).then((r) => {
    if (r.canceled) return showPlayerList(admin, "coins");
    const action = Number(r.formValues?.[0] ?? 0);
    const amount = Number(r.formValues?.[1]);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      admin.sendMessage("§cUngültiger Betrag.");
      return showCoinEditor(admin, target);
    }
    const old = getBalance(target);
    const next = action === 0 ? old + amount : action === 1 ? amount : old - amount;
    if (!Number.isSafeInteger(next) || next < 0) {
      admin.sendMessage("§cDas Guthaben kann nicht unter 0 fallen oder den Zahlenbereich überschreiten.");
      return showCoinEditor(admin, target);
    }
    setBalance(target, next);
    target.sendMessage("§aDein Coins-Guthaben wurde vom Administrator angepasst: §e" + next + " Coins.");
    admin.sendMessage("§a" + target.name + ": " + old + " → " + next + " Coins.");
    showPlayerList(admin, "coins");
  }).catch(() => admin.sendMessage("§cCoins-Fenster konnte nicht geöffnet werden."));
}

function showCatalogForPlayer(admin, target, catalog, title, restricted) {
  if (!isAuthorized(admin)) return;
  const draw = (page = 0, query = "") => {
    if (!isAuthorized(admin)) return;
    const filtered = catalog.filter(([label, id]) => (label + " " + id).toLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const current = Math.min(page, pages - 1);
    const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
    const form = new ActionFormData()
      .title(title)
      .body("§7Empfänger: §f" + target.name + "\n§7Suche: §f" + (query || "keine") +
        "\n§7Seite " + (current + 1) + "/" + pages);
    form.button("§bSuchen / Filter ändern");
    for (const [label] of slice) form.button("§f" + label);
    if (current > 0) form.button("§eVorherige Seite");
    if (current < pages - 1) form.button("§eNächste Seite");
    form.button("§cZurück");
    form.show(admin).then((r) => {
      if (r.canceled) return showPlayerList(admin, restricted ? "adminItems" : "give");
      if (r.selection === 0) return showSearchPrompt(admin, "Item-Suche", (q) => draw(0, q));
      if (r.selection >= 1 && r.selection <= slice.length) {
        const item = slice[r.selection - 1];
        return showGiveAmount(admin, target, item, () => draw(current, query));
      }
      let index = 1 + slice.length;
      if (current > 0 && r.selection === index++) return draw(current - 1, query);
      if (current < pages - 1 && r.selection === index++) return draw(current + 1, query);
      if (r.selection === index) showPlayerList(admin, restricted ? "adminItems" : "give");
    }).catch(() => admin.sendMessage("§cItemliste konnte nicht geöffnet werden."));
  };
  draw();
}

function showGiveAmount(admin, target, item, back) {
  if (!isAuthorized(admin)) return;
  const [label, id] = item;
  const form = new ModalFormData()
    .title("Item ausgeben")
    .textField(label + " – Anzahl", "1 bis 64", { defaultValue: "1" });
  form.show(admin).then((r) => {
    if (r.canceled) return back();
    const amount = Number(r.formValues?.[0]);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 64) {
      admin.sendMessage("§cBitte eine Anzahl von 1 bis 64 eingeben.");
      return showGiveAmount(admin, target, item, back);
    }
    try {
      const result = target.runCommand("give @s " + id + " " + amount);
      admin.sendMessage("§a" + amount + "x " + label + " an " + target.name + " ausgegeben.");
      target.sendMessage("§aDu hast " + amount + "x " + label + " vom Administrator erhalten.");
      if (result && result.successCount === 0) admin.sendMessage("§eMinecraft hat die Ausgabe möglicherweise nicht ausgeführt. Prüfe die Item-ID.");
    } catch (e) {
      admin.sendMessage("§cAusgabe fehlgeschlagen. Prüfe die Item-ID für diese Bedrock-Version.");
    }
    back();
  }).catch(() => admin.sendMessage("§cAusgabefenster konnte nicht geöffnet werden."));
}
