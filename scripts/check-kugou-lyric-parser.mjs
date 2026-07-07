import assert from 'node:assert/strict';
import { normalizeKugouKrcLyric } from '../src/utils/kugouLyric.js';
import { buildLyricsTimeline } from '../src/utils/lyricCore.js';

const language = Buffer.from(JSON.stringify({
    content: [
        {
            lyricContent: [[''], ['ko n ni chi wa'], ['ra su to']],
            type: 0,
            language: 0,
        },
        {
            lyricContent: [[''], ['你好'], ['最后']],
            type: 1,
            language: 0,
        },
    ],
    contentV2: [],
    version: 1,
})).toString('base64');

const result = normalizeKugouKrcLyric([
    '[id:$00000000]',
    `[language:${language}]`,
    '[1000,500]<0,500,0>Intro',
    '[2345,600]<0,200,0>こんにちは <200,400,0>世界',
    '[61000,1000]<0,1000,0>ラスト',
].join('\n'));

assert.equal(result.originalLyricText.includes('[language:'), false);
assert.match(result.originalLyricText, /\[00:02\.34\]こんにちは 世界/);
assert.match(result.originalLyricText, /\[01:01\.00\]ラスト/);
assert.match(result.translatedLyricText, /\[00:02\.34\]你好/);
assert.match(result.translatedLyricText, /\[01:01\.00\]最后/);
assert.match(result.romanizedLyricText, /\[00:02\.34\]ko n ni chi wa/);
assert.match(result.romanizedLyricText, /\[01:01\.00\]ra su to/);

const timeline = buildLyricsTimeline({
    lrc: { lyric: result.originalLyricText },
    tlyric: { lyric: result.translatedLyricText },
    romalrc: { lyric: result.romanizedLyricText },
});

const firstSupplementalRow = timeline.find(row => row.tlyric || row.rlyric);
assert.equal(firstSupplementalRow?.lyric, 'こんにちは 世界');
assert.equal(firstSupplementalRow?.tlyric, '你好');
assert.equal(firstSupplementalRow?.rlyric, 'ko n ni chi wa');

const bracketTimeline = buildLyricsTimeline({
    lrc: { lyric: '[01:10.00]Keep [all] lyric text' },
});
assert.equal(bracketTimeline[0]?.lyric, 'Keep [all] lyric text');

const kanaMetadataTimeline = buildLyricsTimeline({
    lrc: { lyric: '[kana:11111なつ(924,598)]\n[00:01.00]Actual lyric' },
});
assert.equal(kanaMetadataTimeline.some(row => String(row.lyric || '').startsWith('[kana:')), false);
assert.equal(kanaMetadataTimeline[0]?.lyric, 'Actual lyric');

const pureTextKanaMetadataTimeline = buildLyricsTimeline({
    lrc: { lyric: '[kana:11111なつ(924,598)]\nPlain lyric' },
});
assert.equal(pureTextKanaMetadataTimeline[0]?.lyric, 'Plain lyric');

const longRomanizedLanguage = Buffer.from(JSON.stringify({
    content: [
        {
            lyricContent: [[''], ['this romanized line is intentionally longer than fifty visible chars']],
            type: 0,
            language: 0,
        },
        {
            lyricContent: [[''], ['长翻译']],
            type: 1,
            language: 0,
        },
    ],
    version: 1,
})).toString('base64');

const longRomanizedResult = normalizeKugouKrcLyric([
    `[language:${longRomanizedLanguage}]`,
    '[1000,500]<0,500,0>Intro',
    '[2000,1000]<0,1000,0>Long original',
].join('\n'));
const longRomanizedTimeline = buildLyricsTimeline({
    lrc: { lyric: longRomanizedResult.originalLyricText },
    tlyric: { lyric: longRomanizedResult.translatedLyricText },
    romalrc: { lyric: longRomanizedResult.romanizedLyricText },
});
assert.equal(longRomanizedTimeline.some(row => row.lyric === 'Long original'), true);
assert.equal(longRomanizedTimeline.find(row => row.lyric === 'Long original')?.tlyric, '长翻译');

const mixedScriptLanguage = Buffer.from(JSON.stringify({
    content: [
        {
            lyricContent: [['ko re wa'], ['su ki da']],
            type: 0,
            language: 0,
        },
        {
            lyricContent: [['这是'], ['喜欢']],
            type: 1,
            language: 0,
        },
    ],
    version: 1,
})).toString('base64');

const mixedScriptResult = normalizeKugouKrcLyric([
    `[language:${mixedScriptLanguage}]`,
    '[1000,500]<0,500,0>これは',
    '[2000,500]<0,500,0>We are the light',
    '[3000,500]<0,500,0>好きだ',
].join('\n'));
assert.match(mixedScriptResult.romanizedLyricText, /\[00:01\.00\]ko re wa/);
assert.doesNotMatch(mixedScriptResult.romanizedLyricText, /\[00:02\.00\]/);
assert.match(mixedScriptResult.romanizedLyricText, /\[00:03\.00\]su ki da/);
assert.match(mixedScriptResult.translatedLyricText, /\[00:01\.00\]这是/);
assert.doesNotMatch(mixedScriptResult.translatedLyricText, /\[00:02\.00\]/);
assert.match(mixedScriptResult.translatedLyricText, /\[00:03\.00\]喜欢/);

const mixedScriptTimeline = buildLyricsTimeline({
    lrc: { lyric: mixedScriptResult.originalLyricText },
    tlyric: { lyric: mixedScriptResult.translatedLyricText },
    romalrc: { lyric: mixedScriptResult.romanizedLyricText },
});
assert.equal(mixedScriptTimeline.find(row => row.lyric === 'We are the light')?.tlyric, '');
assert.equal(mixedScriptTimeline.find(row => row.lyric === 'We are the light')?.rlyric, '');
assert.equal(mixedScriptTimeline.find(row => row.lyric === '好きだ')?.tlyric, '喜欢');
assert.equal(mixedScriptTimeline.find(row => row.lyric === '好きだ')?.rlyric, 'su ki da');

const compactLanguage = Buffer.from(JSON.stringify({
    content: [
        {
            lyricContent: [['你好'], ['世界']],
            type: 1,
            language: 0,
        },
    ],
    version: 1,
})).toString('base64');

const compactResult = normalizeKugouKrcLyric([
    `[language:${compactLanguage}]`,
    '[0,400]<0,400,0>Song - Artist',
    '[500,400]<0,400,0>词：Writer',
    '[1000,500]<0,500,0>Hello',
    '[2000,500]<0,500,0>World',
].join('\n'));
const compactTimeline = buildLyricsTimeline({
    lrc: { lyric: compactResult.originalLyricText },
    tlyric: { lyric: compactResult.translatedLyricText },
});
assert.equal(compactTimeline.find(row => row.lyric === 'Hello')?.tlyric, '你好');
assert.equal(compactTimeline.find(row => row.lyric === 'World')?.tlyric, '世界');

console.log('kugou lyric parser ok');
