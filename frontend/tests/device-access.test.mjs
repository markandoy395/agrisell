import assert from 'node:assert/strict'
import test from 'node:test'
import { isPhoneDevice } from '../src/utils/isPhoneDevice.ts'
import middleware from '../../backend/src/middleware/rejectPhoneDevice.js'

const devices = [
  ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148', false, false],
  ['iPad with mobile hint', 'Mozilla/5.0 (iPad) Mobile/15E148', true, false],
  ['iPad desktop mode', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1', false, false],
  [
    'Android tablet',
    'Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130 Safari/537.36',
    false,
    false,
  ],
  ['Kindle', 'Mozilla/5.0 (Linux; Android 11; KFMAWI) Silk/100 Mobile Safari/537.36', false, false],
  ['Windows laptop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', false, false],
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', false, true],
  [
    'Android phone',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36',
    false,
    true,
  ],
  ['phone client hint', 'Mozilla/5.0', true, true],
]

for (const [name, userAgent, mobileHint, blocked] of devices) {
  test(`${name}: frontend and backend ${blocked ? 'block' : 'allow'} access`, () => {
    assert.equal(isPhoneDevice(userAgent, mobileHint), blocked)
    const request = {
      headers: { 'user-agent': userAgent, 'sec-ch-ua-mobile': mobileHint ? '?1' : '?0' },
    }
    assert.equal(middleware.isPhoneDeviceRequest(request), blocked)
  })
}
