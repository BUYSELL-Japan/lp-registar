import React, { useState, useEffect } from 'react';
import { Building, User, MapPin, Phone, Mail, CheckCircle, LogIn, Sparkles, ShieldCheck } from 'lucide-react';

// ULID逕滓・逕ｨ縺ｮ髢｢謨ｰ (Crockford's Base32)
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
  sub?: string; // Google隱崎ｨｼ縺ｮsub繧定ｿｽ蜉
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
  '蛹玲ｵｷ驕・, '髱呈｣ｮ逵・, '蟯ｩ謇狗恁', '螳ｮ蝓守恁', '遘狗伐逵・, '螻ｱ蠖｢逵・, '遖丞ｳｶ逵・,
  '闌ｨ蝓守恁', '譬・惠逵・, '鄒､鬥ｬ逵・, '蝓ｼ邇臥恁', '蜊・痩逵・, '譚ｱ莠ｬ驛ｽ', '逾槫･亥ｷ晉恁',
  '譁ｰ貎溽恁', '蟇悟ｱｱ逵・, '遏ｳ蟾晉恁', '遖丈ｺ慕恁', '螻ｱ譴ｨ逵・, '髟ｷ驥守恁', '蟯宣・逵・,
  '髱吝ｲ｡逵・, '諢帷衍逵・, '荳蛾㍾逵・, '貊玖ｳ逵・, '莠ｬ驛ｽ蠎・, '螟ｧ髦ｪ蠎・, '蜈ｵ蠎ｫ逵・,
  '螂郁憶逵・, '蜥梧ｭ悟ｱｱ逵・, '魑･蜿也恁', '蟲ｶ譬ｹ逵・, '蟯｡螻ｱ逵・, '蠎・ｳｶ逵・, '螻ｱ蜿｣逵・,
  '蠕ｳ蟲ｶ逵・, '鬥吝ｷ晉恁', '諢帛ｪ帷恁', '鬮倡衍逵・, '遖丞ｲ｡逵・, '菴占ｳ逵・, '髟ｷ蟠守恁',
  '辭頑悽逵・, '螟ｧ蛻・恁', '螳ｮ蟠守恁', '鮖ｿ蜈仙ｳｶ逵・, '豐也ｸ・恁'
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

  // URL縺九ｉauthorization code繧貞叙蠕励＠縺ｦ繝ｦ繝ｼ繧ｶ繝ｼ諠・ｱ繧貞叙蠕・  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // LP縺九ｉ貂｡縺輔ｌ縺溘ユ繝ｼ繝槭→繝励Λ繝ｳ繧剃ｿ晏ｭ・    const theme = urlParams.get('theme');
    const plan = urlParams.get('plan');
    if (theme) sessionStorage.setItem('landy_theme', theme);
    if (plan) sessionStorage.setItem('landy_plan', plan);

    const code = urlParams.get('code');
    if (code) {
      // authorization code繧剃ｽｿ縺｣縺ｦ繝ｦ繝ｼ繧ｶ繝ｼ諠・ｱ繧貞叙蠕・      exchangeCodeForUserInfo(code);
    } else {
      setIsLoading(false);
    }
  }, []);

  // 蜍慕噪縺ｫ繝ｪ繝繧､繝ｬ繧ｯ繝・RI繧貞叙蠕・  const getRedirectUri = () => {
    // 譛ｫ蟆ｾ縺ｫ繧ｹ繝ｩ繝・す繝･繧剃ｻ倥￠縺ｦ縲，ognito蛛ｴ縺ｮ險ｭ螳夲ｼ井ｾ・ https://example.com/・峨→蜷医ｏ縺帙ｋ
    return `${window.location.origin}/`;
  };

  const getGoogleLoginUrl = () => {
    const redirectUri = encodeURIComponent(getRedirectUri());
    return `https://ap-southeast-2usnGBI9WI.auth.ap-southeast-2.amazoncognito.com/login?response_type=code&client_id=12nf22nqg8mpcq1q77nm5uqbls&scope=email+openid+profile&redirect_uri=${redirectUri}`;
  };

  const exchangeCodeForUserInfo = async (code: string) => {
    try {
      // 繝医・繧ｯ繝ｳ繧ｨ繝ｳ繝峨・繧､繝ｳ繝医〒access token繧貞叙蠕・      const tokenResponse = await fetch('https://ap-southeast-2usnGBI9WI.auth.ap-southeast-2.amazoncognito.com/oauth2/token', {
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
        
        // access token繧剃ｽｿ縺｣縺ｦ繝ｦ繝ｼ繧ｶ繝ｼ諠・ｱ繧貞叙蠕・        const userResponse = await fetch('https://ap-southeast-2usnGBI9WI.auth.ap-southeast-2.amazoncognito.com/oauth2/userInfo', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
          },
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          console.log('Cognito userInfo蜿門ｾ・', userData);
          console.log('sub:', userData.sub);
          console.log('email:', userData.email);
          console.log('name:', userData.name);

          setUserInfo({
            sub: userData.sub,
            email: userData.email,
            name: userData.name || userData.email,
          });

          // URL縺九ｉcode繝代Λ繝｡繝ｼ繧ｿ繧貞炎髯､
          window.history.replaceState({}, document.title, window.location.pathname);

          // ========= 蜀崎ｨｪ繝ｦ繝ｼ繧ｶ繝ｼ縺ｮ繝√ぉ繝・け蜃ｦ逅・=========
          try {
             console.log("譌｢蟄倥・蠎苓・諠・ｱ繧堤｢ｺ隱堺ｸｭ...");
             const checkResponse = await fetch('https://9xylwit7o5.execute-api.ap-southeast-2.amazonaws.com/prod/check-store', { 
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ cognito_sub: userData.sub })
             });
             
             // 笘・ｿｮ豁｣: 200縺ｧ繧・04縺ｧ繧・SON繧定ｪｭ縺ｿ蜿悶ｊ縲’ound:true縺ｮ蝣ｴ蜷医・縺ｿ譌｢蟄倥Θ繝ｼ繧ｶ繝ｼ縺ｨ縺励※謇ｱ縺・             let storeData = null;
             try {
               storeData = await checkResponse.json();
             } catch (_) {
               storeData = { found: false };
             }

             if (storeData && storeData.found) {
                if (storeData.subscriptionStatus === 'active') {
                   // 笘・ｿｮ豁｣: 逶ｴ謗･admin-ui縺ｸ鬟帙・縺吶→蜿､縺・ocalStorage縺御ｽｿ繧上ｌ縺ｦPaymentWall縺ｫ縺ｪ繧・                   // Cognito繧堤ｵ檎罰縺励※譛譁ｰ繝医・繧ｯ繝ｳ・・ustom:store_id蜈･繧奇ｼ峨ｒ蜿門ｾ励＠縺ｦ縺九ｉadmin-ui縺ｸ
                   window.location.href = "https://ap-southeast-2usngbi9wi.auth.ap-southeast-2.amazoncognito.com/oauth2/authorize?client_id=12nf22nqg8mpcq1q77nm5uqbls&response_type=code&scope=email+openid+profile&redirect_uri=https://admin-lp.neural-seeds.com";
                   return; // 莉･髯阪・蜃ｦ逅・ｒ豁｢繧√ｋ
                } else {
                   // 逋ｻ骭ｲ貂医∩縺縺梧悴豎ｺ貂医・蝣ｴ蜷医・縲√ヵ繧ｩ繝ｼ繝繧偵せ繧ｭ繝・・縺励※Stripe縺ｸ鬟帙・縺・                   alert("蠎苓・諠・ｱ縺ｯ逋ｻ骭ｲ貂医∩縺ｧ縺吶ゅし繧､繝医ｒ蜈ｬ髢九☆繧九↓縺ｯ豎ｺ貂育判髱｢縺ｸ縺企ｲ縺ｿ縺上□縺輔＞縲・);
                   setIsSubmitted(true); // 逋ｻ骭ｲ貂医∩逕ｻ髱｢(繝ｭ繝ｼ繝・ぅ繝ｳ繧ｰ)謇ｱ縺・↓
                   
                   const savedTheme = sessionStorage.getItem('landy_theme') || storeData.templateId || 'theme1';
                   const savedPlan = sessionStorage.getItem('landy_plan') || 'monthly';
                   
                   console.log("譌｢蟄伜ｺ苓・縺ｮ豎ｺ貂医そ繝・す繝ｧ繝ｳ繧剃ｽ懈・荳ｭ...");
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
                   console.error("豎ｺ貂医そ繝・す繝ｧ繝ｳ菴懈・繧ｨ繝ｩ繝ｼ", checkoutResponse);
                }
             }
             // storeData.found === false 縺ｮ蝣ｴ蜷医・繝輔か繝ｼ繝陦ｨ遉ｺ・域眠隕上Θ繝ｼ繧ｶ繝ｼ・・          } catch (checkErr) {
             console.error("譌｢蟄伜ｺ苓・縺ｮ遒ｺ隱堺ｸｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆・域眠隕冗匳骭ｲ縺ｨ縺励※邯夊｡鯉ｼ・", checkErr);
          }
          // ============================================
        } else {
          console.error('userInfo蜿門ｾ怜､ｱ謨・', userResponse.status, userResponse.statusText);
        }
      }
    } catch (error) {
      console.error('隱崎ｨｼ繧ｨ繝ｩ繝ｼ:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = getGoogleLoginUrl();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // 驛ｵ萓ｿ逡ｪ蜿ｷ縺ｮ閾ｪ蜍輔ヵ繧ｩ繝ｼ繝槭ャ繝・    let formattedValue = value;
    if (name === 'zip') {
      // 謨ｰ蟄励□縺第ｮ九＠縺ｦ譛螟ｧ7譯√↓蛻ｶ髯・      const digits = value.replace(/\D/g, '').slice(0, 7);
      // 4譯∽ｻ･荳翫≠繧後・繝上う繝輔Φ繧定・蜍墓諺蜈･
      formattedValue = digits.length > 3
        ? `${digits.slice(0, 3)}-${digits.slice(3)}`
        : digits;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: formattedValue
    }));

    // 繧ｨ繝ｩ繝ｼ繧偵け繝ｪ繧｢
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // 蠢・磯・岼縺ｮ繝√ぉ繝・け (store_id 縺ｯ閾ｪ蜍慕函謌舌・縺溘ａ髯､螟・
    const requiredFields = [
      'subdomain', 'storeNameKanji', 'storeNameFurigana', 'fullNameKanji', 'fullNameFurigana',
      'zip', 'provinceKanji', 'cityKanji', 'address1Kanji', 'phone', 'contactEmail', 'emailConfirm'
    ];

    requiredFields.forEach(field => {
      if (!formData[field as keyof FormData]?.toString().trim()) {
        newErrors[field] = '縺薙・鬆・岼縺ｯ蠢・医〒縺・;
      }
    });

    // 驛ｵ萓ｿ逡ｪ蜿ｷ縺ｮ蠖｢蠑上メ繧ｧ繝・け
    if (formData.zip && !/^\d{3}-\d{4}$/.test(formData.zip)) {
      newErrors.zip = '豁｣縺励＞驛ｵ萓ｿ逡ｪ蜿ｷ縺ｮ蠖｢蠑上〒蜈･蜉帙＠縺ｦ縺上□縺輔＞・井ｾ具ｼ・23-4567・・;
    }

    // 髮ｻ隧ｱ逡ｪ蜿ｷ縺ｮ蠖｢蠑上メ繧ｧ繝・け
    if (formData.phone && !/^[\d-]+$/.test(formData.phone)) {
      newErrors.phone = '豁｣縺励＞髮ｻ隧ｱ逡ｪ蜿ｷ縺ｮ蠖｢蠑上〒蜈･蜉帙＠縺ｦ縺上□縺輔＞';
    }

    // 繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｮ蠖｢蠑上メ繧ｧ繝・け
    if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      newErrors.contactEmail = '豁｣縺励＞繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｮ蠖｢蠑上〒蜈･蜉帙＠縺ｦ縺上□縺輔＞';
    }

    // 繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ遒ｺ隱阪メ繧ｧ繝・け
    if (formData.contactEmail !== formData.emailConfirm) {
      newErrors.emailConfirm = '繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺御ｸ閾ｴ縺励∪縺帙ｓ';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('=== 繝輔か繝ｼ繝騾∽ｿ｡髢句ｧ・===');
    console.log('userInfo:', userInfo);
    console.log('formData:', formData);

    const isValid = validateForm();
    console.log('繝舌Μ繝・・繧ｷ繝ｧ繝ｳ邨先棡:', isValid);
    console.log('繧ｨ繝ｩ繝ｼ蜀・ｮｹ:', errors);

    if (isValid && userInfo) {
      // emailConfirm 縺ｨ蟆乗枚蟄励・ subdomain 繧帝勁螟悶＠縲・      // 螟ｧ譁・ｭ励・ Subdomain 縺ｨ cognito_sub 繧貞性繧√◆繝・・繧ｿ繧剃ｽ懈・
      // store_id 縺檎ｩｺ縺ｮ蝣ｴ蜷医・ULID繧堤函謌・      const finalStoreId = formData.store_id || generateULID();
      const { emailConfirm, subdomain, ...formDataWithoutConfirm } = formData;
      const dataWithSub = {
        ...formDataWithoutConfirm,
        store_id: finalStoreId,
        Subdomain: subdomain,
        cognito_sub: userInfo.sub
      };

      console.log('POST騾∽ｿ｡繝・・繧ｿ:', dataWithSub);
      console.log('騾∽ｿ｡縺吶ｋJSON:', JSON.stringify(dataWithSub));
      console.log('cognito_sub 縺ｮ蛟､:', userInfo.sub);

      // AWS API Gateway縺ｸPOST騾∽ｿ｡
      try {
        console.log('fetch髢句ｧ・..');
        const response = await fetch('https://9xylwit7o5.execute-api.ap-southeast-2.amazonaws.com/prod/register-store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dataWithSub)
        });

        console.log('繝ｬ繧ｹ繝昴Φ繧ｹ蜿嶺ｿ｡:', response);
        console.log('繧ｹ繝・・繧ｿ繧ｹ:', response.status);
        console.log('繧ｹ繝・・繧ｿ繧ｹ繝・く繧ｹ繝・', response.statusText);

        if (response.ok) {
          // 蠎苓・諠・ｱ菫晏ｭ俶・蜉溷ｾ後∬・蜍慕噪縺ｫStripe豎ｺ貂育判髱｢繧剃ｽ懈・縺励※驕ｷ遘ｻ
          const savedTheme = sessionStorage.getItem('landy_theme') || 'theme1';
          const savedPlan = sessionStorage.getItem('landy_plan') || 'monthly';
          
          try {
            console.log('Stripe豎ｺ貂医そ繝・す繝ｧ繝ｳ繧剃ｽ懈・荳ｭ...');
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
              return; // 逕ｻ髱｢驕ｷ遘ｻ縺吶ｋ縺溘ａ縺薙ｌ莉･髯阪・螳溯｡後＠縺ｪ縺・            } else {
              throw new Error("No URL returned for checkout");
            }
          } catch (checkoutError) {
            console.error('豎ｺ貂磯｣謳ｺ繧ｨ繝ｩ繝ｼ:', checkoutError);
            alert('蠎苓・諠・ｱ縺ｯ逋ｻ骭ｲ縺輔ｌ縺ｾ縺励◆縺後ヾtripe豎ｺ貂育判髱｢縺ｸ縺ｮ遘ｻ陦後↓螟ｱ謨励＠縺ｾ縺励◆縲・);
            setIsSubmitted(true);
          }
        } else {
          const responseText = await response.text();
          console.error('騾∽ｿ｡繧ｨ繝ｩ繝ｼ:', response.status, response.statusText);
          console.error('繝ｬ繧ｹ繝昴Φ繧ｹ蜀・ｮｹ:', responseText);
          alert('騾∽ｿ｡縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲ゅｂ縺・ｸ蠎ｦ縺願ｩｦ縺励￥縺縺輔＞縲・);
        }
      } catch (error) {
        console.error('繝阪ャ繝医Ρ繝ｼ繧ｯ繧ｨ繝ｩ繝ｼ:', error);
        alert('繝阪ャ繝医Ρ繝ｼ繧ｯ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲ゅｂ縺・ｸ蠎ｦ縺願ｩｦ縺励￥縺縺輔＞縲・);
      }
    } else {
      console.log('=== 繝舌Μ繝・・繧ｷ繝ｧ繝ｳ縺ｾ縺溘・userInfo螟ｱ謨・===');
      console.log('繝舌Μ繝・・繧ｷ繝ｧ繝ｳ:', isValid);
      console.log('userInfo:', userInfo);
      console.log('繧ｨ繝ｩ繝ｼ隧ｳ邏ｰ:', errors);
    }
  };

  // 繝ｭ繝ｼ繝・ぅ繝ｳ繧ｰ逕ｻ髱｢
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">隱崎ｨｼ諠・ｱ繧堤｢ｺ隱堺ｸｭ...</p>
        </div>
      </div>
    );
  }

  // 繝ｭ繧ｰ繧､繝ｳ螳御ｺ・判髱｢
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">逋ｻ骭ｲ螳御ｺ・/h2>
          <p className="text-gray-600 mb-4">蠎苓・諠・ｱ縺ｮ逋ｻ骭ｲ縺悟ｮ御ｺ・＞縺溘＠縺ｾ縺励◆縲・/p>
          <p className="text-sm text-gray-500">繝ｭ繧ｰ繧､繝ｳ繝ｦ繝ｼ繧ｶ繝ｼ: {userInfo?.name}</p>
        </div>
      </div>
    );
  }

  // 繝励Ξ繝溘い繝縺ｪ繝ｭ繧ｰ繧､繝ｳ逕ｻ髱｢・医げ繝ｩ繧ｹ繝｢繝ｫ繝輔ぅ繧ｺ繝謗｡逕ｨ・・  if (!userInfo) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#0f172a] flex items-center justify-center p-4 font-sans">
        {/* 閭梧勹縺ｮ陬・｣ｾ逕ｨ繧｢繝九Γ繝ｼ繧ｷ繝ｧ繝ｳ隕∫ｴ */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[2rem] shadow-2xl p-10 overflow-hidden relative">
            {/* 陬・｣ｾ */}
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
                蠎苓・諠・ｱ縺ｮ逋ｻ骭ｲ繝ｻ邂｡逅・・繝ｼ繧ｿ繝ｫ
              </p>

              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-left">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">繧ｻ繧ｭ繝･繧｢縺ｫ繝ｭ繧ｰ繧､繝ｳ</p>
                      <p className="text-xs text-white/60 leading-relaxed mt-1">菫｡鬆ｼ縺輔ｌ縺溯ｪ崎ｨｼ繧ｷ繧ｹ繝・Β繧貞茜逕ｨ縺励※蠎苓・諠・ｱ繧剃ｿ晁ｭｷ縺励∪縺吶・/p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleGoogleLogin}
                  className="group relative w-full h-16 bg-white text-gray-900 rounded-xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-white/20 flex items-center justify-center gap-3 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-50/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Google繧｢繧ｫ繧ｦ繝ｳ繝医〒繝ｭ繧ｰ繧､繝ｳ
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

  // 繝｡繧､繝ｳ繝輔か繝ｼ繝逕ｻ髱｢・医Ο繧ｰ繧､繝ｳ蠕鯉ｼ・  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* 繝倥ャ繝繝ｼ */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Building className="w-8 h-8" />
                Landy 蠎苓・諠・ｱ逋ｻ骭ｲ
              </h1>
              <div className="text-white text-sm">
                <p>繝ｭ繧ｰ繧､繝ｳ荳ｭ: {userInfo.name}</p>
              </div>
            </div>
          </div>

          {/* 繝輔か繝ｼ繝 */}
          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            {/* 蠎苓・蝓ｺ譛ｬ諠・ｱ */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b-2 border-blue-200 pb-2 flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-600" />
                蠎苓・蝓ｺ譛ｬ諠・ｱ
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* store_id 縺ｯ閾ｪ蜍慕函謌舌＆繧後ｋ縺溘ａ髱櫁｡ｨ遉ｺ */}

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
                    placeholder="萓具ｼ噐uimaru-shop"
                  />
                  {errors.subdomain && <p className="text-red-500 text-sm mt-1">{errors.subdomain}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    蠎苓・蜷搾ｼ域ｼ｢蟄暦ｼ・<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="storeNameKanji"
                    value={formData.storeNameKanji}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.storeNameKanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="萓具ｼ壹ｆ縺・∪繧句膚蠎・
                  />
                  {errors.storeNameKanji && <p className="text-red-500 text-sm mt-1">{errors.storeNameKanji}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    蠎苓・蜷搾ｼ医・繧翫′縺ｪ・・<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="storeNameFurigana"
                    value={formData.storeNameFurigana}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.storeNameFurigana ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="萓具ｼ壹ｆ縺・∪繧九＠繧・≧縺ｦ繧・
                  />
                  {errors.storeNameFurigana && <p className="text-red-500 text-sm mt-1">{errors.storeNameFurigana}</p>}
                </div>
              </div>
            </div>

            {/* 諡・ｽ楢・ュ蝣ｱ */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b-2 border-blue-200 pb-2 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                諡・ｽ楢・ュ蝣ｱ
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    諡・ｽ楢・錐・域ｼ｢蟄暦ｼ・<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullNameKanji"
                    value={formData.fullNameKanji}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.fullNameKanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="萓具ｼ夂伐荳ｭ螟ｪ驛・
                  />
                  {errors.fullNameKanji && <p className="text-red-500 text-sm mt-1">{errors.fullNameKanji}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    諡・ｽ楢・錐・医・繧翫′縺ｪ・・<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullNameFurigana"
                    value={formData.fullNameFurigana}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.fullNameFurigana ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="萓具ｼ壹◆縺ｪ縺九◆繧阪≧"
                  />
                  {errors.fullNameFurigana && <p className="text-red-500 text-sm mt-1">{errors.fullNameFurigana}</p>}
                </div>
              </div>
            </div>

            {/* 菴乗園諠・ｱ */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b-2 border-blue-200 pb-2 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                蠎苓・菴乗園
              </h2>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      驛ｵ萓ｿ逡ｪ蜿ｷ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="zip"
                      value={formData.zip}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.zip ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="萓具ｼ・23-4567"
                    />
                    {errors.zip && <p className="text-red-500 text-sm mt-1">{errors.zip}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      驛ｽ驕灘ｺ懃恁 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="provinceKanji"
                      value={formData.provinceKanji}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.provinceKanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="萓具ｼ壽ｲ也ｸ・恁"
                    />
                    {errors.provinceKanji && <p className="text-red-500 text-sm mt-1">{errors.provinceKanji}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      驛ｽ驕灘ｺ懃恁・医・繧翫′縺ｪ・・                    </label>
                    <input
                      type="text"
                      name="provinceFurigana"
                      value={formData.provinceFurigana}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="萓具ｼ壹♀縺阪↑繧上￠繧・
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      蟶ょ玄逕ｺ譚・<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="cityKanji"
                      value={formData.cityKanji}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.cityKanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="萓具ｼ壽ｵｦ豺ｻ蟶・
                    />
                    {errors.cityKanji && <p className="text-red-500 text-sm mt-1">{errors.cityKanji}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      蟶ょ玄逕ｺ譚托ｼ医・繧翫′縺ｪ・・                    </label>
                    <input
                      type="text"
                      name="cityFurigana"
                      value={formData.cityFurigana}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="萓具ｼ壹≧繧峨◎縺医＠"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      逕ｺ蝓溘・逡ｪ蝨ｰ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="address1Kanji"
                      value={formData.address1Kanji}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.address1Kanji ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="萓具ｼ壽ｲ｢蟯ｻ"
                    />
                    {errors.address1Kanji && <p className="text-red-500 text-sm mt-1">{errors.address1Kanji}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      逕ｺ蝓溘・逡ｪ蝨ｰ・医・繧翫′縺ｪ・・                    </label>
                    <input
                      type="text"
                      name="address1Furigana"
                      value={formData.address1Furigana}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="萓具ｼ壹◆縺上＠"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      蟒ｺ迚ｩ蜷阪・驛ｨ螻狗分蜿ｷ
                    </label>
                    <input
                      type="text"
                      name="address2Kanji"
                      value={formData.address2Kanji}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="萓具ｼ壹ｆ縺・∪繧九ン繝ｫ301蜿ｷ螳､"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      蟒ｺ迚ｩ蜷阪・驛ｨ螻狗分蜿ｷ・医・繧翫′縺ｪ・・                    </label>
                    <input
                      type="text"
                      name="address2Furigana"
                      value={formData.address2Furigana}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="萓具ｼ壹ｆ縺・∪繧九・繧・
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 騾｣邨｡蜈域ュ蝣ｱ */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b-2 border-blue-200 pb-2 flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                騾｣邨｡蜈域ュ蝣ｱ
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    髮ｻ隧ｱ逡ｪ蜿ｷ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.phone ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="萓具ｼ・98-123-4567"
                  />
                  {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="contactEmail"
                    value={formData.contactEmail}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.contactEmail ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="萓具ｼ嘖tore@yuimaru.com"
                  />
                  {errors.contactEmail && <p className="text-red-500 text-sm mt-1">{errors.contactEmail}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ・亥・遒ｺ隱搾ｼ・<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="emailConfirm"
                    value={formData.emailConfirm}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.emailConfirm ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="蜷後§繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ"
                  />
                  {errors.emailConfirm && <p className="text-red-500 text-sm mt-1">{errors.emailConfirm}</p>}
                </div>
              </div>
            </div>

            {/* 逋ｻ骭ｲ繝懊ち繝ｳ */}
            <div className="flex justify-center pt-8">
              <button
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-12 py-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-200 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                蠎苓・諠・ｱ繧堤匳骭ｲ縺吶ｋ
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
