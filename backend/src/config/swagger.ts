import { JsonObject } from 'swagger-ui-express';

export const swaggerDocument: JsonObject = {
  openapi: '3.0.0',
  info: {
    title: 'Distributed Job Scheduler API',
    version: '1.0.0',
    description: 'API Documentation for the Distributed Job Scheduler Platform.',
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local Development Server',
    },
  ],
  paths: {
    '/api/auth/register': {
      post: {
        summary: 'Register a new organization and owner account',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  organizationName: { type: 'string', example: 'Acme Corp' },
                  email: { type: 'string', example: 'admin@acme.com' },
                  password: { type: 'string', example: 'Password123!' },
                },
                required: ['organizationName', 'email', 'password'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Registration successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        email: { type: 'string' },
                        role: { type: 'string' },
                      },
                    },
                    organization: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Bad Request (e.g. email already exists, weak password)' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Log in an existing user',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'admin@acme.com' },
                  password: { type: 'string', example: 'Password123!' },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        email: { type: 'string' },
                        role: { type: 'string' },
                      },
                    },
                    organization: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized (invalid credentials)' },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        summary: 'Refresh access and refresh tokens',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  refreshToken: { type: 'string' },
                },
                required: ['refreshToken'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Tokens rotated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          401: { description: 'Invalid or expired refresh token' },
        },
      },
    },
    '/api/projects': {
      get: {
        summary: 'List all projects for the organization',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'List of projects retrieved successfully',
          },
        },
      },
      post: {
        summary: 'Create a new project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Acme Web Application' },
                },
                required: ['name'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Project created successfully' },
        },
      },
    },
    '/api/projects/{id}': {
      get: {
        summary: 'Get project details',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project details' } },
      },
      put: {
        summary: 'Update project details',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } } },
            },
          },
        },
        responses: { 200: { description: 'Updated project' } },
      },
      delete: {
        summary: 'Delete project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted project' } },
      },
    },
    '/api/projects/{projectId}/queues': {
      get: {
        summary: 'List queues',
        tags: ['Queues'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'List of queues' } },
      },
      post: {
        summary: 'Create queue',
        tags: ['Queues'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  priority: { type: 'integer' },
                  maxConcurrency: { type: 'integer' },
                  retryPolicyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created queue' } },
      },
    },
    '/api/queues/{id}': {
      get: {
        summary: 'Get queue details',
        tags: ['Queues'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Queue details' } },
      },
      put: {
        summary: 'Update queue',
        tags: ['Queues'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: { 200: { description: 'Updated queue' } },
      },
      delete: {
        summary: 'Delete queue',
        tags: ['Queues'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted queue' } },
      },
    },
    '/api/queues/{id}/pause': {
      post: {
        summary: 'Pause queue',
        tags: ['Queues'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Paused' } },
      },
    },
    '/api/queues/{id}/resume': {
      post: {
        summary: 'Resume queue',
        tags: ['Queues'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Resumed' } },
      },
    },
    '/api/projects/{projectId}/jobs': {
      get: {
        summary: 'List/Search jobs (supports pagination, filtering, sorting)',
        tags: ['Jobs'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'queueId', in: 'query', schema: { type: 'string' } },
          { name: 'batchId', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'createdAt' } },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          200: {
            description: 'Paginated list of jobs',
          },
        },
      },
      post: {
        summary: 'Submit an immediate or delayed job',
        tags: ['Jobs'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Sync User Data' },
                  queueId: { type: 'string' },
                  payload: { type: 'object' },
                  runAt: {
                    type: 'string',
                    description: 'ISO date string for delayed execution (Optional)',
                  },
                  maxRetries: { type: 'integer', example: 3 },
                  parentJobIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Workflow dependency parent job IDs',
                  },
                },
                required: ['name', 'queueId'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Job enqueued successfully' },
        },
      },
    },
    '/api/projects/{projectId}/schedules': {
      post: {
        summary: 'Create a recurring cron-scheduled job template',
        tags: ['Jobs'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Daily DB Optimization' },
                  queueId: { type: 'string' },
                  payload: { type: 'object' },
                  cronExpression: { type: 'string', example: '0 0 * * *' },
                },
                required: ['name', 'queueId', 'cronExpression'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Recurring job scheduled successfully' },
        },
      },
    },
    '/api/projects/{projectId}/batches': {
      post: {
        summary: 'Submit a batch of jobs',
        tags: ['Jobs'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Bulk Image Upload Batch' },
                  jobs: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        queueId: { type: 'string' },
                        payload: { type: 'object' },
                        runAt: { type: 'string' },
                        maxRetries: { type: 'integer' },
                      },
                      required: ['name', 'queueId'],
                    },
                  },
                },
                required: ['name', 'jobs'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Batch enqueued successfully' },
        },
      },
    },
    '/api/jobs/{id}': {
      get: {
        summary: 'Get job details (including execution attempts and logs)',
        tags: ['Jobs'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Detailed job status payload' } },
      },
      delete: {
        summary: 'Soft-delete a job',
        tags: ['Jobs'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/jobs/{id}/retry': {
      post: {
        summary: 'Manually force retry a failed or cancelled job',
        tags: ['Jobs'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Job re-queued successfully' } },
      },
    },
    '/api/jobs/{id}/cancel': {
      post: {
        summary: 'Cancel a pending or scheduled job',
        tags: ['Jobs'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Job cancelled successfully' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};
