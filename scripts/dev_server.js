import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function buildDynamicConfigJs() {
  loadDotEnv();
  const mask = 'AutoJigsawPuzzleSecretMask2026';
  const githubToken = process.env.PUZZLE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
  const payload = {
    githubToken,
    postimagesKey: process.env.POSTIMAGES_API_KEY || '',
    postimagesGallery: process.env.POSTIMAGES_GALLERY || 'jigsaw',
    postimagesO: process.env.POSTIMAGES_O || '2b819584285c102318568238c7d4a4c7',
    postimagesM: process.env.POSTIMAGES_M || '59c2ad4b46b0c1e12d5703302bff0120'
  };

  const jsonStr = unescape(encodeURIComponent(JSON.stringify(payload)));
  let xored = '';
  for (let i = 0; i < jsonStr.length; i++) {
    xored += String.fromCharCode(jsonStr.charCodeAt(i) ^ mask.charCodeAt(i % mask.length));
  }
  const encodedAuth = Buffer.from(xored, 'binary').toString('base64');

  return `window.PUZZLE_CONFIG = ${JSON.stringify({
    repo: process.env.REPOSITORY || 'SuperLeeK/AutoJigsawPuzzle',
    proxyUrl: process.env.PROXY_URL || '',
    encodedAuth,
    defaultPieces: 500,
    defaultNickname: '또갈통'
  }, null, 2)};\n`;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  // 로컬 .env 기반으로 /config.js 동적 주입 (디스크의 docs/config.js 원본은 변경하지 않음)
  if (pathname === '/config.js') {
    const js = buildDynamicConfigJs();
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(js);
    return;
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(DOCS_DIR, safePath);

  if (!filePath.startsWith(DOCS_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  res.end(content);
});

server.listen(PORT, () => {
  loadDotEnv();
  const hasToken = Boolean(process.env.PUZZLE_GITHUB_TOKEN || process.env.GITHUB_TOKEN);
  console.log('====================================================');
  console.log(`🚀 로컬 웹 매니저 개발 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📂 정적 파일 경로: ${DOCS_DIR}`);
  console.log(`🔑 GitHub 토큰 로드 상태: ${hasToken ? '✅ 로드됨 (.env)' : '⚠️ 미설정 (목록 조회는 가능, 이슈 등록 테스트 시 .env에 GITHUB_TOKEN 추가)'}`);
  console.log('💡 파일(docs/index.html, style.css, app.js) 수정 후 브라우저를 새로고침하면 즉시 반영됩니다.');
  console.log('====================================================');
});

