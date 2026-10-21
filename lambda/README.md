# Lambda 一覧（lp-registar）

登録・決済まわりの Lambda（リージョン ap-southeast-2）。2026-10-21 に本番のコードを `aws lambda get-function` で取得して、リポジトリと照合した。

| 元コード | Lambda 関数 | ハンドラ | 呼び出し元 | ランタイム | タイムアウト / メモリ | 環境変数（名前のみ） | 本番との差 |
|---|---|---|---|---|---|---|---|
| `lambda_src/index.mjs` | registerStore | `index.handler` | `9xylwit7o5/prod` POST `/register-store` | nodejs22.x | 10秒 / 128MB | `USER_POOL_ID`、`AUTH_MODE` | なし |
| `lambda_src/checkStore.mjs` | LP_CheckStore | `index.handler` | `9xylwit7o5/prod` POST `/check-store` | nodejs24.x | 3秒 / 128MB | なし | **あり（下記）** |
| `lambda_src/createCheckoutSession.mjs` | LP_CreateCheckoutSession | `createCheckoutSession.handler` | `1p5i8eve1i`（HTTP API）POST `/checkout` | nodejs24.x | 10秒 / 128MB | `STRIPE_SECRET_KEY`、`STRIPE_SUCCESS_URL`、`STRIPE_CANCEL_URL`、`STRIPE_PRICE_MONTHLY`（月額）、`STRIPE_PRICE_INITIAL_FEE`（初期費用） | なし |
| `lambda_src/stripeWebhook.mjs` | LP_StripeWebhook | `stripeWebhook.handler` | `1p5i8eve1i` POST `/webhook` | nodejs24.x | 10秒 / 128MB | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`CLOUDFLARE_WEBHOOK_URL`（LP_SaveContent と同じ値） | なし |
| `lambda_src/createPortalSession.mjs` | LP_CreatePortalSession | `createPortalSession.handler` | `1p5i8eve1i` POST `/create-portal-session` | nodejs24.x | 3秒 / 128MB | `STRIPE_SECRET_KEY` | なし |
| `lambda/LP_CreateCustomerPortalSession/` | LP_CreateCustomerPortalSession | `index.handler` | `1p5i8eve1i` POST `/customer-portal` | nodejs24.x | 10秒 / 128MB | `STRIPE_SECRET_KEY`、`DYNAMODB_TABLE` | なし |
| `lambda_src/referralCodes.mjs` | LP_ReferralCodes | `referralCodes.handler` | `1p5i8eve1i` GET・POST `/referral-codes` | nodejs24.x | 10秒 / 128MB | `AUTH_MODE` | なし |
| `lambda_src/reminderEmail.mjs` | LP_ReminderEmail | `reminderEmail.handler` | EventBridge ルール `LP_ReminderEmail_Schedule`（`rate(1 hour)`） | nodejs20.x | 30秒 / 128MB | `RESEND_API_KEY`、`RESEND_FROM_EMAIL` | なし |
| `lambda/StoreId-Injector/` | StoreId-Injector | `index.handler` | Cognito ユーザープール `ap-southeast-2_usnGBI9WI` の Pre Token Generation（V2_0） | nodejs22.x | 3秒 / 128MB | なし | なし（今回追加） |

- `lambda_src/` を使う関数は、`deploy-all.mjs` が `lambda_src/` 全体を1つの zip にしてデプロイしている（ハンドラ名でファイルを切り替える）。registerStore と LP_CheckStore は別の手順で、ファイル1つを `index.mjs` として載せている。registerStore は `lambda_src/index.mjs` と `cognitoAuth.mjs` を、`node_modules`（wanakana など）入りの zip に入れてデプロイする。
- `lambda_src/LP_GetSettings.mjs` はどの関数にもデプロイされていない。`/lp/settings` を処理しているのは lp-baseline-theme の `lambda/LP_iframe/`。
- `1p5i8eve1i`（Landy-Payment-API）のルートにはオーソライザーが付いていない。

## 認証（AUTH_MODE）

- registerStore と LP_ReferralCodes は Cognito の ID トークン（`Authorization: Bearer`）を検証する。
  - registerStore：`cognito_sub` はリクエスト本文ではなくトークンから取る。本文の値と食い違えば 403。サブドメインが他の店舗と重複する、または予約語（`www`・`register`・`admin`・`admin-lp`・`api`・`demo-` で始まるもの）なら 409（`code: SUBDOMAIN_TAKEN`）。
  - LP_ReferralCodes：Cognito の `admin` グループに所属するユーザーだけ許可（ID トークンの `cognito:groups`）。
- 環境変数 `AUTH_MODE=migration` の間は、トークンなしのリクエストも通して `[AUTH_MIGRATION]` の警告ログを出す。トークンが付いていれば検証する。`AUTH_MODE` を外す（または `enforce`）とトークン必須になる。

## Stripe Webhook（LP_StripeWebhook）

| イベント | 処理 |
|---|---|
| `checkout.session.completed` | Stores を `active` にし、サブスクリプションID・顧客ID・テーマ・紹介コードを保存 |
| `customer.subscription.updated`・`customer.subscription.deleted`・`invoice.payment_failed`・`invoice.paid` | Stripe から最新のサブスクリプションを取得し、その `status` を `subscription_status` に保存（順番の前後・重複に強い）。店舗に別のサブスクリプションが紐付いていれば何もしない |

- `unpaid`・`canceled` の店舗は LP_ListStores が公開対象から外す（`past_due` は公開を続ける）。この境目をまたいで状態が変わったときは、Cloudflare の Deploy Hook を呼んで再ビルドする。
- Stripe ダッシュボードの Webhook エンドポイントで、上の5イベントを送信対象にしておく必要がある。

## 本番とリポジトリの差（2026-10-21 時点）

**registerStore**：差はなくなった（2026-10-21、本番にだけあった Subdomain の大文字・小文字の処理と、リポジトリにだけあった store_id の使い回し処理を両方取り込んでデプロイした）。

**LP_CheckStore**（`lambda_src/checkStore.mjs`）。処理の中身は同じ。
- リポジトリ版は CORS の許可に `https://shop.yuimaru-ship.box-pals.com` と `http://localhost:4321` が多い。
- リポジトリ版は 500 エラーのときに `error.message` を返す（本番は返さない）。
