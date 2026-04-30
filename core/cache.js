/**
 * Advanced Caching Engine
 * Multi-layer caching with Redis, in-memory, and query result caching
 * Supports cache invalidation, TTL, and cache warming
 */

const redis = require('redis');
const crypto = require('crypto');

class CacheEngine {
  constructor(config = {}) {
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      ttl: config.ttl || 3600, // 1 hour default
      maxMemoryCache: config.maxMemoryCache || 100, // MB
      enableCompression: config.enableCompression !== false,
      enableMetrics: config.enableMetrics !== false,
      ...config
    };

    this.memoryCache = new Map();
    this.memoryCacheSize = 0;
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      compressionRatio: 0
    };

    this.initialized = false;
    this.client = null;
    this.queryCache = new Map();
  }

  async init() {
    try {
      this.client = redis.createClient({
        url: this.config.redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500),
          keepAlive: 30000
        }
      });

      this.client.on('error', (err) => {
        console.error('[CacheEngine] Redis error:', err.message);
        this.fallbackToMemory();
      });

      await this.client.connect();
      this.initialized = true;
      console.log('[CacheEngine] Connected to Redis');
    } catch (error) {
      console.warn('[CacheEngine] Redis connection failed, using in-memory cache:', error.message);
      this.fallbackToMemory();
    }
  }

  fallbackToMemory() {
    if (this.client) {
      this.client.disconnect().catch(() => {});
    }
    this.client = null;
    console.warn('[CacheEngine] Falling back to in-memory caching');
  }

  /**
   * Generate cache key with hash for consistency
   */
  generateKey(namespace, identifier) {
    const combined = `${namespace}:${JSON.stringify(identifier)}`;
    return crypto.createHash('md5').update(combined).digest('hex');
  }

  /**
   * Compress data for storage efficiency
   */
  compress(data) {
    if (!this.config.enableCompression) return data;
    const zlib = require('zlib');
    return zlib.brotliCompressSync(JSON.stringify(data));
  }

  /**
   * Decompress cached data
   */
  decompress(data) {
    if (!this.config.enableCompression) return JSON.parse(data);
    const zlib = require('zlib');
    return JSON.parse(zlib.brotliDecompressSync(data).toString());
  }

  /**
   * Get from cache with fallback chain
   */
  async get(namespace, identifier, options = {}) {
    const key = this.generateKey(namespace, identifier);

    // Try Redis first
    if (this.client) {
      try {
        const redisData = await this.client.get(key);
        if (redisData) {
          this.updateMetrics('hits');
          return this.decompress(redisData);
        }
      } catch (error) {
        console.error('[CacheEngine] Redis get error:', error.message);
      }
    }

    // Try memory cache
    if (this.memoryCache.has(key)) {
      this.updateMetrics('hits');
      return this.memoryCache.get(key);
    }

    this.updateMetrics('misses');
    return null;
  }

  /**
   * Set cache with multi-layer storage
   */
  async set(namespace, identifier, data, ttl = null) {
    const key = this.generateKey(namespace, identifier);
    const cacheTime = ttl || this.config.ttl;

    // Store in memory
    this.memoryCache.set(key, data);
    this.updateMemorySize(key, data);
    this.evictIfNeeded();

    // Store in Redis
    if (this.client) {
      try {
        const compressed = this.compress(data);
        await this.client.setEx(
          key,
          cacheTime,
          typeof compressed === 'string' ? compressed : JSON.stringify(compressed)
        );
      } catch (error) {
        console.error('[CacheEngine] Redis set error:', error.message);
      }
    }

    this.updateMetrics('sets');
  }

  /**
   * Cache query results for optimized database access
   */
  async cacheQuery(query, result, ttl = 1800) {
    const key = crypto.createHash('md5').update(JSON.stringify(query)).digest('hex');
    await this.set('query', key, result, ttl);
    this.queryCache.set(key, { query, timestamp: Date.now() });
  }

  /**
   * Invalidate queries matching pattern
   */
  invalidateQueries(pattern) {
    let invalidated = 0;
    for (const [key, value] of this.queryCache.entries()) {
      if (JSON.stringify(value.query).includes(pattern)) {
        this.memoryCache.delete(key);
        if (this.client) {
          this.client.del(`query:${key}`).catch(err => console.error('[CacheEngine] Delete error:', err));
        }
        this.queryCache.delete(key);
        invalidated++;
      }
    }
    return invalidated;
  }

  /**
   * Clear specific cache namespace
   */
  async clear(namespace = null) {
    if (namespace) {
      for (const [key] of this.memoryCache.entries()) {
        if (key.startsWith(namespace)) {
          this.memoryCache.delete(key);
        }
      }
      if (this.client) {
        const keys = await this.client.keys(`${namespace}:*`);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      }
    } else {
      this.memoryCache.clear();
      if (this.client) {
        await this.client.flushDb();
      }
    }
    this.updateMetrics('deletes');
  }

  /**
   * Warm cache with frequent queries
   */
  async warmCache(queries) {
    for (const { query, result, ttl } of queries) {
      await this.cacheQuery(query, result, ttl);
    }
  }

  /**
   * Update memory usage tracking
   */
  updateMemorySize(key, data) {
    const size = JSON.stringify(data).length / (1024 * 1024); // MB
    if (this.memoryCache.size > 1000) {
      // Evict oldest if too many entries
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
  }

  /**
   * Evict cache if memory limit exceeded
   */
  evictIfNeeded() {
    if (this.memoryCacheSize > this.config.maxMemoryCache) {
      const entriesToRemove = Math.ceil(this.memoryCache.size * 0.2);
      let removed = 0;

      for (const [key] of this.memoryCache.entries()) {
        if (removed >= entriesToRemove) break;
        this.memoryCache.delete(key);
        removed++;
      }
    }
  }

  /**
   * Update metrics
   */
  updateMetrics(type) {
    if (this.config.enableMetrics) {
      this.metrics[type]++;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.metrics.hits / (this.metrics.hits + this.metrics.misses || 1);
    return {
      ...this.metrics,
      hitRate: (hitRate * 100).toFixed(2) + '%',
      memoryEntries: this.memoryCache.size,
      memorySizeBytes: this.memoryCacheSize * 1024 * 1024
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      console.log('[CacheEngine] Redis connection closed');
    }
  }
}

module.exports = CacheEngine;
