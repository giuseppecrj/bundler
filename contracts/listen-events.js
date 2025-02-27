import { createPublicClient, http } from "viem";
import { localhost } from "viem/chains";
import fs from "fs";
import { join } from "path";

const counterAbi = JSON.parse(
  fs.readFileSync("./out/Counter.sol/Counter.json", "utf8")
);

// Create the client
const client = createPublicClient({
  chain: localhost,
  transport: http(),
});

// Read Counter contract address from file
const counterAddress = fs
  .readFileSync("./deployed-counter-address.txt", "utf8")
  .trim();
console.log(`📋 Using Counter contract at: ${counterAddress}`);

console.log("🎧 Listening for Counter events...");

// Watch for NumberIncremented events
client.watchContractEvent({
  address: counterAddress,
  abi: counterAbi.abi,
  eventName: "NumberIncremented",
  onLogs: (logs) => {
    const newNumber = logs[0].args.newNumber;
    console.log(`\n📈 Number Incremented! New value: ${newNumber}`);
  },
});

// Watch for NumberSet events
client.watchContractEvent({
  address: counterAddress,
  abi: counterAbi.abi,
  eventName: "NumberSet",
  onLogs: (logs) => {
    const newNumber = logs[0].args.newNumber;
    console.log(`\n🎯 Number Set! New value: ${newNumber}`);
  },
});
