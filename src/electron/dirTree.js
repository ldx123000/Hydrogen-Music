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
    let dirPath = path.resolve(__dirname, baseDir);
    let all = {
        'name': baseDir,
        "children":[],
        'type': 'folder',
        'dirPath': dirPath
    }
    let count = 0
    // 文件数组
    let res = fs.readdirSync(dirPath);
    //all里的children数组
    let temp = await getFileJson(res, all.children, dirPath)
    all.children = temp;
    all.count = count
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
            let tempDir = `${dir}\\${res[i]}`;
            await newObj(tempDir, res[i]).then(async (obj) => {
                if(obj != null)
                    arr.push(obj);
                if(obj != null && obj.children?.length == 0) {
                    let dirValArr = fs.readdirSync(tempDir);
                    return await getFileJson(dirValArr,obj.children, obj.dirPath)
                }
            })
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
        //判断路径是否为文件夹
        if(! fs.statSync(tempDir).isFile()){
            obj.children = [];
            obj.type = 'folder'
        } else {
            if(getType == 'dir') return null
            if(musicType.indexOf(path.extname(tempDir).toLowerCase()) == -1) return null
            const result = await parseFile(tempDir)
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
            win.webContents.send('local-music-count', count++)
        }
        return obj
    }
}