import pino from 'pino';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: null,
  redact: {
    paths: ['req.headers.authorization', 'headers.authorization', 'token', 'secret'],
    censor: '[redacted]',
  },
});
