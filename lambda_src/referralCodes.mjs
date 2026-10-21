/**
 * LP_ReferralCodes — 紹介コード管理 Lambda
 *
 * GET  /referral-codes : 紹介コード一覧 + コードごとの成約件数(Storesテーブル集計)を返す
 * POST /referral-codes : 新しい紹介コードを発行する { referral_code, agent_name }
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { verifyIdToken, getBearerToken } from "./cognitoAuth.mjs";

const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// AUTH_MODE=migration の間はトークンなしのリクエストも通す（警告ログのみ）。それ以外はトークン必須
const AUTH_MODE = process.env.AUTH_MODE === "migration" ? "migration" : "enforce";

// 紹介コードの発行・一覧は Cognito の admin グループに所属するユーザーだけに許可する
const ADMIN_GROUP = "admin";

async function authorizeAdmin(event) {
    const token = getBearerToken(event.headers || {});
    if (!token) {
        if (AUTH_MODE === "migration") {
            console.warn(`[AUTH_MIGRATION] referral-codes without token (${event.requestContext?.http?.method || event.httpMethod})`);
            return { ok: true };
        }
        return { ok: false, statusCode: 401, message: "Unauthorized" };
    }

    let claims;
    try {
        claims = await verifyIdToken(token);
    } catch (err) {
        console.warn("Token verification failed:", err.message);
        return { ok: false, statusCode: 401, message: "Unauthorized" };
    }

    const groups = claims["cognito:groups"] || [];
    if (!groups.includes(ADMIN_GROUP)) {
        console.warn(`Forbidden: sub ${claims.sub} is not in the ${ADMIN_GROUP} group`);
        return { ok: false, statusCode: 403, message: "Forbidden" };
    }
    return { ok: true };
}

const ALLOWED_ORIGINS = [
    "https://admin-lp.global-reaches.com",
    "http://localhost:5173"
];

export const handler = async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const headers = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    const method = event.httpMethod || event.requestContext?.http?.method || "GET";

    const auth = await authorizeAdmin(event);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, headers, body: JSON.stringify({ message: auth.message }) };
    }

    // ==========================
    // POST: 新規紹介コードの発行
    // ==========================
    if (method === "POST") {
        try {
            const body = JSON.parse(event.body || "{}");
            const agentName = (body.agent_name || "").trim();
            const referralCode = (body.referral_code || "").trim().toUpperCase();

            if (!referralCode || !agentName) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: "referral_code and agent_name are required." })
                };
            }

            await ddbDocClient.send(new PutCommand({
                TableName: "LP_ReferralCodes",
                Item: {
                    referral_code: referralCode,
                    agent_name: agentName,
                    active: true,
                    created_at: new Date().toISOString(),
                },
                ConditionExpression: "attribute_not_exists(referral_code)"
            }));

            console.log(`Created referral code ${referralCode} for agent ${agentName}`);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, referral_code: referralCode })
            };
        } catch (err) {
            if (err.name === "ConditionalCheckFailedException") {
                return {
                    statusCode: 409,
                    headers,
                    body: JSON.stringify({ message: "This referral code already exists." })
                };
            }
            console.error("Error creating referral code:", err);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: "Failed to create referral code.", error: err.message })
            };
        }
    }

    // ==========================
    // GET: 紹介コード一覧 + 成約件数の集計
    // ==========================
    try {
        const [codesResult, storesResult] = await Promise.all([
            ddbDocClient.send(new ScanCommand({ TableName: "LP_ReferralCodes" })),
            ddbDocClient.send(new ScanCommand({
                TableName: "Stores",
                ProjectionExpression: "referral_code",
                FilterExpression: "attribute_exists(referral_code)"
            })),
        ]);

        const conversionCounts = {};
        for (const store of storesResult.Items || []) {
            const code = store.referral_code;
            if (!code) continue;
            conversionCounts[code] = (conversionCounts[code] || 0) + 1;
        }

        const codes = (codesResult.Items || []).map(item => ({
            referralCode: item.referral_code,
            agentName: item.agent_name,
            active: item.active !== false,
            createdAt: item.created_at || null,
            conversionCount: conversionCounts[item.referral_code] || 0,
        })).sort((a, b) => b.conversionCount - a.conversionCount);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ codes })
        };
    } catch (err) {
        console.error("Error fetching referral codes:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: "Failed to fetch referral codes.", error: err.message })
        };
    }
};
