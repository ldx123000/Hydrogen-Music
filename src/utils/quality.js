export const DEFAULT_QUALITY_LEVEL = 'flac'

export const QUALITY_LEVELS = [
    '128',
    '320',
    'flac',
    'high',
]

export function getPreferredQuality(level) {
    return QUALITY_LEVELS.includes(level) ? level : DEFAULT_QUALITY_LEVEL
}
