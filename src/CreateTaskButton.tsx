import React, { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
import BN from "bn.js";
// IDLファイルのパスはプロジェクト構造に合わせて修正してください
import idl from "./idl-v7.json";

// SolanaプログラムのID
const PROGRAM_ID = new PublicKey(
  "Drr2eM6yoGXL2QZHdaFzXzUDDPQarV8acbbYWTBAtNyE"
);

// IDLの型定義をインポート
type SunpathProgram = Program<typeof idl>;

// CreateTaskButtonコンポーネントのpropsの型定義
interface CreateTaskButtonProps {
  taskIdString: string; // フォームなどから文字列として渡されるタスクID
  rewardAmountString: string; // 同様に文字列として渡される報酬額 (lamports単位)
  durationSecondsString: string; // 同様に文字列として渡される期間 (秒単位)
  onTaskCreated: (signature: TransactionSignature) => void; // タスク作成成功時のコールバック関数
  onError: (error: any) => void; // エラー発生時のコールバック関数
}

const CreateTaskButton: React.FC<CreateTaskButtonProps> = ({
  taskIdString,
  rewardAmountString,
  durationSecondsString,
  onTaskCreated,
  onError,
}) => {
  const { connection } = useConnection(); // Solana接続を取得
  const { publicKey, signTransaction } = useWallet(); // ウォレット情報（公開鍵、署名関数）を取得
  const [isLoading, setIsLoading] = useState(false); // ローディング状態の管理

  // AnchorProviderを取得する関数
  const getProvider = useCallback(() => {
    // ウォレットが接続されていない場合はnullを返す
    if (!publicKey || !signTransaction) {
      onError(new Error("ウォレットが接続されていません。"));
      return null;
    }
    // AnchorProviderを初期化
    // signTransactionだけでなく、signAllTransactionsも渡すのが一般的ですが、
    // この例ではcreateTaskのみなのでsignTransactionだけでも動作する場合があります。
    // Walletインターフェースに準拠するため、publicKeyとsignTransactionを持つオブジェクトを渡します。
    const provider = new AnchorProvider(
      connection,
      {
        publicKey,
        signTransaction,
        // signAllTransactions: wallet.signAllTransactions // 必要に応じて追加
      } as any, // Wallet型のアサーション (必要に応じてより厳密な型付けを)
      { preflightCommitment: "confirmed" }
    );
    return provider;
  }, [publicKey, signTransaction, connection, onError]);

  // タスク作成処理を実行する関数
  const handleCreateTask = useCallback(async () => {
    const provider = getProvider();
    if (!provider || !publicKey) {
      if (!publicKey) onError(new Error("ウォレットが接続されていません。"));
      return;
    }

    let taskId: BN;
    let rewardAmount: BN;
    let durationSeconds: BN;

    try {
      taskId = new BN(taskIdString);
      rewardAmount = new BN(rewardAmountString);
      durationSeconds = new BN(durationSecondsString);

      // 入力値の検証を強化
      if (rewardAmount.isNeg() || durationSeconds.isNeg() || taskId.isNeg()) {
        throw new Error("ID、報酬額、期間には正の数を入力してください。");
      }
      if (rewardAmount.isZero()) {
        throw new Error("報酬額は0より大きい値を入力してください。");
      }
      if (durationSeconds.isZero()) {
        throw new Error("期間は0より大きい値を入力してください。");
      }
    } catch (e: any) {
      onError(
        new Error(
          `入力値の変換に失敗しました: ${e.message || "無効な数値です。"}`
        )
      );
      return;
    }

    setIsLoading(true);

    try {
      const program = new Program(idl, PROGRAM_ID, provider) as SunpathProgram;

      // TaskAccount PDA (Program Derived Address) を導出
      // seeds: [b"task_account", consigner.key().as_ref(), &task_id.to_le_bytes()]
      const [taskAccountPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("task_account"), // "task_account"のバイト配列
          publicKey.toBuffer(), // consigner (現在のウォレット) の公開鍵のバッファ
          taskId.toArrayLike(Buffer, "le", 8), // taskId (u64) をリトルエンディアン8バイトのバッファに変換
        ],
        program.programId
      );

      // Config PDAを導出
      // seeds: [b"config_v2"]
      const [configPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("config_v2")],
        program.programId
      );

      // `createTask` 命令を呼び出し
      const signature = await program.methods
        .createTask(taskId, rewardAmount, durationSeconds)
        .accounts({
          taskAccount: taskAccountPDA, // 作成されるタスクアカウントのPDA
          consigner: publicKey, // タスク作成者 (現在のウォレット)
          config: configPDA, // プログラム設定アカウントのPDA
          systemProgram: SystemProgram.programId, // システムプログラムのID
        })
        .rpc(); // トランザクションを送信し、署名を待つ

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

      onTaskCreated(signature);
    } catch (error: any) {
      console.error("タスク作成中にエラーが発生しました:", error);
      let errorMessage = error.message || "不明なエラーが発生しました。";

      // より詳細なエラーメッセージの抽出
      if (error.logs) {
        for (const log of error.logs) {
          if (log.includes("SunpathError::")) {
            errorMessage = log.substring(
              log.indexOf("SunpathError::") + "SunpathError::".length
            );
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
  }, [
    getProvider,
    publicKey,
    taskIdString,
    rewardAmountString,
    durationSecondsString,
    onTaskCreated,
    onError,
  ]);

  return (
    <button
      onClick={handleCreateTask}
      disabled={!publicKey || isLoading}
      className="px-4 py-2 font-semibold text-white bg-blue-500 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? "タスク作成中..." : "タスクを作成"}
    </button>
  );
};

export default CreateTaskButton;

// --- 以下は呼び出し元コンポーネントでの使用例 (参考) ---
/*
import React, { useState, useMemo } from 'react';
import CreateTaskButton from './CreateTaskButton'; // 作成したコンポーネントのパスに合わせる
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, TransactionSignature } from '@solana/web3.js';

// ウォレットボタン用のCSS (プロジェクトに合わせて調整)
require('@solana/wallet-adapter-react-ui/styles.css');

const YourFormComponent: React.FC = () => {
  const [taskId, setTaskId] = useState<string>('1'); // 例: 初期値
  const [reward, setReward] = useState<string>('100000000'); // 例: 0.1 SOL (lamports)
  const [duration, setDuration] = useState<string>('3600'); // 例: 1時間 (秒)
  const [message, setMessage] = useState<string>(''); // 結果表示用メッセージ
  const [txSignature, setTxSignature] = useState<string>(''); // トランザクション署名表示用

  // Solanaネットワーク設定 (例: devnet)
  const network = web3.clusterApiUrl('devnet');
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );

  const handleTaskSuccessfullyCreated = (signature: TransactionSignature) => {
    setMessage('タスクが正常に作成されました！');
    setTxSignature(signature);
    console.log('タスク作成成功:', signature);
    // ここでフォームをリセットするなどの処理を追加可能
  };

  const handleCreationError = (error: any) => {
    setMessage(`エラー: ${error.message}`);
    setTxSignature('');
    console.error('タスク作成エラー:', error);
  };

  return (
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div style={{ padding: '20px' }}>
            <h2>タスク作成フォーム</h2>
            <WalletMultiButton />

            <div style={{ margin: '10px 0' }}>
              <label htmlFor="taskId">タスクID: </label>
              <input
                id="taskId"
                type="text"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                placeholder="例: 1"
              />
            </div>
            <div style={{ margin: '10px 0' }}>
              <label htmlFor="reward">報酬額 (lamports): </label>
              <input
                id="reward"
                type="text"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                placeholder="例: 100000000 (0.1 SOL)"
              />
            </div>
            <div style={{ margin: '10px 0' }}>
              <label htmlFor="duration">期間 (秒): </label>
              <input
                id="duration"
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="例: 3600 (1時間)"
              />
            </div>

            <CreateTaskButton
              taskIdString={taskId}
              rewardAmountString={reward}
              durationSecondsString={duration}
              onTaskCreated={handleTaskSuccessfullyCreated}
              onError={handleCreationError}
            />

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

// export default YourFormComponent; // アプリケーションのエントリーポイントでレンダリング
*/
