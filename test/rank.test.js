'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { rankJev } = require('../app/rank');
test('Jev reranks shortlisted files and sends only bounded excerpts', async () => {
  let sent;
  const fetcher = async (_url, request) => {
    sent = JSON.parse(request.body);
    return { ok: true, json: async () => ({ answers: { match_0: { score: 0.2 }, match_1: { score: 2.8 } } }) };
  };
  const items = [
    { path: '/a/notes.txt', preview: 'generic notes', score: 8 },
    { path: '/a/launch.pdf', preview: 'Cobalt autumn launch plan '.repeat(50), score: 7 }
  ];
  const ranked = await rankJev('autumn launch plan', items, 'fake-key', fetcher);
  assert.equal(ranked[0].path, '/a/launch.pdf');
  assert.equal(sent.model, 'jev-latest');
  assert.equal(sent.state.files[1].excerpt.length, 700);
  assert.equal(sent.questions.match_0.type, 'score');
});
