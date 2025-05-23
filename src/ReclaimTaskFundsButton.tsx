import React, { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
// IDLファイルのパスはプロジェクト構造に合わせて修正してください
import idl from "./idl-v7.json"; // 既存のボタンと同じIDLを使用

// SolanaプログラムのID (既存のボタンと同じ)
const PROGRAM_ID = new PublicKey(
  "Drr2eM6yoGXL2QZHdaFzXzUDDPQarV8acbbYWTBAtNyE"
);

// IDLの型定義をインポート
type SunpathProgram = Program<typeof idl>;

// ReclaimTaskFundsButtonコンポーネントのpropsの型定義
interface ReclaimTaskFundsButtonProps {
  taskAccountPDAString: string; // 資金を回収するタスクアカウントのPDA文字列
  onFundsReclaimed: (signature: TransactionSignature) => void; // 資金回収成功時のコールバック
  onError: (error: any) => void; // エラー発生時のコールバック
}

const ReclaimTaskFundsButton: React.FC<ReclaimTaskFundsButtonProps> = ({
  taskAccountPDAString,
  onFundsReclaimed,
  onError,
}) => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet(); // publicKey は consignerWallet として機能
  const [isLoading, setIsLoading] = useState(false);

  // AnchorProviderを取得する関数 (既存のボタンと同様)
  const getProvider = useCallback(() => {
    if (!publicKey || !signTransaction) {
      onError(new Error("ウォレットが接続されていません。"));
      return null;
    }
    const provider = new AnchorProvider(
      connection,
      { publicKey, signTransaction } as any,
      { preflightCommitment: "confirmed" }
    );
    return provider;
  }, [publicKey, signTransaction, connection, onError]);

  // 資金回収処理を実行する関数
  const handleReclaimFunds = useCallback(async () => {
    const provider = getProvider();
    if (!provider || !publicKey) {
      if (!publicKey) onError(new Error("ウォレットが接続されていません。"));
      return;
    }

    let taskAccountPDA: PublicKey;

    try {
      taskAccountPDA = new PublicKey(taskAccountPDAString);
    } catch (e: any) {
      onError(
        new Error(`タスクアカウントPDAの形式が正しくありません: ${e.message}`)
      );
      return;
    }

    setIsLoading(true);

    try {
      const program = new Program(idl, PROGRAM_ID, provider) as SunpathProgram;

      // Config PDAを導出 (既存のボタンと同様)
      const [configPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("config_v2")],
        program.programId
      );

      // `reclaimTaskFunds` 命令を呼び出し
      // 注意: この呼び出しが成功するためには、`publicKey` (現在のウォレット) が
      // `taskAccountPDA` に保存されている `consignerWallet` と一致している必要があります。
      const signature = await program.methods
        .reclaimTaskFunds()
        .accounts({
          taskAccount: taskAccountPDA,
          consignerWallet: publicKey,
          config: configPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // トランザクションの確認を待つ（より堅牢な方法）
      const confirmation = await provider.connection.confirmTransaction(
        signature,
        "finalized"
      );

      if (confirmation.value.err) {
        throw new Error(
          `トランザクションが失敗しました: ${confirmation.value.err}`
        );
      }

      onFundsReclaimed(signature);
    } catch (error: any) {
      console.error("資金回収中にエラーが発生しました:", error);
      let errorMessage = error.message || "不明なエラーが発生しました。";

      // より詳細なエラーメッセージの抽出
      if (error.logs) {
        for (const log of error.logs) {
          if (log.includes("SunpathError::")) {
            errorMessage = log.substring(
              log.indexOf("SunpathError::") + "SunpathError::".length
            );
            if (errorMessage.startsWith("NotConsigner")) {
              errorMessage =
                "タスクの資金回収権限がありません (NotConsigner)。";
            } else if (errorMessage.startsWith("CannotReclaimFunds")) {
              errorMessage =
                "まだ資金を回収できません (CannotReclaimFunds)。タスクが期限切れまたは拒否後のペナルティ期間が終了しているか確認してください。";
            } else if (errorMessage.startsWith("DenialLockupActive")) {
              errorMessage =
                "拒否後のロックアップ期間が有効です。まだ資金を回収できません (DenialLockupActive)。";
            }
            break;
          } else if (log.includes("Error:")) {
            errorMessage = log;
          } else if (log.includes("Program failed to complete")) {
            errorMessage = "プログラムの実行に失敗しました。";
          }
        }
      }

      onError(new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [getProvider, publicKey, taskAccountPDAString, onFundsReclaimed, onError]);

  return (
    <button
      onClick={handleReclaimFunds}
      disabled={!publicKey || isLoading || !taskAccountPDAString}
      className="px-4 py-2 font-semibold text-white bg-orange-500 rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? "資金回収中..." : "資金を回収"}
    </button>
  );
};

export default ReclaimTaskFundsButton;

// --- 以下は呼び出し元コンポーネントでの使用例 (参考) ---
/*
import React, { useState, useMemo } from 'react';
import ReclaimTaskFundsButton from './ReclaimTaskFundsButton'; // 作成したコンポーネントのパス
// 既存のボタンの例から必要なimportを流用
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, TransactionSignature } from '@solana/web3.js';

require('@solana/wallet-adapter-react-ui/styles.css');

const YourTaskListForReclaimingComponent: React.FC = () => {
  const [selectedTaskPDA, setSelectedTaskPDA] = useState<string>(''); 
  const [message, setMessage] = useState<string>('');
  const [txSignature, setTxSignature] = useState<string>('');

  const network = clusterApiUrl('devnet');
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );

  const handleFundsSuccessfullyReclaimed = (signature: TransactionSignature) => {
    setMessage('資金が正常に回収されました！');
    setTxSignature(signature);
    console.log('資金回収成功:', signature);
  };

  const handleReclaimingError = (error: any) => {
    setMessage(`エラー: ${error.message}`);
    setTxSignature('');
    console.error('資金回収エラー:', error);
  };

  // ダミーデータ
  const tasks = [
    { id: '1', pda: 'TASK_PDA_ADDRESS_HERE_1', description: 'タスク1の説明 (期限切れまたは拒否済み)' },
    // ... 他のタスク
  ];

  const handleSelectTask = (taskPda: string) => {
    setSelectedTaskPDA(taskPda);
  };

  return (
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div style={{ padding: '20px' }}>
            <h2>タスク資金回収</h2>
            <WalletMultiButton />

            <div>
              <h3>タスク一覧 (ダミー)</h3>
              {tasks.map(task => (
                <div key={task.id} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px'}}>
                  <p>{task.description}</p>
                  <p>Task PDA: {task.pda}</p>
                  <button onClick={() => handleSelectTask(task.pda)}>このタスクを選択</button>
                </div>
              ))}
            </div>

            {selectedTaskPDA && (
              <div style={{marginTop: '20px'}}>
                <h3>選択中のタスク: {selectedTaskPDA}</h3>
                <ReclaimTaskFundsButton
                  taskAccountPDAString={selectedTaskPDA}
                  onFundsReclaimed={handleFundsSuccessfullyReclaimed}
                  onError={handleReclaimingError}
                />
              </div>
            )}

            {message && <p style={{ marginTop: '10px', color: txSignature ? 'green' : 'red' }}>{message}</p>}
            {txSignature && (
              <p>
                トランザクション署名: {' '}
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {txSignature}
                </a>
              </p>
            )}
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

// export default YourTaskListForReclaimingComponent;
*/
