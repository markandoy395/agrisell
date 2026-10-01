const { config } = require('../../config/environment');
const { serializeCookie } = require('../../utils/cookies');

const getSessionCookie = (token) =>
  serializeCookie(config.sessionCookieName, token, {
    httpOnly: true,
    maxAge: config.sessionTtlSeconds,
    path: '/',
    sameSite: config.sessionCookieSameSite,
    secure: config.secureCookies,
  });

const getExpiredSessionCookie = () =>
  serializeCookie(config.sessionCookieName, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: config.sessionCookieSameSite,
    secure: config.secureCookies,
  });

module.exports = { getExpiredSessionCookie, getSessionCookie };
