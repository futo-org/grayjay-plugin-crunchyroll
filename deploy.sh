#!/bin/sh
DOCUMENT_ROOT=/var/www/sources

# Take site offline
echo "Taking site offline..."
touch $DOCUMENT_ROOT/maintenance.file

# Swap over the content
echo "Deploying content..."
mkdir -p $DOCUMENT_ROOT/Crunchyroll
cp build/CrunchyrollIcon.png $DOCUMENT_ROOT/Crunchyroll
cp build/CrunchyrollConfig.json $DOCUMENT_ROOT/Crunchyroll
cp build/CrunchyrollScript.js $DOCUMENT_ROOT/Crunchyroll
sh sign.sh $DOCUMENT_ROOT/Crunchyroll/CrunchyrollScript.js $DOCUMENT_ROOT/Crunchyroll/CrunchyrollConfig.json

# Notify Cloudflare to wipe the CDN cache
echo "Purging Cloudflare cache for zone $CLOUDFLARE_ZONE_ID..."
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"files":["https://plugins.grayjay.app/Crunchyroll/CrunchyrollIcon.png", "https://plugins.grayjay.app/Crunchyroll/CrunchyrollConfig.json", "https://plugins.grayjay.app/Crunchyroll/CrunchyrollScript.js"]}'

# Take site back online
echo "Bringing site back online..."
rm $DOCUMENT_ROOT/maintenance.file
