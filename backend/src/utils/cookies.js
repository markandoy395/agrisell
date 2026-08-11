const { getHeaderValue } = require('./http');

const parseCookies = (request) => {
  const cookieHeader = getHeaderValue(request.headers.cookie);

  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce((cookies, cookiePair) => {
    const separatorIndex = cookiePair.indexOf('=');

    if (separatorIndex === -1) return cookies;

    const name = cookiePair.slice(0, separatorIndex).trim();
    const value = cookiePair.slice(separatorIndex + 1).trim();

    if (!name) return cookies;

    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
};

const serializeCookie = (name, value, options = {}) => {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) segments.push(`Max-Age=${options.maxAge}`);
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.httpOnly) segments.push('HttpOnly');
  if (options.secure) segments.push('Secure');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);

  return segments.join('; ');
};

module.exports = { parseCookies, serializeCookie };
