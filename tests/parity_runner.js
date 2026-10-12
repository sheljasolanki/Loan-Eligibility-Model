// Used by tests/test_parity.py: runs the browser engine (webui/eligibility.js) on profiles read from stdin.
const fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ["data.js", "eligibility.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "webui", f), "utf8"), ctx);
vm.runInContext("this.LOAN_DATA = LOAN_DATA;", ctx);
const D = ctx.PLE.prepare(ctx.LOAN_DATA);
const profiles = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(profiles.map((p) => ctx.PLE.run(p, D))));
