import type { Handler } from "./shared";
import { applyRemoteRecords } from "./shared";

const applyRemote: Handler<"sync.applyRemote"> = async (tx, payload) => {
  return applyRemoteRecords(tx, payload);
};

const mergeImport: Handler<"import.merge"> = async (tx, payload) => {
  return applyRemoteRecords(tx, payload);
};

export const syncCommands = {
  "sync.applyRemote": applyRemote,
  "import.merge": mergeImport,
} satisfies { [K in "sync.applyRemote" | "import.merge"]: Handler<K> };
