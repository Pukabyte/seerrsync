#!/usr/bin/env python3
"""
FastAPI backend for Seerrsync
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import json
import os
import requests
import uuid
import xml.etree.ElementTree as ET
from urllib.parse import urljoin
import secrets
from sync_users import (
    OverseerrConfig, MediaServerConfig, OverseerrClient,
    create_media_server_client, load_config, add_manual_user
)

app = FastAPI(title="Seerrsync API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIG_FILE = os.getenv('CONFIG_FILE', 'config.json')

# Authentication
security = HTTPBearer()
# Simple token storage (in production, use Redis or database)
active_tokens = set()

# Pydantic models for API
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    message: str
class MediaServerCreate(BaseModel):
    name: str
    type: str = Field(..., pattern="^(plex|jellyfin|emby)$")
    url: str
    token: str
    enabled: bool = True
    password_suffix: str = ""
    request_limit: Optional[int] = None
    machine_identifier: Optional[str] = None


class MediaServerUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = Field(None, pattern="^(plex|jellyfin|emby)$")
    url: Optional[str] = None
    token: Optional[str] = None
    enabled: Optional[bool] = None
    password_suffix: Optional[str] = None
    request_limit: Optional[int] = None
    machine_identifier: Optional[str] = None


class SeerrConfigUpdate(BaseModel):
    url: Optional[str] = None
    api_key: Optional[str] = None
    sync_interval_minutes: Optional[int] = None


class PlexServerInfo(BaseModel):
    name: str
    machineIdentifier: str
    address: Optional[str] = None
    port: Optional[int] = None


class MediaServerResponse(BaseModel):
    name: str
    type: str
    url: str
    enabled: bool
    password_suffix: str
    request_limit: Optional[int] = None
    user_count: Optional[int] = None
    machine_identifier: Optional[str] = None


class SeerrInfo(BaseModel):
    url: str
    api_key: Optional[str] = None
    user_count: Optional[int] = None
    total_requests: Optional[int] = None
    total_media_items: Optional[int] = None
    missing_requests: Optional[int] = None
    version: Optional[str] = None
    sync_interval_minutes: Optional[int] = None


class UserRequest(BaseModel):
    id: int
    status: int
    media_type: str
    requested_by: Dict
    media: Dict
    created_at: str
    updated_at: str


class UserDetail(BaseModel):
    username: str
    email: Optional[str] = None
    source_servers: List[str] = []
    source_types: List[str] = []
    synced_to_overseerr: bool = False
    overseerr_user_id: Optional[int] = None
    request_count: int = 0
    missing_requests: int = 0
    blocked: bool = False
    immune: bool = False
    password_suffix: Optional[str] = None
    request_limit: Optional[int] = None


class UserSettingsUpdate(BaseModel):
    blocked: Optional[bool] = None
    immune: Optional[bool] = None
    password: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    password: Optional[str] = None
    permissions: int = 0
    request_limit: Optional[int] = None
    blocked: bool = False
    immune: bool = False


def load_config_data():
    """Load configuration from JSON file"""
    try:
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"seerr": {}, "media_servers": []}
    except json.JSONDecodeError:
        return {"seerr": {}, "media_servers": []}


def verify_admin_credentials(username: str, password: str) -> bool:
    """Verify admin credentials from config"""
    config_data = load_config_data()
    admin_config = config_data.get('admin', {})
    return (
        admin_config.get('username') == username and
        admin_config.get('password') == password
    )


def generate_token() -> str:
    """Generate a secure random token"""
    return secrets.token_urlsafe(32)


async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify authentication token"""
    token = credentials.credentials
    if token not in active_tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def save_config_data(data: dict):
    """Save configuration to JSON file"""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def get_user_count_from_server(server_config: dict) -> Optional[int]:
    """Get user count from a media server"""
    try:
        server_url = server_config['url'].strip() if server_config.get('url') else ''
        config = MediaServerConfig(
            name=server_config['name'],
            type=server_config['type'],
            url=server_url,
            token=server_config['token'],
            enabled=server_config.get('enabled', True),
            password_suffix=server_config.get('password_suffix', ''),
            request_limit=server_config.get('request_limit'),
            machine_identifier=server_config.get('machine_identifier'),
            include_owner=server_config.get('include_owner', True)
        )
        client = create_media_server_client(config)
        users = client.get_users()
        return len(users)
    except Exception as e:
        print(f"Error getting user count from {server_config.get('name', 'unknown')}: {e}")
        return None


