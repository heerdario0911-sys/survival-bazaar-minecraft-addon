import { world, ItemStack, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

const STATE_KEY = "bazaar:market_state_v2";
const LEGACY_ACCOUNTS_KEY = "bazaar:accounts";
const LEGACY_LISTINGS_KEY = "bazaar:listings";
const STARTING_BALANCE_CENTS = 10000;
const STORAGE_BASE = { x: 100000, y: -63, z: 100000 };
const STORAGE_CHESTS = 20;
const STORAGE_SLOTS = 27;
const MAX_LISTINGS = STORAGE_CHESTS * STORAGE_SLOTS;

let cachedContainers;
let storageInitialized = false;

function parseJsonProperty(key, fallback) {
    try {
        const raw = world.getDynamicProperty(key);
        return typeof raw === "string" ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function saveState(state) {
    const raw = JSON.stringify(state);
    if (raw.length > 30000) {
        throw new Error("Der Marktplatz-Speicher ist voll.");
    }
    world.setDynamicProperty(STATE_KEY, raw);
}

function loadState() {
    const saved = parseJsonProperty(STATE_KEY, null);

    if (
        saved &&
        typeof saved === "object" &&
        saved.accounts &&
        typeof saved.accounts === "object" &&
        Array.isArray(saved.listings)
    ) {
        if (!("pendingTransaction" in saved)) {
            saved.pendingTransaction = null;
        }
        return saved;
    }

    const accounts = parseJsonProperty(LEGACY_ACCOUNTS_KEY, {});
    const oldListings = parseJsonProperty(LEGACY_LISTINGS_KEY, []);
    const sbListings = parseJsonProperty("sb_marketplace", []);
    const oldPending = parseJsonProperty("sb_pending_payouts", {});

    const migratedSbListings = Array.isArray(sbListings)
        ? sbListings.flatMap(offer => {
            const itemId = String(offer.itemId ?? "");
            const totalAmount = Number(offer.amount ?? 0);
            const totalPrice = Number(offer.price ?? 0);

            if (
                !itemId ||
                !Number.isSafeInteger(totalAmount) ||
                totalAmount <= 0 ||
                !Number.isSafeInteger(totalPrice) ||
                totalPrice < 0
            ) {
                return [];
            }

            let maxStack = 64;

            try {
                maxStack = new ItemStack(itemId, 1).maxAmount;
            } catch {
                return [];
            }

            const sellerName = String(offer.seller ?? offer.sellerName ?? "unbekannt");
            const result = [];
            let remainingAmount = totalAmount;
            let remainingPrice = totalPrice;
            let part = 0;

            while (remainingAmount > 0) {
                const amount = Math.min(maxStack, remainingAmount);
                const price = amount === remainingAmount
                    ? remainingPrice
                    : Math.floor(totalPrice * amount / totalAmount);

                result.push({
                    id: String(offer.id ?? (Date.now() + "-" + Math.random())) + "-part-" + (++part),
                    sellerId: sellerName,
                    sellerName,
                    itemId,
                    itemName: itemId.replace(/^(minecraft|survivalbazaar):/, "").replaceAll("_", " "),
                    amount,
                    price,
                    legacy: true
                });

                remainingAmount -= amount;
                remainingPrice -= price;
            }

            return result;
        })
        : [];

    const state = {
        version: 2,
        accounts: accounts && typeof accounts === "object" && !Array.isArray(accounts) ? accounts : {},
        listings: [
            ...(Array.isArray(oldListings) ? oldListings : []),
            ...migratedSbListings
        ],
        pendingPayouts: oldPending && typeof oldPending === "object" && !Array.isArray(oldPending) ? oldPending : {},
        pendingTransaction: null
    };

    saveState(state);
    return state;
}

export function getMarketplaceAccounts() {
    return loadState().accounts;
}

export function getMarketplaceListings() {
    return loadState().listings;
}

export function getMarketplaceBalance(playerId) {
    const state = loadState();

    if (!Number.isSafeInteger(state.accounts[playerId])) {
        state.accounts[playerId] = STARTING_BALANCE_CENTS;
        saveState(state);
    }

    return state.accounts[playerId];
}

export function migrateLegacyPlayerData(player) {
    if (!player || typeof player.id !== "string") return;

    const state = loadState();

    const hadIdBalance = Number.isSafeInteger(state.accounts[player.id]);
    const namedBalance = Number(state.accounts[player.name]);
    const oldPlayerBalance = Number(player.getDynamicProperty("sb_coins"));

    if (!hadIdBalance) {
        if (Number.isSafeInteger(namedBalance) && namedBalance >= 0) {
            state.accounts[player.id] = namedBalance;
        } else if (Number.isSafeInteger(oldPlayerBalance) && oldPlayerBalance >= 0) {
            state.accounts[player.id] = oldPlayerBalance;
        } else {
            state.accounts[player.id] = STARTING_BALANCE_CENTS;
        }
    } else if (
        player.name !== player.id &&
        Number.isSafeInteger(namedBalance) &&
        namedBalance > 0
    ) {
        // Older offline sales may have been credited under the seller's name.
        state.accounts[player.id] += namedBalance;
    }

    if (state.accounts[player.name] !== undefined && player.name !== player.id) {
        delete state.accounts[player.name];
    }

    for (const offer of state.listings) {
        if (offer.sellerId === player.name) {
            offer.sellerId = player.id;
            offer.sellerName = player.name;
        }
    }

    const pending = Number(state.pendingPayouts?.[player.name] ?? 0);
    if (Number.isSafeInteger(pending) && pending > 0) {
        state.accounts[player.id] =
            Number(state.accounts[player.id] ?? STARTING_BALANCE_CENTS) + pending;
        delete state.pendingPayouts[player.name];
    }

    saveState(state);

    try {
        player.setDynamicProperty("sb_coins", undefined);
    } catch {}
}

export function setMarketplaceBalance(playerId, amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new Error("Ungültiger Kontostand.");
    }

    const state = loadState();
    state.accounts[playerId] = amount;
    saveState(state);
}

function ensureStorage() {
    const dimension = world.getDimension("overworld");

    // The ticking area keeps the hidden storage chunk loaded between visits.
    try {
        dimension.runCommand(
            "tickingarea add circle " +
            STORAGE_BASE.x + " 0 " +
            STORAGE_BASE.z + " 2 sb_market"
        );
    } catch {
        // An existing ticking area with this name is expected on later loads.
    }

    const containers = [];

    for (let i = 0; i < STORAGE_CHESTS; i++) {
        const location = {
            x: STORAGE_BASE.x + i * 2,
            y: STORAGE_BASE.y,
            z: STORAGE_BASE.z
        };

        let block = dimension.getBlock(location);

        if (!block) {
            throw new Error("Der versteckte Lagerbereich ist noch nicht geladen.");
        }

        if (block.typeId !== "minecraft:chest") {
            dimension.setBlockType(location, "minecraft:chest");
            block = dimension.getBlock(location);
        }

        const container = block?.getComponent("minecraft:inventory")?.container;

        if (!container || !container.isValid) {
            throw new Error("Das versteckte Lager konnte nicht geöffnet werden.");
        }

        containers.push(container);
    }

    cachedContainers = containers;
    storageInitialized = true;
    return containers;
}

function getStorageContainers() {
    if (!storageInitialized || !cachedContainers) {
        return ensureStorage();
    }

    if (cachedContainers.some(container => !container.isValid)) {
        storageInitialized = false;
        cachedContainers = undefined;
        return ensureStorage();
    }

    return cachedContainers;
}

function findFreeStorageSlot(state, containers) {
    const occupied = new Set();

    for (const offer of state.listings) {
        if (
            Number.isInteger(offer.storageIndex) &&
            Number.isInteger(offer.storageSlot)
        ) {
            occupied.add(offer.storageIndex + ":" + offer.storageSlot);
        }
    }

    for (let chest = 0; chest < containers.length; chest++) {
        const container = containers[chest];

        for (let slot = 0; slot < container.size; slot++) {
            if (
                !occupied.has(chest + ":" + slot) &&
                !container.getItem(slot)
            ) {
                return { storageIndex: chest, storageSlot: slot };
            }
        }
    }

    return undefined;
}

function canFitExactStack(inventory, stack) {
    if (!inventory || !stack) return false;

    let capacity = 0;

    for (let i = 0; i < inventory.size; i++) {
        const existing = inventory.getItem(i);

        if (!existing) {
            capacity += stack.maxAmount;
        } else if (existing.isStackableWith(stack)) {
            capacity += Math.max(0, existing.maxAmount - existing.amount);
        }

        if (capacity >= stack.amount) return true;
    }

    return false;
}

function restoreLeftover(container, slot, leftover) {
    if (!leftover) return;

    const current = container.getItem(slot);

    if (!current) {
        container.setItem(slot, leftover);
        return;
    }

    if (current.isStackableWith(leftover)) {
        const restored = current.clone();
        const total = current.amount + leftover.amount;

        if (total <= restored.maxAmount) {
            restored.amount = total;
            container.setItem(slot, restored);
        }
    }
}

function clearPendingTransaction() {
    const state = loadState();
    state.pendingTransaction = null;
    saveState(state);
}

function finalizePendingTransaction() {
    const state = loadState();
    const transaction = state.pendingTransaction;

    if (!transaction) return true;

    const containers = getStorageContainers();
    const source = containers[transaction.storageIndex];
    const remaining = source?.getItem(transaction.storageSlot);

    // If the original stack is still in storage, the transfer did not finish.
    if (remaining) {
        state.pendingTransaction = null;
        saveState(state);
        return false;
    }

    if (transaction.type === "buy") {
        const buyerBalance = Number(
            state.accounts[transaction.buyerId] ?? STARTING_BALANCE_CENTS
        );
        const sellerBalance = Number(
            state.accounts[transaction.sellerId] ?? 0
        );

        state.accounts[transaction.buyerId] =
            buyerBalance - transaction.price;
        state.accounts[transaction.sellerId] =
            sellerBalance + transaction.price;
    }

    state.listings = state.listings.filter(
        offer => offer.id !== transaction.offerId
    );
    state.pendingTransaction = null;

    // Accounts, listings and the transaction journal are committed together.
    saveState(state);
    return true;
}

function recoverPendingTransaction() {
    try {
        const state = loadState();
        if (!state.pendingTransaction) return;

        finalizePendingTransaction();
    } catch (error) {
        console.warn(
            "[SurvivalBazaar] Eine Marktplatz-Transaktion wird später erneut geprüft:",
            error?.message ?? error
        );
    }
}

function tell(player, message) {
    try {
        player.sendMessage("§6[Bazaar] §r" + message);
    } catch {}
}

function formatMoney(cents) {
    return (cents / 100).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + " €";
}

function parseMoneyToCents(value) {
    let normalized = String(value ?? "")
        .trim()
        .replace(/€/g, "")
        .replace(/\s/g, "");

    if (normalized.includes(",")) {
        normalized = normalized.replace(/\./g, "").replace(",", ".");
    }

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return NaN;

    const cents = Math.round(Number(normalized) * 100);
    return Number.isSafeInteger(cents) && cents > 0 ? cents : NaN;
}

function addTextField(form, label, placeholder, defaultValue) {
    form.textField(String(label), String(placeholder), {
        defaultValue: String(defaultValue ?? "")
    });
}

function getItemIcon(itemId) {
    const name = String(itemId).replace(/^minecraft:/, "").replace(/^survivalbazaar:/, "");

    const blockIcons = {
        stone: "textures/blocks/stone",
        cobblestone: "textures/blocks/cobblestone",
        dirt: "textures/blocks/dirt",
        grass_block: "textures/blocks/grass_side",
        sand: "textures/blocks/sand",
        red_sand: "textures/blocks/red_sand",
        gravel: "textures/blocks/gravel",
        oak_log: "textures/blocks/log_oak",
        oak_planks: "textures/blocks/planks_oak",
        glass: "textures/blocks/glass",
        bricks: "textures/blocks/brick",
        obsidian: "textures/blocks/obsidian",
        netherrack: "textures/blocks/netherrack",
        diamond_block: "textures/blocks/diamond_block",
        gold_block: "textures/blocks/gold_block",
        iron_block: "textures/blocks/iron_block",
        emerald_block: "textures/blocks/emerald_block",
        coal_block: "textures/blocks/coal_block",
        lapis_block: "textures/blocks/lapis_block",
        redstone_block: "textures/blocks/redstone_block",
        chest: "textures/blocks/chest_front",
        crafting_table: "textures/blocks/crafting_table_front",
        furnace: "textures/blocks/furnace_front",
        tnt: "textures/blocks/tnt_side",
        bookshelf: "textures/blocks/bookshelf"
    };

    return blockIcons[name] ?? "textures/items/" + name;
}

function itemLabel(stack) {
    if (stack.nameTag) return stack.nameTag;
    return stack.typeId
        .replace(/^(minecraft|survivalbazaar):/, "")
        .replaceAll("_", " ");
}

function getOfferStack(offer, containers) {
    if (
        !Number.isInteger(offer.storageIndex) ||
        !Number.isInteger(offer.storageSlot)
    ) {
        return undefined;
    }

    return containers[offer.storageIndex]?.getItem(offer.storageSlot);
}

function ensureOfferStored(offer, containers) {
    if (
        Number.isInteger(offer.storageIndex) &&
        Number.isInteger(offer.storageSlot)
    ) {
        return {
            offer,
            containers,
            stack: getOfferStack(offer, containers)
        };
    }

    const state = loadState();
    const target = state.listings.find(item => item.id === offer.id);
    if (!target) return undefined;

    const free = findFreeStorageSlot(state, containers);
    if (!free) return undefined;

    try {
        const stack = new ItemStack(target.itemId, target.amount);
        containers[free.storageIndex].setItem(free.storageSlot, stack);

        target.storageIndex = free.storageIndex;
        target.storageSlot = free.storageSlot;
        target.storageV2 = true;

        try {
            saveState(state);
        } catch (error) {
            containers[free.storageIndex].setItem(free.storageSlot, undefined);
            throw error;
        }

        return {
            offer: target,
            containers,
            stack
        };
    } catch {
        return undefined;
    }
}

function prepareTransaction(type, offer, player) {
    const state = loadState();

    if (state.pendingTransaction) {
        throw new Error("Eine andere Marktplatz-Transaktion wird noch abgeschlossen.");
    }

    const transaction = {
        id: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        type,
        offerId: offer.id,
        buyerId: type === "buy" ? player.id : undefined,
        sellerId: offer.sellerId,
        price: offer.price,
        storageIndex: offer.storageIndex,
        storageSlot: offer.storageSlot
    };

    state.pendingTransaction = transaction;
    saveState(state);
    return transaction;
}

function findCurrentOffer(offerId) {
    const state = loadState();
    const index = state.listings.findIndex(offer => offer.id === offerId);

    if (index < 0) return undefined;

    return {
        state,
        index,
        offer: state.listings[index]
    };
}

async function buyOffer(player, offerId, ui) {
    recoverPendingTransaction();

    const current = findCurrentOffer(offerId);
    if (!current) {
        ui.tell(player, "Dieses Angebot ist nicht mehr verfügbar.");
        return;
    }

    let offer = current.offer;

    if (offer.sellerId === player.id) {
        ui.tell(player, "Du kannst dein eigenes Angebot nicht kaufen.");
        return;
    }

    if (ui.getBalance(player.id) < offer.price) {
        ui.tell(player, "Dein Euro-Guthaben reicht nicht aus.");
        return;
    }

    const inventory = player.getComponent("minecraft:inventory")?.container;
    if (!inventory) {
        ui.tell(player, "Dein Inventar konnte nicht geöffnet werden.");
        return;
    }

    let containers;

    try {
        containers = getStorageContainers();
    } catch (error) {
        ui.tell(player, "Der Marktplatz-Speicher ist noch nicht bereit.");
        return;
    }

    const stored = ensureOfferStored(offer, containers);

    if (!stored) {
        ui.tell(player, "Der Gegenstand dieses Angebots konnte nicht wiederhergestellt werden.");
        return;
    }

    offer = stored.offer;
    containers = stored.containers;
    const stack = stored.stack;

    if (!stack) {
        ui.tell(player, "Der angebotene Gegenstand fehlt im Marktplatz-Lager. Bitte informiere den Admin.");
        return;
    }

    if (!canFitExactStack(inventory, stack)) {
        ui.tell(player, "Dein Inventar hat nicht genug Platz für diesen Gegenstand.");
        return;
    }

    const confirm = new MessageFormData()
        .title("Angebot kaufen")
        .body(
            stack.amount + "× " + itemLabel(stack) +
            " von " + offer.sellerName +
            " für " + formatMoney(offer.price) + " kaufen?"
        )
        .button1("Kaufen")
        .button2("Abbrechen");

    const response = await confirm.show(player);

    if (response.canceled || response.selection !== 0) return;

    const latest = findCurrentOffer(offer.id);

    if (!latest || latest.offer.storageIndex !== offer.storageIndex ||
        latest.offer.storageSlot !== offer.storageSlot) {
        ui.tell(player, "Dieses Angebot wurde inzwischen geändert.");
        return;
    }

    const source = containers[latest.offer.storageIndex];
    const currentStack = source?.getItem(latest.offer.storageSlot);

    if (!currentStack || !canFitExactStack(inventory, currentStack)) {
        ui.tell(player, "Der Gegenstand ist nicht mehr verfügbar oder dein Inventar ist voll.");
        return;
    }

    let transaction;

    try {
        transaction = prepareTransaction("buy", latest.offer, player);
    } catch (error) {
        ui.tell(player, "Die Zahlung konnte nicht vorbereitet werden: " + (error?.message ?? String(error)));
        return;
    }

    try {
        const leftover = source.transferItem(
            latest.offer.storageSlot,
            inventory
        );

        if (leftover) {
            restoreLeftover(source, latest.offer.storageSlot, leftover);
            clearPendingTransaction();
            ui.tell(player, "Die Übergabe wurde abgebrochen. Dein Inventar konnte den Gegenstand nicht vollständig aufnehmen.");
            return;
        }

        if (source.getItem(latest.offer.storageSlot)) {
            clearPendingTransaction();
            ui.tell(player, "Die Übergabe konnte nicht abgeschlossen werden. Es wurde nichts berechnet.");
            return;
        }

        finalizePendingTransaction();

        ui.tell(
            player,
            "Kauf erfolgreich! " + formatMoney(offer.price) +
            " wurden bezahlt."
        );

        const seller = world.getAllPlayers().find(
            online => online.id === offer.sellerId
        );

        if (seller) {
            tell(
                seller,
                "Dein Angebot wurde verkauft. Du hast " +
                formatMoney(offer.price) + " erhalten."
            );
        }
    } catch (error) {
        // If the stack already left storage, the saved journal completes the payment later.
        recoverPendingTransaction();
        ui.tell(
            player,
            "Der Kauf wird geprüft. Falls der Gegenstand bereits übergeben wurde, wird die Zahlung automatisch abgeschlossen."
        );
        console.warn("[SurvivalBazaar] Kaufabwicklung:", error?.message ?? error);
    }
}

async function cancelOffer(player, offerId, ui) {
    recoverPendingTransaction();

    const current = findCurrentOffer(offerId);

    if (!current || current.offer.sellerId !== player.id) {
        ui.tell(player, "Dieses eigene Angebot wurde nicht gefunden.");
        return;
    }

    let offer = current.offer;
    const inventory = player.getComponent("minecraft:inventory")?.container;

    if (!inventory) {
        ui.tell(player, "Dein Inventar konnte nicht geöffnet werden.");
        return;
    }

    let containers;

    try {
        containers = getStorageContainers();
    } catch {
        ui.tell(player, "Der Marktplatz-Speicher ist noch nicht bereit.");
        return;
    }

    const stored = ensureOfferStored(offer, containers);

    if (!stored || !stored.stack) {
        ui.tell(player, "Der Gegenstand fehlt im Marktplatz-Lager. Bitte informiere den Admin.");
        return;
    }

    offer = stored.offer;
    containers = stored.containers;
    const stack = stored.stack;

    if (!canFitExactStack(inventory, stack)) {
        ui.tell(player, "Dein Inventar hat nicht genug Platz für die Rückgabe.");
        return;
    }

    const confirm = new MessageFormData()
        .title("Angebot zurücknehmen")
        .body(
            stack.amount + "× " + itemLabel(stack) +
            " zurück in dein Inventar nehmen?"
        )
        .button1("Zurücknehmen")
        .button2("Abbrechen");

    const response = await confirm.show(player);

    if (response.canceled || response.selection !== 0) return;

    let transaction;

    try {
        transaction = prepareTransaction("cancel", offer, player);
    } catch (error) {
        ui.tell(player, "Das Angebot konnte nicht zurückgenommen werden: " + (error?.message ?? String(error)));
        return;
    }

    try {
        const source = containers[offer.storageIndex];
        const leftover = source.transferItem(offer.storageSlot, inventory);

        if (leftover) {
            restoreLeftover(source, offer.storageSlot, leftover);
            clearPendingTransaction();
            ui.tell(player, "Die Rückgabe wurde abgebrochen. Dein Inventar ist voll.");
            return;
        }

        if (source.getItem(offer.storageSlot)) {
            clearPendingTransaction();
            ui.tell(player, "Die Rückgabe konnte nicht abgeschlossen werden.");
            return;
        }

        finalizePendingTransaction();
        ui.tell(player, "Dein Angebot wurde zurückgenommen.");
    } catch (error) {
        recoverPendingTransaction();
        ui.tell(player, "Die Rückgabe wird geprüft. Bitte öffne den Marktplatz erneut.");
        console.warn("[SurvivalBazaar] Angebotsrückgabe:", error?.message ?? error);
    }
}

async function openMyOffers(player, ui) {
    recoverPendingTransaction();

    const own = loadState().listings.filter(
        offer => offer && offer.sellerId === player.id
    );

    const visible = own.slice(0, 25);

    const form = new ActionFormData()
        .title("§l§eMEINE ANGEBOTE")
        .body(
            visible.length
                ? "§7Wähle ein Angebot, um es zurückzunehmen."
                : "§7Du hast keine aktiven Angebote."
        );

    for (const offer of visible) {
        const containers = getStorageContainers();
        const stack = getOfferStack(offer, containers);
        const label = stack ? itemLabel(stack) : (offer.itemName ?? offer.itemId);

        form.button(
            label + " ×" + offer.amount +
            "\n§6" + formatMoney(offer.price),
            getItemIcon(offer.itemId)
        );
    }

    form.button("§7Zurück");

    const response = await form.show(player);

    if (response.canceled || response.selection === visible.length) {
        return openPlayerMarketplace(player, ui);
    }

    const selected = visible[response.selection];

    if (selected) {
        await cancelOffer(player, selected.id, ui);
    }

    return openMyOffers(player, ui);
}

async function createListing(player, ui) {
    let containers;

    try {
        containers = getStorageContainers();
    } catch {
        ui.tell(player, "Der Marktplatz-Speicher wird gerade vorbereitet. Bitte versuche es gleich erneut.");
        return;
    }

    const inventory = player.getComponent("minecraft:inventory")?.container;
    if (!inventory) {
        ui.tell(player, "Dein Inventar konnte nicht geöffnet werden.");
        return;
    }

    const selectedSlot = player.selectedSlotIndex;
    const held = inventory.getItem(selectedSlot);

    if (!held) {
        ui.tell(player, "Halte den Gegenstand, den du anbieten möchtest, in deiner Hand.");
        return;
    }

    const modal = new ModalFormData().title("Item anbieten");
    addTextField(modal, "Anzahl (maximal " + held.amount + ")", "z. B. 1", "1");
    addTextField(modal, "Gesamtpreis in Euro", "z. B. 12,50", "1,00");

    const response = await modal.show(player);

    if (response.canceled) return;

    const amount = Number(String(response.formValues?.[0] ?? "").trim());
    const price = parseMoneyToCents(response.formValues?.[1]);

    if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > held.amount ||
        !Number.isSafeInteger(price) ||
        price <= 0
    ) {
        ui.tell(player, "Ungültige Anzahl oder Preis.");
        return;
    }

    const state = loadState();

    if (state.pendingTransaction) {
        ui.tell(player, "Eine andere Marktplatz-Transaktion wird noch abgeschlossen.");
        return;
    }

    if (state.listings.length >= MAX_LISTINGS) {
        ui.tell(player, "Der Marktplatz ist voll. Es können maximal " + MAX_LISTINGS + " Angebote gleichzeitig aktiv sein.");
        return;
    }

    const free = findFreeStorageSlot(state, containers);

    if (!free) {
        ui.tell(player, "Der Marktplatz-Speicher ist voll. Bitte nimm zuerst eigene Angebote zurück.");
        return;
    }

    const original = held.clone();
    const offeredStack = held.clone();
    offeredStack.amount = amount;

    const offer = {
        id: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        sellerId: player.id,
        sellerName: player.name,
        itemId: held.typeId,
        itemName: itemLabel(held),
        amount,
        price,
        storageIndex: free.storageIndex,
        storageSlot: free.storageSlot,
        storageV2: true
    };

    try {
        containers[free.storageIndex].setItem(
            free.storageSlot,
            offeredStack
        );

        if (amount === original.amount) {
            inventory.setItem(selectedSlot, undefined);
        } else {
            const remainder = original.clone();
            remainder.amount = original.amount - amount;
            inventory.setItem(selectedSlot, remainder);
        }

        state.listings.push(offer);
        saveState(state);

        ui.tell(
            player,
            "Dein Angebot wurde eingestellt: " +
            amount + "× " + offer.itemName +
            " für " + formatMoney(price) + "."
        );
    } catch (error) {
        try {
            inventory.setItem(selectedSlot, original);
            containers[free.storageIndex].setItem(free.storageSlot, undefined);
        } catch {}

        ui.tell(
            player,
            "Das Angebot konnte nicht gespeichert werden: " +
            (error?.message ?? String(error))
        );
    }
}

export async function openPlayerMarketplace(player, ui) {
    try {
        getStorageContainers();
        recoverPendingTransaction();
    } catch (error) {
        ui.tell(
            player,
            "Der Marktplatz-Speicher ist noch nicht bereit. Bitte warte einen Moment und öffne den Marktplatz erneut."
        );
        console.warn("[SurvivalBazaar] Speicher nicht bereit:", error?.message ?? error);
        return;
    }

    const state = loadState();
    const offers = state.listings.filter(
        offer => offer && offer.id && offer.sellerId !== player.id
    );
    const visible = offers.slice(0, 25);

    const form = new ActionFormData()
        .title("§l§bSPIELER-MARKTPLATZ")
        .body(
            "§7Angebote anderer Spieler.\n" +
            "§7Dein Guthaben: §6" + ui.formatMoney(ui.getBalance(player.id))
        );

    for (const offer of visible) {
        const containers = getStorageContainers();
        const stack = getOfferStack(offer, containers);
        const label = stack ? itemLabel(stack) : (offer.itemName ?? offer.itemId);

        form.button(
            label + " ×" + offer.amount +
            "\n§6" + ui.formatMoney(offer.price) +
            " §8| §7von " + offer.sellerName,
            getItemIcon(offer.itemId)
        );
    }

    form.button("§eMeine Angebote verwalten");
    form.button("§aEigenes Item anbieten");
    form.button("§7Zurück");

    const response = await form.show(player);

    if (response.canceled) return;

    if (response.selection < visible.length) {
        const offer = visible[response.selection];
        if (offer) await buyOffer(player, offer.id, ui);
        return openPlayerMarketplace(player, ui);
    }

    if (response.selection === visible.length) {
        return openMyOffers(player, ui);
    }

    if (response.selection === visible.length + 1) {
        await createListing(player, ui);
        return openPlayerMarketplace(player, ui);
    }
}

export function initializeMarketplace() {
    try {
        loadState();
    } catch (error) {
        console.warn("[SurvivalBazaar] Marktplatzdaten konnten nicht geladen werden:", error?.message ?? error);
    }

    system.runTimeout(() => {
        try {
            getStorageContainers();
            recoverPendingTransaction();
            console.warn("[SurvivalBazaar] Verstecktes Marktplatz-Lager bereit.");
        } catch (error) {
            console.warn(
                "[SurvivalBazaar] Lagerinitialisierung fehlgeschlagen. Prüfe die Ticking Area und die Welt-Höhe:",
                error?.message ?? error
            );
        }
    }, 40);
}
