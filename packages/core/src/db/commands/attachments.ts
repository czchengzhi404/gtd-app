import type { AttachmentMeta } from "../../models/task";
import type { SqliteRow } from "../../platform/executor";
import { attachmentFromRow, attachmentToParams } from "../mappers";
import { uuidv7 } from "../ids";
import type { Handler } from "./shared";

const addAttachment: Handler<"attachment.add"> = async (tx, payload, ctx) => {
  const now = ctx.now();
  const attachment: AttachmentMeta = {
    id: uuidv7(now),
    taskId: payload.taskId,
    fileName: payload.fileName,
    mimeType: payload.mimeType ?? "application/octet-stream",
    size: payload.size ?? 0,
    storagePath: payload.storagePath,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    deletedAt: null,
  };
  await tx.run(
    "INSERT INTO attachments (id, task_id, file_name, mime_type, size, storage_path, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    attachmentToParams(attachment),
  );
  return [{ type: "attachment", record: attachment }];
};

const removeAttachment: Handler<"attachment.remove"> = async (tx, payload, ctx) => {
  const rows = await tx.query<SqliteRow>(
    "SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL",
    [payload.id],
  );
  if (rows.length === 0) throw new Error(`attachment not found: ${payload.id}`);
  const now = ctx.now();
  const removed = {
    ...attachmentFromRow(rows[0] as SqliteRow),
    deletedAt: now,
    updatedAt: now,
  };
  removed.revision = removed.revision + 1;
  await tx.run(
    "UPDATE attachments SET deleted_at = ?, updated_at = ?, revision = ? WHERE id = ?",
    [removed.deletedAt, removed.updatedAt, removed.revision, removed.id],
  );
  return [{ type: "attachment", record: removed }];
};

export const attachmentCommands = {
  "attachment.add": addAttachment,
  "attachment.remove": removeAttachment,
} satisfies { [K in "attachment.add" | "attachment.remove"]: Handler<K> };