@app.get("/")
async def root():
    """Serve the frontend"""
    frontend_path = os.path.join(os.path.dirname(__file__), "frontend", "dist", "index.html")
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path)
    return {"message": "Seerrsync API", "frontend": "not found", "hint": "Run 'npm run build' in the frontend directory"}


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(login_data: LoginRequest):
    """Login endpoint"""
    if verify_admin_credentials(login_data.username, login_data.password):
        token = generate_token()
        active_tokens.add(token)
        return LoginResponse(token=token, message="Login successful")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password"
    )


@app.post("/api/auth/logout")
async def logout(token: str = Depends(verify_token)):
    """Logout endpoint"""
    active_tokens.discard(token)
    return {"message": "Logged out successfully"}


@app.get("/api/auth/verify")
async def verify_auth(token: str = Depends(verify_token)):
    """Verify authentication status"""
    return {"authenticated": True}


@app.get("/api/seerr")
async def get_seerr(token: str = Depends(verify_token)):
    """Get Seerr configuration and info"""
    config_data = load_config_data()
    seerr_config = config_data.get('seerr', {})
    # Fallback to 'overseerr' for backward compatibility
    if not seerr_config:
        seerr_config = config_data.get('overseerr', {})
    
    if not seerr_config.get('url') or not seerr_config.get('api_key'):
        sync_interval_minutes = config_data.get('sync_interval_minutes')
        return SeerrInfo(url="", api_key="", user_count=None, total_requests=None, total_media_items=None, missing_requests=None, version=None, sync_interval_minutes=sync_interval_minutes)
    
    try:
        from concurrent.futures import ThreadPoolExecutor

        overseerr_client = OverseerrClient(OverseerrConfig(
            url=seerr_config['url'],
            api_key=seerr_config['api_key']
        ))

        # Fetch users, stats, and missing requests in parallel
        with ThreadPoolExecutor(max_workers=3) as executor:
            users_future = executor.submit(overseerr_client.get_users)
            stats_future = executor.submit(overseerr_client.get_stats)
            missing_future = executor.submit(overseerr_client.get_missing_requests_count)

            users = users_future.result()
            stats = stats_future.result()
            missing_requests = missing_future.result()

        config_data = load_config_data()
        sync_interval_minutes = config_data.get('sync_interval_minutes')

        return SeerrInfo(
            url=seerr_config['url'],
            api_key=seerr_config.get('api_key', ''),
            user_count=len(users),
            total_requests=stats.get('totalRequests') if stats else None,
            total_media_items=stats.get('totalMediaItems') if stats else None,
            missing_requests=missing_requests,
            version=stats.get('version') if stats else None,
            sync_interval_minutes=sync_interval_minutes
        )
    except Exception as e:
        config_data = load_config_data()
        sync_interval_minutes = config_data.get('sync_interval_minutes')
        
        return SeerrInfo(
            url=seerr_config.get('url', ''),
            api_key=seerr_config.get('api_key', ''),
            user_count=None,
            total_requests=None,
            total_media_items=None,
            missing_requests=None,
            version=None,
            sync_interval_minutes=sync_interval_minutes
        )


@app.put("/api/seerr")
async def update_seerr(config: SeerrConfigUpdate, token: str = Depends(verify_token)):
    """Update Seerr configuration"""
    config_data = load_config_data()
    # Migrate from 'overseerr' to 'seerr' if needed
    if 'overseerr' in config_data and 'seerr' not in config_data:
        config_data['seerr'] = config_data['overseerr']
        del config_data['overseerr']
    
    if 'seerr' not in config_data:
        config_data['seerr'] = {}
    
    if config.url is not None:
        config_data['seerr']['url'] = config.url
    if config.api_key is not None:
        config_data['seerr']['api_key'] = config.api_key
    if config.sync_interval_minutes is not None:
        config_data['sync_interval_minutes'] = config.sync_interval_minutes
    
    save_config_data(config_data)
    return {"message": "Seerr configuration updated"}


# Backward compatibility endpoint
@app.get("/api/overseerr")
async def get_overseerr_legacy(token: str = Depends(verify_token)):
    """Legacy endpoint - redirects to /api/seerr"""
    return await get_seerr(token)


@app.put("/api/overseerr")
async def update_overseerr_legacy(config: SeerrConfigUpdate, token: str = Depends(verify_token)):
    """Legacy endpoint - redirects to /api/seerr"""
    return await update_seerr(config, token)


