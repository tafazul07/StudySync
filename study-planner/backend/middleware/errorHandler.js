export function errorHandler(err, req, res, next) {
  console.error(err.stack);

  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
}
