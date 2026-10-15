/**
 * cognitoAuth.mjs
 * Cognito ID トークン（JWT）の検証と、店舗へのアクセス権チェック。
 * 外部ライブラリ不要（Node.js 標準の crypto のみ使用）。
 *
 * ※ 同じファイルを各 Lambda の zip に同梱している。修正時は全コピーを揃えること:
 *   - lp-baseline-theme/lambda/shared/cognitoAuth.mjs（原本）
 *   - lp-baseline-theme/lambda/LP_GetContent/, LP_SaveContent/
 *   - lp-registar/lambda_src/（LP_CreatePortalSession ほか）
 *   - lp-registar/lambda/LP_CreateCustomerPortalSession/
 */

import { createPublicKey, createVerify } from "node:crypto";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

const REGION = "ap-southeast-2";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "ap-southeast-2_usnGBI9WI";
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || "12nf22nqg8mpcq1q77nm5uqbls";
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
const STORES_TABLE = "Stores";

let jwksCache = null;

async function fetchJwks() {
  const res = await fetch(`${ISSUER}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
  const { keys } = await res.json();
  jwksCache = keys;
  return keys;
}

async function findKey(kid) {
  let keys = jwksCache || (await fetchJwks());
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    // 鍵のローテーションに備えて1回だけ取り直す
    keys = await fetchJwks();
    jwk = keys.find((k) => k.kid === kid);
  }
  return jwk || null;
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/**
 * ID トークンを検証し、クレームを返す。不正な場合は例外を投げる。
 */
export async function verifyIdToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeSegment(headerB64);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported token header");

  const jwk = await findKey(header.kid);
  if (!jwk) throw new Error("Unknown signing key");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const valid = verifier.verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(signatureB64, "base64url"));
  if (!valid) throw new Error("Invalid signature");

  const claims = decodeSegment(payloadB64);
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) throw new Error("Invalid issuer");
  if (claims.token_use !== "id") throw new Error("Not an ID token");
  if (claims.aud !== CLIENT_ID) throw new Error("Invalid audience");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("Token expired");
  if (!claims.sub) throw new Error("Missing sub");

  return claims;
}

export function getBearerToken(headers = {}) {
  const value = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

/**
 * リクエストのトークンを検証し、そのユーザーが storeId の店舗を操作できるか確認する。
 * 許可条件: トークンの custom:store_id が一致する、または Stores テーブルの cognito_sub がトークンの sub と一致する。
 *
 * @returns {Promise<{ok: true, claims: object} | {ok: false, statusCode: number, message: string}>}
 */
export async function authorizeStoreAccess(event, storeId, ddbDocClient) {
  const token = getBearerToken(event.headers || {});
  if (!token) return { ok: false, statusCode: 401, message: "Unauthorized" };

  let claims;
  try {
    claims = await verifyIdToken(token);
  } catch (err) {
    console.warn("Token verification failed:", err.message);
    return { ok: false, statusCode: 401, message: "Unauthorized" };
  }

  if (!storeId) return { ok: false, statusCode: 400, message: "Store ID is required." };

  if (claims["custom:store_id"] && claims["custom:store_id"] === storeId) {
    return { ok: true, claims };
  }

  try {
    const { Item } = await ddbDocClient.send(new GetCommand({
      TableName: STORES_TABLE,
      Key: { store_id: storeId },
      ProjectionExpression: "cognito_sub",
    }));
    if (Item && Item.cognito_sub === claims.sub) {
      return { ok: true, claims };
    }
  } catch (err) {
    console.error("Failed to look up store owner:", err);
    return { ok: false, statusCode: 500, message: "Authorization check failed" };
  }

  console.warn(`Forbidden: sub ${claims.sub} attempted to access store ${storeId}`);
  return { ok: false, statusCode: 403, message: "Forbidden" };
}
