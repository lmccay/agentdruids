#!/bin/bash

# Druids Development Environment Startup Script

echo "🌟 Starting Druids Multi-Agent System..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Start all services
echo "🚀 Starting all services with Docker Compose..."
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."
echo "📊 Frontend UI:     http://localhost:3006/"
echo "🔧 Backend API:     http://localhost:3000/api/"
echo "🤖 MCP Server:      http://localhost:3003/mcp"
echo "📈 Grafana:         http://localhost:3002/"
echo "🔍 Prometheus:      http://localhost:9090/"

# Test endpoints
echo ""
echo "🧪 Testing endpoints..."

if curl -s -f http://localhost:3006/ > /dev/null; then
    echo "✅ Frontend UI is running"
else
    echo "❌ Frontend UI is not responding"
fi

if curl -s -f http://localhost:3000/api/agents > /dev/null; then
    echo "✅ Backend API is running"
else
    echo "❌ Backend API is not responding"
fi

if curl -s -f http://localhost:3003/ > /dev/null; then
    echo "✅ MCP Server is running"
else
    echo "❌ MCP Server is not responding"
fi

echo ""
echo "🎉 Druids system is ready!"
echo "💻 Open http://localhost:3006/ to access the UI"
echo "🤖 MCP clients can connect to http://localhost:3003/mcp"