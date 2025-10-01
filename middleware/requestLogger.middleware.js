const logger = require('./logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || '-';

  const initialUser = req.user || res.locals?.user;
  const initialUserInfo = initialUser ? ` userId=${initialUser._id || initialUser.id || '-'} userName=${initialUser.name ? initialUser.name.split(' ')[0] : (initialUser.email || '-')} ` : '';
  logger.info(`${method} ${originalUrl} - start - ip=${ip} ${initialUserInfo}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
  const finalUser = req.user || res.locals?.user;
  const userInfo = finalUser ? ` userId=${finalUser._id || finalUser.id || '-'} userName=${finalUser.name ? finalUser.name.split(' ')[0] : (finalUser.email || '-')} ` : '';
  logger.info(`${method} ${originalUrl} - ${res.statusCode} - ${duration}ms - ip=${ip} ${userInfo}`);
  });

  next();
}

module.exports = requestLogger;
