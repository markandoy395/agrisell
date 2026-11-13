const phoneUserAgentPattern =
  /Android.+Mobile|iPhone|iPod|webOS|IEMobile|Windows Phone|BlackBerry|BB10|Opera Mini/i;
const tabletUserAgentPattern = /iPad|Tablet|Kindle|Silk|PlayBook/i;

const { getHeaderValue, sendJson } = require('../utils/http');

const isPhoneDeviceRequest = (request) => {
  const userAgent = getHeaderValue(request.headers['user-agent']) ?? '';
  const mobileHint = getHeaderValue(request.headers['sec-ch-ua-mobile']);

  if (tabletUserAgentPattern.test(userAgent)) return false;

  return phoneUserAgentPattern.test(userAgent) || mobileHint === '?1';
};

const rejectPhoneDevice = (request, response) => {
  if (!isPhoneDeviceRequest(request)) {
    return false;
  }

  sendJson(response, 403, {
    code: 'MOBILE_PHONE_NOT_ALLOWED',
    message:
      'Agrisell Admin cannot be accessed from mobile phones. Please use a desktop, laptop, tablet, or iPad to continue.',
  });

  return true;
};

module.exports = { isPhoneDeviceRequest, rejectPhoneDevice };
