/**
 * AutoJigsawPuzzle 런타임 설정 파일
 * - 로컬 환경 또는 GitHub Actions 배포 시점(deploy_pages.yml)에 Secrets 값이 안전하게 인코딩되어 주입됩니다.
 * - 이 파일에는 실제 Secret 원본 값을 직접 커밋하지 마세요.
 */
window.PUZZLE_CONFIG = {
  // 대상 GitHub 저장소 (owner/repo)
  repo: 'SuperLeeK/AutoJigsawPuzzle',

  // 선택 사항: Cloudflare Workers 프록시 URL (설정 시 브라우저가 프록시를 통해 무인증 업로드 및 이슈 생성 수행)
  // 예: 'https://auto-jigsaw-proxy.your-subdomain.workers.dev'
  proxyUrl: '',

  // GitHub Actions (deploy_pages.yml) 배포 시 Secrets가 자동 인코딩되어 주입되는 영역
  encodedAuth: '',

  // 기본 설정값
  defaultPieces: 500,
  defaultNickname: '또갈통'
};

