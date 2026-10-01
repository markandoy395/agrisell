const { getHeaderValue, readJsonBody, sendJson } = require('../../utils/http');

const isObjectBody = (body) =>
  typeof body === 'object' && body !== null && !Array.isArray(body);

const handleRequestBodyError = (response, error) => {
  sendJson(response, error.statusCode ?? 400, {
    code: error.code ?? 'INVALID_REQUEST_BODY',
    message: error.message,
  });
};

const requireJsonContentType = (request, response, message) => {
  const contentType = getHeaderValue(request.headers['content-type']) ?? '';
  if (contentType.includes('application/json')) return true;
  sendJson(response, 415, { code: 'JSON_REQUIRED', message });
  return false;
};

const readObjectBody = async ({ request, response, maxBytes, code, message }) => {
  try {
    const body = await readJsonBody(request, { maxBytes });
    if (isObjectBody(body)) return body;
    sendJson(response, 400, { code, message });
  } catch (error) {
    handleRequestBodyError(response, error);
  }
  return null;
};

module.exports = {
  isObjectBody,
  readObjectBody,
  requireJsonContentType,
};
