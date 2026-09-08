const clients = new Set();

function broadcast() {
  for (const res of clients) {
    if (res.destroyed || res.writableEnded) {
      clients.delete(res);
      continue;
    }

    if (!res.write('data: refresh\n\n')) {
      res.end();
      clients.delete(res);
    }
  }
}

// Install before application routes.
// A notification is sent only after a successful mutation response.
function notifyChanges(req, res, next) {
  const url = req.originalUrl.split('?')[0];

  const mutation = [
    'POST',
    'PUT',
    'PATCH',
    'DELETE'
  ].includes(req.method);

  if (
    mutation &&
    url.startsWith('/api/') &&
    !url.startsWith('/api/auth/') &&
    !url.endsWith('/login')
  ) {
    res.once('finish', () => {
      if (
        res.statusCode >= 200 &&
        res.statusCode < 300
      ) {
        broadcast();
      }
    });
  }

  next();
}

function stream(req, res) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.flushHeaders();
  clients.add(res);

  // Initial connection/reconnection always resynchronizes the client.
  res.write('data: refresh\n\n');

  const cleanup = () => {
    clearInterval(heartbeat);
    clients.delete(res);
  };

  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      cleanup();
      return;
    }

    res.write(': keep-alive\n\n');
  }, 20000);

  res.on('close', cleanup);
  res.on('error', cleanup);
}

module.exports = {
  notifyChanges,
  stream
};