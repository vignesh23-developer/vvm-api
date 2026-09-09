import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Response } from 'express';
import { BadgeType } from '../dto/badge.dto';

export interface SSEPayload {
  id?: string;
  event?: string;
  data: any;
  retry?: number;
}

export interface SSESendResult {
  success: boolean;
  connectionsSent: number;
  connectionsFailed: number;
  error?: string;
}

@Injectable()
export class EventEmitterService implements OnModuleDestroy {
  // Map of userId -> Set of SSE Response connections
  private readonly connections = new Map<string, Set<Response>>();
  // Map of connectionId -> userId (for cleanup)
  private readonly connectionToUser = new Map<string, string>();

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(EventEmitterService.name);
  }

  // ============================================
  // REGISTER SSE CONNECTION
  // ============================================

  /**
   * Register a new SSE connection for a user
   * @param userId - User ID
   * @param response - Express Response object for SSE
   * @returns connectionId for tracking
   */
  registerConnection(userId: string, response: Response): string {
    const connectionId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initialize user's connection set if not exists
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }

    // Add connection to user's set
    this.connections.get(userId)!.add(response);
    this.connectionToUser.set(connectionId, userId);

    // Set SSE headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Credentials', 'true');

    // Send initial connection message
    this.sendSSE(response, {
      event: 'connected',
      data: { connectionId, userId, timestamp: new Date().toISOString() },
      retry: 3000,
    });

    // Handle client disconnect
    response.on('close', () => {
      this.removeConnection(connectionId, userId);
      this.logger.debug({ connectionId, userId }, 'SSE connection closed');
    });

    // Handle errors
    response.on('error', (error) => {
      this.logger.error({ error, connectionId, userId }, 'SSE connection error');
      this.removeConnection(connectionId, userId);
    });

    this.logger.info(
      {
        connectionId,
        userId,
        totalConnections: this.connections.get(userId)!.size,
      },
      'SSE connection registered',
    );

    return connectionId;
  }

  // ============================================
  // SEND TO USER
  // ============================================

  /**
   * Send notification to all active SSE connections for a user
   * @param userId - User ID
   * @param payload - SSE payload to send
   * @returns Result with success count
   */
  async sendToUser(userId: string, payload: SSEPayload): Promise<SSESendResult> {
    const userConnections = this.connections.get(userId);

    if (!userConnections || userConnections.size === 0) {
      return {
        success: false,
        connectionsSent: 0,
        connectionsFailed: 0,
        error: 'No active SSE connections for user',
      };
    }

    let sent = 0;
    let failed = 0;
    const deadConnections: Response[] = [];

    // Send to all connections
    for (const connection of userConnections) {
      try {
        if (connection.writableEnded || connection.destroyed) {
          deadConnections.push(connection);
          failed++;
          continue;
        }

        this.sendSSE(connection, payload);
        sent++;
      } catch (error: any) {
        this.logger.error({ error, userId }, 'Failed to send SSE to connection');
        deadConnections.push(connection);
        failed++;
      }
    }

    // Clean up dead connections
    for (const deadConnection of deadConnections) {
      userConnections.delete(deadConnection);
    }

    // Remove user entry if no connections left
    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }

    this.logger.debug(
      { userId, sent, failed, totalConnections: userConnections.size },
      'SSE sent to user',
    );

    return {
      success: sent > 0,
      connectionsSent: sent,
      connectionsFailed: failed,
    };
  }

  // ============================================
  // SEND TO MULTIPLE USERS
  // ============================================

  /**
   * Send notification to multiple users
   * @param userIds - Array of user IDs
   * @param payload - SSE payload to send
   * @returns Map of userId -> result
   */
  async sendToUsers(
    userIds: string[],
    payload: SSEPayload,
  ): Promise<Map<string, SSESendResult>> {
    const resultsMap = new Map<string, SSESendResult>();

    for (const userId of userIds) {
      const result = await this.sendToUser(userId, payload);
      resultsMap.set(userId, result);
    }

    return resultsMap;
  }

  // ============================================
  // BROADCAST TO ALL USERS
  // ============================================

  /**
   * Broadcast notification to all connected users
   * @param payload - SSE payload to send
   * @returns Total sent count
   */
  async broadcast(payload: SSEPayload): Promise<{
    totalSent: number;
    totalFailed: number;
  }> {
    let totalSent = 0;
    let totalFailed = 0;

    for (const [userId] of this.connections) {
      const result = await this.sendToUser(userId, payload);
      totalSent += result.connectionsSent;
      totalFailed += result.connectionsFailed;
    }

    this.logger.info({ totalSent, totalFailed }, 'SSE broadcast completed');

    return { totalSent, totalFailed };
  }

  // ============================================
  // GET CONNECTION COUNT
  // ============================================

  /**
   * Get number of active connections for a user
   */
  getConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size || 0;
  }

  /**
   * Get total number of active connections
   */
  getTotalConnectionCount(): number {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.size;
    }
    return total;
  }

  /**
   * Get all connected user IDs
   */
  getConnectedUsers(): string[] {
    return Array.from(this.connections.keys());
  }

  // ============================================
  // REMOVE CONNECTION
  // ============================================

  /**
   * Remove a specific connection
   */
  private removeConnection(connectionId: string, userId: string): void {
    const userConnections = this.connections.get(userId);
    if (userConnections) {
      // Find and remove the connection
      for (const connection of userConnections) {
        if ((connection as any).connectionId === connectionId) {
          userConnections.delete(connection);
          break;
        }
      }

      // Remove user entry if no connections left
      if (userConnections.size === 0) {
        this.connections.delete(userId);
      }
    }

    this.connectionToUser.delete(connectionId);
  }

  /**
   * Remove all connections for a user
   */
  removeUserConnections(userId: string): number {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return 0;

    const count = userConnections.size;

    // Close all connections
    for (const connection of userConnections) {
      try {
        if (!connection.writableEnded && !connection.destroyed) {
          connection.end();
        }
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    this.connections.delete(userId);
    this.logger.info({ userId, count }, 'Removed all SSE connections for user');

    return count;
  }

  private sendSSE(response: Response, payload: SSEPayload): void {
    try {
      if (payload.id) {
        response.write(`id: ${payload.id}\n`);
      }

      if (payload.event) {
        response.write(`event: ${payload.event}\n`);
      }

      if (payload.retry) {
        response.write(`retry: ${payload.retry}\n`);
      }

      // Format data (can be object or string)
      const data =
        typeof payload.data === 'string'
          ? payload.data
          : JSON.stringify(payload.data);

      response.write(`data: ${data}\n\n`);

      // Flush the response
      if (typeof (response as any).flush === 'function') {
        (response as any).flush();
      }
    } catch (error: any) {
      this.logger.error({ error }, 'Failed to write SSE message');
      throw error;
    }
  }

  onModuleDestroy() {
    // Close all connections
    for (const [userId, connections] of this.connections.entries()) {
      for (const connection of connections) {
        try {
          if (!connection.writableEnded && !connection.destroyed) {
            connection.end();
          }
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    }

    this.connections.clear();
    this.connectionToUser.clear();
    this.logger.info('All SSE connections closed');
  }

  async sendBadgeUpdate(
    userId: string,
    badgeType: BadgeType,
    count: number
  ): Promise<SSESendResult> {
    return this.sendToUser(userId, {
      event: 'badge_update',
      data: {
        type: badgeType,
        count,
        timestamp: new Date().toISOString()
      }
    });
  }

  async sendBadgeUpdates(
    userId: string,
    badges: Partial<Record<BadgeType, number>>
  ): Promise<SSESendResult> {
    return this.sendToUser(userId, {
      event: 'badge_update',
      data: {
        badges,
        timestamp: new Date().toISOString()
      }
    });
  }

  async sendBadgeUpdateToAdmins(
    badgeType: BadgeType,
    count: number,
    adminUserIds: string[]
  ): Promise<Map<string, SSESendResult>> {
    const payload: SSEPayload = {
      event: 'badge_update',
      data: {
        type: badgeType,
        count,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendToUsers(adminUserIds, payload);
  }




}