@app.get("/api/mediaservers")
async def get_mediaservers(token: str = Depends(verify_token)):
    """Get all media servers with user counts"""
    from concurrent.futures import ThreadPoolExecutor

    config_data = load_config_data()
    servers = config_data.get('media_servers', [])

    # Fetch user counts from all enabled servers in parallel
    enabled_servers = {i: server for i, server in enumerate(servers) if server.get('enabled', True)}
    user_counts = {}

    if enabled_servers:
        with ThreadPoolExecutor(max_workers=min(len(enabled_servers), 5)) as executor:
            futures = {executor.submit(get_user_count_from_server, server): i for i, server in enabled_servers.items()}
            for future in futures:
                idx = futures[future]
                try:
                    user_counts[idx] = future.result()
                except Exception:
                    user_counts[idx] = None

    result = []
    for i, server in enumerate(servers):
        result.append(MediaServerResponse(
            name=server['name'],
            type=server['type'],
            url=server['url'],
            enabled=server.get('enabled', True),
            password_suffix=server.get('password_suffix', ''),
            request_limit=server.get('request_limit'),
            user_count=user_counts.get(i),
            machine_identifier=server.get('machine_identifier')
        ))

    return result


@app.get("/api/mediaservers/{server_name}")
async def get_mediaserver(server_name: str, token: str = Depends(verify_token)):
    """Get a specific media server by name"""
    config_data = load_config_data()
    servers = config_data.get('media_servers', [])
    
    for server in servers:
        if server['name'] == server_name:
            user_count = None
            if server.get('enabled', True):
                user_count = get_user_count_from_server(server)
            
            return MediaServerResponse(
                name=server['name'],
                type=server['type'],
                url=server['url'],
                enabled=server.get('enabled', True),
                password_suffix=server.get('password_suffix', ''),
                request_limit=server.get('request_limit'),
                user_count=user_count,
                machine_identifier=server.get('machine_identifier')
            )
    
    raise HTTPException(status_code=404, detail="Media server not found")


@app.post("/api/mediaservers")
async def create_mediaserver(server: MediaServerCreate, token: str = Depends(verify_token)):
    """Create a new media server"""
    config_data = load_config_data()
    
    # Check if server with same name already exists
    for existing in config_data.get('media_servers', []):
        if existing['name'] == server.name:
            raise HTTPException(status_code=400, detail="Media server with this name already exists")
    
    server_dict = server.dict()
    if 'media_servers' not in config_data:
        config_data['media_servers'] = []
    
    config_data['media_servers'].append(server_dict)
    save_config_data(config_data)
    
    return {"message": "Media server created", "server": server_dict}


@app.put("/api/mediaservers/{server_name}")
async def update_mediaserver(server_name: str, server_update: MediaServerUpdate, token: str = Depends(verify_token)):
    """Update a media server"""
    config_data = load_config_data()
    servers = config_data.get('media_servers', [])
    
    # Find the server to update
    server_index = None
    for i, server in enumerate(servers):
        if server['name'] == server_name:
            server_index = i
            break
    
    if server_index is None:
        raise HTTPException(status_code=404, detail="Media server not found")
    
    update_data = server_update.dict(exclude_unset=True)
    
    # Check if name is being changed and if the new name already exists
    if 'name' in update_data and update_data['name'] != server_name:
        new_name = update_data['name']
        # Check if another server already has this name
        for i, server in enumerate(servers):
            if i != server_index and server['name'] == new_name:
                raise HTTPException(status_code=400, detail="Media server with this name already exists")
    
    servers[server_index].update(update_data)
    save_config_data(config_data)
    return {"message": "Media server updated", "server": servers[server_index]}


