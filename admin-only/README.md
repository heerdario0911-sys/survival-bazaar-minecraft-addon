# SurvivalBazaar – Admin Only

This folder is a **separate, clean Behavior Pack** foundation. It does not reuse or modify the existing shop/furniture implementation.

## Included
- Operator-restricted custom admin command.
- Additional exact player-name allowlist: `Skillet8736`.
- A minimal in-game admin form with a status check.

## Intentionally not included
- Shop or player marketplace
- Furniture or resource-pack assets
- Spawn eggs or spawners
- Economy, balance, or purchase logic

## Command
The registered namespaced command is:

`/survivalbazaar:admin`

Minecraft custom commands are namespaced by the Script API. This source does not claim that the unqualified `/admin` alias is available on every Bedrock build.

## Install/build notes
Import the Behavior Pack folder as a pack (or package it as an `.mcpack`). Enable the required Script API support if Minecraft prompts for it. The pack has not yet been runtime-tested inside the user's Xbox world; verify it in a copy of the world before using it in the main save.
