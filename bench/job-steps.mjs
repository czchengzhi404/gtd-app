import { execFileSync } from "node:child_process";

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

for (const id of process.argv.slice(2)) {
  const name = gh(["api", `repos/czchengzhi404/gtd-app/actions/jobs/${id}`, "--jq", ".name"]);
  console.log("===", name);
  const steps = JSON.parse(
    gh(["api", `repos/czchengzhi404/gtd-app/actions/jobs/${id}`, "--jq", ".steps"]),
  );
  for (const step of steps) {
    console.log(`  ${step.conclusion ?? step.status}  ${step.name}`);
  }
}
