function getLoginUrlParam(urlStr, key) {
    try {
        return new URL(urlStr).searchParams.get(key)
    } catch (_) {
        try {
            const matched = String(urlStr).match(new RegExp(`${key}=([^&;#]+)`))
            return matched ? decodeURIComponent(matched[1]) : null
        } catch (_) {
            return null
        }
    }
}

function parseBiliLoginCookiesFromUrl(urlStr) {
    if (!urlStr) return null

    const sessdata = getLoginUrlParam(urlStr, 'SESSDATA')
    if (!sessdata) return null

    return {
        sessdata,
        biliJct: getLoginUrlParam(urlStr, 'bili_jct'),
        dedeUserId: getLoginUrlParam(urlStr, 'DedeUserID'),
    }
}

export function resolveBiliLoginCookies(loginData) {
    const capturedCookies = loginData?.loginCookies
    if (typeof capturedCookies?.sessdata === 'string' && capturedCookies.sessdata) {
        return {
            sessdata: capturedCookies.sessdata,
            biliJct: capturedCookies.biliJct,
            dedeUserId: capturedCookies.dedeUserId,
        }
    }

    return parseBiliLoginCookiesFromUrl(loginData?.url)
}
