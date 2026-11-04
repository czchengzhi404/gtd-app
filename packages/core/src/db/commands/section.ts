import type { Section } from "../../models/task";
import { sectionToParams } from "../mappers";
import { uuidv7 } from "../ids";
import { padOrderKey, type Handler } from "./shared";

const createSection: Handler<"section.create"> = async (tx, payload, ctx) => {
  const now = ctx.now();
  const section: Section = {
    id: uuidv7(now),
    projectId: payload.projectId,
    name: payload.name,
    orderKey: padOrderKey(now),
    createdAt: now,
    updatedAt: now,
    revision: 1,
    deletedAt: null,
  };
  await tx.run(
    "INSERT INTO sections (id, project_id, name, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    sectionToParams(section),
  );
  return [{ type: "section", record: section }];
};

export const sectionCommands = {
  "section.create": createSection,
} satisfies { "section.create": Handler<"section.create"> };
