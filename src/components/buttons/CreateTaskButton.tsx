import React, { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
import BN from "bn.js";
import idl from "../../idl-v7.json";
import { PROGRAM_ID } from "../../constants/program";
import { SunpathProgram } from "../../types/program";

// ... existing code ...
