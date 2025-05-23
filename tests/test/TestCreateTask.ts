import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Sunpath } from "../target/types/sunpath"; // Adjust path as needed
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";

describe("sunpath", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sunpath as Program<Sunpath>;

  // --- From your previous request ---
  const adminPublicKey = new PublicKey(
    "Gv3J4Cf84cnGmJZtQtUF4gEzqshxEDV9gqzrEg3g9iZU"
  );
  const daoTreasuryAddress = new PublicKey(
    "GwBivTqKpi5WLFN5mnf47d7vnBkXZ4RcxUeyiuViqMyH"
  );
  const governanceTokenMint = new PublicKey(
    "8JuJT8SWq7M9Az2pwgs2cJFZGKvvQatzmNLjkNDsUv8H"
  );
  const minimumRewardAmountInConfig = new BN(10000000); // from your config
  const daoFeePercentage = 5;
  const denialPenaltyDuration = new BN(1);
  const patrollerGovernanceTokenAmount = new BN(0);

  // Assuming adminSigner is the provider's wallet, which should be Gv3J4Cf84cnGmJZtQtUF4gEzqshxEDV9gqzrEg3g9iZU
  const adminSigner = provider.wallet as anchor.Wallet;

  const configPdaSeed = Buffer.from("config_v2");
  let configKey: PublicKey; // Will be set in 'before' or in the init test

  // Before running tests, ensure the config PDA is known.
  // This would typically be derived once.
  before(async () => {
    [configKey] = PublicKey.findProgramAddressSync(
      [configPdaSeed],
      program.programId
    );
    console.log(`Using Config PDA: ${configKey.toBase58()}`); // Should be HJCLK4Bvk3QV3XekUHvN1EnSt7se42QDyLDKofk5Thow

    // Airdrop to admin/consigner if needed for tests, especially on localnet/devnet
    // This is important because createTask involves SOL transfer and account creation.
    const adminBalance = await provider.connection.getBalance(
      adminSigner.publicKey
    );
    console.log(
      `Admin/Consigner (${adminSigner.publicKey.toBase58()}) balance: ${
        adminBalance / LAMPORTS_PER_SOL
      } SOL`
    );
    if (adminBalance < 2 * LAMPORTS_PER_SOL) {
      // Ensure at least 2 SOL for fees and transfers
      console.log(
        `Airdropping 2 SOL to ${adminSigner.publicKey.toBase58()}...`
      );
      await provider.connection.requestAirdrop(
        adminSigner.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      // You might need a delay here for the airdrop to be confirmed
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 sec delay
      const newBalance = await provider.connection.getBalance(
        adminSigner.publicKey
      );
      console.log(
        `New admin/consigner balance: ${newBalance / LAMPORTS_PER_SOL} SOL`
      );
    }
  });

  it("Is initialized! (or verifies existing initialization)", async () => {
    // (Your initialize_program test code from the previous response)
    // For brevity, assuming it runs and either initializes or verifies the existing config.
    // We will rely on the configKey derived in the `before` block.
    try {
      const txSignature = await program.methods
        .initializeProgram(
          adminPublicKey,
          daoTreasuryAddress,
          governanceTokenMint,
          minimumRewardAmountInConfig,
          daoFeePercentage,
          denialPenaltyDuration,
          patrollerGovernanceTokenAmount
        )
        .accounts({
          config: configKey,
          admin: adminSigner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("InitializeProgram successful, TX:", txSignature);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.toString().includes("custom program error: 0x0") ||
          error.toString().includes("Account already in use"))
      ) {
        console.warn(
          "Config account already initialized, proceeding with test."
        );
        const configAccount = await program.account.programConfig.fetch(
          configKey
        );
        expect(configAccount.admin.toBase58()).to.equal(
          adminPublicKey.toBase58()
        );
        // Add other assertions if needed
      } else {
        console.error("Error during initializeProgram in test setup:", error);
        throw error;
      }
    }
  });

  it("Creates a task successfully", async () => {
    // Args for create_task
    const taskId = new BN(Date.now()); // Using timestamp for a somewhat unique ID for multiple test runs
    const rewardAmount = new BN(15000000); // 0.015 SOL, which is > minimumRewardAmountInConfig
    const durationSeconds = new BN(3600); // 1 hour

    // Accounts for create_task
    // 1. task_account (PDA to be initialized)
    const [taskAccountKey, taskAccountBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("task_account"),
        adminSigner.publicKey.toBuffer(), // consigner's public key
        taskId.toArrayLike(Buffer, "le", 8), // task_id as 8-byte little-endian buffer
      ],
      program.programId
    );
    console.log(`Derived Task PDA: ${taskAccountKey.toBase58()}`);

    // 2. consigner (Signer, using adminSigner here)
    const consigner = adminSigner.publicKey;

    // 3. config (already known)
    // configKey is used from the 'before' block

    // 4. system_program
    const systemProgram = SystemProgram.programId;

    const initialConsignerBalance = await provider.connection.getBalance(
      consigner
    );
    let taskAccountRent =
      await provider.connection.getMinimumBalanceForRentExemption(
        8 + (32 + 8 + 8 + 8 + 8 + 1 + 8 + (1 + 32) + (1 + 32) + 1) // TaskAccount::LEN
      );

    console.log(`Task ID: ${taskId.toString()}`);
    console.log(`Reward Amount: ${rewardAmount.toString()}`);
    console.log(`Duration Seconds: ${durationSeconds.toString()}`);
    console.log(`Consigner: ${consigner.toBase58()}`);
    console.log(`Task Account PDA to be created: ${taskAccountKey.toBase58()}`);
    console.log(`Config Account PDA: ${configKey.toBase58()}`);

    try {
      const txSignature = await program.methods
        .createTask(taskId, rewardAmount, durationSeconds)
        .accounts({
          taskAccount: taskAccountKey,
          consigner: consigner,
          config: configKey,
          systemProgram: systemProgram,
        })
        // If adminSigner is a Keypair object and not provider.wallet, you'd add .signers([adminSignerKeypair])
        .rpc();

      console.log("CreateTask Transaction Signature:", txSignature);
      await provider.connection.confirmTransaction(txSignature, "confirmed");

      // Verification
      // 1. Fetch the created task_account data
      const taskData = await program.account.taskAccount.fetch(taskAccountKey);
      console.log("Fetched Task Account Data:", {
        taskId: taskData.taskId.toString(),
        consignerWallet: taskData.consignerWallet.toBase58(),
        rewardAmountLocked: taskData.rewardAmountLocked.toString(),
        creationTimestamp: new Date(
          taskData.creationTimestamp.toNumber() * 1000
        ).toISOString(),
        durationSeconds: taskData.durationSeconds.toString(),
        expirationTimestamp: new Date(
          taskData.expirationTimestamp.toNumber() * 1000
        ).toISOString(),
        status: taskData.status,
        statusUpdateTimestamp: new Date(
          taskData.statusUpdateTimestamp.toNumber() * 1000
        ).toISOString(),
        isInitialized: taskData.isInitialized,
      });

      expect(taskData.taskId.toString()).to.equal(taskId.toString());
      expect(taskData.consignerWallet.toBase58()).to.equal(
        consigner.toBase58()
      );
      expect(taskData.rewardAmountLocked.toString()).to.equal(
        rewardAmount.toString()
      );
      expect(taskData.durationSeconds.toString()).to.equal(
        durationSeconds.toString()
      );
      expect(taskData.status).to.deep.equal({ open: {} }); // Check if status is Open
      expect(taskData.isInitialized).to.be.true;
      expect(taskData.creationTimestamp.toNumber()).to.be.a("number").gt(0);
      expect(taskData.expirationTimestamp.toNumber()).to.equal(
        taskData.creationTimestamp.add(durationSeconds).toNumber()
      );
      expect(taskData.statusUpdateTimestamp.toNumber()).to.equal(
        taskData.creationTimestamp.toNumber()
      );

      // 2. Check the SOL balance of the task_account PDA
      // It should hold the reward_amount (plus its own rent, which is covered by the system during init)
      // The program transfers `reward_amount` into the task_account PDA.
      // The task_account itself is initialized with rent exemption.
      const taskAccountInfo = await provider.connection.getAccountInfo(
        taskAccountKey
      );
      if (!taskAccountInfo) {
        throw new Error("Task account not found");
      }
      expect(taskAccountInfo.lamports).to.equal(
        rewardAmount.toNumber() + taskAccountRent
      );
      console.log(
        `Task Account Balance: ${
          taskAccountInfo.lamports
        } lamports (Expected: ${rewardAmount.toNumber() + taskAccountRent})`
      );

      // 3. Check consigner's balance change (optional, more complex due to fees)
      // const finalConsignerBalance = await provider.connection.getBalance(consigner);
      // expect(finalConsignerBalance).to.be.lessThan(initialConsignerBalance - rewardAmount.toNumber()); // Considers tx fee + rent for task_account

      console.log("Task created and verified successfully!");
    } catch (error: unknown) {
      console.error("Error during createTask:", error);
      if (error instanceof Error && "logs" in error) {
        console.error("Program Logs:", (error as { logs: string[] }).logs);
      }
      throw error;
    }
  });

  // You can add other tests here for accept_task, reject_task, etc.
});
