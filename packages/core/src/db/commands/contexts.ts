import type { Context } from "../../models/task";
import { findContextByName } from "../queries";
import { contextFromRow, contextToParams } from "../mappers";
import { uuidv7 } from "../ids";
import type { Handler } from "./shared";

const upsertContext: Handler<"context.upsert"> = async (tx, payload, ctx) => {
  const now = ctx.now();
  const name = payload.name.trim().replace(/^@+/, "").slice(0, 100);
  if (name.length === 0) throw new Error("context name is empty");
  const existing = await findContextByName(tx, name);
  const context: Context = existing
    ? {
        ...existing,
        color: payload.color !== undefined ? (payload.color ?? null) : existing.color,
        icon: payload.icon !== undefined ? (payload.icon ?? null) : existing.icon,
        updatedAt: now,
        revision: existing.revision + 1,
      }
    : {
        id: uuidv7(now),
        name,
        color: payload.color ?? null,
        icon: payload.icon ?? null,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        deletedAt: null,
      };
  if (existing) {
    await tx.run(
      "UPDATE contexts SET color = ?, icon = ?, updated_at = ?, revision = ? WHERE id = ?",
      [context.color, context.icon, context.updatedAt, context.revision, context.id],
    );
  } else {
    await tx.run(
      "INSERT INTO contexts (id, name, color, icon, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      contextToParams(context),
    );
  }
  return [{ type: "context", record: context }];
};

export const contextCommands = {
  "context.upsert": upsertContext,
} satisfies { "context.upsert": Handler<"context.upsert"> };
