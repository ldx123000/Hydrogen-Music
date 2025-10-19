// 尝试加载增强版API（新包名）
let enhancedApi = null;
try {
    enhancedApi = require('@neteasecloudmusicapienhanced/api');
} catch (error) {
    console.log('增强版API加载失败:', error.message);
}

//启动网易云音乐API（可选）
module.exports = async function startNeteaseMusicApi() {
    if (enhancedApi && enhancedApi.serveNcmApi) {
        try {
            await enhancedApi.serveNcmApi({
                checkVersion: true,
                port: 36530,
            });
        } catch (error) {
            console.log('API服务器启动失败，将使用直接调用模式:', error.message);
        }
    } else {
        console.log('API将以直接调用模式运行，无需本地服务器');
    }
}
