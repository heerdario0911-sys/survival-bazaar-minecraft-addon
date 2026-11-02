# SurvivalBazaar – Admin Only

A separate Bedrock Behavior Pack foundation. It does not contain or load the old shop/furniture implementation.

## Access control
- Custom command: `/survivalbazaar:admin`
- Command permission: operator/admin level.
- Additional exact-name allowlist: `Skillet8736`.
- Other players, including other operators, are rejected by the allowlist check.

## Admin menu functions
1. **Price management** – searchable, paginated list of common vanilla items; prices are stored as world dynamic properties.
2. **Player Coins** – view and adjust the virtual Coins balance of online players (add, set, remove). Balances are stored per player in world dynamic properties.
3. **Give items** – searchable, paginated list of ordinary items, issued to a selected online player.
4. **Admin items** – separate searchable, paginated list of spawn eggs and the spawner item. These entries exist only in this admin pack's admin menu; they are not placed in a public shop/catalog.

## Important command note
The Script API registers a namespaced custom command. Use the fully qualified form `/survivalbazaar:admin`. This pack does not claim that Minecraft exposes an unqualified `/admin` alias on every Bedrock build.

## Install
Import the `behavior_pack` folder as a Behavior Pack (or package that folder as an `.mcpack`) and activate it in the target world. The pack uses `@minecraft/server` and `@minecraft/server-ui` script modules. If Minecraft prompts for required experimental/script features, enable the ones it requests.

## Scope and test status
- No furniture or resource pack.
- No player-facing shop or marketplace is included yet.
- No spawn eggs or spawners are exposed outside the admin menu.
- Code has been committed to the `admin-only-foundation` branch. It still needs an in-world test on the user's exact Bedrock build; command registration, item identifiers, and script API compatibility should be verified before using it in the main world.
