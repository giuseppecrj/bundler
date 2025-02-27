import {
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { createSmartAccountClient } from "permissionless/clients";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { entryPoint06Address } from "viem/account-abstraction";
import { parseEther } from "viem/utils";

// Get the current file's directory
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Read and parse the ABI file
const counterAbi = JSON.parse(
  readFileSync(join(__dirname, "out/Counter.sol/Counter.json"), "utf8")
);

// Counter contract address from your deployment
const counterAddress = readFileSync(
  "./deployed-counter-address.txt",
  "utf8"
).trim();

// Example private key (replace with your actual private key)
const privateKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(privateKey);

// Remove the localhost import and create our own chain config
const localHostChain = {
  id: 31337, // Anvil's default chain ID
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

// Create the public client for the local chain
const publicClient = createPublicClient({
  chain: localHostChain,
  transport: http(),
});

// Create wallet client for funding
const walletClient = createWalletClient({
  account,
  chain: localHostChain,
  transport: http(),
});

// Create the bundler client
const bundlerClient = createPimlicoClient({
  transport: http("http://localhost:4337"),
  entryPoint: {
    address: entryPoint06Address,
    version: "0.6",
  },
});

async function main() {
  try {
    console.log("🚀 Preparing user operation to increment counter...");

    // Get the EOA address
    const eoaAddress = account.address;
    console.log(`👛 EOA address: ${eoaAddress}`);

    // Create Simple Smart Account instance
    const simpleAccount = await toSimpleSmartAccount({
      client: publicClient,
      owner: account,
      nonceKey: 0n,
      entryPoint: {
        address: entryPoint06Address,
        version: "0.6",
      },
    });

    // Get the account address
    const accountAddress = simpleAccount.address;
    console.log(`📱 Smart Account address: ${accountAddress}`);

    // Initialize the account if needed
    const isAccountDeployed = await publicClient.getCode({
      address: accountAddress,
    });
    if (!isAccountDeployed) {
      console.log(
        "🏗️ Smart Account not deployed yet. It will be deployed with the first transaction."
      );
    }

    // Fund the smart account
    // Check current balance
    const balance = await publicClient.getBalance({ address: accountAddress });
    console.log("💰 Current balance:", balance);
    if (balance === 0n) {
      console.log("💰 Funding smart account...");
      const fundTx = await walletClient.sendTransaction({
        to: accountAddress,
        value: parseEther("1"), // Send 1 ETH
      });
      await publicClient.waitForTransactionReceipt({ hash: fundTx });
      console.log("✅ Smart account funded!");
    } else {
      console.log("💰 Smart account already has funds");
    }

    // Create smart account client
    const smartAccountClient = createSmartAccountClient({
      account: simpleAccount,
      chain: localHostChain,
      bundlerTransport: http("http://localhost:4337"),
      userOperation: {
        estimateFeesPerGas: async () => await publicClient.estimateFeesPerGas(),
      },
    });

    // Encode the increment function call
    const incrementFunctionData = encodeFunctionData({
      abi: counterAbi.abi,
      functionName: "increment",
    });

    console.log("📝 Creating user operation...");

    // Send the user operation
    const userOpHash = await smartAccountClient.sendUserOperation({
      calls: [
        {
          to: counterAddress,
          data: incrementFunctionData,
          value: 0n,
        },
      ],
    });

    console.log(`✨ User operation submitted! Hash: ${userOpHash}`);

    // Wait for the user operation to be included
    console.log("⏳ Waiting for user operation to be included...");
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log(
      `✅ User operation included in block ${receipt.receipt.blockNumber}`
    );
    console.log("Transaction hash:", receipt.receipt.transactionHash);
  } catch (error) {
    console.error("❌ Error:", error);
    // Log more detailed error information
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

main();
