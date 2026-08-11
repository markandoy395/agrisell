const getHeaderValue = (header) => {
  if (Array.isArray(header)) return header[0];

  return header;
};

const getRequestPathname = (request) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  return requestUrl.pathname;
};

const sendJson = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
};

const sendNoContent = (response, headers = {}) => {
  response.writeHead(204, headers);
  response.end();
};

const createRequestError = (statusCode, code, message) =>
  Object.assign(new Error(message), { code, statusCode });

const readJsonBody = (request, { maxBytes = 10_000 } = {}) =>
  new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;

    request.setEncoding('utf8');

    request.on('data', (chunk) => {
      if (tooLarge) return;

      body += chunk;

      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        tooLarge = true;
      }
    });

    request.on('end', () => {
      if (tooLarge) {
        reject(
          createRequestError(
            413,
            'REQUEST_BODY_TOO_LARGE',
            'Request body is too large.',
          ),
        );
        return;
      }

      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(
          createRequestError(400, 'INVALID_JSON', 'Request body must be JSON.'),
        );
      }
    });

    request.on('error', () => {
      reject(
        createRequestError(
          400,
          'REQUEST_READ_FAILED',
          'Request body could not be read.',
        ),
      );
    });
  });

module.exports = {
  getHeaderValue,
  getRequestPathname,
  readJsonBody,
  sendJson,
  sendNoContent,
};
