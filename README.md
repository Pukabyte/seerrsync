# Seerrsync

A modern web application for managing Seerr user synchronization across multiple media servers (Plex, Jellyfin, Emby). The application provides both a web dashboard and API for managing user sync operations.

## Features

### Core Functionality
- **Multi-Server Support**: Sync users from multiple Plex, Jellyfin, and Emby servers
- **User Management**: Create local Seerr accounts for media server users
- **Automatic Sync**: Trigger user synchronization from the web interface
- **User Blocking**: Block specific users from being synced
- **Immune Users**: Mark users as immune to prevent deletion during cleanup
- **Request Limits**: Configure per-server request limits for users
- **Password Suffixes**: Automatically append suffixes to usernames for passwords

### Web Dashboard
- **Dashboard**: Overview of all configured media servers and Seerr instance
- **Media Server Management**: Add, edit, enable/disable, and delete media servers
- **Seerr Configuration**: Configure your Seerr instance URL and API key
- **User Management**: View detailed user information with sync status
- **Requests Dashboard**: View all user requests organized by user
- **User Settings**: Block/unblock users, set immune status, update passwords

### API
- RESTful API for automation and integration
- Bearer token authentication
- Comprehensive endpoints for all operations

## Setup

### Configuration Files

**Important:** The repository includes example configuration files. You must create your own configuration files from the examples:

1. Copy `config.json.example` to `config.json` and fill in your settings:
   ```bash
   cp config.json.example config.json
   ```

2. Copy `docker-compose.yml.example` to `docker-compose.yml` and adjust for your environment:
   ```bash
   cp docker-compose.yml.example docker-compose.yml
   ```

**Note:** `config.json` and `docker-compose.yml` are excluded from git via `.gitignore` to protect sensitive information.

## Installation

### Docker (Recommended)

1. **Build the Docker image**:
```bash
docker build -t seersync:latest .
```

2. **Start the service**:
```bash
docker compose up -d
```

The application will be available at the configured domain (default: `seersync.arctv.xyz`).

### Manual Installation

#### Backend

1. Install Python 3.11 or higher
2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Start the API server:
```bash
python api.py
```

The API will be available at `http://localhost:8000`

#### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. For development:
```bash
npm run dev
```

4. For production build:
```bash
npm run build
```

The built frontend will be in `frontend/dist/` and will be served by the FastAPI backend when running `api.py`.

## Configuration

### Config File

The application uses `config.json` for configuration. When running in Docker, this file should be located at `/opt/oversyncerr/config.json` (or the path specified in your docker-compose volume mount).

### Configuration Structure

```json
{
  "admin": {
    "username": "admin",
    "password": "your-secure-password"
  },
  "seerr": {
    "url": "https://request.example.com",
    "api_key": "your-api-key-here"
  },
  "media_servers": [
    {
      "name": "Plex Server",
      "type": "plex",
      "url": "https://plex.example.com",
      "token": "your-plex-token",
      "enabled": true,
      "password_suffix": "-request",
      "request_limit": 10,
      "machine_identifier": "optional-plex-machine-id"
    }
  ],
  "user_settings": {
    "username": {
      "blocked": false,
      "immune": false
    }
  }
}
```

### Getting API Tokens

#### Seerr/Jellyseerr
1. Go to Settings → General Settings
2. Copy your API key

#### Plex
1. Visit https://plex.tv/api
2. Sign in and copy your token from the URL or use browser developer tools
3. Optional: Use the `/api/plex/servers` endpoint to discover available servers

#### Jellyfin
1. Go to Settings → API Keys
2. Create a new API key and copy it

#### Emby
1. Go to Settings → API Keys
2. Create a new API key and copy it

## Usage

### Web Interface

1. Access the web dashboard at your configured domain
2. Log in with your admin credentials (from `config.json`)
3. Configure your Seerr instance and media servers
4. Use the "Sync Users" button to trigger synchronization

### Command Line Sync

You can also use the sync script directly:

#### Basic Sync
```bash
python sync_users.py
```

