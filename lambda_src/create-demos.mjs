import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const REGION = "ap-southeast-2";
const ddbClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// 対象となる「こと麺屋」の完成したテスト店舗ID
const SOURCE_STORE_ID = "01KP1TR2KAEG7Q64BP67RNAW3E";

// 生成する4つのデモ店舗のデータマッピング
const DEMO_TARGETS = [
    { store_id: "demo-theme1", subdomain: "demo-standard", templateId: "theme1" },
    { store_id: "demo-theme2", subdomain: "demo-modern", templateId: "theme2" },
    { store_id: "demo-theme3", subdomain: "demo-elegant", templateId: "theme3" },
    { store_id: "demo-theme4", subdomain: "demo-tropical", templateId: "theme4" },
];

async function main() {
    console.log(`🚀 ソース店舗[${SOURCE_STORE_ID}]からデモデータを複製開始します...\n`);

    try {
        // 1. 店舗情報 (Stores) の取得
        const storeRes = await docClient.send(new GetCommand({
            TableName: "Stores",
            Key: { store_id: SOURCE_STORE_ID }
        }));
        if (!storeRes.Item) throw new Error("Storesテーブルにソースデータが見つかりません。");
        const sourceStore = storeRes.Item;

        // 2. LPコンテンツ情報 (LP_Contents) の取得
        const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
        const contentRes = await docClient.send(new QueryCommand({
            TableName: "LP_Contents",
            KeyConditionExpression: "store_id = :sid",
            ExpressionAttributeValues: { ":sid": SOURCE_STORE_ID }
        }));
        if (!contentRes.Items || contentRes.Items.length === 0) throw new Error("LP_Contentsテーブルにソースデータが見つかりません。");
        const sourceContent = contentRes.Items[0];

        for (const target of DEMO_TARGETS) {
            console.log(`🔄 デモ店舗作成中: ${target.store_id} (サブドメイン: ${target.subdomain})`);

            // 3. Storesへの新しいダミーレコード投入
            const newStore = {
                ...sourceStore,
                store_id: target.store_id,
                subdomain: target.subdomain,
                Subdomain: target.subdomain, 
                templateId: target.templateId, // ここでテーマを上書き！
                subscription_status: "active", // 強制的にアクティブに
                cognito_sub: "demo-user-skip-auth", // ログイン不要なのでダミー入れ
            };

            await docClient.send(new PutCommand({
                TableName: "Stores",
                Item: newStore
            }));
            console.log("   ✅ Storesテーブルに登録しました");

            // 4. LP_Contentsへの新しいコンテンツ投入
            const newContent = {
                ...sourceContent,
                store_id: target.store_id, // 新しい店舗IDに紐付け！
                Subdomain: target.subdomain,
                CreatedAt: new Date().toISOString(),
                UpdatedAt: new Date().toISOString()
            };
            
            // コンテンツ内のテーマ設定も上書きする（Astroがこちらを優先してしまうため）
            if (newContent.ContentData) {
                let parsedContentData = typeof newContent.ContentData === 'string' 
                    ? JSON.parse(newContent.ContentData) 
                    : newContent.ContentData;
                
                parsedContentData.templateId = target.templateId;
                if (!parsedContentData.settings) {
                    parsedContentData.settings = {};
                }
                parsedContentData.settings.theme = target.templateId;
                
                newContent.ContentData = typeof newContent.ContentData === 'string'
                    ? JSON.stringify(parsedContentData)
                    : parsedContentData;
            }

            await docClient.send(new PutCommand({
                TableName: "LP_Contents",
                Item: newContent
            }));
            console.log("   ✅ LP_Contentsテーブルに登録しました\n");
        }

        console.log("🎉 すべてのデモサイトデータの自動構築が完了しました！");
        
    } catch (err) {
        console.error("❌ エラーが発生しました:", err);
    }
}

main();
