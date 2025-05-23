import { useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PROGRAM_ID } from "../constants/program";

export const useSolanaProgram = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const getProvider = useCallback(() => {
    if (!publicKey || !signTransaction) {
      return null;
    }
    return new AnchorProvider(
      connection,
      { publicKey, signTransaction } as any,
      { preflightCommitment: "confirmed" }
    );
  }, [publicKey, signTransaction, connection]);

  return {
    provider: getProvider(),
    publicKey,
    connection,
  };
};
