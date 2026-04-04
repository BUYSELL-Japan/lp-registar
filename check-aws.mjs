import { APIGatewayClient, GetResourcesCommand, GetIntegrationCommand, GetMethodResponseCommand, GetIntegrationResponseCommand } from "@aws-sdk/client-api-gateway";
import { LambdaClient, GetFunctionCommand } from "@aws-sdk/client-lambda";

const apiId = "9xylwit7o5";
const region = "ap-southeast-2";

const apigw = new APIGatewayClient({ region });
const lambda = new LambdaClient({ region });

async function run() {
  try {
    const resources = await apigw.send(new GetResourcesCommand({ restApiId: apiId }));
    const registerStoreResource = resources.items.find(r => r.path === '/register-store');
    console.log("Resource:", JSON.stringify(registerStoreResource, null, 2));

    if (registerStoreResource && registerStoreResource.resourceMethods) {
      if (registerStoreResource.resourceMethods['OPTIONS']) {
        const optionsIntegration = await apigw.send(new GetIntegrationCommand({
          restApiId: apiId,
          resourceId: registerStoreResource.id,
          httpMethod: 'OPTIONS'
        }));
        console.log("OPTIONS Integration:", JSON.stringify(optionsIntegration, null, 2));
        
        // Try getting Method Response for OPTIONS
        try {
            const mResponse = await apigw.send(new GetMethodResponseCommand({
                restApiId: apiId, resourceId: registerStoreResource.id, httpMethod: 'OPTIONS', statusCode: '200'
            }));
            console.log("OPTIONS Method Response 200:", JSON.stringify(mResponse, null, 2));
            
            const iResponse = await apigw.send(new GetIntegrationResponseCommand({
                restApiId: apiId, resourceId: registerStoreResource.id, httpMethod: 'OPTIONS', statusCode: '200'
            }));
            console.log("OPTIONS Integration Response 200:", JSON.stringify(iResponse, null, 2));
        } catch(e) { console.log("No 200 response configured for OPTIONS"); }
      }
      
      if (registerStoreResource.resourceMethods['POST']) {
        const postIntegration = await apigw.send(new GetIntegrationCommand({
          restApiId: apiId,
          resourceId: registerStoreResource.id,
          httpMethod: 'POST'
        }));
        console.log("POST Integration:", JSON.stringify(postIntegration, null, 2));
        
        const uri = postIntegration.uri;
        if (uri) {
          const match = uri.match(/function:([a-zA-Z0-9-_]+)/);
          if (match) {
            const funcName = match[1];
            console.log("Found Lambda Function:", funcName);
            const lambdaInfo = await lambda.send(new GetFunctionCommand({ FunctionName: funcName }));
            console.log("Lambda Environment Variables:", JSON.stringify(lambdaInfo.Configuration.Environment, null, 2));
          }
        }
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
