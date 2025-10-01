function sendSuccess(res, body = {}, status = 200) {
  const payload = Object.assign({ success: true }, body);
  return res.status(status).json(payload);
}

function sendError(res, message = 'Error', status = 400, extra = {}) {
  const payload = Object.assign({ success: false, message }, extra);
  return res.status(status).json(payload);
}

module.exports = {
  sendSuccess,
  sendError
};
