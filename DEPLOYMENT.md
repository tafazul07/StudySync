# StudySync Production Deployment Guide

## Architecture Overview

This deployment is designed to scale to 5,000+ users with the following architecture:

- **3 Backend Instances** - Node.js API servers with load balancing
- **PostgreSQL Master-Replica** - 1 master + 2 read replicas for database scaling
- **Redis** - Session storage and caching
- **Nginx** - Reverse proxy and load balancer
- **Frontend** - React SPA served via Nginx

## Prerequisites

- Docker and Docker Compose installed
- SSL certificates for HTTPS (place in `nginx/ssl/`)
- Domain name configured with DNS

## Deployment Steps

### 1. Configure Environment Variables

Copy the production environment template:
```bash
cp .env.production .env
```

Edit `.env` and update the following:
- `POSTGRES_PASSWORD` - Strong database password
- `POSTGRES_REPLICATION_PASSWORD` - Strong replication password
- `JWT_SECRET` - Strong random secret (min 32 characters)
- `FRONTEND_URL` - Your production domain
- `CORS_ORIGIN` - Your production domain

### 2. Setup SSL Certificates

Place your SSL certificates in the `nginx/ssl/` directory:
```bash
mkdir -p nginx/ssl
cp /path/to/cert.pem nginx/ssl/cert.pem
cp /path/to/key.pem nginx/ssl/key.pem
```

### 3. Build and Start Services

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Initialize Database

The database schema will be automatically initialized on first startup. To verify:
```bash
docker-compose exec postgres-master psql -U studysync -d studysync -c "\dt"
```

### 5. Verify Health Checks

```bash
# Check overall health
curl https://your-domain.com/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": { "status": "healthy", "latency": "OK" },
    "redis": { "status": "healthy", "latency": "PONG" },
    "memory": { "status": "healthy", "usage": "45%" },
    "uptime": { "status": "healthy", "uptime": "0d 0h 5m" }
  }
}
```

## Scaling

### Horizontal Scaling (Backend)

To add more backend instances, edit `docker-compose.yml` and add new services:

```yaml
backend-4:
  build:
    context: ./backend
    dockerfile: Dockerfile
  environment:
    # ... same environment variables
  ports:
    - "5004:5000"
  depends_on:
    - postgres-master
    - redis
  networks:
    - studysync-network
```

Then update the Nginx upstream configuration in `nginx/nginx.conf`:

```nginx
upstream backend_servers {
    least_conn;
    server backend-1:5000 max_fails=3 fail_timeout=30s weight=1;
    server backend-2:5000 max_fails=3 fail_timeout=30s weight=1;
    server backend-3:5000 max_fails=3 fail_timeout=30s weight=1;
    server backend-4:5000 max_fails=3 fail_timeout=30s weight=1;
    keepalive 32;
}
```

### Database Scaling

To add more read replicas, follow the pattern in `docker-compose.yml` for `postgres-replica-1` and `postgres-replica-2`.

## Monitoring

### Health Monitoring

- Check `/api/health` endpoint for system status
- Monitor Nginx status at `/nginx_status` (restricted access)
- Check Docker container health: `docker-compose ps`

### Logs

```bash
# Backend logs
docker-compose logs -f backend-1 backend-2 backend-3

# Database logs
docker-compose logs -f postgres-master

# Redis logs
docker-compose logs -f redis

# Nginx logs
docker-compose logs -f nginx
```

### Performance Monitoring

Consider adding:
- Prometheus + Grafana for metrics
- ELK Stack for log aggregation
- APM tools like New Relic or Datadog

## Backup Strategy

### Database Backup

```bash
# Backup master database
docker-compose exec postgres-master pg_dump -U studysync studysync > backup.sql

# Restore from backup
docker-compose exec -T postgres-master psql -U studysync studysync < backup.sql
```

### Redis Backup

Redis data is persisted to the `redis-data` volume. For additional backups:

```bash
# Backup Redis data
docker run --rm -v studysync_redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz /data
```

## Security Considerations

1. **Change all default passwords** in `.env`
2. **Use strong SSL certificates** from a trusted CA
3. **Keep dependencies updated** regularly
4. **Enable firewall rules** to restrict access
5. **Monitor logs** for suspicious activity
6. **Implement rate limiting** (already configured)
7. **Use HTTPS only** (redirect configured in Nginx)

## Troubleshooting

### Backend instances not starting

```bash
# Check logs
docker-compose logs backend-1

# Verify database connection
docker-compose exec backend-1 node -e "console.log(process.env.DATABASE_URL)"
```

### Database replication issues

```bash
# Check replication status on master
docker-compose exec postgres-master psql -U studysync -d studysync -c "SELECT * FROM pg_stat_replication;"

# Check replica status
docker-compose exec postgres-replica-1 psql -U studysync -d studysync -c "SELECT pg_is_in_recovery();"
```

### Redis connection issues

```bash
# Test Redis connection
docker-compose exec redis redis-cli ping

# Check Redis logs
docker-compose logs redis
```

## Maintenance

### Update Services

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build

# Clean up old images
docker image prune -f
```

### Database Maintenance

```bash
# Vacuum and analyze tables
docker-compose exec postgres-master psql -U studysync -d studysync -c "VACUUM ANALYZE;"

# Reindex tables
docker-compose exec postgres-master psql -U studysync -d studysync -c "REINDEX DATABASE studysync;"
```

## Capacity Estimation

For 5,000 users:
- **3 Backend instances** should handle ~1,500 concurrent users each
- **PostgreSQL master** handles all writes (~500 writes/sec)
- **2 Read replicas** distribute read load (~1,500 reads/sec each)
- **Redis** handles session storage with 256MB memory limit
- **Nginx** distributes load across backends with least_conn algorithm

Adjust scaling based on actual usage patterns.
