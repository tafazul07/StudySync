import { query } from './db.js';
import { getRedisClient } from './redisService.js';

/**
 * Health check service for monitoring
 */
class HealthService {
  async checkDatabase() {
    try {
      const result = await query('SELECT 1 as health');
      return {
        status: 'healthy',
        latency: result.rows[0].health === 1 ? 'OK' : 'FAIL'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkRedis() {
    try {
      const redis = getRedisClient();
      const result = await redis.ping();
      return {
        status: result === 'PONG' ? 'healthy' : 'unhealthy',
        latency: result
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkMemory() {
    const used = process.memoryUsage();
    const total = process.memoryUsage().heapTotal;
    const free = total - used.heapUsed;
    
    return {
      status: 'healthy',
      memory: {
        rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(used.external / 1024 / 1024)}MB`
      },
      usage: `${Math.round((used.heapUsed / total) * 100)}%`
    };
  }

  async checkUptime() {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    return {
      status: 'healthy',
      uptime: `${days}d ${hours}h ${minutes}m`,
      uptimeSeconds: uptime
    };
  }

  async getSystemHealth() {
    const [database, redis, memory, uptime] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
      this.checkUptime()
    ]);

    const overallStatus = 
      database.status === 'healthy' && 
      redis.status === 'healthy' 
        ? 'healthy' : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        database,
        redis,
        memory,
        uptime
      }
    };
  }
}

export default new HealthService();
