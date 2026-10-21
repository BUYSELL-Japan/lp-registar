// Cognito のトークン管理。
// IDトークンの有効期限は30分なので、フォーム入力中に切れてもリフレッシュトークンで更新して送れるようにする。
const COGNITO_DOMAIN = 'https://ap-southeast-2usnGBI9WI.auth.ap-southeast-2.amazoncognito.com';
const CLIENT_ID = '12nf22nqg8mpcq1q77nm5uqbls';
const TOKEN_REFRESH_MARGIN_SEC = 120;

const ID_TOKEN_KEY = 'landy_id_token';
const REFRESH_TOKEN_KEY = 'landy_refresh_token';

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
}

export function storeTokens(tokens: TokenResponse) {
  if (tokens.id_token) sessionStorage.setItem(ID_TOKEN_KEY, tokens.id_token);
  if (tokens.refresh_token) sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

function isTokenFresh(idToken: string): boolean {
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp - Date.now() / 1000 > TOKEN_REFRESH_MARGIN_SEC;
  } catch {
    return false;
  }
}

async function refreshIdToken(): Promise<string | null> {
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });
    if (!response.ok) {
      console.warn('Token refresh failed:', response.status);
      return null;
    }
    const tokens: TokenResponse = await response.json();
    if (!tokens.id_token) return null;
    sessionStorage.setItem(ID_TOKEN_KEY, tokens.id_token);
    return tokens.id_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * 有効なIDトークンを返す（期限切れ間近ならリフレッシュする）。取得できなければ null。
 */
export async function getValidIdToken(): Promise<string | null> {
  const idToken = sessionStorage.getItem(ID_TOKEN_KEY);
  if (idToken && isTokenFresh(idToken)) return idToken;
  return refreshIdToken();
}
