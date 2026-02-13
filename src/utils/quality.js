export const DEFAULT_QUALITY_LEVEL = 'lossless'

export const QUALITY_LEVELS = [
    'standard',
    'higher',
    'exhigh',
    'lossless',
    'hires',
    'jyeffect',
    'sky',
    'dolby',
    'jymaster',
]

export function getPreferredQuality(level) {
    return QUALITY_LEVELS.includes(level) ? level : DEFAULT_QUALITY_LEVEL
}
