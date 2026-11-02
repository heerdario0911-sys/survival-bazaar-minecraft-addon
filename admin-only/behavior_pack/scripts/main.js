import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system
} from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const AUTHORIZED_ADMIN = "Skillet8736";
const ADMIN_COMMAND = "survivalbazaar:admin";

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerCommand(
    {
      name: ADMIN_COMMAND,
      description: "Opens the SurvivalBazaar admin panel.",
      permissionLevel: CommandPermissionLevel.Admin,
      cheatsRequired: false
    },
    (origin) => {
      const player = origin.sourceEntity;

      if (!(player instanceof Player)) {
        return {
          status: CustomCommandStatus.Failure,
          message: "This command can only be used by a player."
        };
      }

      if (player.name !== AUTHORIZED_ADMIN) {
        return {
          status: CustomCommandStatus.Failure,
          message: "Access denied. This admin command is reserved for the authorized operator."
        };
      }

      system.run(() => showAdminMenu(player));

      return {
        status: CustomCommandStatus.Success,
        message: "Opening admin panel."
      };
    }
  );
});

function showAdminMenu(player) {
  const form = new ActionFormData()
    .title("§6SurvivalBazaar | Admin")
    .body(
      "§7Authorized account: §f" + AUTHORIZED_ADMIN +
      "\n\n§aAdmin foundation is running." +
      "\n\n§7This clean pack intentionally contains no shop, marketplace, furniture, spawn eggs, or spawners yet."
    )
    .button("§aCheck admin system")
    .button("§cClose");

  form.show(player).then((response) => {
    if (response.canceled) return;

    if (response.selection === 0) {
      player.sendMessage("§a[SurvivalBazaar] Admin foundation is active.");
      showAdminMenu(player);
    }
  }).catch(() => {
    player.sendMessage("§c[SurvivalBazaar] Could not display the admin panel.");
  });
}
