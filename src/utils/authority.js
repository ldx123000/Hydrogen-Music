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

//获取Cookie
export function getCookie(key) {
  return Cookies.get(key) ?? localStorage.getItem('cookie:' + key)
}

//判断是否登录
export function isLogin() {
  return (getCookie('MUSIC_U') != undefined)
}