import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
// ★修正：本当のユーザー名を検索するための ListUsersCommand を追加
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { toRomaji } from 'wanakana';

const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// ★追加：Cognitoのクライアントを初期化
const cognitoClient = new CognitoIdentityProviderClient({ region: "ap-southeast-2" });

// 許可するオリジンのリスト
const ALLOWED_ORIGINS = [
    "https://register.yuimaru-ship.box-pals.com",
    "https://register.global-reaches.com",
    "https://shop.yuimaru-ship.box-pals.com",
    "http://localhost:5173"
];

export const handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    // リクエストのOriginをチェック
    let origin = "";
    if (event.headers) {
        origin = event.headers.origin || event.headers.Origin || "";
    }

    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const headers = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Content-Type": "application/json"
    };

    // ★修正箇所①：JSON解析の「前」にOPTIONSを処理して返す
    if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
        return { statusCode: 200, headers: headers, body: "" };
    }

    let parsedBody;
    try {
        parsedBody = JSON.parse(event.body);
    } catch (error) {
        console.error("Failed to parse event body:", error);
        return {
            statusCode: 400,
            headers: headers, 
            body: JSON.stringify({ message: "Invalid JSON format." }),
        };
    }

    try {
        const {
            store_id,
            Subdomain: subdomain, // ★修正：JSONの大文字 Subdomain を小文字の変数で受け取る
            storeNameKanji,
            storeNameFurigana,
            fullNameKanji,
            fullNameFurigana,
            zip,
            provinceKanji,
            provinceFurigana,
            cityKanji,
            cityFurigana,
            address1Kanji,
            address1Furigana,
            address2Kanji,
            address2Furigana,
            phone,
            contactEmail,
            cognito_sub, 
        } = parsedBody;

        if (!store_id || !cognito_sub) {
            return {
                statusCode: 400,
                headers: headers, 
                body: JSON.stringify({ message: "store_id and cognito_sub are required." }),
            };
        }

        const romajiStoreName = toRomaji(storeNameFurigana || "");
        const romajiFullName = toRomaji(fullNameFurigana || "");
        const romajiProvince = toRomaji(provinceFurigana || "");
        const romajiCity = toRomaji(cityFurigana || "");
        const romajiAddress1 = toRomaji(address1Furigana || "");
        const romajiAddress2 = toRomaji(address2Furigana || "");

        // ★追加: 既存のレコードがないか cognito_sub でチェック
        let finalStoreId = store_id;
        try {
            const scanCommand = new ScanCommand({
                TableName: "Stores",
                FilterExpression: "cognito_sub = :sub",
                ExpressionAttributeValues: {
                    ":sub": cognito_sub
                }
            });
            const scanResult = await ddbDocClient.send(scanCommand);
            if (scanResult.Items && scanResult.Items.length > 0) {
                // 既存のレコードがあれば、その store_id を再利用
                finalStoreId = scanResult.Items[0].store_id;
                console.log(`User already has a store. Reusing store_id: ${finalStoreId}`);
            }
        } catch (scanError) {
            console.error("Error scanning for existing store:", scanError);
            // スキャンエラー時はそのまま続行（既存ロジック通り新規生成される）
        }

        const putCommand = new PutCommand({
            TableName: "Stores",
            Item: {
                store_id: finalStoreId,
                Subdomain: subdomain, // 大文字を追加
                subdomain: subdomain, // 小文字も維持（既存データ互換性のため）
                cognito_sub: cognito_sub, 
                store_name: romajiStoreName,
                store_name_kanji: storeNameKanji,
                contact_email: contactEmail,
                created_at: new Date().toISOString(),
                from_address: {
                    address1: romajiAddress1,
                    address2: romajiAddress2 || "",
                    city: romajiCity,
                    country: "JP",
                    full_name: romajiFullName,
                    phone: phone,
                    province: romajiProvince,
                    zip: zip,
                },
            },
        });

        await ddbDocClient.send(putCommand);
        
        // ★修正箇所④：subを使って本当のユーザー名を検索し、Cognitoに custom:store_id を自動保存する処理
        const userPoolId = process.env.USER_POOL_ID;
        if (userPoolId) {
            try {
                // 1. sub を使って対象のユーザーを検索する
                const listUsersCommand = new ListUsersCommand({
                    UserPoolId: userPoolId,
                    Filter: `sub = "${cognito_sub}"`,
                    Limit: 1
                });
                const userListResponse = await cognitoClient.send(listUsersCommand);

                if (userListResponse.Users && userListResponse.Users.length > 0) {
                    // 検索で見つかった本当のユーザー名 (例: Google_xxxxxx) を取得
                    const actualUsername = userListResponse.Users[0].Username;
                    
                    // 2. 本当の Username を指定して属性を登録する
                    const updateAuthCommand = new AdminUpdateUserAttributesCommand({
                        UserPoolId: userPoolId,
                        Username: actualUsername, 
                        UserAttributes: [
                            { Name: "custom:store_id", Value: String(finalStoreId) }
                        ]
                    });
                    await cognitoClient.send(updateAuthCommand);
                    console.log(`Successfully updated custom:store_id for user ${actualUsername}`);
                } else {
                    console.error(`User with sub ${cognito_sub} not found in user pool.`);
                }
            } catch (cognitoError) {
                console.error("Error updating Cognito user attributes:", cognitoError);
                // ※万が一Cognitoの更新に失敗しても、DynamoDBの保存は成功しているためエラーにせず継続します
            }
        } else {
            console.warn("USER_POOL_ID environment variable is not set. Skipping Cognito custom:store_id update.");
        }

        return {
            statusCode: 200,
            headers: headers, 
            body: JSON.stringify({ message: "Store registered successfully!" }),
        };

    } catch (error) {
        console.error("Error registering store:", error);
        return {
            statusCode: 500,
            headers: headers, 
            body: JSON.stringify({ message: "Failed to register store.", error: error.message }),
        };
    }
};