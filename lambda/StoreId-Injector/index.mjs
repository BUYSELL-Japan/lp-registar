export const handler = async (event) => {
    // ログインしようとしているユーザーのメールアドレスと、Cognitoに登録済みの属性
    const email = event.request.userAttributes.email;
    const existingStoreId = event.request.userAttributes['custom:store_id'];
   
    // 特定のメールアドレスを、強制的に特定の店舗に紐付ける場合のみここを使用
    const storeMapping = {
        // "あなたのメールアドレス@gmail.com": "OKI1011",
    };
  
    // 【重要】
    // 1. マッピングに合致すればそれを優先
    // 2. なければ、Cognito画面でちゃんと設定した `custom:store_id` (TOA1011など) をそのまま使う
    const storeId = storeMapping[email] || existingStoreId;
  
    // storeIdが正しく存在する場合のみ、トークンに注入する
    if (storeId) {
        event.response = {
            claimsAndScopeOverrideDetails: {
                idTokenGeneration: {
                    claimsToAddOrOverride: {
                        "custom:store_id": storeId
                    }
                },
                accessTokenGeneration: {
                    claimsToAddOrOverride: {
                        "custom:store_id": storeId
                    }
                }
            }
        };
        console.log(`Assigned store_id: ${storeId} to email: ${email}`);
    } else {
        console.log(`No valid storeId mapping found for ${email}`);
    }
  
    return event;
  };
  