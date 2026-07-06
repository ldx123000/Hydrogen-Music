import assert from 'node:assert/strict';
import { normalizeKugouKrcLyric } from '../src/utils/kugouLyric.js';
import { buildLyricsTimeline } from '../src/utils/lyricCore.js';

const language = Buffer.from(JSON.stringify({
    content: [{
        lyricContent: [[''], ['你好'], ['世界']],
        type: 1,
        language: 0,
    }],
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

const timeline = buildLyricsTimeline({
    lrc: { lyric: result.originalLyricText },
    tlyric: { lyric: result.translatedLyricText },
});

assert.equal(timeline.find(row => row.tlyric)?.lyric, 'Hello world');

console.log('kugou lyric parser ok');
