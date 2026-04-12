import React, { useState, useEffect } from 'react';
import { Building, User, MapPin, Phone, Mail, CheckCircle, LogIn, Sparkles, ShieldCheck } from 'lucide-react';

// ULID生成用の関数 (Crockford's Base32)
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const generateULID = () => {
  const time = Date.now();
  const timeStr = Array.from({ length: 10 }, (_, i) => {
    const bit = Math.floor(time / Math.pow(32, 9 - i)) % 32;
    return ENCODING[bit];
  }).join('');
  const randomStr = Array.from({ length: 16 }, () => ENCODING[Math.floor(Math.random() * ENCODING.length)]).join('');
  return timeStr + randomStr;
};

interface FormData {
  store_id: string;
  subdomain: string;
  storeNameKanji: string;
  storeNameFurigana: string;
  fullNameKanji: string;
  fullNameFurigana: string;
  zip: string;
  provinceKanji: string;
  provinceFurigana: string;
  cityKanji: string;
  cityFurigana: string;
  address1Kanji: string;
  address1Furigana: string;
  address2Kanji: string;
  address2Furigana: string;
  phone: string;
  contactEmail: string;
  emailConfirm: string;
  sub?: string; // Google認証のsubを追加
}

interface FormErrors {
  [key: string]: string;
}

interface UserInfo {
  sub: string;
  email: string;
  name: string;
}

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];


