const phoneUserAgentPattern =
  /Android.+Mobile|iPhone|iPod|IEMobile|Windows Phone|BlackBerry|BB10|Opera Mini/i;

const { getHeaderValue, sendJson } = require('../utils/http');

const isPhoneDeviceRequest = (request) => {
  const userAgent = getHeaderValue(request.headers['user-agent']) ?? '';
  const mobileHint = getHeaderValue(request.headers['sec-ch-ua-mobile']);

  return phoneUserAgentPattern.test(userAgent) || mobileHint === '?1';
};

const rejectPhoneDevice = (request, response) => {
  if (!isPhoneDeviceRequest(request)) {
    return false;
  }

  sendJson(response, 403, {
    code: 'MOBILE_PHONE_NOT_ALLOWED',
    message:
      'Agrisell Admin cannot be accessed from mobile phones. Please use a desktop or laptop to continue.',
  });

  return true;
};

module.exports = { isPhoneDeviceRequest, rejectPhoneDevice };
