import type { Project } from "../../models/task";
import type { SqliteRow } from "../../platform/executor";
import { findProjectByName } from "../queries";
import { projectFromRow, projectToParams } from "../mappers";
import { uuidv7 } from "../ids";
import type { Handler } from "./shared";

type ProjectCommandOp = "project.upsert" | "project.softDelete" | "project.markReviewed";

const upsertProject: Handler<"project.upsert"> = async (tx, payload, ctx) => {
  const now = ctx.now();
  let existing: Project | null = null;
  if (payload.id !== undefined) {
    const rows = await tx.query<SqliteRow>(
      "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL",
      [payload.id],
    );
    existing = rows.length > 0 ? projectFromRow(rows[0] as SqliteRow) : null;
  } else {
    existing = await findProjectByName(tx, payload.name);
  }
  const project: Project = existing
    ? {
        ...existing,
        name: payload.name,
        description: payload.description ?? existing.description,
        kind: payload.kind ?? existing.kind,
        status: payload.status ?? existing.status,
        color: payload.color !== undefined ? payload.color : existing.color,
        areaId: payload.areaId !== undefined ? payload.areaId : existing.areaId,
        reviewIntervalDays: payload.reviewIntervalDays ?? existing.reviewIntervalDays,
        updatedAt: now,
        revision: existing.revision + 1,
      }
    : {
        id: uuidv7(now),
        name: payload.name,
        description: payload.description ?? "",
        kind: payload.kind ?? "parallel",
        status: payload.status ?? "active",
        color: payload.color ?? null,
        areaId: payload.areaId ?? null,
        reviewIntervalDays: payload.reviewIntervalDays ?? 7,
        lastReviewedAt: null,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        deletedAt: null,
      };
  if (existing) {
    await tx.run(
      "UPDATE projects SET name = ?, description = ?, kind = ?, status = ?, color = ?, area_id = ?, review_interval_days = ?, last_reviewed_at = ?, updated_at = ?, revision = ?, deleted_at = ? WHERE id = ?",
      [
        project.name,
        project.description,
        project.kind,
        project.status,
        project.color,
        project.areaId,
        project.reviewIntervalDays,
        project.lastReviewedAt,
        project.updatedAt,
        project.revision,
        project.deletedAt,
        project.id,
      ],
    );
  } else {
    await tx.run(
      "INSERT INTO projects (id, name, description, kind, status, color, area_id, review_interval_days, last_reviewed_at, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      projectToParams(project),
    );
  }
  return [{ type: "project", record: project }];
};

const markProjectReviewed: Handler<"project.markReviewed"> = async (tx, payload, ctx) => {
  const rows = await tx.query<SqliteRow>(
    "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL",
    [payload.id],
  );
  if (rows.length === 0) throw new Error(`project not found: ${payload.id}`);
  const now = ctx.now();
  const project: Project = {
    ...projectFromRow(rows[0] as SqliteRow),
    lastReviewedAt: now,
    updatedAt: now,
    revision: (projectFromRow(rows[0] as SqliteRow).revision ?? 0) + 1,
  };
  await tx.run(
    "UPDATE projects SET last_reviewed_at = ?, updated_at = ?, revision = ? WHERE id = ?",
    [project.lastReviewedAt, project.updatedAt, project.revision, project.id],
  );
  return [{ type: "project", record: project }];
};

const softDeleteProject: Handler<"project.softDelete"> = async (tx, payload, ctx) => {
  const rows = await tx.query<SqliteRow>(
    "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL",
    [payload.id],
  );
  if (rows.length === 0) throw new Error(`project not found: ${payload.id}`);
  const now = ctx.now();
  const target: Project = {
    ...projectFromRow(rows[0] as SqliteRow),
    deletedAt: now,
    updatedAt: now,
  };
  target.revision = target.revision + 1;
  await tx.run(
    "UPDATE projects SET deleted_at = ?, updated_at = ?, revision = ? WHERE id = ?",
    [target.deletedAt, target.updatedAt, target.revision, target.id],
  );
  return [{ type: "project", record: target }];
};

export const projectCommands = {
  "project.upsert": upsertProject,
  "project.softDelete": softDeleteProject,
  "project.markReviewed": markProjectReviewed,
} satisfies { [K in ProjectCommandOp]: Handler<K> };