#### Sync with Removal
Remove users from Seerr that no longer exist in any media server:
```bash
python sync_users.py --remove-missing
```

#### Custom Permissions
Set default permissions for new users:
```bash
python sync_users.py --permissions 2
```

#### Custom Config File
```bash
python sync_users.py --config my-config.json
```

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login and get bearer token
- `POST /api/auth/logout` - Logout (invalidate token)
- `GET /api/auth/verify` - Verify authentication status

### Seerr

- `GET /api/seerr` - Get Seerr configuration and info (user count, stats, version)
- `PUT /api/seerr` - Update Seerr configuration

### Media Servers

- `GET /api/mediaservers` - Get all media servers with user counts
- `GET /api/mediaservers/{server_name}` - Get a specific media server
- `POST /api/mediaservers` - Create a new media server
- `PUT /api/mediaservers/{server_name}` - Update a media server
- `DELETE /api/mediaservers/{server_name}` - Delete a media server
- `GET /api/plex/servers?token={plex_token}` - Discover Plex servers

### Users & Requests

- `GET /api/users` - Get all users from Seerr
- `GET /api/users/detailed` - Get detailed user information from all sources
- `GET /api/users/requests` - Get all requests grouped by user
- `PUT /api/users/{username}/settings` - Update user settings (blocked, immune, password)

### Sync

- `POST /api/sync` - Trigger user synchronization

### Health

- `GET /api/health` - Health check endpoint

## Example: Adding Media Server via API

```bash
curl -X POST http://localhost:8000/api/mediaservers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My Plex Server",
    "type": "plex",
    "url": "https://plex.example.com",
    "token": "your-token-here",
    "enabled": true,
    "password_suffix": "-request",
    "request_limit": 10
  }'
```

## How It Works

1. The application connects to each configured media server
2. Fetches the list of users from each server
3. Creates a unified list of unique users (by username, case-insensitive)
4. Compares with existing Seerr users
5. Creates new local users in Seerr for users that don't exist
6. Optionally removes users from Seerr that no longer exist in any media server
7. Respects blocked and immune user settings

## Docker Compose Configuration

The application includes a `docker-compose.yml` file configured for Saltbox/Traefik. Key settings:

- **Service name**: `seersync`
- **Port**: `8000`
- **Volume**: `/opt/oversyncerr:/config` (config.json location)
- **Network**: `saltbox` (external network)
- **Domain**: `seersync.arctv.xyz` (configurable)

## Notes

- Users are identified by username (case-insensitive)
- If a user exists in multiple media servers, their information is merged
- Email addresses are used when available
- The application preserves existing Seerr users and only adds new ones or deletes users who are no longer apart of a configured media server
- Users created by this application are local users and do not require Plex/Jellyfin/Emby authentication
- Blocked users are skipped during sync but remain visible in the UI
- Immune users are protected from deletion during cleanup operations
- Password suffixes are automatically appended to usernames when creating passwords

## Troubleshooting

### Connection Errors
- Verify your server URLs and that they're accessible
- Check firewall rules and network connectivity
- Ensure SSL certificates are valid for HTTPS URLs

### Authentication Errors
- Double-check your API keys and tokens
- Verify token permissions (especially for Plex)
- Ensure your Seerr API key has `MANAGE_USERS` permission

### User Not Created
- Check if the username already exists in Seerr
- Verify the user is not blocked in user settings
- Check application logs for detailed error messages

### Docker Issues
- Verify the config file exists at the mounted volume path
- Check container logs: `docker logs seersync`
- Ensure the saltbox network exists: `docker network ls | grep saltbox`

### Frontend Not Loading
- Ensure the frontend is built: `npm run build` in the frontend directory
- Check that `frontend/dist` exists and contains built files
- Verify static file serving is configured correctly in `api.py`

## Development

The frontend uses Vite for development. The API proxy is configured to forward `/api` requests to the backend running on port 8000.

For production, build the frontend and serve it through the FastAPI static file handler (already configured in `api.py`).

## License

This project is open source and available for use and modification.
