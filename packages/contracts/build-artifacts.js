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
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
    },
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
    }
  }
}
if (hasError) process.exit(1);

// Only write artifacts for our own contracts (not the entire dependency
// tree) — these are the only ones we need for local Hardhat Network tests.
const OUR_FILES = [
  "contracts/PolycastMarket.sol",
  "contracts/PolycastMarketFactory.sol",
  "contracts/resolvers/ManualResolver.sol",
  "contracts/mocks/MockERC20.sol",
];

const artifactsRoot = path.resolve(__dirname, "artifacts");

for (const file of OUR_FILES) {
  const contractsInFile = output.contracts[file];
  if (!contractsInFile) {
    console.error("Missing expected compiled file:", file);
    process.exit(1);
  }
  for (const [name, contract] of Object.entries(contractsInFile)) {
    const outDir = path.join(artifactsRoot, file);
    fs.mkdirSync(outDir, { recursive: true });
    const artifact = {
      _format: "hh-sol-artifact-1",
      contractName: name,
      sourceName: file,
      abi: contract.abi,
      bytecode: "0x" + contract.evm.bytecode.object,
      deployedBytecode: "0x" + contract.evm.deployedBytecode.object,
      linkReferences: {},
      deployedLinkReferences: {},
    };
    fs.writeFileSync(
      path.join(outDir, name + ".json"),
      JSON.stringify(artifact, null, 2),
    );
    console.log("Wrote artifact:", path.join(file, name + ".json"));
  }
}
