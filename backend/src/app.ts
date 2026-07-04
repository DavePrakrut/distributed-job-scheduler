import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocument } from './config/swagger';
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import queueRoutes from './routes/queue.routes';
import jobRoutes from './routes/job.routes';
import { errorHandler } from './middleware/error.middleware';
import { WebSocketManager } from './services/websocket.service';

const app = express();

app.use(cors());
app.use(express.json());

// API Documentation (Swagger UI)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Internal Broadcast Route for Worker process to notify WebSocket Server
app.post('/api/internal/broadcast', (req, res) => {
  const { projectId, organizationId, event } = req.body;
  if (projectId) {
    WebSocketManager.getInstance().broadcastToProject(projectId, organizationId, event);
  } else if (organizationId) {
    WebSocketManager.getInstance().broadcastToOrganization(organizationId, event);
  }
  res.sendStatus(200);
});

// Authentication Routes
app.use('/api/auth', authRoutes);

// Project Routes
app.use('/api/projects', projectRoutes);

// Queue and Job Routes (Mounts project, queue, and job endpoints)
app.use('/api', queueRoutes);
app.use('/api', jobRoutes);

// Health Check Endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Global Error Handler (MUST be registered last)
app.use(errorHandler);

export default app;
