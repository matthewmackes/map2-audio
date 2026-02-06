# Production Deployment Checklist

**MAP2 Audio Platform - Cluster Management**

Version 1.0 | February 2026

---

## Pre-Deployment Verification

### ✅ Code Quality
- [ ] All Phase 5 tests passing (3/3)
- [ ] No critical errors in logs
- [ ] Code reviewed and approved
- [ ] Version tagged in git

### ✅ Documentation
- [ ] User guide complete ([CLUSTER_USER_GUIDE.md](CLUSTER_USER_GUIDE.md))
- [ ] Admin guide complete ([CLUSTER_ADMIN_GUIDE.md](CLUSTER_ADMIN_GUIDE.md))
- [ ] API documentation up to date
- [ ] Change log updated

### ✅ Database
- [ ] Migration scripts tested
- [ ] Backup procedure documented
- [ ] Restore procedure tested
- [ ] Performance tuning applied

### ✅ Security
- [ ] API authentication enabled
- [ ] TLS/SSL certificates installed
- [ ] Firewall rules configured
- [ ] Secrets stored securely (environment variables)

### ✅ Infrastructure
- [ ] Management node provisioned
- [ ] Worker nodes provisioned
- [ ] Network connectivity verified
- [ ] DNS entries configured
- [ ] Load balancer configured (if applicable)

---

## Deployment Steps

### 1. Pre-Deployment Backup

```bash
# Database backup
sqlite3 data/map2.db ".backup data/map2-pre-deploy-$(date +%Y%m%d).db"

# Configuration backup
tar -czf config-backup-$(date +%Y%m%d).tar.gz config.yaml *.env
```

### 2. Management Node Deployment

```bash
# Stop existing service (if applicable)
sudo systemctl stop map2

# Update code
cd /opt/map2
git pull origin main
git checkout v1.0.0  # Use tagged version

# Install/update dependencies
pip install -r requirements.txt --upgrade

# Run database migrations
python3 scripts/migrate_db.py

# Verify configuration
python3 -c "from app.config import validate_config; validate_config()"

# Start service
sudo systemctl start map2
sudo systemctl enable map2

# Verify startup
curl http://localhost:8080/api/health
```

### 3. Worker Node Deployment (Rolling)

**For each worker node:**

```bash
# Put node in maintenance mode
curl -X POST http://management:8080/api/cluster/nodes/{node_id}/maintenance \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Wait for flows to migrate
sleep 10

# SSH to worker node
ssh worker-node-1

# Update code
cd /opt/map2
git pull origin main
git checkout v1.0.0

# Install/update dependencies
pip install -r requirements.txt --upgrade

# Restart service
sudo systemctl restart map2

# Verify health
curl http://localhost:8080/api/health

# Exit maintenance mode
curl -X POST http://management:8080/api/cluster/nodes/{node_id}/maintenance \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Verify flows restored
curl http://management:8080/api/cluster/flows/assignments
```

### 4. Post-Deployment Verification

```bash
# Run final validation script
python3 scripts/final_validation.py

# Check all nodes online
curl http://management:8080/api/cluster/nodes | jq '.nodes[] | {node_id, status}'

# Verify all flows assigned
curl http://management:8080/api/cluster/flows/assignments

# Check for errors in logs
tail -100 /var/log/map2/cluster.log | grep -i error
```

---

## Monitoring Setup

### 1. Log Aggregation

```bash
# Configure rsyslog to forward logs
cat >> /etc/rsyslog.d/50-map2.conf <<EOF
if \$programname == 'map2' then @@log-server:514
EOF

sudo systemctl restart rsyslog
```

### 2. Metrics Collection

```bash
# Install Prometheus node exporter
sudo apt install prometheus-node-exporter

# Configure MAP2 metrics endpoint
# Edit config.yaml
metrics:
  enabled: true
  port: 9090
  path: /metrics
```

### 3. Alerting

```yaml
# alertmanager.yml
receivers:
  - name: 'admin'
    email_configs:
      - to: 'admin@example.com'
        
route:
  receiver: 'admin'
  group_by: ['alertname', 'cluster']
  
  routes:
    - match:
        severity: critical
      receiver: 'admin'
      continue: true
```

---

## Rollback Procedure

If deployment fails:

### 1. Quick Rollback

```bash
# Restore database
cp data/map2-pre-deploy-YYYYMMDD.db data/map2.db

# Revert code
git checkout v0.9.0  # Previous version

# Restart services
sudo systemctl restart map2
```

### 2. Full Rollback

```bash
# Management node
cd /opt/map2
git reset --hard v0.9.0
pip install -r requirements.txt
sudo systemctl restart map2

# Each worker node
ssh worker-node-1 'cd /opt/map2 && git reset --hard v0.9.0 && sudo systemctl restart map2'
```

### 3. Verify Rollback

```bash
# Check version
curl http://management:8080/api/version

# Verify cluster health
python3 scripts/check_cluster.sh
```