function App() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    store_id: '',
    subdomain: '',
    storeNameKanji: '',
    storeNameFurigana: '',
    fullNameKanji: '',
    fullNameFurigana: '',
    zip: '',
    provinceKanji: '',
    provinceFurigana: '',
    cityKanji: '',
    cityFurigana: '',
    address1Kanji: '',
    address1Furigana: '',
    address2Kanji: '',
    address2Furigana: '',
    phone: '',
    contactEmail: '',
    emailConfirm: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  // URLからauthorization codeを取得してユーザー情報を取得
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // LPから渡されたテーマとプランを保存
    const theme = urlParams.get('theme');
    const plan = urlParams.get('plan');
    if (theme) sessionStorage.setItem('landy_theme', theme);
    if (plan) sessionStorage.setItem('landy_plan', plan);

    const code = urlParams.get('code');
    if (code) {
      // authorization codeを使ってユーザー情報を取得
      exchangeCodeForUserInfo(code);
    } else {
      setIsLoading(false);
    }
  }, []);

  // 動的にリダイレクトURIを取得
  const getRedirectUri = () => {
    // 末尾にスラッシュを付けて、Cognito側の設定（例: https://example.com/）と合わせる
    return `${window.location.origin}/`;
  };

  const getGoogleLoginUrl = () => {
    const redirectUri = encodeURIComponent(getRedirectUri());
    return `https://ap-southeast-2usnGBI9WI.auth.ap-southeast-2.amazoncognito.com/login?response_type=code&client_id=12nf22nqg8mpcq1q77nm5uqbls&scope=email+openid+profile&redirect_uri=${redirectUri}`;
  };

  const exchangeCodeForUserInfo = async (code: string) => {
    try {
      // トークンエンドポイントでaccess tokenを取得
      const tokenResponse = await fetch('https://ap-southeast-2usnGBI9WI.auth.ap-southeast-2.amazoncognito.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: '12nf22nqg8mpcq1q77nm5uqbls',
          code: code,
          redirect_uri: getRedirectUri(),
        }),
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        
        // access tokenを使ってユーザー情報を取得
        const userResponse = await fetch('https://ap-southeast-2usnGBI9WI.auth.ap-southeast-2.amazoncognito.com/oauth2/userInfo', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
          },
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          console.log('Cognito userInfo取得:', userData);
          console.log('sub:', userData.sub);
          console.log('email:', userData.email);
          console.log('name:', userData.name);

          setUserInfo({
            sub: userData.sub,
            email: userData.email,
            name: userData.name || userData.email,
          });

          // URLからcodeパラメータを削除
          window.history.replaceState({}, document.title, window.location.pathname);

          // ========= 再訪ユーザーのチェック処理 =========
          try {
             console.log("既存の店舗情報を確認中...");
             // FIXME: /check-store を構築したAPI GatewayのURLに変更して使う (register-storeと同等のホストを想定)
             const checkResponse = await fetch('https://9xylwit7o5.execute-api.ap-southeast-2.amazonaws.com/prod/check-store', { 
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ cognito_sub: userData.sub })
             });
             
             if (checkResponse.ok) {
                const storeData = await checkResponse.json();
                if (storeData.found) {
                   if (storeData.subscriptionStatus === 'active') {
                      alert("すでに決済が完了しています。管理画面へ移動します。");
                      window.location.href = "https://admin-lp.global-reaches.com/";
                      return; // 以降の処理を止める
                   } else {
                      // 登録済みだが未決済の場合は、フォームをスキップしてStripeへ飛ばす
                      alert("店舗情報は登録済みです。サイトを公開するには決済画面へお進みください。");
                      setIsSubmitted(true); // 登録済み画面(ローディング)扱いに
                      
                      const savedTheme = sessionStorage.getItem('landy_theme') || storeData.templateId || 'theme1';
                      const savedPlan = sessionStorage.getItem('landy_plan') || 'monthly';
                      
                      console.log("既存店舗の決済セッションを作成中...");
                      const checkoutResponse = await fetch("https://1p5i8eve1i.execute-api.ap-southeast-2.amazonaws.com/prod/checkout", {
                         method: "POST",
                         headers: { "Content-Type": "application/json" },
                         body: JSON.stringify({
                           storeId: storeData.storeId,
                           planType: savedPlan,
                           templateId: savedTheme
                         })
                      });
                      
                      if (checkoutResponse.ok) {
                         const checkoutData = await checkoutResponse.json();
                         if (checkoutData.url) {
                            window.location.href = checkoutData.url;
                            return;
                         }
                      }
                      console.error("決済セッション作成エラー", checkoutResponse);
                   }
                }
             }
          } catch (checkErr) {
             console.error("既存店舗の確認中にエラーが発生しました（新規登録として続行）:", checkErr);
          }
          // ============================================
        } else {
          console.error('userInfo取得失敗:', userResponse.status, userResponse.statusText);
        }
      }
    } catch (error) {
      console.error('認証エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = getGoogleLoginUrl();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // 郵便番号の自動フォーマット
    let formattedValue = value;
    if (name === 'zip') {
      formattedValue = value.replace(/\D/g, '').replace(/^(\d{3})(\d{4})$/, '$1-$2');
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: formattedValue
    }));

    // エラーをクリア
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // 必須項目のチェック (store_id は自動生成のため除外)
    const requiredFields = [
      'subdomain', 'storeNameKanji', 'storeNameFurigana', 'fullNameKanji', 'fullNameFurigana',
      'zip', 'provinceKanji', 'cityKanji', 'address1Kanji', 'phone', 'contactEmail', 'emailConfirm'
    ];

    requiredFields.forEach(field => {
      if (!formData[field as keyof FormData]?.toString().trim()) {
        newErrors[field] = 'この項目は必須です';
      }
    });

    // 郵便番号の形式チェック
    if (formData.zip && !/^\d{3}-\d{4}$/.test(formData.zip)) {
      newErrors.zip = '正しい郵便番号の形式で入力してください（例：123-4567）';
    }

    // 電話番号の形式チェック
    if (formData.phone && !/^[\d-]+$/.test(formData.phone)) {
      newErrors.phone = '正しい電話番号の形式で入力してください';
    }

    // メールアドレスの形式チェック
    if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      newErrors.contactEmail = '正しいメールアドレスの形式で入力してください';
    }

    // メールアドレス確認チェック
    if (formData.contactEmail !== formData.emailConfirm) {
      newErrors.emailConfirm = 'メールアドレスが一致しません';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('=== フォーム送信開始 ===');
    console.log('userInfo:', userInfo);
    console.log('formData:', formData);

    const isValid = validateForm();
    console.log('バリデーション結果:', isValid);
    console.log('エラー内容:', errors);

    if (isValid && userInfo) {
      // emailConfirm と小文字の subdomain を除外し、
      // 大文字の Subdomain と cognito_sub を含めたデータを作成
      // store_id が空の場合はULIDを生成
      const finalStoreId = formData.store_id || generateULID();
      const { emailConfirm, subdomain, ...formDataWithoutConfirm } = formData;
      const dataWithSub = {
        ...formDataWithoutConfirm,
        store_id: finalStoreId,
        Subdomain: subdomain,
        cognito_sub: userInfo.sub
      };

      console.log('POST送信データ:', dataWithSub);
      console.log('送信するJSON:', JSON.stringify(dataWithSub));
      console.log('cognito_sub の値:', userInfo.sub);

      // AWS API GatewayへPOST送信
      try {
        console.log('fetch開始...');
        const response = await fetch('https://9xylwit7o5.execute-api.ap-southeast-2.amazonaws.com/prod/register-store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dataWithSub)
        });

        console.log('レスポンス受信:', response);
        console.log('ステータス:', response.status);
        console.log('ステータステキスト:', response.statusText);

        if (response.ok) {
          // 店舗情報保存成功後、自動的にStripe決済画面を作成して遷移
          const savedTheme = sessionStorage.getItem('landy_theme') || 'theme1';
          const savedPlan = sessionStorage.getItem('landy_plan') || 'monthly';
          
          try {
            console.log('Stripe決済セッションを作成中...');
            const checkoutResponse = await fetch("https://1p5i8eve1i.execute-api.ap-southeast-2.amazonaws.com/prod/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storeId: finalStoreId,
                planType: savedPlan,
                templateId: savedTheme
              })
            });

            if (!checkoutResponse.ok) {
              throw new Error("Checkout session response was not ok");
            }
            
            const checkoutData = await checkoutResponse.json();
            if (checkoutData.url) {
              window.location.href = checkoutData.url;
              return; // 画面遷移するためこれ以降は実行しない
            } else {
              throw new Error("No URL returned for checkout");
            }
          } catch (checkoutError) {
            console.error('決済連携エラー:', checkoutError);
            alert('店舗情報は登録されましたが、Stripe決済画面への移行に失敗しました。');
            setIsSubmitted(true);
          }
        } else {
          const responseText = await response.text();
          console.error('送信エラー:', response.status, response.statusText);
          console.error('レスポンス内容:', responseText);
          alert('送信に失敗しました。もう一度お試しください。');
        }
      } catch (error) {
        console.error('ネットワークエラー:', error);
        alert('ネットワークエラーが発生しました。もう一度お試しください。');
      }
    } else {
      console.log('=== バリデーションまたはuserInfo失敗 ===');
      console.log('バリデーション:', isValid);
      console.log('userInfo:', userInfo);
      console.log('エラー詳細:', errors);
    }
  };

  // ローディング画面
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">認証情報を確認中...</p>
        </div>
      </div>
    );
  }

  // ログイン完了画面
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">登録完了</h2>
          <p className="text-gray-600 mb-4">店舗情報の登録が完了いたしました。</p>
          <p className="text-sm text-gray-500">ログインユーザー: {userInfo?.name}</p>
        </div>
      </div>
    );
  }

  // プレミアムなログイン画面（グラスモルフィズム採用）
  if (!userInfo) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#0f172a] flex items-center justify-center p-4 font-sans">
        {/* 背景の装飾用アニメーション要素 */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[2rem] shadow-2xl p-10 overflow-hidden relative">
            {/* 装飾 */}
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <Sparkles className="w-12 h-12 text-blue-400" />
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg mb-8 transform hover:rotate-6 transition-transform duration-300">
                <Building className="w-10 h-10 text-white" />
              </div>
              
              <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
                Landy
              </h1>
              <p className="text-blue-200/80 font-medium mb-8 text-sm">
                店舗情報の登録・管理ポータル
              </p>

              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-left">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">セキュアにログイン</p>
                      <p className="text-xs text-white/60 leading-relaxed mt-1">信頼された認証システムを利用して店舗情報を保護します。</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleGoogleLogin}
                  className="group relative w-full h-16 bg-white text-gray-900 rounded-xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-white/20 flex items-center justify-center gap-3 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-50/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Googleアカウントでログイン
                </button>
              </div>

              <p className="text-white/40 text-[10px] mt-10">
                &copy; 2024 Landy Systems. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // メインフォーム画面（ログイン後）
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* ヘッダー */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Building className="w-8 h-8" />
                Landy 店舗情報登録
              </h1>
              <div className="text-white text-sm">
                <p>ログイン中: {userInfo.name}</p>
              </div>
            </div>
          </div>

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            {/* 店舗基本情報 */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b-2 border-blue-200 pb-2 flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-600" />
                店舗基本情報
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* store_id は自動生成されるため非表示 */}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="subdomain"
                    value={formData.subdomain}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.subdomain ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="例：yuimaru-shop"
                  />
                  {errors.subdomain && <p className="text-red-500 text-sm mt-1">{errors.subdomain}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    店舗名（漢字） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="storeNameKanji"
                    value={formData.storeNameKanji}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.storeNameKanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="例：ゆいまる商店"
                  />
                  {errors.storeNameKanji && <p className="text-red-500 text-sm mt-1">{errors.storeNameKanji}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    店舗名（ふりがな） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="storeNameFurigana"
                    value={formData.storeNameFurigana}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.storeNameFurigana ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="例：ゆいまるしょうてん"
                  />
                  {errors.storeNameFurigana && <p className="text-red-500 text-sm mt-1">{errors.storeNameFurigana}</p>}
                </div>
              </div>
            </div>

            {/* 担当者情報 */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b-2 border-blue-200 pb-2 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                担当者情報
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    担当者名（漢字） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullNameKanji"
                    value={formData.fullNameKanji}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.fullNameKanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="例：田中太郎"
                  />
                  {errors.fullNameKanji && <p className="text-red-500 text-sm mt-1">{errors.fullNameKanji}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    担当者名（ふりがな） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullNameFurigana"
                    value={formData.fullNameFurigana}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.fullNameFurigana ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="例：たなかたろう"
                  />
                  {errors.fullNameFurigana && <p className="text-red-500 text-sm mt-1">{errors.fullNameFurigana}</p>}
                </div>
              </div>
            </div>

            {/* 住所情報 */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b-2 border-blue-200 pb-2 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                店舗住所
              </h2>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      郵便番号 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="zip"
                      value={formData.zip}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.zip ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="例：123-4567"
                    />
                    {errors.zip && <p className="text-red-500 text-sm mt-1">{errors.zip}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      都道府県 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="provinceKanji"
                      value={formData.provinceKanji}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.provinceKanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="例：沖縄県"
                    />
                    {errors.provinceKanji && <p className="text-red-500 text-sm mt-1">{errors.provinceKanji}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      都道府県（ふりがな）
                    </label>
                    <input
                      type="text"
                      name="provinceFurigana"
                      value={formData.provinceFurigana}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="例：おきなわけん"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      市区町村 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="cityKanji"
                      value={formData.cityKanji}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.cityKanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="例：浦添市"
                    />
                    {errors.cityKanji && <p className="text-red-500 text-sm mt-1">{errors.cityKanji}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      市区町村（ふりがな）
                    </label>
                    <input
                      type="text"
                      name="cityFurigana"
                      value={formData.cityFurigana}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="例：うらそえし"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      町域・番地 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="address1Kanji"
                      value={formData.address1Kanji}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.address1Kanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="例：沢岻"
                    />
                    {errors.address1Kanji && <p className="text-red-500 text-sm mt-1">{errors.address1Kanji}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      町域・番地（ふりがな）
                    </label>
                    <input
                      type="text"
                      name="address1Furigana"
                      value={formData.address1Furigana}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="例：たくし"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      建物名・部屋番号
                    </label>
                    <input
                      type="text"
                      name="address2Kanji"
                      value={formData.address2Kanji}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="例：ゆいまるビル301号室"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      建物名・部屋番号（ふりがな）
                    </label>
                    <input
                      type="text"
                      name="address2Furigana"
                      value={formData.address2Furigana}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="例：ゆいまるびる"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 連絡先情報 */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b-2 border-blue-200 pb-2 flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                連絡先情報
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    電話番号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.phone ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="例：098-123-4567"
                  />
                  {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    メールアドレス <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="contactEmail"
                    value={formData.contactEmail}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.contactEmail ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="例：store@yuimaru.com"
                  />
                  {errors.contactEmail && <p className="text-red-500 text-sm mt-1">{errors.contactEmail}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    メールアドレス（再確認） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="emailConfirm"
                    value={formData.emailConfirm}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.emailConfirm ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="同じメールアドレス"
                  />
                  {errors.emailConfirm && <p className="text-red-500 text-sm mt-1">{errors.emailConfirm}</p>}
                </div>
              </div>
            </div>

            {/* 登録ボタン */}
            <div className="flex justify-center pt-8">
              <button
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-12 py-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-200 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                店舗情報を登録する
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;