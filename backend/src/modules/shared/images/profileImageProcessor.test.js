const assert = require('node:assert/strict');
const test = require('node:test');
const { processProfileImage } = require('./profileImageProcessor');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const dataUrl = (type, bytes) => `data:image/${type};base64,${bytes.toString('base64')}`;

test('decodes a real image and emits canonical WebP without trailing content', async () => {
  const marker = Buffer.from('<script>alert(1)</script>');
  const output = await processProfileImage(dataUrl('png', Buffer.concat([PNG, marker])));

  assert.equal(output.toString('ascii', 0, 4), 'RIFF');
  assert.equal(output.toString('ascii', 8, 12), 'WEBP');
  assert.equal(output.includes(marker), false);
  assert.ok(output.length <= 500_000);
});

test('rejects a declared media type that does not match the file signature', async () => {
  await assert.rejects(
    processProfileImage(dataUrl('jpeg', PNG)),
    { code: 'INVALID_PROFILE_IMAGE', statusCode: 400 },
  );
});

test('rejects malformed image bytes even when the prefix and signature look valid', async () => {
  const malformedPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
  await assert.rejects(
    processProfileImage(dataUrl('png', malformedPng)),
    { code: 'INVALID_PROFILE_IMAGE', statusCode: 400 },
  );
});

test('rejects non-canonical base64 and empty images before decoding', async () => {
  await assert.rejects(processProfileImage('data:image/png;base64,not-valid==='), {
    code: 'INVALID_PROFILE_IMAGE', statusCode: 400,
  });
  await assert.rejects(processProfileImage('data:image/png;base64,'), {
    code: 'INVALID_PROFILE_IMAGE', statusCode: 400,
  });
});
