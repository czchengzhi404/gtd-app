import type { Handler } from "./shared";

const setSetting: Handler<"settings.set"> = async (tx, payload) => {
  await tx.run(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [payload.key, String(payload.value)],
  );
  return [];
};

export const settingsCommands = {
  "settings.set": setSetting,
} satisfies { "settings.set": Handler<"settings.set"> };
