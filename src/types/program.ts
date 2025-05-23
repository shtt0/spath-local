import { Program } from "@coral-xyz/anchor";
import idl from "../idl-v7.json";

export type SunpathProgram = Program<typeof idl>;
