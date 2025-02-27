import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

// Get the current file's directory
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Chain configuration
const localHostChain = {
  id: 31337,
  name: "Localhost",
  network: "localhost",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
    public: {
      http: ["http://127.0.0.1:8545"],
    },
  },
};

// Read and parse the ABI file
const createSpaceAbi = JSON.parse(
  readFileSync(
    join(__dirname, "abi/CreateSpace.sol/CreateSpaceFacet.abi.json"),
    "utf8"
  )
);

// Create the client
const client = createPublicClient({
  chain: localHostChain,
  transport: http(),
});

// CreateSpace contract address
const createSpaceAddress = "0x5081a39b8A5f0E35a8D959395a630b68B74Dd30f";

console.log("🎧 Listening for CreateSpace events...");
console.log(`📋 Contract address: ${createSpaceAddress}`);

// Check for past events first
async function checkPastEvents() {
  console.log("🔍 Checking for past SpaceCreated events...");

  try {
    const pastLogs = await client.getContractEvents({
      address: createSpaceAddress,
      abi: createSpaceAbi,
      eventName: "SpaceCreated",
      fromBlock: 0n,
      toBlock: "latest",
    });

    if (pastLogs.length > 0) {
      console.log(`✅ Found ${pastLogs.length} past SpaceCreated events:`);
      pastLogs.forEach((log, index) => {
        const { owner, tokenId, space } = log.args;
        console.log(`\n📜 Past Event #${index + 1}:`);
        console.log(`👤 Owner: ${owner}`);
        console.log(`🔢 Token ID: ${tokenId}`);
        console.log(`📍 Space Address: ${space}`);
        console.log(`🧾 Transaction Hash: ${log.transactionHash}`);
        console.log(`📦 Block Number: ${log.blockNumber}`);
      });
    } else {
      console.log("❌ No past SpaceCreated events found");
    }
  } catch (error) {
    console.error("❌ Error fetching past events:", error);
  }
}

// Run the past events check
checkPastEvents();

// Watch for SpaceCreated events
const unwatch = client.watchContractEvent({
  address: createSpaceAddress,
  abi: createSpaceAbi,
  eventName: "SpaceCreated",
  onLogs: (logs) => {
    const { owner, tokenId, space } = logs[0].args;
    console.log("\n✨ New Space Created!");
    console.log(`👤 Owner: ${owner}`);
    console.log(`🔢 Token ID: ${tokenId}`);
    console.log(`📍 Space Address: ${space}`);
    console.log(`🧾 Transaction Hash: ${logs[0].transactionHash}`);
    console.log(`📦 Block Number: ${logs[0].blockNumber}`);
  },
  onError: (error) => {
    console.error("❌ Event watching error:", error);
  },
});

console.log("⏳ Waiting for new events...");

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n🛑 Stopping event listener...");
  unwatch();
  process.exit(0);
});
