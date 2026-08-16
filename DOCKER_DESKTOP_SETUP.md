# Docker Desktop Deployment Guide

## Prerequisites

- Docker Desktop installed and running
- Neon DB account with:
  - Primary database connection string
  - Read replica connection string
- Domain name (optional, for production)

## Step 1: Setup Neon Database

1. Log in to your Neon Console
2. Create a new project or use existing one
3. Create a read replica (if not already created)
4. Copy the connection strings:
   - **Primary DB URL**: For write operations
   - **Read Replica URL**: For read operations

Example format:
```
Primary: postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname
Replica: postgresql://user:password@ep-yyy.region.aws.neon.tech/dbname
```

## Step 2: Configure Environment Variables

1. Copy the production environment file:
```bash
cp .env.production .env
```

2. Edit `.env` and update these values:
```bash
# Neon DB Configuration
DATABASE_URL=postgresql://your_user:your_password@ep-xxx.region.aws.neon.tech/your_db
DATABASE_READ_URL=postgresql://your_user:your_password@ep-yyy.region.aws.neon.tech/your_db

# JWT Secret (generate a strong random string)
JWT_SECRET=your_very_long_random_secret_key_minimum_32_characters

# Frontend URL (your domain or localhost)
FRONTEND_URL=https://your-domain.com
```

## Step 3: Setup SSL Certificates (Production Only)

If deploying with HTTPS:

1. Create SSL directory:
```bash
mkdir -p nginx/ssl
```

2. Place your SSL certificates:
```bash
cp /path/to/cert.pem nginx/ssl/cert.pem
cp /path/to/key.pem nginx/ssl/key.pem
```

For local development without SSL, skip this step and modify `nginx/nginx.conf` to use HTTP only.

## Step 4: Build and Start Services

Open Docker Desktop and ensure it's running, then:

```bash
# Build all services
docker-compose build

# Start all services in detached mode
docker-compose up -d

# Check service status
docker-compose ps
```

## Step 5: Verify Deployment

1. Check if all containers are running:
```bash
docker-compose ps
```

Expected output:
```
NAME                    STATUS              PORTS
studysync-redis         Up (healthy)        0.0.0.0:6379->6379/tcp
studysync-backend-1     Up                  0.0.0.0:5001->5000/tcp
studysync-backend-2     Up                  0.0.0.0:5002->5000/tcp
studysync-backend-3     Up                  0.0.0.0:5003->5000/tcp
studysync-frontend      Up                  0.0.0.0:8080->80/tcp
studysync-nginx         Up                  0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

2. Check health endpoint:
```bash
curl http://localhost/api/health
```

Expected response:
```json
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

## Step 6: Access the Application

- **Frontend**: http://localhost (if using Nginx) or http://localhost:8080 (direct)
- **API**: http://localhost/api
- **Health Check**: http://localhost/api/health

## Common Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend-1
docker-compose logs -f redis
docker-compose logs -f nginx
```

### Stop Services
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
```

### Rebuild After Code Changes
```bash
docker-compose up -d --build
```

### Clean Up (Remove All Containers and Volumes)
```bash
docker-compose down -v
```

## Troubleshooting

### Docker Desktop Not Starting

1. Check Docker Desktop is running in system tray
2. Restart Docker Desktop
3. Check Docker Desktop settings > Resources > ensure enough memory allocated

### Port Conflicts

If ports are already in use, modify `docker-compose.yml`:
```yaml
ports:
  - "8081:80"  # Change frontend port
  - "5004:5000" # Change backend ports
```

### Database Connection Issues

1. Verify Neon DB connection strings are correct
2. Check if Neon DB allows connections from your IP
3. Test connection directly:
```bash
docker-compose exec backend-1 node -e "console.log(process.env.DATABASE_URL)"
```

### Redis Connection Issues

```bash
# Test Redis connection
docker-compose exec redis redis-cli ping
```

### Container Keeps Restarting

```bash
# Check logs for errors
docker-compose logs backend-1

# Check container status
docker-compose ps
```

## Local Development Without SSL

For local development without HTTPS, modify `nginx/nginx.conf`:

1. Comment out the HTTP to HTTPS redirect:
```nginx
# server {
#     listen 80;
#     server_name _;
#     return 301 https://$host$request_uri;
# }
```

2. Change HTTPS server to HTTP:
```nginx
server {
    listen 80;  # Change from 443 to 80
    server_name _;
    # Remove SSL configuration
    # ssl_certificate /etc/nginx/ssl/cert.pem;
    # ssl_certificate_key /etc/nginx/ssl/key.pem;
    # ... rest of config
}
```

## Performance Tuning

### Adjust Docker Desktop Resources

1. Open Docker Desktop
2. Go to Settings > Resources
3. Increase:
   - Memory: 8GB+ recommended
   - CPUs: 4+ recommended
   - Disk: 50GB+

### Scale Backend Instances

To add more backend instances, edit `docker-compose.yml` and add:
```yaml
backend-4:
  build:
    context: ./backend
    dockerfile: Dockerfile
  environment:
    # ... same as other backends
  ports:
    - "5004:5000"
  depends_on:
    - redis
  networks:
    - studysync-network
```

Then update Nginx upstream in `nginx/nginx.conf`:
```nginx
upstream backend_servers {
    least_conn;
    server backend-1:5000;
    server backend-2:5000;
    server backend-3:5000;
    server backend-4:5000;  # Add new backend
    keepalive 32;
}
```

## Monitoring

### Docker Desktop Dashboard

- Open Docker Desktop
- Click on "Containers" tab
- View resource usage, logs, and container status

### Health Checks

Monitor health endpoint:
```bash
watch -n 5 curl http://localhost/api/health
```

## Next Steps

1. Set up monitoring (Prometheus + Grafana recommended)
2. Configure automated backups for Neon DB
3. Set up CI/CD pipeline for deployments
4. Configure domain and DNS
5. Set up SSL certificates (Let's Encrypt recommended)
