#!/bin/sh
# Listening Stats - Spicetify CustomApp Installer for Linux/macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/Xndr2/listening-stats/main/install.sh | sh

set -e

# Config
REPO_URL="https://github.com/Xndr2/listening-stats"
APP_NAME="listening-stats"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo "${GREEN}"
echo " _     _     _             _               ____  _        _       "
echo "| |   (_)___| |_ ___ _ __ (_)_ __   __ _  / ___|| |_ __ _| |_ ___ "
echo "| |   | / __| __/ _ \ '_ \| | '_ \ / _\` | \___ \| __/ _\` | __/ __|"
echo "| |___| \__ \ ||  __/ | | | | | | | (_| |  ___) | || (_| | |_\__ \\"
echo "|_____|_|___/\__\___|_| |_|_|_| |_|\__, | |____/ \__\__,_|\__|___/"
echo "                                   |___/                          "
echo "${NC}"
echo "${CYAN}Listening Stats Installer for Linux/macOS${NC}"
echo ""

# Check if Spicetify is installed
echo -n "Checking for Spicetify..."
if ! command -v spicetify &> /dev/null; then
    echo " ${RED}NOT FOUND${NC}"
    echo ""
    echo "${YELLOW}Spicetify is not installed. Please install it first:${NC}"
    echo "${CYAN}curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh${NC}"
    echo ""
    exit 1
fi

SPICETIFY_VERSION=$(spicetify -v 2>/dev/null || echo "unknown")
echo " ${GREEN}v${SPICETIFY_VERSION}${NC}"

# Get Spicetify config directory
echo -n "Getting Spicetify config directory..."
SPICETIFY_CONFIG=""

# Try to get from spicetify command
if command -v spicetify &> /dev/null; then
    SPICETIFY_CONFIG=$(spicetify path userdata 2>/dev/null || echo "")
fi

# Fallback to common locations
if [ -z "$SPICETIFY_CONFIG" ] || [ ! -d "$SPICETIFY_CONFIG" ]; then
    if [ -d "$HOME/.config/spicetify" ]; then
        SPICETIFY_CONFIG="$HOME/.config/spicetify"
    elif [ -d "$HOME/.spicetify" ]; then
        SPICETIFY_CONFIG="$HOME/.spicetify"
    elif [ -n "$XDG_CONFIG_HOME" ] && [ -d "$XDG_CONFIG_HOME/spicetify" ]; then
        SPICETIFY_CONFIG="$XDG_CONFIG_HOME/spicetify"
    else
        # Create default
        SPICETIFY_CONFIG="$HOME/.config/spicetify"
    fi
fi

echo " ${GREEN}OK${NC}"
echo "  → $SPICETIFY_CONFIG"

CUSTOM_APPS_PATH="$SPICETIFY_CONFIG/CustomApps"
APP_PATH="$CUSTOM_APPS_PATH/$APP_NAME"

# Create CustomApps directory if needed
if [ ! -d "$CUSTOM_APPS_PATH" ]; then
    echo -n "Creating CustomApps directory..."
    mkdir -p "$CUSTOM_APPS_PATH"
    echo " ${GREEN}OK${NC}"
fi

# Remove old installation
if [ -d "$APP_PATH" ]; then
    echo -n "Removing old installation..."
    rm -rf "$APP_PATH"
    echo " ${GREEN}OK${NC}"
fi

# Download latest release
echo "${CYAN}Downloading latest release...${NC}"
TEMP_ZIP="/tmp/$APP_NAME.zip"
DOWNLOAD_URL="$REPO_URL/releases/latest/download/listening-stats.zip"

if command -v curl &> /dev/null; then
    DOWNLOAD_CMD="curl -fsSL"
elif command -v wget &> /dev/null; then
    DOWNLOAD_CMD="wget -qO-"
else
    echo "${RED}Error: curl or wget is required${NC}"
    exit 1
fi

# Try releases first
if ! $DOWNLOAD_CMD "$DOWNLOAD_URL" > "$TEMP_ZIP" 2>/dev/null; then
    echo "${YELLOW}Release not found, trying dist branch...${NC}"
    ALT_URL="$REPO_URL/archive/refs/heads/dist.zip"
    if ! $DOWNLOAD_CMD "$ALT_URL" > "$TEMP_ZIP" 2>/dev/null; then
        echo "${RED}Download failed${NC}"
        exit 1
    fi
fi

echo "${GREEN}Download complete!${NC}"

# Extract and install
echo -n "Installing..."
TEMP_EXTRACT="/tmp/$APP_NAME-extract"
rm -rf "$TEMP_EXTRACT"
mkdir -p "$TEMP_EXTRACT"

if command -v unzip &> /dev/null; then
    unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"
else
    echo "${RED}Error: unzip is required${NC}"
    exit 1
fi

# Find the actual content (might be nested in a directory)
SOURCE_DIR="$TEMP_EXTRACT"
if [ -f "$TEMP_EXTRACT/manifest.json" ]; then
    SOURCE_DIR="$TEMP_EXTRACT"
else
    # Check for nested directory
    NESTED=$(find "$TEMP_EXTRACT" -maxdepth 1 -type d ! -path "$TEMP_EXTRACT" | head -1)
    if [ -n "$NESTED" ] && [ -f "$NESTED/manifest.json" ]; then
        SOURCE_DIR="$NESTED"
    fi
fi

# Create app directory and copy files
mkdir -p "$APP_PATH"
cp -r "$SOURCE_DIR"/* "$APP_PATH/"

# Cleanup
rm -f "$TEMP_ZIP"
rm -rf "$TEMP_EXTRACT"

echo " ${GREEN}OK${NC}"

# Configure Spicetify
echo -n "Configuring Spicetify..."
spicetify config custom_apps "$APP_NAME" 2>/dev/null || true
echo " ${GREEN}OK${NC}"

# Apply changes
echo "${CYAN}Applying changes...${NC}"
if spicetify apply; then
    echo ""
    echo "${GREEN}✓ Listening Stats installed successfully!${NC}"
    echo ""
    echo "${YELLOW}Restart Spotify if it was running.${NC}"
    echo "${CYAN}You will find Listening Stats in the sidebar.${NC}"
else
    echo ""
    echo "${YELLOW}Could not apply automatically. Try running:${NC}"
    echo "${CYAN}  spicetify apply${NC}"
fi

echo ""
