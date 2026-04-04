import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const ddb = DynamoDBDocumentClient.from(client);

(async () => {
    try {
        const scan = await ddb.send(new ScanCommand({
            TableName: 'Stores',
            FilterExpression: 'Subdomain = :s OR subdomain = :s',
            ExpressionAttributeValues: { ':s': 'toamenya' }
        }));
        const store = scan.Items[0];
        console.log('Found store store_id:', store?.store_id);

        if (store) {
            const content = await ddb.send(new GetCommand({
                TableName: 'LP_Contents',
                Key: { store_id: store.store_id }
            }));
            if (content.Item && content.Item.ContentData) {
                const data = typeof content.Item.ContentData === 'string' ? JSON.parse(content.Item.ContentData) : content.Item.ContentData;
                console.log('ContentData keys:', Object.keys(data).join(', '));
                if (data.all) {
                  console.log('Found "all" key inside ContentData! Its keys are:', Object.keys(data.all).join(', '));
                }
            } else {
                console.log('No ContentData found in LP_Contents for this store ID.');
            }
        }
    } catch (e) {
        console.error(e);
    }
})();
