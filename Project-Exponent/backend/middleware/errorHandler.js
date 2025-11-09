const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });

    // PostgreSQL errors
    if (err.code) {
        switch (err.code) {
            case '23505': // unique_violation
                error.message = 'Resource already exists';
                error.statusCode = 409;
                break;
            case '23503': // foreign_key_violation
                error.message = 'Referenced resource not found';
                error.statusCode = 404;
                break;
            case '23502': // not_null_violation
                error.message = 'Required field missing';
                error.statusCode = 400;
                break;
            case '22P02': // invalid_text_representation
                error.message = 'Invalid data format';
                error.statusCode = 400;
                break;
            case '42703': // undefined_column
                error.message = 'Invalid field name';
                error.statusCode = 400;
                break;
            default:
                error.message = 'Database error';
                error.statusCode = 500;
        }
    }

    // Default to 500 server error
    const statusCode = error.statusCode || err.statusCode || 500;
    const message = error.message || 'Server Error';

    res.status(statusCode).json({
        success: false,
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;