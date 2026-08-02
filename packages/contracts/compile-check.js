const solc = require("solc");
const fs = require("fs");
const path = require("path");

function findImports(importPath) {
  const candidates = [
    path.resolve(__dirname, importPath),
    path.resolve(__dirname, "node_modules", importPath),
    path.resolve(__dirname, "../../node_modules", importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { contents: fs.readFileSync(c, "utf8") };
    }
  }
  return { error: "File not found: " + importPath };
}

const contractsDir = path.resolve(__dirname, "contracts");

function listSolFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(listSolFiles(full));
    else if (entry.name.endsWith(".sol")) results.push(full);
  }
  return results;
}

const sources = {};
for (const file of listSolFiles(contractsDir)) {
  const rel = "contracts/" + path.relative(contractsDir, file);
  sources[rel] = { content: fs.readFileSync(file, "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    outputSelection: { "*": { "*": ["abi"] } },
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
  },
};

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImports }),
);

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      hasError = true;
      console.error("\n" + err.formattedMessage);
    } else {
      console.warn("\n" + err.formattedMessage);
    }
  }
}

if (!hasError) {
  console.log("\n✅ All contracts compiled successfully. Contracts found:");
  for (const file of Object.keys(output.contracts || {})) {
    for (const name of Object.keys(output.contracts[file])) {
      console.log(`   - ${name} (${file})`);
    }
  }
} else {
  process.exit(1);
}