---

## Performance Baseline

### Metrics to Track

**Before Deployment:**
- Average CPU usage per node
- Average memory usage per node
- Average flow assignment time
- Average failover time
- API response time (p50, p95, p99)

**After Deployment:**
- Compare against baseline
- Ensure no regressions
- Document any improvements

### Load Testing

```bash
# Run Locust load test
locust -f tests/load_test.py --host=http://management:8080 --users 100 --spawn-rate 10

# Monitor during test
watch -n 1 'curl -s http://management:8080/api/cluster/nodes | jq ".nodes[] | {node_id, cpu_percent}"'
```

---

## Production Configuration

### Recommended Settings

```yaml
# config.yaml (Production)
server:
  host: 0.0.0.0
  port: 8080
  workers: 4
  ssl_enabled: true
  ssl_cert: /etc/map2/ssl/cert.pem
  ssl_key: /etc/map2/ssl/key.pem

database:
  url: postgresql+asyncpg://map2:${DB_PASSWORD}@db-server:5432/map2
  pool_size: 20
  max_overflow: 40
  echo: false  # Disable SQL logging in production

cluster:
  enabled: true
  heartbeat_interval: 5
  health_check_timeout: 10
  auto_failover: true
  
audio:
  engine: juce  # CRITICAL: Always use JUCE in production
  allow_python_io: false
  buffer_size: 256
  sample_rate: 48000

logging:
  level: INFO  # Not DEBUG
  format: json  # For log aggregation
  file: /var/log/map2/cluster.log
  rotation: daily
  retention: 30  # days

monitoring:
  metrics_enabled: true
  metrics_port: 9090
  health_check_path: /api/health
```

---

## Systemd Service Configuration

```ini
# /etc/systemd/system/map2.service
[Unit]
Description=MAP2 Audio Platform
After=network.target postgresql.service

[Service]
Type=simple
User=map2
Group=map2
WorkingDirectory=/opt/map2
Environment="PATH=/opt/map2/venv/bin:/usr/bin"
Environment="MAP2_CONFIG=/etc/map2/config.yaml"
ExecStart=/opt/map2/venv/bin/python3 app/main.py
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security hardening
PrivateTmp=yes
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/map2/data /var/log/map2

[Install]
WantedBy=multi-user.target
```

---

## Health Check Endpoints

### Liveness Probe

```bash
# Kubernetes/Container health check
curl http://localhost:8080/api/health
# Expected: {"status": "healthy"}
```

### Readiness Probe

```bash
# Check if ready to accept traffic
curl http://localhost:8080/api/cluster/nodes
# Expected: HTTP 200 with node list
```

### Startup Probe

```bash
# Check if initialization complete
curl http://localhost:8080/api/ready
# Expected: {"ready": true}
```

---

## Disaster Recovery

### Backup Strategy

**Daily:**
- Database backup
- Configuration files

**Weekly:**
- Full system backup
- Test restore procedure

**Monthly:**
- Disaster recovery drill

### Recovery Time Objectives

- **RTO** (Recovery Time Objective): < 1 hour
- **RPO** (Recovery Point Objective): < 24 hours

### Failover Plan

1. **Management Node Failure:**
   - Promote standby management node
   - Update DNS to point to new management node
   - Restore database from backup

2. **Worker Node Failure:**
   - Automatic failover to standby (already implemented)
   - Provision replacement node
   - Register and assign flows

---

## Post-Deployment Tasks

### Day 1
- [ ] Monitor logs for errors
- [ ] Verify all flows operational
- [ ] Check metrics for anomalies
- [ ] Test failover manually

### Week 1
- [ ] Performance review
- [ ] User feedback collection
- [ ] Address any issues
- [ ] Document lessons learned

### Month 1
- [ ] Capacity planning review
- [ ] Optimization opportunities
- [ ] Security audit
- [ ] Update documentation

---

## Support Plan

### On-Call Rotation
- Primary: [Name/Contact]
- Secondary: [Name/Contact]

### Escalation Path
1. On-call engineer (15 min response)
2. Team lead (30 min response)
3. CTO (1 hour response)

### Critical Issue Response
- Acknowledge within 15 minutes
- Initial assessment within 30 minutes
- Resolution or workaround within 2 hours

---

## Success Criteria

Deployment is successful when:

✅ All nodes reporting online  
✅ All flows assigned and processing  
✅ Zero errors in last hour of logs  
✅ API response times < 100ms (p95)  
✅ Failover tested and working  
✅ Monitoring and alerts functional  
✅ Documentation complete and accessible  

---

**Deployment Sign-Off**

- [ ] Technical Lead: _________________ Date: _______
- [ ] Operations: ___________________ Date: _______
- [ ] Security: _____________________ Date: _______
- [ ] Product Owner: ________________ Date: _______

---

*Document Version: 1.0*  
*Last Updated: February 5, 2026*
