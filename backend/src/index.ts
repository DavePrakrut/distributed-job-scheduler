import http from 'http';
import app from './app';
import dotenv from 'dotenv';
import { WebSocketManager } from './services/websocket.service';

dotenv.config();

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

// Initialize WebSocket support
WebSocketManager.getInstance().init(server);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is running on port ${PORT}`);
});
