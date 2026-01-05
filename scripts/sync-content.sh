#!/bin/bash

# Script to sync published content from container to host
# This ensures the content API can always see the latest files

CONTAINER_NAME="druids-main"
HOST_DIR="/Users/lmccay/Projects/druids/data/published_content"
CONTAINER_DIR="/app/data/published_content"

echo "Syncing published content from container to host..."
echo "Container: $CONTAINER_NAME"
echo "Host dir: $HOST_DIR"
echo "Container dir: $CONTAINER_DIR"
echo ""

# Copy all content files from container to host
docker cp "$CONTAINER_NAME:$CONTAINER_DIR/" "$HOST_DIR/../"

# Set proper permissions
chmod -R 755 "$HOST_DIR"

echo "Sync completed at $(date)"
echo "Content stats:"
ls -la "$HOST_DIR" | grep -E '\.(json|md)$' | wc -l | xargs echo "Total files:"
ls -la "$HOST_DIR" | grep -E "$(date '+%b %d')" | wc -l | xargs echo "Today's files:"