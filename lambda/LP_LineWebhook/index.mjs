/**
 * LP_LineWebhook — Landyパートナー用 LINE 公式アカウントの Webhook
 *
 * パートナーが「URL希望」と送ると、その LINE ユーザー専用の紹介コード（LP001, LP002...）を
 * LP_ReferralCodes に発行し、紹介URLを応答メッセージで返す。同じユーザーには同じコードを返す。
 *
 * 呼び出し元: API Gateway HTTP API（1p5i8eve1i）POST /line/webhook
 * 環境変数:
 *   LINE_CHANNEL_SECRET        … 署名（x-line-signature）の検証に使う
 *   LINE_CHANNEL_ACCESS_TOKEN  … 応答メッセージ・プロフィール取得に使う
 *   LP_BASE_URL                … 紹介URLのベース（省略時 https://webdesign.neural-seeds.com/）
 */

import crypto from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "ap-southeast-2" }));
const TABLE = "LP_ReferralCodes";
const CODE_PREFIX = "LP";
const CODE_DIGITS = 3;
const LP_BASE_URL = process.env.LP_BASE_URL || "https://webdesign.neural-seeds.com/";

// 紹介URLを返すキーワード（前後の空白・全角/半角の違いは吸収する）
const KEYWORDS = ["URL希望", "紹介URL"];

const ok = () => ({ statusCode: 200, body: "OK" });

function normalize(text) {
    return String(text || "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}
const NORMALIZED_KEYWORDS = KEYWORDS.map(normalize);

function getRawBody(event) {
    const body = event.body || "";
    return event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}

function verifySignature(rawBody, signature, secret) {
    if (!signature || !secret) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest();
    let given;
    try {
        given = Buffer.from(signature, "base64");
    } catch {
        return false;
    }
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function scanAll(params) {
    const items = [];
    let ExclusiveStartKey;
    do {
        const res = await ddb.send(new ScanCommand({ ...params, ExclusiveStartKey }));
        items.push(...(res.Items || []));
        ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

async function findCodeByLineUser(lineUserId) {
    const items = await scanAll({
        TableName: TABLE,
        FilterExpression: "line_user_id = :u",
        ExpressionAttributeValues: { ":u": lineUserId },
    });
    // 万一複数あれば、最初に作られたものを使う
    items.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    return items[0] || null;
}

async function nextSequence() {
    const items = await scanAll({ TableName: TABLE, ProjectionExpression: "referral_code" });
    const pattern = new RegExp(`^${CODE_PREFIX}(\\d+)$`);
    let max = 0;
    for (const { referral_code } of items) {
        const m = pattern.exec(referral_code || "");
        if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
}

async function createCode(lineUserId, agentName) {
    let seq = await nextSequence();
    // 同時に発行されて番号がぶつかったら、次の番号で取り直す
    for (let attempt = 0; attempt < 10; attempt++, seq++) {
        const code = `${CODE_PREFIX}${String(seq).padStart(CODE_DIGITS, "0")}`;
        try {
            await ddb.send(new PutCommand({
                TableName: TABLE,
                Item: {
                    referral_code: code,
                    agent_name: agentName,
                    active: true,
                    created_at: new Date().toISOString(),
                    line_user_id: lineUserId,
                    source: "line",
                },
                ConditionExpression: "attribute_not_exists(referral_code)",
            }));
            console.log(`Created referral code ${code} for LINE user ${lineUserId} (${agentName})`);
            return code;
        } catch (err) {
            if (err.name !== "ConditionalCheckFailedException") throw err;
        }
    }
    throw new Error("Could not allocate a referral code after 10 attempts");
}

async function lineApi(path, init = {}) {
    const res = await fetch(`https://api.line.me${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
        },
    });
    if (!res.ok) {
        throw new Error(`LINE API ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res;
}

async function getDisplayName(lineUserId) {
    try {
        const res = await lineApi(`/v2/bot/profile/${encodeURIComponent(lineUserId)}`);
        const profile = await res.json();
        return (profile.displayName || "").trim() || "LINEパートナー";
    } catch (err) {
        // 友だち追加されていない・ブロック中などで取れないことがある
        console.warn("Profile fetch failed:", err.message);
        return "LINEパートナー";
    }
}

async function reply(replyToken, text) {
    await lineApi("/v2/bot/message/reply", {
        method: "POST",
        body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
    });
}

function buildReferralUrl(code) {
    const url = new URL(LP_BASE_URL);
    url.searchParams.set("ref", code);
    return url.toString();
}

async function handleUrlRequest(ev) {
    const lineUserId = ev.source?.userId;
    if (!lineUserId) {
        console.warn("No userId in event source:", JSON.stringify(ev.source));
        return;
    }

    let item = await findCodeByLineUser(lineUserId);
    let code;
    if (item) {
        if (item.active === false) {
            await reply(ev.replyToken, "現在、紹介URLはご利用いただけません。お手数ですが運営までお問い合わせください。");
            return;
        }
        code = item.referral_code;
    } else {
        const agentName = await getDisplayName(lineUserId);
        code = await createCode(lineUserId, agentName);
    }

    await reply(
        ev.replyToken,
        `あなた専用の紹介URLです。\n${buildReferralUrl(code)}\n\n紹介コード：${code}\nこのURLからお申し込みいただくと、あなたの紹介として記録されます。`
    );
}

export const handler = async (event) => {
    const rawBody = getRawBody(event);
    const headers = event.headers || {};
    const signature = headers["x-line-signature"] || headers["X-Line-Signature"];

    if (!verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
        console.warn("Invalid LINE signature");
        return { statusCode: 401, body: "Invalid signature" };
    }

    let payload;
    try {
        payload = JSON.parse(rawBody || "{}");
    } catch {
        return { statusCode: 400, body: "Invalid JSON" };
    }

    // LINE Developers の「検証」ボタンは events が空で届く
    for (const ev of payload.events || []) {
        try {
            if (ev.type !== "message" || ev.message?.type !== "text") continue;
            if (ev.deliveryContext?.isRedelivery) {
                // 再送では replyToken が使えないことがあるが、コードの発行・取得は冪等なので処理してよい
                console.log("Redelivered event", ev.webhookEventId);
            }
            if (!NORMALIZED_KEYWORDS.includes(normalize(ev.message.text))) continue;
            await handleUrlRequest(ev);
        } catch (err) {
            console.error("Failed to handle LINE event:", err);
        }
    }

    // LINE には常に 200 を返す（エラーで再送が続かないように）
    return ok();
};