@app.get("/api/plex/servers")
async def get_plex_servers(token: str, token_auth: str = Depends(verify_token)):
    """Get available Plex servers using a Plex token (token is query parameter)"""
    try:
        url = "https://plex.tv/api/resources"
        headers = {
            'X-Plex-Token': token,
            'X-Plex-Client-Identifier': str(uuid.uuid4()),
            'Accept': 'application/json, application/xml'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        servers = []
        content_type = response.headers.get('Content-Type', '').lower()
        
        if 'xml' in content_type or response.text.strip().startswith('<?xml') or response.text.strip().startswith('<'):
            root = ET.fromstring(response.content)
            media_container = root if root.tag == 'MediaContainer' else root.find('MediaContainer')
            if media_container is not None:
                device_elements = media_container.findall('Device')
                for device_elem in device_elements:
                    device_type = device_elem.get('product', '')
                    if device_type == 'Plex Media Server':
                        name = device_elem.get('name', '')
                        machine_id = device_elem.get('clientIdentifier', '')
                        connection_elem = device_elem.find('Connection')
                        address = None
                        port = None
                        if connection_elem is not None:
                            address = connection_elem.get('address')
                            port_str = connection_elem.get('port')
                            if port_str:
                                try:
                                    port = int(port_str)
                                except ValueError:
                                    pass
                        servers.append(PlexServerInfo(
                            name=name,
                            machineIdentifier=machine_id,
                            address=address,
                            port=port
                        ))
        else:
            data = response.json()
            if isinstance(data, dict) and 'MediaContainer' in data:
                devices = data['MediaContainer'].get('Device', [])
                if not isinstance(devices, list):
                    devices = [devices]
                for device in devices:
                    if device.get('product') == 'Plex Media Server':
                        name = device.get('name', '')
                        machine_id = device.get('clientIdentifier', '')
                        connections = device.get('Connection', [])
                        if not isinstance(connections, list):
                            connections = [connections]
                        address = None
                        port = None
                        if connections:
                            connection = connections[0]
                            address = connection.get('address')
                            port_str = connection.get('port')
                            if port_str:
                                try:
                                    port = int(port_str)
                                except ValueError:
                                    pass
                        servers.append(PlexServerInfo(
                            name=name,
                            machineIdentifier=machine_id,
                            address=address,
                            port=port
                        ))
        
        return servers
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch Plex servers: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching Plex servers: {str(e)}")


@app.delete("/api/mediaservers/{server_name}")
async def delete_mediaserver(server_name: str, token: str = Depends(verify_token)):
    """Delete a media server"""
    config_data = load_config_data()
    servers = config_data.get('media_servers', [])
    
    for i, server in enumerate(servers):
        if server['name'] == server_name:
            deleted = servers.pop(i)
            save_config_data(config_data)
            return {"message": "Media server deleted", "server": deleted}
    
    raise HTTPException(status_code=404, detail="Media server not found")


@app.get("/api/users/requests")
async def get_all_requests(token: str = Depends(verify_token)):
    """Get all user requests from Seerr"""
    config_data = load_config_data()
    seerr_config = config_data.get('seerr', {})
    # Fallback to 'overseerr' for backward compatibility
    if not seerr_config:
        seerr_config = config_data.get('overseerr', {})
    
    if not seerr_config.get('url') or not seerr_config.get('api_key'):
        raise HTTPException(status_code=400, detail="Seerr not configured")
    
    try:
        overseerr_client = OverseerrClient(OverseerrConfig(
            url=seerr_config['url'],
            api_key=seerr_config['api_key']
        ))
        
        # Get all requests
        url = f"{overseerr_client.base_url}/request"
        all_requests = []
        skip = 0
        take = 100
        
        while True:
            params = {'skip': skip, 'take': take}
            response = overseerr_client.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            page_requests = data.get('results', [])
            all_requests.extend(page_requests)
            
            if len(page_requests) < take:
                break
            
            page_info = data.get('pageInfo', {})
            current_page = page_info.get('page', 1)
            total_pages = page_info.get('pages', 1)
            
            if current_page >= total_pages:
                break
            
            skip += take
        
        # Run media detail fetches and media server source lookups concurrently
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def fetch_media_details(req):
            media = req.get('media', {})
            media_type = req.get('type') or media.get('mediaType')
            tmdb_id = media.get('tmdbId')
            req['mediaType'] = media_type
            if tmdb_id and media_type:
                try:
                    if media_type == 'movie':
                        media_url = f"{overseerr_client.base_url}/movie/{tmdb_id}"
                    elif media_type == 'tv':
                        media_url = f"{overseerr_client.base_url}/tv/{tmdb_id}"
                    else:
                        media_id = media.get('id')
                        if media_id:
                            media_url = f"{overseerr_client.base_url}/media/{media_id}"
                        else:
                            return req
                    media_response = overseerr_client.session.get(media_url, timeout=10)
                    if media_response.status_code == 200:
                        media_data = media_response.json()
                        req['media'].update(media_data)
                except Exception as e:
                    print(f"Warning: Failed to fetch media details for {media_type} ID {tmdb_id}: {e}")
            return req

        def fetch_all_source_users():
            """Fetch user source info from all media servers in parallel"""
            source_map = {}
            try:
                from sync_users import MediaServerConfig, create_media_server_client
                cfg = load_config_data()

                def fetch_source_users(server_data):
                    server_url = server_data['url'].strip() if server_data.get('url') else ''
                    config = MediaServerConfig(
                        name=server_data['name'],
                        type=server_data['type'],
                        url=server_url,
                        token=server_data['token'],
                        enabled=server_data.get('enabled', True),
                        password_suffix=server_data.get('password_suffix', ''),
                        request_limit=server_data.get('request_limit'),
                        machine_identifier=server_data.get('machine_identifier'),
                        include_owner=server_data.get('include_owner', True)
                    )
                    client = create_media_server_client(config)
                    return client.get_users()

                enabled = [s for s in cfg.get('media_servers', []) if s.get('enabled', True)]
                if enabled:
                    with ThreadPoolExecutor(max_workers=min(len(enabled), 5)) as ex:
                        futs = {ex.submit(fetch_source_users, s): s for s in enabled}
                        for fut in futs:
                            try:
                                for mu in fut.result():
                                    ul = mu.username.lower()
                                    if ul not in source_map:
                                        source_map[ul] = {'source_servers': [], 'source_types': []}
                                    if mu.source_server not in source_map[ul]['source_servers']:
                                        source_map[ul]['source_servers'].append(mu.source_server)
                                    if mu.source_type not in source_map[ul]['source_types']:
                                        source_map[ul]['source_types'].append(mu.source_type)
                            except Exception as e:
                                sd = futs[fut]
                                print(f"Error fetching user sources from {sd.get('name', 'unknown')}: {e}")
            except Exception as e:
                print(f"Error building user source map: {e}")
            return source_map

        # Run media details + source user lookups concurrently
        user_source_map = {}
        with ThreadPoolExecutor(max_workers=15) as executor:
            # Submit source user fetch as one task
            source_future = executor.submit(fetch_all_source_users)
            # Submit all media detail fetches
            media_futures = {executor.submit(fetch_media_details, req): i for i, req in enumerate(all_requests)}

            # Collect media results
            results = [None] * len(all_requests)
            for future in as_completed(media_futures):
                idx = media_futures[future]
                results[idx] = future.result()
            all_requests = results

            # Collect source map result
            user_source_map = source_future.result()
        
        # Group requests by user and add source information
        # Trim each request to only fields the frontend uses
        requests_by_user = {}
        for req in all_requests:
            requested_by = req.get('requestedBy') or {}
            user_id = requested_by.get('id')
            username = requested_by.get('username') or 'Unknown'
            username_lower = username.lower()

            if user_id not in requests_by_user:
                user_info = {
                    'id': user_id,
                    'username': username,
                    'email': requested_by.get('email'),
                    'source_servers': user_source_map.get(username_lower, {}).get('source_servers', []),
                    'source_types': user_source_map.get(username_lower, {}).get('source_types', [])
                }
                requests_by_user[user_id] = {
                    'user': user_info,
                    'requests': []
                }

            media = req.get('media', {})
            trimmed_req = {
                'id': req.get('id'),
                'status': req.get('status'),
                'mediaType': req.get('mediaType'),
                'createdAt': req.get('createdAt'),
                'updatedAt': req.get('updatedAt'),
                'media': {
                    'title': media.get('title') or media.get('name'),
                    'name': media.get('name'),
                    'releaseDate': media.get('releaseDate'),
                }
            }
            requests_by_user[user_id]['requests'].append(trimmed_req)
        
        return {
            'total_requests': len(all_requests),
            'requests_by_user': requests_by_user
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching requests: {str(e)}")


@app.get("/api/users")
async def get_all_users(token: str = Depends(verify_token)):
    """Get all users from Seerr"""
    config_data = load_config_data()
    seerr_config = config_data.get('seerr', {})
    # Fallback to 'overseerr' for backward compatibility
    if not seerr_config:
        seerr_config = config_data.get('overseerr', {})
    
    if not seerr_config.get('url') or not seerr_config.get('api_key'):
        raise HTTPException(status_code=400, detail="Seerr not configured")
    
    try:
        overseerr_client = OverseerrClient(OverseerrConfig(
            url=seerr_config['url'],
            api_key=seerr_config['api_key']
        ))
        users = overseerr_client.get_users()
        return {"users": users, "count": len(users)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching users: {str(e)}")


@app.get("/api/users/detailed")
async def get_detailed_users(token: str = Depends(verify_token)):
    """Get detailed user information from all media servers and Overseerr"""
    config_data = load_config_data()
    seerr_config = config_data.get('seerr', {})
    if not seerr_config:
        seerr_config = config_data.get('overseerr', {})
    
    user_settings = config_data.get('user_settings', {})
    
    all_users: Dict[str, UserDetail] = {}
    
    # First, add all blocked users from config (even if not in media servers or Overseerr)
    # This ensures blocked users are visible in UI even after being removed from Overseerr
    for username_lower, user_setting in user_settings.items():
        if user_setting.get('blocked', False):
            if username_lower not in all_users:
                # Use lowercase as initial value, will be updated with correct case when processing media servers
                all_users[username_lower] = UserDetail(
                    username=username_lower,
                    email=None,
                    source_servers=[],
                    source_types=[],
                    synced_to_overseerr=False,
                    overseerr_user_id=None,
                    request_count=0,
                    missing_requests=0,
                    blocked=True,
                    immune=user_setting.get('immune', False),
                    password_suffix=None,
                    request_limit=None
                )
    
    # Get users from all enabled media servers in parallel
    from concurrent.futures import ThreadPoolExecutor

    def fetch_server_users(server_data):
        server_url = server_data['url'].strip() if server_data.get('url') else ''
        config = MediaServerConfig(
            name=server_data['name'],
            type=server_data['type'],
            url=server_url,
            token=server_data['token'],
            enabled=server_data.get('enabled', True),
            password_suffix=server_data.get('password_suffix', ''),
            request_limit=server_data.get('request_limit'),
            machine_identifier=server_data.get('machine_identifier'),
            include_owner=server_data.get('include_owner', True)
        )
        client = create_media_server_client(config)
        return client.get_users()

    enabled_servers = [s for s in config_data.get('media_servers', []) if s.get('enabled', True)]
    server_results = {}

    if enabled_servers:
        with ThreadPoolExecutor(max_workers=min(len(enabled_servers), 5)) as executor:
            futures = {executor.submit(fetch_server_users, s): s for s in enabled_servers}
            for future in futures:
                server_data = futures[future]
                try:
                    server_results[server_data['name']] = future.result()
                except Exception as e:
                    print(f"Error fetching users from {server_data.get('name', 'unknown')}: {e}")

    for server_name, media_users in server_results.items():
        for media_user in media_users:
            username_lower = media_user.username.lower()
            user_setting = user_settings.get(username_lower, {})
            if username_lower not in all_users:
                all_users[username_lower] = UserDetail(
                    username=media_user.username,
                    email=media_user.email,
                    source_servers=[media_user.source_server],
                    source_types=[media_user.source_type],
                    synced_to_overseerr=False,
                    request_count=0,
                    missing_requests=0,
                    blocked=user_setting.get('blocked', False),
                    immune=user_setting.get('immune', False),
                    password_suffix=media_user.password_suffix,
                    request_limit=media_user.request_limit
                )
            else:
                all_users[username_lower].username = media_user.username
                if media_user.source_server not in all_users[username_lower].source_servers:
                    all_users[username_lower].source_servers.append(media_user.source_server)
                if media_user.source_type not in all_users[username_lower].source_types:
                    all_users[username_lower].source_types.append(media_user.source_type)
                if not all_users[username_lower].email and media_user.email:
                    all_users[username_lower].email = media_user.email
                if not all_users[username_lower].password_suffix and media_user.password_suffix:
                    all_users[username_lower].password_suffix = media_user.password_suffix
                if all_users[username_lower].request_limit is None and media_user.request_limit is not None:
                    all_users[username_lower].request_limit = media_user.request_limit
                all_users[username_lower].blocked = user_setting.get('blocked', all_users[username_lower].blocked)
                all_users[username_lower].immune = user_setting.get('immune', all_users[username_lower].immune)
    
    # Get Overseerr users and match them
    overseerr_users = []
    requests_by_user = {}
    missing_requests_by_user = {}
    
    if seerr_config.get('url') and seerr_config.get('api_key'):
        try:
            overseerr_client = OverseerrClient(OverseerrConfig(
                url=seerr_config['url'],
                api_key=seerr_config['api_key']
            ))

            # Fetch Overseerr users and all requests in parallel
            def fetch_all_requests():
                reqs = []
                req_url = f"{overseerr_client.base_url}/request"
                skip = 0
                take = 100
                while True:
                    params = {'skip': skip, 'take': take}
                    resp = overseerr_client.session.get(req_url, params=params, timeout=10)
                    resp.raise_for_status()
                    data = resp.json()
                    page_requests = data.get('results', [])
                    reqs.extend(page_requests)
                    if len(page_requests) < take:
                        break
                    page_info = data.get('pageInfo', {})
                    if page_info.get('page', 1) >= page_info.get('pages', 1):
                        break
                    skip += take
                return reqs

            with ThreadPoolExecutor(max_workers=2) as executor:
                users_future = executor.submit(overseerr_client.get_users)
                requests_future = executor.submit(fetch_all_requests)

                overseerr_users = users_future.result()
                all_requests = requests_future.result()

            overseerr_usernames = {user['username'].lower(): user for user in overseerr_users if user.get('username')}

            for req in all_requests:
                requested_by = req.get('requestedBy', {})
                user_id = requested_by.get('id')
                if user_id:
                    if user_id not in requests_by_user:
                        requests_by_user[user_id] = 0
                    requests_by_user[user_id] += 1
                    if req.get('status') == 7:
                        if user_id not in missing_requests_by_user:
                            missing_requests_by_user[user_id] = 0
                        missing_requests_by_user[user_id] += 1
            
            # Match Overseerr users with media server users
            for overseerr_user in overseerr_users:
                username = overseerr_user.get('username')
                if not username:
                    continue
                
                username_lower = username.lower()
                user_id = overseerr_user.get('id')
                user_setting = user_settings.get(username_lower, {})
                
                if username_lower in all_users:
                    # Update existing user (even if blocked - they'll show as synced until deleted)
                    all_users[username_lower].synced_to_overseerr = True
                    all_users[username_lower].overseerr_user_id = user_id
                    all_users[username_lower].request_count = requests_by_user.get(user_id, 0)
                    all_users[username_lower].missing_requests = missing_requests_by_user.get(user_id, 0)
                    # Preserve blocked/immune status from config
                    all_users[username_lower].blocked = user_setting.get('blocked', all_users[username_lower].blocked)
                    all_users[username_lower].immune = user_setting.get('immune', all_users[username_lower].immune)
                else:
                    # User exists in Overseerr but not in any media server
                    # Only add if not blocked (blocked users should come from config)
                    if not user_setting.get('blocked', False):
                        all_users[username_lower] = UserDetail(
                            username=username,
                            email=overseerr_user.get('email'),
                            source_servers=[],
                            source_types=[],
                            synced_to_overseerr=True,
                            overseerr_user_id=user_id,
                            request_count=requests_by_user.get(user_id, 0),
                            missing_requests=missing_requests_by_user.get(user_id, 0),
                            blocked=False,
                            immune=user_setting.get('immune', False),
                            password_suffix=None,
                            request_limit=None
                        )
        except Exception as e:
            print(f"Error fetching Overseerr users: {e}")
    
    return {
        "users": [user.dict() for user in all_users.values()],
        "count": len(all_users)
    }


@app.put("/api/users/{username}/settings")
async def update_user_settings(username: str, settings: UserSettingsUpdate, token: str = Depends(verify_token)):
    """Update user settings (blocked, immune, password)"""
    config_data = load_config_data()
    
    if 'user_settings' not in config_data:
        config_data['user_settings'] = {}
    
    username_lower = username.lower()
    if username_lower not in config_data['user_settings']:
        config_data['user_settings'][username_lower] = {}
    
    if settings.blocked is not None:
        config_data['user_settings'][username_lower]['blocked'] = settings.blocked
    
    if settings.immune is not None:
        config_data['user_settings'][username_lower]['immune'] = settings.immune
    
    save_config_data(config_data)
    
    # Update password in Overseerr if provided
    if settings.password:
        seerr_config = config_data.get('seerr', {})
        if not seerr_config:
            seerr_config = config_data.get('overseerr', {})
        
        if seerr_config.get('url') and seerr_config.get('api_key'):
            try:
                overseerr_client = OverseerrClient(OverseerrConfig(
                    url=seerr_config['url'],
                    api_key=seerr_config['api_key']
                ))
                overseerr_users = overseerr_client.get_users()
                overseerr_user = next((u for u in overseerr_users if u.get('username', '').lower() == username_lower), None)
                
                if overseerr_user:
                    user_id = overseerr_user.get('id')
                    if user_id:
                        if not overseerr_client.set_user_password(user_id, settings.password):
                            raise HTTPException(status_code=500, detail="Failed to update password in Overseerr")
                else:
                    raise HTTPException(status_code=404, detail="User not found in Overseerr")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error updating password: {str(e)}")
    
    return {"message": "User settings updated successfully"}


@app.post("/api/users")
async def create_user(user: UserCreate, token: str = Depends(verify_token)):
    """Manually add a user to Overseerr and configure settings"""
    config_data = load_config_data()
    
    seerr_config = config_data.get('seerr', {})
    if not seerr_config:
        seerr_config = config_data.get('overseerr', {})
    
    if not seerr_config.get('url') or not seerr_config.get('api_key'):
        raise HTTPException(status_code=400, detail="Seerr not configured")
    
    try:
        overseerr_client = OverseerrClient(OverseerrConfig(
            url=seerr_config['url'],
            api_key=seerr_config['api_key']
        ))
        
        # Check if user already exists
        overseerr_users = overseerr_client.get_users()
        overseerr_usernames = {u.get('username', '').lower(): u for u in overseerr_users if u.get('username')}
        
        if user.username.lower() in overseerr_usernames and not user.password:
            # User exists, just update settings
            user_id = overseerr_usernames[user.username.lower()].get('id')
            if user.request_limit is not None and user_id:
                overseerr_client.set_user_request_limit(
                    user_id,
                    movie_limit=user.request_limit,
                    tv_limit=user.request_limit
                )
        else:
            # Create new user or update existing with password
            if not user.password:
                raise HTTPException(status_code=400, detail="Password required for new users")
            
            success = add_manual_user(
                overseerr_client,
                username=user.username,
                password=user.password,
                permissions=user.permissions,
                request_limit=user.request_limit,
                blocked=user.blocked,
                immune=user.immune,
                config_file=CONFIG_FILE
            )
            
            if not success:
                raise HTTPException(status_code=500, detail="Failed to create user")
        
        return {"message": f"User {user.username} added/updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating user: {str(e)}")


@app.get("/api/config/sync-interval")
async def get_sync_interval(token: str = Depends(verify_token)):
    """Get sync interval from config"""
    config_data = load_config_data()
    sync_interval_minutes = config_data.get('sync_interval_minutes')
    return {"sync_interval_minutes": sync_interval_minutes}


@app.post("/api/sync")
async def trigger_sync(token: str = Depends(verify_token)):
    """Trigger user sync from media servers to Seerr"""
    config_data = load_config_data()
    seerr_config = config_data.get('seerr', {})
    
    if not seerr_config.get('url') or not seerr_config.get('api_key'):
        raise HTTPException(status_code=400, detail="Seerr not configured")
    
    try:
        overseerr_client = OverseerrClient(OverseerrConfig(
            url=seerr_config['url'],
            api_key=seerr_config['api_key']
        ))
        
        media_servers = []
        for server_data in config_data.get('media_servers', []):
            server_url = server_data['url'].strip() if server_data.get('url') else ''
            media_servers.append(MediaServerConfig(
                name=server_data['name'],
                type=server_data['type'],
                url=server_url,
                token=server_data['token'],
                enabled=server_data.get('enabled', True),
                password_suffix=server_data.get('password_suffix', ''),
                request_limit=server_data.get('request_limit'),
                machine_identifier=server_data.get('machine_identifier'),
                include_owner=server_data.get('include_owner', True)
            ))
        
        if not media_servers:
            raise HTTPException(status_code=400, detail="No media servers configured")
        
        from sync_users import sync_users
        sync_users(
            overseerr_client,
            media_servers,
            remove_missing=True,
            permissions=0,
            config_file=CONFIG_FILE
        )
        
        return {"message": "Sync completed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during sync: {str(e)}")


# Serve static files for frontend
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    # Catch-all route for React Router (must be registered last)
    # This should only match GET requests for non-API paths
    # FastAPI matches more specific routes first, so /api/* routes will match before this
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React app for all non-API routes"""
        # Double-check: Don't serve for API routes or assets
        if full_path.startswith("api/") or full_path.startswith("assets/"):
            raise HTTPException(status_code=404, detail="Not found")
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "Frontend not built. Run 'npm run build' in the frontend directory."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

