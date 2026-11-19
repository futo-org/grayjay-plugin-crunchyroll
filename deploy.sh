#!/bin/sh
set -eu

PRE_RELEASE=${PRE_RELEASE:-false} # Default to false if not set

# Determine deployment directory
if [ "$PRE_RELEASE" = "true" ]; then
    RELATIVE_PATH="pre-release/Crunchyroll"
else
    RELATIVE_PATH="Crunchyroll"
fi

sh "$(dirname "$0")/publish-r2.sh" "$RELATIVE_PATH" CrunchyrollConfig.json CrunchyrollConfig.json CrunchyrollScript.js CrunchyrollIcon.png
