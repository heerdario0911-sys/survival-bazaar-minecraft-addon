# SurvivalBazaar – Admin Only

This is a separate, clean Minecraft Bedrock Behavior Pack. It does not reuse or load the previous shop/furniture implementation.

## Access control
- Registered command: `survivalbazaar:admin`.
- Minecraft also exposes the short chat alias `/admin` for a namespaced custom command.
- Native permission: `CommandPermissionLevel.Any` – no Operator permission is required.
- Exact player-name allowlist: `Skillet8736` and `Kiwi175031`.
- Only these two exact names can open or use the admin menus; all other players, including operators, are rejected.

## Admin menu
1. **Price management** – searchable, paginated catalog of common vanilla items. Prices are saved as world dynamic properties.
2. **Player Coins** – view and adjust the Coins balance of online players: add, set, or remove. Balances are stored per player in world dynamic properties.
3. **Give items** – searchable, paginated catalog of ordinary items, issued to a selected online player.
4. **Admin items** – separate searchable, paginated catalog of spawn eggs and the spawner item. These are only accessible from the admin menu and are not part of any public shop/catalog.

## Scope
- No furniture.
- No resource pack.
- No player-facing shop or marketplace yet.
- Spawn eggs and spawner are only in the admin area.
- Item search and page navigation are included in the item/price lists.

## Version target
Configured for Minecraft Bedrock 1.26.60 / 26.60 with:
- `@minecraft/server` 2.11.0
- `@minecraft/server-ui` 2.3.0

## Test status
The changes have been merged into the repository's `main` branch (PR #1). The pack has not yet been run inside the user's Xbox world. Verify command registration and each item identifier in a copy of the world before enabling it in the main save.
