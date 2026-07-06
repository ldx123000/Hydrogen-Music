import assert from 'node:assert/strict';
import { normalizeKugouKrcLyric } from '../src/utils/kugouLyric.js';
import { buildLyricsTimeline } from '../src/utils/lyricCore.js';

const language = Buffer.from(JSON.stringify({
    content: [
        {
            lyricContent: [[''], ['he ro'], ['ra su to']],
            type: 0,
            language: 0,
        },
        {
            lyricContent: [[''], ['你好'], ['世界']],
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
    '[2345,600]<0,200,0>Hello <200,400,0>world',
    '[61000,1000]<0,1000,0>Last',
].join('\n'));

assert.equal(result.originalLyricText.includes('[language:'), false);
assert.match(result.originalLyricText, /\[00:02\.34\]Hello world/);
assert.match(result.originalLyricText, /\[01:01\.00\]Last/);
assert.match(result.translatedLyricText, /\[00:02\.34\]你好/);
assert.match(result.translatedLyricText, /\[01:01\.00\]世界/);
assert.match(result.romanizedLyricText, /\[00:02\.34\]he ro/);
assert.match(result.romanizedLyricText, /\[01:01\.00\]ra su to/);

const timeline = buildLyricsTimeline({
    lrc: { lyric: result.originalLyricText },
    tlyric: { lyric: result.translatedLyricText },
    romalrc: { lyric: result.romanizedLyricText },
});

const firstSupplementalRow = timeline.find(row => row.tlyric || row.rlyric);
assert.equal(firstSupplementalRow?.lyric, 'Hello world');
assert.equal(firstSupplementalRow?.tlyric, '你好');
assert.equal(firstSupplementalRow?.rlyric, 'he ro');

console.log('kugou lyric parser ok');
