class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request') {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

const errorHandler = (err, req, res, next) => {
  console.error('Error handler called:', err.message);
  console.error(err.stack);

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  err.message = err.message || 'Something went wrong';

  console.log('Sending error response:', {
    statusCode: err.statusCode,
    status: err.status,
    message: err.message
  });

  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.message,
  stack: err.stack
  });
};

module.exports = {
  errorHandler,
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
};