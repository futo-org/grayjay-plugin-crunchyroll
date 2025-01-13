#!/bin/sh

DOCUMENT_ROOT=/var/www/sources
PRE_RELEASE=false  # Default to false if --pre-release is not provided

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --pre-release)
      PRE_RELEASE=true  # Set to true if --pre-release is passed
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Determine deployment directory
if [ "$PRE_RELEASE" = "true" ]; then
    DEPLOY_DIR="$DOCUMENT_ROOT/Crunchyroll/pre-release"
else
    DEPLOY_DIR="$DOCUMENT_ROOT/Crunchyroll"
fi

# Take site offline
echo "Taking site offline..."
touch $DOCUMENT_ROOT/maintenance.file

# Swap over the content
echo "Deploying content..."
mkdir -p "$DEPLOY_DIR"
cp CrunchyrollIcon.png "$DEPLOY_DIR"
cp CrunchyrollConfig.json "$DEPLOY_DIR"
cp CrunchyrollScript.js "$DEPLOY_DIR"
sh sign.sh "$DEPLOY_DIR/CrunchyrollScript.js" "$DEPLOY_DIR/CrunchyrollConfig.json"

# Notify Cloudflare to wipe the CDN cache
echo "Purging Cloudflare cache for zone $CLOUDFLARE_ZONE_ID..."
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"files":["https://plugins.grayjay.app/Crunchyroll/CrunchyrollIcon.png", "https://plugins.grayjay.app/Crunchyroll/CrunchyrollConfig.json", "https://plugins.grayjay.app/Crunchyroll/CrunchyrollScript.js"]}'

# Take site back online
echo "Bringing site back online..."
rm $DOCUMENT_ROOT/maintenance.file
