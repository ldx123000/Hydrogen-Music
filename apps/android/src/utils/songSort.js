export const SONG_SORT_DEFAULT = 'default'

const textCollator = new Intl.Collator('zh-CN-u-co-pinyin', {
    sensitivity: 'base',
    numeric: true,
})
const initialCollator = new Intl.Collator('en', {
    sensitivity: 'base',
    numeric: true,
})
const pinyinInitialBoundaries = [
    ['A', '阿'], ['B', '八'], ['C', '嚓'], ['D', '咑'], ['E', '妸'],
    ['F', '发'], ['G', '旮'], ['H', '哈'], ['J', '丌'], ['K', '咔'],
    ['L', '垃'], ['M', '妈'], ['N', '拏'], ['O', '噢'], ['P', '妑'],
    ['Q', '七'], ['R', '呥'], ['S', '仨'], ['T', '它'], ['W', '穵'],
    ['X', '夕'], ['Y', '丫'], ['Z', '帀'],
]
const initialCache = new Map()

const getTextInitial = text => {
    const firstCharacter = Array.from(text)[0] || ''
    if (initialCache.has(firstCharacter)) return initialCache.get(firstCharacter)

    let initial = '~'
    if (/^[a-z]$/i.test(firstCharacter)) return firstCharacter.toUpperCase()
    if (/^[0-9]$/.test(firstCharacter)) return '0'
    if (/^\p{Script=Han}$/u.test(firstCharacter)) {
        initial = 'A'
        pinyinInitialBoundaries.forEach(([letter, boundary]) => {
            if (textCollator.compare(firstCharacter, boundary) >= 0) initial = letter
        })
    }
    initialCache.set(firstCharacter, initial)
    return initial
}

const compareText = (left, right, direction) => {
    const leftText = String(left || '').trim()
    const rightText = String(right || '').trim()
    if (!leftText && !rightText) return 0
    if (!leftText) return 1
    if (!rightText) return -1
    const initialResult = initialCollator.compare(getTextInitial(leftText), getTextInitial(rightText))
    return (initialResult || textCollator.compare(leftText, rightText)) * direction
}

const compareTime = (left, right, direction) => {
    const leftTime = Number(left)
    const rightTime = Number(right)
    const hasLeftTime = Number.isFinite(leftTime) && leftTime > 0
    const hasRightTime = Number.isFinite(rightTime) && rightTime > 0
    if (!hasLeftTime && !hasRightTime) return 0
    if (!hasLeftTime) return 1
    if (!hasRightTime) return -1
    return (leftTime - rightTime) * direction
}

export function createSongSortOptions(timeLabel = '') {
    const options = [
        { label: '默认顺序', value: SONG_SORT_DEFAULT },
        { label: '歌曲首字母 A-Z', value: 'title-asc' },
        { label: '歌曲首字母 Z-A', value: 'title-desc' },
        { label: '歌手首字母 A-Z', value: 'artist-asc' },
        { label: '歌手首字母 Z-A', value: 'artist-desc' },
    ]

    if (timeLabel) {
        options.push(
            { label: `${timeLabel} LATEST FIRST`, value: 'time-desc' },
            { label: `${timeLabel} EARLIEST FIRST`, value: 'time-asc' },
        )
    }

    return options
}

export function sortSongEntries(entries, mode, {
    getTitle = entry => entry?.song?.name,
    getArtist = entry => entry?.song?.ar?.map(artist => artist.name).join('/'),
    getTime = () => 0,
} = {}) {
    if (mode === SONG_SORT_DEFAULT) return entries.slice()

    return entries
        .map((entry, originalIndex) => ({ entry, originalIndex }))
        .sort((left, right) => {
            let result = 0
            if (mode === 'title-asc') result = compareText(getTitle(left.entry), getTitle(right.entry), 1)
            else if (mode === 'title-desc') result = compareText(getTitle(left.entry), getTitle(right.entry), -1)
            else if (mode === 'artist-asc') result = compareText(getArtist(left.entry), getArtist(right.entry), 1)
            else if (mode === 'artist-desc') result = compareText(getArtist(left.entry), getArtist(right.entry), -1)
            else if (mode === 'time-desc') result = compareTime(getTime(left.entry), getTime(right.entry), -1)
            else if (mode === 'time-asc') result = compareTime(getTime(left.entry), getTime(right.entry), 1)

            return result || left.originalIndex - right.originalIndex
        })
        .map(item => item.entry)
}
