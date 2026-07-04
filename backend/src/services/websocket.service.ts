import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
}

interface AuthenticatedWebSocket extends WebSocket {
  organizationId?: string;
  projectId?: string;
}

export class WebSocketManager {
  private static instance: WebSocketManager;
  private wss: WebSocketServer | null = null;

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Initializes the WebSocket server using the HTTP Server instance
   */
  public init(server: Server): void {
    this.wss = new WebSocketServer({ noServer: true });

    // Handle protocol upgrade with JWT authentication check
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      try {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const decoded = jwt.verify(
          token,
          process.env.JWT_ACCESS_SECRET || 'access-secret',
        ) as TokenPayload;

        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          const authWs = ws as AuthenticatedWebSocket;
          authWs.organizationId = decoded.organizationId;
          this.wss?.emit('connection', authWs, request);
        });
      } catch (err) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: AuthenticatedWebSocket) => {
      console.log(`🔌 WebSocket client connected for organization: ${ws.organizationId}`);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);

          if (data.type === 'SUBSCRIBE' && data.projectId) {
            ws.projectId = data.projectId;
            console.log(`🔔 Client subscribed to project: ${ws.projectId}`);
            ws.send(JSON.stringify({ type: 'SUBSCRIBED', projectId: ws.projectId }));
          }
        } catch (err) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message payload format' }));
        }
      });

      ws.on('close', () => {
        console.log(`🔌 WebSocket client disconnected for organization: ${ws.organizationId}`);
      });
    });
  }

  /**
   * Broadcasts an event to all client connections subscribed to a specific project (Tenant isolated)
   */
  public broadcastToProject(
    projectId: string,
    organizationId: string,
    event: { type: string; payload: unknown },
  ): void {
    if (!this.wss) return;

    const messageString = JSON.stringify(event);

    this.wss.clients.forEach((client) => {
      const authClient = client as AuthenticatedWebSocket;
      if (
        authClient.readyState === WebSocket.OPEN &&
        authClient.organizationId === organizationId &&
        authClient.projectId === projectId
      ) {
        authClient.send(messageString);
      }
    });
  }

  /**
   * Broadcasts an event to all client connections of a specific organization (Tenant isolated)
   */
  public broadcastToOrganization(
    organizationId: string,
    event: { type: string; payload: unknown },
  ): void {
    if (!this.wss) return;

    const messageString = JSON.stringify(event);

    this.wss.clients.forEach((client) => {
      const authClient = client as AuthenticatedWebSocket;
      if (
        authClient.readyState === WebSocket.OPEN &&
        authClient.organizationId === organizationId
      ) {
        authClient.send(messageString);
      }
    });
  }
}
