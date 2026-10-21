# Lambda 一覧（lp-registar）

登録・決済まわりの Lambda（リージョン ap-southeast-2）。2026-10-21 に本番のコードを `aws lambda get-function` で取得して、リポジトリと照合した。

| 元コード | Lambda 関数 | ハンドラ | 呼び出し元 | ランタイム | タイムアウト / メモリ | 環境変数（名前のみ） | 本番との差 |
|---|---|---|---|---|---|---|---|
| `lambda_src/index.mjs` | registerStore | `index.handler` | `9xylwit7o5/prod` POST `/register-store` | nodejs22.x | 3秒 / 128MB | `USER_POOL_ID` | **あり（下記）** |
| `lambda_src/checkStore.mjs` | LP_CheckStore | `index.handler` | `9xylwit7o5/prod` POST `/check-store` | nodejs24.x | 3秒 / 128MB | なし | **あり（下記）** |
| `lambda_src/createCheckoutSession.mjs` | LP_CreateCheckoutSession | `createCheckoutSession.handler` | `1p5i8eve1i`（HTTP API）POST `/checkout` | nodejs24.x | 10秒 / 128MB | `STRIPE_SECRET_KEY`、`STRIPE_SUCCESS_URL`、`STRIPE_CANCEL_URL` | なし |
| `lambda_src/stripeWebhook.mjs` | LP_StripeWebhook | `stripeWebhook.handler` | `1p5i8eve1i` POST `/webhook` | nodejs24.x | 10秒 / 128MB | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` | なし |
| `lambda_src/createPortalSession.mjs` | LP_CreatePortalSession | `createPortalSession.handler` | `1p5i8eve1i` POST `/create-portal-session` | nodejs24.x | 3秒 / 128MB | `STRIPE_SECRET_KEY` | なし |
| `lambda/LP_CreateCustomerPortalSession/` | LP_CreateCustomerPortalSession | `index.handler` | `1p5i8eve1i` POST `/customer-portal` | nodejs24.x | 10秒 / 128MB | `STRIPE_SECRET_KEY`、`DYNAMODB_TABLE` | なし |
| `lambda_src/referralCodes.mjs` | LP_ReferralCodes | `referralCodes.handler` | `1p5i8eve1i` GET・POST `/referral-codes` | nodejs24.x | 10秒 / 128MB | なし | なし |
| `lambda_src/reminderEmail.mjs` | LP_ReminderEmail | `reminderEmail.handler` | EventBridge ルール `LP_ReminderEmail_Schedule`（`rate(1 hour)`） | nodejs20.x | 30秒 / 128MB | `RESEND_API_KEY`、`RESEND_FROM_EMAIL` | なし |
| `lambda/StoreId-Injector/` | StoreId-Injector | `index.handler` | Cognito ユーザープール `ap-southeast-2_usnGBI9WI` の Pre Token Generation（V2_0） | nodejs22.x | 3秒 / 128MB | なし | なし（今回追加） |

- `lambda_src/` を使う関数は、`deploy-all.mjs` が `lambda_src/` 全体を1つの zip にしてデプロイしている（ハンドラ名でファイルを切り替える）。registerStore と LP_CheckStore は別の手順で、ファイル1つを `index.mjs` として載せている。
- `lambda_src/LP_GetSettings.mjs` はどの関数にもデプロイされていない。`/lp/settings` を処理しているのは lp-baseline-theme の `lambda/LP_iframe/`。
- `1p5i8eve1i`（Landy-Payment-API）のルートにはオーソライザーが付いていない。

## 本番とリポジトリの差（2026-10-21 時点）

**registerStore**（`lambda_src/index.mjs`）。リポジトリ版を本番に出すと挙動が変わるので注意。
- リポジトリにだけあるもの：同じ `cognito_sub` の店舗が既にあれば、その `store_id` を使い回すスキャン処理。本番には入っていない。
- 本番にだけあるもの：`Subdomain` と `subdomain` のどちらで送られてきても受け取る処理。リポジトリ版は `Subdomain` しか読まない。
- 認証対応（フェーズ3）でこのファイルを書き直すときに、両方を取り込んで揃える。

**LP_CheckStore**（`lambda_src/checkStore.mjs`）。処理の中身は同じ。
- リポジトリ版は CORS の許可に `https://shop.yuimaru-ship.box-pals.com` と `http://localhost:4321` が多い。
- リポジトリ版は 500 エラーのときに `error.message` を返す（本番は返さない）。
