/**
 * ☁️ AutoJigsawPuzzle - Cloudflare Workers 서버리스 프록시 (선택 사항)
 *
 * [역할]
 * 브라우저에 토큰이나 API Key를 전혀 내려보내지 않고,
 * 비개발자 사용자가 GitHub Pages에서 무인증 원클릭으로 이미지 업로드 & 이슈 등록을 할 수 있게 중계합니다.
 *
 * [Cloudflare Worker 환경변수 (Settings -> Variables and Secrets) 등록 목록]
 * - PUZZLE_GITHUB_TOKEN : GitHub Fine-grained PAT (Issues: Read and write 권한)
 * - POSTIMAGES_API_KEY  : Postimages API Key
 * - POSTIMAGES_O        : (선택) 기본값 내장
 * - POSTIMAGES_M        : (선택) 기본값 내장
 * - GITHUB_REPO         : SuperLeeK/AutoJigsawPuzzle
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const repo = env.GITHUB_REPO || 'SuperLeeK/AutoJigsawPuzzle';

    try {
      // 1. POST /upload -> Postimages 이미지 업로드 중계
      if (request.method === 'POST' && url.pathname === '/upload') {
        const { image, name, type } = await request.json();
        if (!image) {
          return jsonResponse({ error: 'image(base64) 데이터가 필요합니다.' }, 400);
        }

        const formData = {
          key: env.POSTIMAGES_API_KEY,
          gallery: env.POSTIMAGES_GALLERY || 'jigsaw',
          o: env.POSTIMAGES_O || '2b819584285c102318568238c7d4a4c7',
          m: env.POSTIMAGES_M || '59c2ad4b46b0c1e12d5703302bff0120',
          version: '1.0.1',
          portable: '1',
          name: `${name || 'puzzle'}_${Date.now()}`,
          type: type || 'jpg',
          image
        };

        const formBody = Object.keys(formData)
          .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(formData[k])}`)
          .join('&');

        const postRes = await fetch('https://api.postimage.org/1/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: formBody
        });

        const text = await postRes.text();
        const successMatch = text.match(/success="(\d+)"/);
        const hotlinkMatch = text.match(/<hotlink>(.*?)<\/hotlink>/);

        if (successMatch && successMatch[1] === '1' && hotlinkMatch && hotlinkMatch[1]) {
          return jsonResponse({ hotlinkUrl: hotlinkMatch[1] });
        }
        return jsonResponse({ error: 'Postimages 업로드 응답 실패' }, 502);
      }

      // 2. POST /issues -> GitHub Issue 생성 중계
      if (request.method === 'POST' && url.pathname === '/issues') {
        const payload = await request.json();
        const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.PUZZLE_GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'AutoJigsawPuzzle-Worker',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: JSON.stringify({
            title: payload.title,
            body: payload.body,
            labels: payload.labels || ['puzzle-generator']
          })
        });

        const data = await ghRes.json();
        return jsonResponse(data, ghRes.status);
      }

      // 3. GET /issues -> GitHub Issue 목록 조회 중계
      if (request.method === 'GET' && url.pathname.startsWith('/issues')) {
        const ghUrl = `https://api.github.com/repos/${repo}${url.pathname}${url.search}`;
        const headers = {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'AutoJigsawPuzzle-Worker',
          'X-GitHub-Api-Version': '2022-11-28'
        };
        if (env.PUZZLE_GITHUB_TOKEN) {
          headers['Authorization'] = `Bearer ${env.PUZZLE_GITHUB_TOKEN}`;
        }
        const ghRes = await fetch(ghUrl, { headers });
        const data = await ghRes.json();
        return jsonResponse(data, ghRes.status);
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
    }
  }
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

