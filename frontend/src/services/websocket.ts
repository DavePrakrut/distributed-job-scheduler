const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';

export interface WsEvent {
  type: string;
  payload: any;
}

export type WsCallback = (event: WsEvent) => void;

export class WebSocketClient {
  private static instance: WebSocketClient | null = null;
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<WsCallback>> = new Map();
  private isConnecting: boolean = false;
  private reconnectTimeoutId: any = null;
  private reconnectAttempts: number = 0;
  private currentProjectId: string | null = null;

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  /**
   * Connects to the WebSocket server using the stored JWT access token
   */
  public connect(projectId: string | null = null): void {
    if (projectId) {
      this.currentProjectId = projectId;
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      // Already connected or connecting, subscribe if project changed
      this.subscribeToProject();
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(`${WS_BASE}?token=${token}`);

      this.ws.onopen = () => {
        console.log('🔌 WebSocket connection established.');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.subscribeToProject();
        this.notify('CONNECTION_CHANGE', { connected: true });
      };

      this.ws.onmessage = (messageEvent) => {
        try {
          const event: WsEvent = JSON.parse(messageEvent.data);
          this.notify(event.type, event.payload);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket connection closed.');
        this.isConnecting = false;
        this.ws = null;
        this.notify('CONNECTION_CHANGE', { connected: false });
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('❌ WebSocket error:', err);
        this.ws?.close();
      };
    } catch (err) {
      console.error('Failed to establish WebSocket connection:', err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Subscribes the connection to updates for the active project
   */
  private subscribeToProject(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentProjectId) {
      console.log(`🔔 Subscribing WebSocket to project: ${this.currentProjectId}`);
      this.ws.send(
        JSON.stringify({
          type: 'SUBSCRIBE',
          projectId: this.currentProjectId,
        }),
      );
    }
  }

  /**
   * Dynamic subscription setter for changing projects
   */
  public changeProject(projectId: string): void {
    this.currentProjectId = projectId;
    this.subscribeToProject();
  }

  /**
   * Registers a listener callback for a specific event type
   */
  public subscribe(eventType: string, callback: WsCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(callback);

    // Return unsubscription function
    return () => {
      const set = this.listeners.get(eventType);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  /**
   * Notifies all registered listener callbacks of an event
   */
  private notify(type: string, payload: any): void {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb({ type, payload });
        } catch (err) {
          console.error(`Error in WebSocket subscriber for ${type}:`, err);
        }
      });
    }
  }

  /**
   * Schedules a connection attempt using exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(
      `🔌 Scheduling WebSocket reconnect in ${delay}ms (Attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Closes the active WebSocket connection and halts reconnect tickers
   */
  public disconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentProjectId = null;
  }
}
