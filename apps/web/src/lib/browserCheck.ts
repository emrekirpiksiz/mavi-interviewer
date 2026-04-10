export interface BrowserCheckResult {
  isSupported: boolean;
  isMobile: boolean;
  isChrome: boolean;
  browserName: string;
  issues: string[];
}

function detectBrowserName(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Brave/i.test(ua)) return 'Brave';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Chrome\//i.test(ua)) return 'Google Chrome';
  return 'Bilinmeyen Tarayıcı';
}

export function checkBrowserCompatibility(): BrowserCheckResult {
  if (typeof navigator === 'undefined') {
    return {
      isSupported: true,
      isMobile: false,
      isChrome: true,
      browserName: 'SSR',
      issues: [],
    };
  }

  const ua = navigator.userAgent;

  const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  const isChrome = /Chrome\/\d+/.test(ua) && !/Edg|OPR|Brave/i.test(ua);
  const browserName = detectBrowserName(ua);

  const issues: string[] = [];
  if (isMobile) issues.push('mobile');
  if (!isChrome) issues.push('non-chrome');

  return {
    isSupported: isMobile || isChrome,
    isMobile,
    isChrome,
    browserName,
    issues,
  };
}

export function getBrowserWarningMessage(_result: BrowserCheckResult): string {
  return 'Bu görüşme şu anda yalnızca Google Chrome tarayıcısı ile desteklenmektedir. Lütfen Chrome tarayıcısı ile tekrar deneyin. Diğer tarayıcı desteği için testlerimiz devam etmektedir.';
}
