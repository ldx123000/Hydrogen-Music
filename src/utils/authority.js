import Cookies from "js-cookie";

export function setCookies(data, type) {
  console.log(data)
  if(type == 'account') {
    const cookies = data.cookie.split(';;')
    cookies.map(cookie => {
      document.cookie = cookie;
      const temCookie = cookie.split(';')[0].split('=');
      localStorage.setItem('cookie:' + temCookie[0], temCookie[1])
    });
  }
  if(type == 'qr') {
    const cookies = data.cookie.split(';')
    cookies.map(cookie => {
      const temCookie = cookie.split('=');
      if(temCookie[0] == 'MUSIC_U' || temCookie[0] == 'MUSIC_A_T' || temCookie[0] == 'MUSIC_R_T') {
        document.cookie = cookie;
        localStorage.setItem('cookie:' + temCookie[0], temCookie[1])
      }
    });
  }
  if(type == 'cookie') {
    const cookies = data.cookie.split(';')
    cookies.map(cookie => {
      const temCookie = cookie.trim().split('=');
      if(temCookie[0] && temCookie[1]) {
        // 设置到document.cookie
        document.cookie = cookie.trim();
        // 保存重要的cookie到localStorage
        if(temCookie[0] == 'MUSIC_U' || temCookie[0] == 'MUSIC_A_T' || temCookie[0] == 'MUSIC_R_T') {
          localStorage.setItem('cookie:' + temCookie[0], temCookie[1])
        }
      }
    });
  }
}

//获取Cookie - 优先从localStorage读取，确保在Electron中的可靠性
export function getCookie(key) {
  // 直接从localStorage读取，这是更可靠的方式
  const localStorageValue = localStorage.getItem('cookie:' + key)
  if (localStorageValue) {
    return localStorageValue
  }
  // 作为备用，尝试从document.cookie读取
  return Cookies.get(key)
}

//判断是否登录
export function isLogin() {
  return (getCookie('MUSIC_U') != undefined)
}

// 清理登录相关Cookie与本地存储（不影响其他设置）
export function clearLoginCookies() {
  try {
    const keys = ['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T']
    keys.forEach((k) => {
      // 移除 localStorage 中持久化的 cookie 值
      try { localStorage.removeItem('cookie:' + k) } catch (_) {}
      // 通过设置过期来移除浏览器 cookie
      try {
        document.cookie = `${k}=; Max-Age=0; path=/`;
        // 兼容可能的 domain/path 组合
        const hostParts = location.hostname.split('.')
        if (hostParts.length > 1) {
          const rootDomain = `.${hostParts.slice(-2).join('.')}`
          document.cookie = `${k}=; Max-Age=0; path=/; domain=${rootDomain}`
        }
      } catch (_) {}
    })
  } catch (_) {}
}
