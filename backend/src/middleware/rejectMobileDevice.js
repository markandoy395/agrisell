const mobileUserAgentPattern = /Android|BlackBerry|IEMobile|iPhone|iPad|iPod|Opera Mini|webOS|Windows Phone/i;

const isMobileDeviceRequest = (request) => {
  const userAgent = request.headers['user-agent'];
  const value = Array.isArray(userAgent) ? userAgent[0] : userAgent;

  return mobileUserAgentPattern.test(value ?? '');
};

const rejectMobileDevice = (request, response) => {
  if (!isMobileDeviceRequest(request)) {
    return false;
  }

  response.writeHead(403, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify({
    code: 'MOBILE_DEVICE_NOT_ALLOWED',
    message: 'Agrisell Admin is available on desktop and laptop devices only.',
  }));

  return true;
};

module.exports = { isMobileDeviceRequest, rejectMobileDevice };
