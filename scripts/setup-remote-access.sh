#!/bin/bash

# Remote Access Setup Script for Druids
# This script helps configure Druids for remote browser access

set -e

echo "🌍 Druids Remote Access Setup"
echo "=============================="
echo ""

# Detect current IP address
echo "🔍 Detecting server IP address..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    SERVER_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    SERVER_IP=$(hostname -I | awk '{print $1}')
else
    # Windows (Git Bash)
    SERVER_IP=$(ipconfig | grep "IPv4" | head -n 1 | awk '{print $NF}')
fi

if [ -z "$SERVER_IP" ]; then
    echo "❌ Could not detect server IP address automatically"
    echo "Please enter your server IP address manually:"
    read -r SERVER_IP
fi

echo "✅ Detected IP: $SERVER_IP"
echo ""

# Confirm with user
echo "📋 Configuration Summary:"
echo "   - Server IP: $SERVER_IP"
echo "   - UI will be accessible at: http://$SERVER_IP:3004"
echo "   - API will be accessible at: http://$SERVER_IP:3000"
echo "   - MCP will be accessible at: http://$SERVER_IP:3003"
echo ""
echo "Do you want to proceed with this configuration? (y/n)"
read -r confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled"
    exit 0
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env from .env.example"
    else
        echo "❌ .env.example not found. Please create .env manually"
        exit 1
    fi
fi

# Update .env file
echo ""
echo "📝 Updating .env configuration..."

# Check if SERVER_HOST already exists in .env
if grep -q "^SERVER_HOST=" .env; then
    # Update existing
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS requires -i ''
        sed -i '' "s|^SERVER_HOST=.*|SERVER_HOST=$SERVER_IP|" .env
    else
        # Linux
        sed -i "s|^SERVER_HOST=.*|SERVER_HOST=$SERVER_IP|" .env
    fi
    echo "✅ Updated SERVER_HOST=$SERVER_IP"
else
    # Add new
    echo "" >> .env
    echo "# Remote Access Configuration" >> .env
    echo "SERVER_HOST=$SERVER_IP" >> .env
    echo "✅ Added SERVER_HOST=$SERVER_IP"
fi

# Check if ALLOWED_ORIGINS already exists in .env
ORIGIN_URL="http://$SERVER_IP:3004"
if grep -q "^ALLOWED_ORIGINS=" .env; then
    # Update existing
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$ORIGIN_URL|" .env
    else
        sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$ORIGIN_URL|" .env
    fi
    echo "✅ Updated ALLOWED_ORIGINS=$ORIGIN_URL"
else
    # Add new
    echo "ALLOWED_ORIGINS=$ORIGIN_URL" >> .env
    echo "✅ Added ALLOWED_ORIGINS=$ORIGIN_URL"
fi

echo ""
echo "🔄 Configuration complete! Now rebuilding services..."
echo ""

# Rebuild and restart services
echo "⏹️  Stopping services..."
./scripts/dev.sh stop

echo ""
echo "🔨 Rebuilding services (this may take a few minutes)..."
docker-compose build --no-cache druids-app druids-mcp druids-frontend

echo ""
echo "🚀 Starting services..."
./scripts/dev.sh start

echo ""
echo "⏳ Waiting for services to be healthy (30 seconds)..."
sleep 30

echo ""
echo "🏥 Checking service health..."
./scripts/health.sh check

echo ""
echo "✅ Remote access setup complete!"
echo ""
echo "📱 Access Druids from any device on your network:"
echo "   🌐 Web UI: http://$SERVER_IP:3004"
echo "   🔌 API: http://$SERVER_IP:3000/api"
echo "   🔗 MCP: http://$SERVER_IP:3003/mcp"
echo ""
echo "🔒 Security Notes:"
echo "   - This is configured for local network access only"
echo "   - Do NOT expose these ports directly to the internet"
echo "   - For internet access, use a reverse proxy with HTTPS"
echo "   - See docs/REMOTE_ACCESS.md for security best practices"
echo ""
echo "🧪 Test from another device:"
echo "   curl http://$SERVER_IP:3000/health"
echo "   # Then open http://$SERVER_IP:3004 in your browser"
echo ""
