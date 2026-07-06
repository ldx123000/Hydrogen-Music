import assert from 'node:assert/strict';
import {
    findRememberedLyricCandidate,
    getLyricPreferenceKey,
    rememberLyricCandidate,
} from '../src/utils/lyricPreference.js';

function createStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
}

const storage = createStorage();
const params = { hash: 'ABCDEF1234567890ABCDEF1234567890', album_audio_id: 123 };
const selected = { id: 2, accesskey: 'picked' };
const candidates = [
    { id: 1, accesskey: 'first' },
    selected,
    { id: 3, accesskey: 'third' },
];

assert.equal(getLyricPreferenceKey(params), 'hash:abcdef1234567890abcdef1234567890');
assert.equal(rememberLyricCandidate(params, selected, storage), true);
assert.equal(findRememberedLyricCandidate(params, candidates, storage), selected);
assert.equal(findRememberedLyricCandidate({ album_audio_id: 123 }, candidates, storage), null);

console.log('lyric preference ok');
