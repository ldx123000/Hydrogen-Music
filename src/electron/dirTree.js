const fs = require('fs-extra');
const path = require('path');
const { parseFile } = require('music-metadata');
const { nanoid } = require('nanoid')
/**
 * 函数作用: 初始化
 * @returns 处理完的对象
 */
const musicType = ['.aiff', '.aac', '.ape', '.asf', '.bwf', '.dsdiff', '.dsf', '.flac', '.mp2','.matroska', '.mp3', '.mpc', '.mpeg4', '.ogg', '.opus', '.speex', '.theora', '.vorbis', '.wav', '.webm', '.wv', '.wma', '.m4a']
let getType = null

module.exports = async function getDirTree(baseDir, type, win) {
    getType = type
    // 修复Windows路径处理：如果是绝对路径，直接使用；否则解析为相对路径
    let dirPath = path.isAbsolute(baseDir) ? path.normalize(baseDir) : path.resolve(__dirname, baseDir);
    
    // 检查路径是否存在
    if (!fs.existsSync(dirPath)) {
        console.error('路径不存在:', dirPath);
        return {
            'name': baseDir,
            "children": [],
            'type': 'folder',
            'dirPath': dirPath,
            'count': 0
        };
    }
    
    let all = {
        'name': baseDir,
        "children":[],
        'type': 'folder',
        'dirPath': dirPath
    }
    let count = 0
    
    try {
        // 文件数组
        let res = fs.readdirSync(dirPath);
        //all里的children数组
        let temp = await getFileJson(res, all.children, dirPath)
        all.children = temp;
        all.count = count
    } catch (error) {
        console.error('读取目录失败:', dirPath, error);
        all.count = 0;
    }
    
    count = null
    return all

    /**
     * @param {A路径下的文件数组} res
     * @param {children数组} arr
     * @param {A路径} dir
     * @returns children数组
     */
    async function getFileJson(res,arr,dir) {
        for (let i = 0; i < res.length; i++) {
            let tempDir = path.join(dir, res[i]);
            try {
                await newObj(tempDir, res[i]).then(async (obj) => {
                    if(obj != null)
                        arr.push(obj);
                    if(obj != null && obj.children?.length == 0) {
                        try {
                            let dirValArr = fs.readdirSync(tempDir);
                            return await getFileJson(dirValArr,obj.children, obj.dirPath)
                        } catch (error) {
                            console.warn('读取子目录失败:', tempDir, error);
                        }
                    }
                })
            } catch (error) {
                console.warn('处理文件失败:', tempDir, error);
                // 继续处理下一个文件，不中断整个扫描过程
            }
        }
        return arr
    }
    // 处理该目录下生成的obj是否带有children
    /**
     * 处理添加到children数组下的对象属性
     * @param {B路径 = A路径 + 文件名} tempDir
     * @param {文件名} item
     * @returns 返回处理好的对象
     */
    async function newObj(tempDir,item) {
        let obj = {
            name: item,
            dirPath: tempDir
        }
        
        try {
            //判断路径是否为文件夹
            if(! fs.statSync(tempDir).isFile()){
                obj.children = [];
                obj.type = 'folder'
            } else {
                if(getType == 'dir') return null
                if(musicType.indexOf(path.extname(tempDir).toLowerCase()) == -1) return null
                
                try {
                    const result = await parseFile(tempDir)
                    // 如果音频标签缺少关键信息，尝试读取同名 JSON 侧车文件补全
                    try {
                        const parsedPath = path.parse(tempDir)
                        const metaPath = path.join(parsedPath.dir, parsedPath.name + '.json')
                        if (fs.existsSync(metaPath)) {
                            const metaRaw = fs.readFileSync(metaPath, 'utf8')
                            const meta = JSON.parse(metaRaw)
                            if ((!result.common.title || result.common.title.trim() === '') && meta && meta.name) {
                                result.common.title = meta.name
                            }
                            if ((!result.common.artists || result.common.artists.length === 0) && meta && Array.isArray(meta.artists)) {
                                result.common.artists = meta.artists
                            }
                            if ((!result.common.album || result.common.album.trim() === '') && meta && meta.album) {
                                result.common.album = meta.album
                            }
                        }
                        // 继续尝试从同名 LRC 标签中读取 [ar:]/[ti:]/[al:]
                        const lrcPath = path.join(parsedPath.dir, parsedPath.name + '.lrc')
                        if (fs.existsSync(lrcPath)) {
                            try {
                                const lrcText = fs.readFileSync(lrcPath, 'utf8')
                                const lines = lrcText.split(/\r?\n/)
                                for (let i = 0; i < Math.min(lines.length, 50); i++) {
                                    const line = lines[i]
                                    const m = line.match(/^\[(ar|ti|al):([^\]]*)\]/i)
                                    if (m) {
                                        const key = m[1].toLowerCase()
                                        const val = (m[2] || '').trim()
                                        if (key === 'ar' && (!result.common.artists || result.common.artists.length === 0)) {
                                            // 支持以逗号/斜杠分隔的多位歌手
                                            const arr = val.split(/[，,\/|]/).map(s => s.trim()).filter(Boolean)
                                            if (arr.length) result.common.artists = arr
                                        } else if (key === 'ti' && (!result.common.title || result.common.title.trim() === '')) {
                                            result.common.title = val
                                        } else if (key === 'al' && (!result.common.album || result.common.album.trim() === '')) {
                                            result.common.album = val
                                        }
                                    }
                                }
                            } catch (_) { /* ignore */ }
                        }
                    } catch (_) { /* ignore */ }
                    obj.id = nanoid()
                    obj.common = {
                        localTitle: path.basename(tempDir, path.extname(tempDir)),
                        fileUrl: tempDir,
                        title: result.common.title,
                        artists: result.common.artists,
                        album: result.common.album,
                        albumartist: result.common.albumartist,
                        date: result.common.date,
                        genre: result.common.genre,
                        year: result.common.year,
                    }
                    obj.format = {
                        bitrate: result.format.bitrate,
                        bitsPerSample: result.format.bitsPerSample,
                        container: result.format.container,
                        duration: result.format.duration,
                        sampleRate: result.format.sampleRate,
                    }
                    if (win && win.webContents && !win.webContents.isDestroyed()) {
                        win.webContents.send('local-music-count', count++)
                    }
                } catch (parseError) {
                    console.warn('解析音乐文件失败:', tempDir, parseError);
                    // 即使解析失败，也创建一个基本的音乐文件对象
                    obj.id = nanoid()
                    obj.common = {
                        localTitle: path.basename(tempDir, path.extname(tempDir)),
                        fileUrl: tempDir,
                        title: path.basename(tempDir, path.extname(tempDir)),
                        artists: [],
                        album: '',
                        albumartist: '',
                        date: '',
                        genre: '',
                        year: '',
                    }
                    obj.format = {
                        bitrate: 0,
                        bitsPerSample: 0,
                        container: path.extname(tempDir).substring(1),
                        duration: 0,
                        sampleRate: 0,
                    }
                    if (win && win.webContents && !win.webContents.isDestroyed()) {
                        win.webContents.send('local-music-count', count++)
                    }
                }
            }
        } catch (statError) {
            console.warn('获取文件状态失败:', tempDir, statError);
            return null
        }
        
        return obj
    }
}
