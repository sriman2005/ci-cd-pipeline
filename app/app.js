const express = require('express');
const promClient = require('prom-client');

const app = express();

// ============================================
// PROMETHEUS METRICS SETUP
// ============================================

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics for HTTP requests
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});
register.registerMetric(httpRequestDurationMicroseconds);

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestsTotal);

const httpErrorsTotal = new promClient.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (5xx)',
  labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpErrorsTotal);

// Middleware to track request metrics
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    const statusCode = res.statusCode.toString();

    httpRequestDurationMicroseconds.observe(
      { method: req.method, route, status_code: statusCode },
      duration
    );

    httpRequestsTotal.inc({ method: req.method, route, status_code: statusCode });

    // Track 5xx errors
    if (res.statusCode >= 500) {
      httpErrorsTotal.inc({ method: req.method, route, status_code: statusCode });
    }
  });

  next();
});

// ============================================
// HEALTH & READINESS ENDPOINTS (for K8s probes)
// ============================================

// Liveness probe - is the app alive?
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Readiness probe - is the app ready to receive traffic?
app.get('/ready', (req, res) => {
  // Add any readiness checks here (DB connection, etc.)
  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
});

// ============================================
// PROMETHEUS METRICS ENDPOINT
// ============================================

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// ============================================
// APPLICATION ROUTES
// ============================================

app.get('/', (req, res) => {
  res.send('🚀 CI/CD App is Running! (v2.0 - with DevSecOps & Observability)');
});

// Example API endpoint
app.get('/api/status', (req, res) => {
  res.json({
    app: 'ci-cd-app',
    version: '2.0.0',
    features: ['DevSecOps', 'Observability', 'Chaos Engineering'],
    uptime: process.uptime()
  });
});

// ============================================
// ERROR HANDLING (for testing 5xx metrics)
// ============================================

app.get('/api/error-test', (req, res) => {
  res.status(500).json({ error: 'Intentional error for testing' });
});

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
  console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
  console.log(`❤️  Health check at http://localhost:${PORT}/health`);
  console.log(`✅ Readiness check at http://localhost:${PORT}/ready`);
});