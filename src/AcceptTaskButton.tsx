import React, { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
// IDLファイルのパスはプロジェクト構造に合わせて修正してください
import idl from "./idl-v7.json"; // CreateTaskButtonと同じIDLを使用

// SolanaプログラムのID (CreateTaskButtonと同じ)
const PROGRAM_ID = new PublicKey(
  "Drr2eM6yoGXL2QZHdaFzXzUDDPQarV8acbbYWTBAtNyE"
);

// IDLの型定義をインポート
type SunpathProgram = Program<typeof idl>;

// AcceptTaskButtonコンポーネントのpropsの型定義
interface AcceptTaskButtonProps {
  taskAccountPDAString: string; // 承認するタスクアカウントのPDA文字列
  recipientPublicKeyString: string; // 報酬受取人の公開鍵文字列
  onTaskAccepted: (signature: TransactionSignature) => void; // タスク承認成功時のコールバック
  onError: (error: any) => void; // エラー発生時のコールバック
}

const AcceptTaskButton: React.FC<AcceptTaskButtonProps> = ({
  taskAccountPDAString,
  recipientPublicKeyString,
  onTaskAccepted,
  onError,
}) => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet(); // publicKey は consignerWallet として機能
  const [isLoading, setIsLoading] = useState(false);

  // AnchorProviderを取得する関数 (CreateTaskButtonと同様)
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

  // タスク承認処理を実行する関数
  const handleAcceptTask = useCallback(async () => {
    const provider = getProvider();
    if (!provider || !publicKey) {
      if (!publicKey) onError(new Error("ウォレットが接続されていません。"));
      return;
    }

    let taskAccountPDA: PublicKey;
    let recipientPublicKey: PublicKey;

    try {
      // 公開鍵の形式チェックを強化
      if (!taskAccountPDAString || !recipientPublicKeyString) {
        throw new Error("タスクPDAと受取人アドレスは必須です。");
      }

      taskAccountPDA = new PublicKey(taskAccountPDAString);
      recipientPublicKey = new PublicKey(recipientPublicKeyString);

      // 同じアドレスのチェック
      if (recipientPublicKey.equals(publicKey)) {
        throw new Error(
          "受取人はタスク作成者と同じアドレスにすることはできません。"
        );
      }
    } catch (e: any) {
      onError(new Error(`公開鍵の形式が正しくありません: ${e.message}`));
      return;
    }

    setIsLoading(true);

    try {
      const program = new Program(idl, PROGRAM_ID, provider) as SunpathProgram;

      // Config PDAを導出 (CreateTaskButtonと同様)
      const [configPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("config_v2")],
        program.programId
      );

      // AdminActionCounter PDAを導出
      // seeds: [b"admin_counter", consigner_wallet.key().as_ref()]
      // ここでの consigner_wallet は現在のウォレット (publicKey)
      const [adminActionCounterPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("admin_counter"),
          publicKey.toBuffer(), // 現在のウォレットの公開鍵
        ],
        program.programId
      );

      // `acceptTask` 命令を呼び出し
      // 注意: この呼び出しが成功するためには、`publicKey` (現在のウォレット) が
      // `taskAccountPDA` に保存されている `consignerWallet` と一致している必要があります。
      // (IDLの has_one = consigner_wallet 制約による)
      const signature = await program.methods
        .acceptTask(recipientPublicKey)
        .accounts({
          taskAccount: taskAccountPDA,
          consignerWallet: publicKey,
          recipientAccount: recipientPublicKey,
          config: configPDA,
          adminActionCounter: adminActionCounterPDA,
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

      onTaskAccepted(signature);
    } catch (error: any) {
      console.error("タスク承認中にエラーが発生しました:", error);
      let errorMessage = error.message || "不明なエラーが発生しました。";

      // より詳細なエラーメッセージの抽出
      if (error.logs) {
        for (const log of error.logs) {
          if (log.includes("SunpathError::")) {
            errorMessage = log.substring(
              log.indexOf("SunpathError::") + "SunpathError::".length
            );
            if (errorMessage.startsWith("NotTaskConsigner")) {
              errorMessage =
                "タスクの承認権限がありません (NotTaskConsigner)。";
            } else if (errorMessage.startsWith("TaskNotOpen")) {
              errorMessage =
                "タスクが承認可能な状態ではありません (TaskNotOpen)。";
            } else if (errorMessage.startsWith("TaskExpired")) {
              errorMessage = "タスクは期限切れです (TaskExpired)。";
            } else if (errorMessage.startsWith("InvalidRecipient")) {
              errorMessage = "無効な受取人アドレスです (InvalidRecipient)。";
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
  }, [
    getProvider,
    publicKey,
    taskAccountPDAString,
    recipientPublicKeyString,
    onTaskAccepted,
    onError,
  ]);

  return (
    <button
      onClick={handleAcceptTask}
      disabled={
        !publicKey ||
        isLoading ||
        !taskAccountPDAString ||
        !recipientPublicKeyString
      }
      className="px-4 py-2 font-semibold text-white bg-green-500 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? "承認処理中..." : "タスクを承認"}
    </button>
  );
};

export default AcceptTaskButton;

// --- 以下は呼び出し元コンポーネントでの使用例 (参考) ---
/*
import React, { useState, useMemo } from 'react';
import AcceptTaskButton from './AcceptTaskButton'; // 作成したコンポーネントのパス
// CreateTaskButtonの例から必要なimportを流用
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, TransactionSignature, PublicKey } from '@solana/web3.js';

require('@solana/wallet-adapter-react-ui/styles.css');

const YourTaskListComponent: React.FC = () => {
  // 実際にはタスク一覧から選択されたタスクのPDAと、報酬受取人を設定する
  const [selectedTaskPDA, setSelectedTaskPDA] = useState<string>(''); 
  const [recipientAddress, setRecipientAddress] = useState<string>('');
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

  const handleTaskSuccessfullyAccepted = (signature: TransactionSignature) => {
    setMessage('タスクが正常に承認されました！');
    setTxSignature(signature);
    console.log('タスク承認成功:', signature);
  };

  const handleAcceptanceError = (error: any) => {
    setMessage(`エラー: ${error.message}`);
    setTxSignature('');
    console.error('タスク承認エラー:', error);
  };

  // ダミーデータ。実際にはオンチェーンからタスクリストを取得し、
  // ユーザーが承認したいタスクを選択できるようにする
  const tasks = [
    { 
      id: '1', 
      pda: 'TASK_PDA_ADDRESS_HERE_1', // 実際のタスクPDAに置き換える
      description: 'タスク1の説明', 
      // consignerWallet: 'CONSIGNER_WALLET_PUBKEY_HERE' // この情報も取得できると良い
    },
    // ... 他のタスク
  ];

  const handleSelectTask = (taskPda: string) => {
    setSelectedTaskPDA(taskPda);
    // 簡単のため、受取人は固定の自分のアドレスにする例
    // 本来はユーザーが入力するか、プログラムロジックで決定される
    // if (publicKey) { // publicKey は useWallet() から取得
    //   setRecipientAddress(publicKey.toBase58());
    // }
  };


  return (
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div style={{ padding: '20px' }}>
            <h2>タスク承認</h2>
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
                <div>
                  <label htmlFor="recipient">報酬受取人アドレス: </label>
                  <input
                    id="recipient"
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="受取人のウォレットアドレス"
                    style={{width: '300px'}}
                  />
                </div>
                <AcceptTaskButton
                  taskAccountPDAString={selectedTaskPDA}
                  recipientPublicKeyString={recipientAddress}
                  onTaskAccepted={handleTaskSuccessfullyAccepted}
                  onError={handleAcceptanceError}
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

// export default YourTaskListComponent;
*/
