import type { Area } from "../../models/task";
import type { SqliteRow } from "../../platform/executor";
import { areaFromRow, areaToParams } from "../mappers";
import { uuidv7 } from "../ids";
import { padOrderKey, type Handler } from "./shared";

const upsertArea: Handler<"area.upsert"> = async (tx, payload, ctx) => {
  const now = ctx.now();
  let existing: Area | null = null;
  if (payload.id !== undefined) {
    const rows = await tx.query<SqliteRow>(
      "SELECT * FROM areas WHERE id = ? AND deleted_at IS NULL",
      [payload.id],
    );
    existing = rows.length > 0 ? areaFromRow(rows[0] as SqliteRow) : null;
  } else {
    const rows = await tx.query<SqliteRow>(
      "SELECT * FROM areas WHERE name = ? AND deleted_at IS NULL LIMIT 1",
      [payload.name],
    );
    existing = rows.length > 0 ? areaFromRow(rows[0] as SqliteRow) : null;
  }
  const area: Area = existing
    ? {
        ...existing,
        name: payload.name,
        color: payload.color !== undefined ? (payload.color ?? null) : existing.color,
        updatedAt: now,
        revision: existing.revision + 1,
      }
    : {
        id: uuidv7(now),
        name: payload.name,
        color: payload.color ?? null,
        orderKey: padOrderKey(now),
        createdAt: now,
        updatedAt: now,
        revision: 1,
        deletedAt: null,
      };
  if (existing) {
    await tx.run("UPDATE areas SET name = ?, color = ?, updated_at = ?, revision = ? WHERE id = ?", [
      area.name,
      area.color,
      area.updatedAt,
      area.revision,
      area.id,
    ]);
  } else {
    await tx.run(
      "INSERT INTO areas (id, name, color, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      areaToParams(area),
    );
  }
  return [{ type: "area", record: area }];
};

const softDeleteArea: Handler<"area.softDelete"> = async (tx, payload, ctx) => {
  const rows = await tx.query<SqliteRow>(
    "SELECT * FROM areas WHERE id = ? AND deleted_at IS NULL",
    [payload.id],
  );
  if (rows.length === 0) throw new Error(`area not found: ${payload.id}`);
  const now = ctx.now();
  const area: Area = {
    ...areaFromRow(rows[0] as SqliteRow),
    deletedAt: now,
    updatedAt: now,
    revision: areaFromRow(rows[0] as SqliteRow).revision + 1,
  };
  await tx.run("UPDATE areas SET deleted_at = ?, updated_at = ?, revision = ? WHERE id = ?", [
    area.deletedAt,
    area.updatedAt,
    area.revision,
    area.id,
  ]);
  return [{ type: "area", record: area }];
};

export const areaCommands = {
  "area.upsert": upsertArea,
  "area.softDelete": softDeleteArea,
} satisfies { [K in "area.upsert" | "area.softDelete"]: Handler<K> };
