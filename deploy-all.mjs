/**
 * deploy-all.mjs
 *
 * lp-registar の全 Lambda 関数をパッケージ化してデプロイするスクリプト。
 *
 * 使い方:
 *   cd lp-registar/lambda_src
 *   node ../deploy-all.mjs
 */

import { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand } from "@aws-sdk/client-lambda";
import { createWriteStream, readFileSync, existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const REGION = "ap-southeast-2";
const lambda = new LambdaClient({ region: REGION });

// ========================
// デプロイ対象の Lambda 関数マップ
// KEY   = AWS Lambda の関数名（AWSコンソールで確認したもの）
// VALUE = lambda_src/ 内のエントリポイントファイル名
// ========================
const FUNCTIONS = {
  "LP_CreateCheckoutSession": "createCheckoutSession.mjs",
  "LP_StripeWebhook":         "stripeWebhook.mjs",
};

const LAMBDA_SRC_DIR = join(__dirname, "lambda_src");
const ZIP_PATH       = join(__dirname, "lambda_deploy.zip");

async function buildZip() {
  console.log("📦 zip を作成中... (lambda_src/ 全体をパッケージング)");

  // Windows: PowerShell の Compress-Archive を使用
  const cmd = `powershell -Command "Compress-Archive -Path '${LAMBDA_SRC_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force"`;
  const { stdout, stderr } = await execAsync(cmd);
  if (stderr) console.warn("zip 警告:", stderr);
  console.log(`✅ zip 作成完了: ${ZIP_PATH}`);
}

async function deployFunction(functionName) {
  console.log(`\n🚀 デプロイ中: ${functionName}`);

  try {
    // まず関数が存在するか確認
    await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      console.error(`❌ Lambda 関数が見つかりません: "${functionName}"`);
      console.error(`   → AWSコンソールで関数名を確認し、FUNCTIONS マップを修正してください`);
      return false;
    }
    throw err;
  }

  const zipFile = readFileSync(ZIP_PATH);
  const command = new UpdateFunctionCodeCommand({
    FunctionName: functionName,
    ZipFile: zipFile,
  });

  const response = await lambda.send(command);
  console.log(`✅ デプロイ成功: ${functionName}`);
  console.log(`   最終更新: ${response.LastModified}`);
  console.log(`   バージョン: ${response.FunctionArn}`);
  return true;
}

async function main() {
  console.log("=== Landy Lambda デプロイツール ===");
  console.log(`リージョン: ${REGION}`);
  console.log(`対象関数: ${Object.keys(FUNCTIONS).join(", ")}`);
  console.log("===================================\n");

  try {
    await buildZip();

    let successCount = 0;
    for (const [funcName] of Object.entries(FUNCTIONS)) {
      const ok = await deployFunction(funcName);
      if (ok) successCount++;
    }

    console.log(`\n=== 完了: ${successCount}/${Object.keys(FUNCTIONS).length} 関数をデプロイ ===`);
  } catch (err) {
    console.error("\n❌ デプロイエラー:", err.message);
    if (err.name === "UnrecognizedClientException" || err.name === "ExpiredTokenException") {
      console.error("\n⚠️  AWS 認証トークンが無効または期限切れです。");
      console.error("   以下のコマンドで再ログインしてください:");
      console.error("   aws sso login");
    }
    process.exit(1);
  }
}

main();
