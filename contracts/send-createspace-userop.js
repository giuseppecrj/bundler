import {
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  createWalletClient,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { createSmartAccountClient } from "permissionless/clients";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { entryPoint06Address } from "viem/account-abstraction";
import { parseEther } from "viem/utils";

// Get the current file's directory
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Read and parse the ABI file
const createSpaceAbi = JSON.parse(
  readFileSync(
    join(__dirname, "abi/CreateSpace.sol/CreateSpaceFacet.abi.json"),
    "utf8"
  )
);

// CreateSpace contract address
const createSpaceAddress = "0x5081a39b8A5f0E35a8D959395a630b68B74Dd30f";

// Example private key (replace with your actual private key)
const privateKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(privateKey);

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

// Create the public client
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

// Helper function to estimate gas for a transaction
async function estimateTransactionGas(to, data, from) {
  try {
    console.log("🔍 Estimating gas for the transaction...");
    const gasEstimate = await publicClient.estimateGas({
      account: from,
      to,
      data,
      value: 0n,
    });

    console.log(`📊 Estimated gas for direct transaction: ${gasEstimate}`);
    return gasEstimate;
  } catch (error) {
    console.warn("⚠️ Gas estimation failed:", error.message);
    console.log("⚠️ Using fallback gas estimate of 3,000,000");
    return 3000000n;
  }
}

// Helper function to get current gas prices
async function getCurrentGasPrices() {
  try {
    console.log("💰 Fetching current gas prices from the network...");
    const feeData = await publicClient.estimateFeesPerGas();

    console.log(`⛽ Current max fee per gas: ${feeData.maxFeePerGas} wei`);
    console.log(
      `⛽ Current max priority fee per gas: ${feeData.maxPriorityFeePerGas} wei`
    );

    return {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    };
  } catch (error) {
    console.warn("⚠️ Fee estimation failed:", error.message);
    console.log("⚠️ Using fallback gas prices");
    return {
      maxFeePerGas: 10000000000n, // 10 gwei fallback
      maxPriorityFeePerGas: 5000000000n, // 5 gwei fallback
    };
  }
}

async function main() {
  try {
    console.log("🚀 Preparing user operation to create space...");

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

    // Fund the smart account if needed
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

    // Example space creation parameters
    const spaceInfo = {
      metadata: {
        name: "Test Space",
        uri: "https://example.com",
        shortDescription: "A test space",
        longDescription: "A longer description",
      },
      membership: {
        settings: {
          name: "Test Membership",
          symbol: "TEST",
          price: 0n,
          maxSupply: 100n,
          duration: 365n * 24n * 60n * 60n, // 1 year in seconds
          currency: "0x0000000000000000000000000000000000000000", // Zero address for ETH
          feeRecipient: accountAddress,
          freeAllocation: 0n,
          pricingModule: "0x4c5859f0F772848b2D91F1D83E2Fe57935348029",
        },
        requirements: {
          everyone: true,
          users: [],
          ruleData: "0x",
          syncEntitlements: false,
        },
        permissions: ["Read"],
      },
      channel: {
        metadata: "general",
      },
      prepay: {
        supply: 0n,
      },
    };

    const options = {
      to: accountAddress, // The address that will own the space
    };

    // Encode the createSpaceV2 function call
    const createSpaceFunctionData = encodeFunctionData({
      abi: createSpaceAbi,
      functionName: "createSpaceV2",
      args: [spaceInfo, options],
    });

    const executeCalldata = encodeFunctionData({
      abi: parseAbi([
        "function execute(address to, uint256 value, bytes calldata data) payable",
      ]),
      functionName: "execute",
      args: [createSpaceAddress, 0n, createSpaceFunctionData],
    });

    // Estimate gas for the transaction
    const directGasEstimate = await estimateTransactionGas(
      accountAddress,
      executeCalldata,
      eoaAddress
    );

    console.log("🔍 Direct gas estimate:", directGasEstimate);

    // Get current gas prices
    const gasPrices = await getCurrentGasPrices();
    console.log("💰 Current gas prices:", gasPrices);

    // Calculate gas limits with safety margins
    const callGasLimit = directGasEstimate * 2n; // 2x safety margin

    // Send the user operation
    const userOpHash = await smartAccountClient.sendUserOperation({
      calls: [
        {
          to: createSpaceAddress,
          data: createSpaceFunctionData,
          value: 0n,
        },
      ],
      // Explicitly set all gas parameters to ensure they're defined
      callGasLimit: callGasLimit,
    });

    console.log(`✨ User operation submitted with hash: ${userOpHash}`);
    console.log("⏳ Waiting for user operation to be included...");

    try {
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 60_000, // 60 seconds timeout
        retryInterval: 1_500, // Check every 1.5 seconds
      });

      console.log(
        `✅ User operation included in block ${receipt.receipt.blockNumber}`
      );
      console.log("Transaction hash:", receipt.receipt.transactionHash);

      // Get transaction receipt with logs
      console.log("\n🔍 Checking transaction receipt for logs...");
      const txReceipt = await publicClient.getTransactionReceipt({
        hash: receipt.receipt.transactionHash,
      });

      console.log(`📦 Block number: ${txReceipt.blockNumber}`);
      console.log(
        `🧾 Transaction status: ${
          txReceipt.status === "success" ? "✅ Success" : "❌ Failed"
        }`
      );
      console.log(`🔥 Gas used: ${txReceipt.gasUsed}`);

      if (txReceipt.logs.length > 0) {
        console.log(
          `\n📝 Found ${txReceipt.logs.length} logs in the transaction:`
        );
        txReceipt.logs.forEach((log, index) => {
          console.log(`\nLog #${index + 1}:`);
          console.log(`Address: ${log.address}`);
          console.log(`Topics: ${log.topics.join(", ")}`);
          console.log(`Data: ${log.data}`);
        });
      } else {
        console.log("❌ No logs found in the transaction");
      }
    } catch (receiptError) {
      console.error("Error waiting for receipt:", receiptError);

      // Try to get more information about the error
      if (receiptError.message) {
        console.error("Error message:", receiptError.message);

        // Check for common bundler rejection reasons
        if (receiptError.message.includes("AA")) {
          console.error(
            "This appears to be an Account Abstraction protocol error."
          );
        } else if (receiptError.message.includes("gas")) {
          console.error(
            "This appears to be a gas-related error. The bundler may have rejected the operation due to gas limits."
          );
        }
      }
    }
  } catch (error) {
    console.error("Error in main function:", error);
  }
}

main();
