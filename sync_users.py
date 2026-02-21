#!/usr/bin/env python3
"""
Overseerr/Jellyseerr User Sync Script

This script scans multiple Plex/Jellyfin/Emby servers for users and
creates local logins in Overseerr/Jellyseerr for them. It can also
remove users that no longer exist in the media servers.
"""

import requests
import json
import sys
import uuid
import xml.etree.ElementTree as ET
import time
import signal
from datetime import datetime
from typing import List, Dict, Optional, Set, Tuple
from dataclasses import dataclass
from urllib.parse import urljoin


@dataclass
class MediaServerConfig:
    """Configuration for a media server"""
    name: str
    type: str  # 'plex', 'jellyfin', or 'emby'
    url: str
    token: str
    enabled: bool = True
    password_suffix: str = ""  # Suffix to append to username for password
    request_limit: Optional[int] = None  # Request limit for users from this server (None = use global default)
    machine_identifier: Optional[str] = None  # Machine identifier for Plex servers to filter users
    include_owner: bool = True  # Include the owner/admin user from the media server


@dataclass
class OverseerrConfig:
    """Configuration for Overseerr/Jellyseerr"""
    url: str
    api_key: str


@dataclass
class MediaUser:
    """Represents a user from a media server"""
    username: str
    email: Optional[str] = None
    source_server: str = ""
    source_type: str = ""
    password_suffix: str = ""  # Password suffix from the media server config
    request_limit: Optional[int] = None  # Request limit from the media server config


class MediaServerClient:
    """Base class for media server clients"""
    
    def __init__(self, config: MediaServerConfig):
        self.config = config
        self.session = requests.Session()
        self.session.verify = True
    
    def check_health(self) -> bool:
        """Check if the media server is available and reachable"""
        raise NotImplementedError
    
    def get_users(self) -> List[MediaUser]:
        """Fetch users from the media server"""
        raise NotImplementedError


class PlexClient(MediaServerClient):
    """Client for Plex Media Server"""
    
    def check_health(self) -> bool:
        """Check if Plex server is available"""
        try:
            url = "https://plex.tv/api/users"
            headers = {
                'X-Plex-Token': self.config.token,
                'X-Plex-Client-Identifier': str(uuid.uuid4()),
                'Accept': 'application/json, application/xml'
            }
            response = self.session.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException:
            return False
    
    def get_users(self) -> List[MediaUser]:
        """Fetch users from Plex.tv API. If machine_identifier is set, uses shared_servers endpoint."""
        users = []
        
        # If machine_identifier is set, use the shared_servers endpoint for that specific server
        if self.config.machine_identifier:
            return self._get_users_from_shared_servers()
        
        # Otherwise, use the standard /api/users endpoint to get all users
        try:
            url = "https://plex.tv/api/users"
            headers = {
                'X-Plex-Token': self.config.token,
                'X-Plex-Client-Identifier': str(uuid.uuid4()),
                'Accept': 'application/json, application/xml'
            }
            
            response = self.session.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            content_type = response.headers.get('Content-Type', '').lower()
            
            if 'xml' in content_type or response.text.strip().startswith('<?xml') or response.text.strip().startswith('<'):
                root = ET.fromstring(response.content)
                media_container = root if root.tag == 'MediaContainer' else root.find('MediaContainer')
                if media_container is not None:
                    user_elements = media_container.findall('User')
                    for user_elem in user_elements:
                        username = user_elem.get('username', '')
                        email = user_elem.get('email', '')
                        users.append(MediaUser(
                            username=username,
                            email=email if email else None,
                            source_server=self.config.name,
                            source_type='plex',
                            password_suffix=self.config.password_suffix,
                            request_limit=self.config.request_limit
                        ))
            else:
                data = response.json()
                
                if isinstance(data, dict):
                    if 'MediaContainer' in data and 'User' in data['MediaContainer']:
                        user_list = data['MediaContainer']['User']
                        if not isinstance(user_list, list):
                            user_list = [user_list]
                        for user_data in user_list:
                            username = user_data.get('username', '')
                            email = user_data.get('email', '')
                            users.append(MediaUser(
                                username=username,
                                email=email if email else None,
                                source_server=self.config.name,
                                source_type='plex',
                                password_suffix=self.config.password_suffix,
                                request_limit=self.config.request_limit
                            ))
                    elif 'users' in data:
                        for user_data in data['users']:
                            username = user_data.get('username', '')
                            email = user_data.get('email', '')
                            users.append(MediaUser(
                                username=username,
                                email=email if email else None,
                                source_server=self.config.name,
                                source_type='plex',
                                password_suffix=self.config.password_suffix,
                                request_limit=self.config.request_limit
                            ))
                elif isinstance(data, list):
                    for user_data in data:
                        username = user_data.get('username', '')
                        email = user_data.get('email', '')
                        users.append(MediaUser(
                            username=username,
                            email=email if email else None,
                            source_server=self.config.name,
                            source_type='plex',
                            password_suffix=self.config.password_suffix,
                            request_limit=self.config.request_limit
                        ))
        except requests.exceptions.RequestException as e:
            error_msg = f"Error fetching Plex users from {self.config.name}: {e}"
            if hasattr(e, 'response') and e.response is not None:
                error_msg += f" (Status: {e.response.status_code})"
            raise RuntimeError(error_msg) from e
        except (json.JSONDecodeError, ValueError) as e:
            error_msg = f"Error parsing JSON response from {self.config.name}: {e}"
            if 'response' in locals():
                error_msg += f" (Response: {response.text[:200]})"
            raise RuntimeError(error_msg) from e
        except ET.ParseError as e:
            error_msg = f"Error parsing XML response from {self.config.name}: {e}"
            if 'response' in locals():
                error_msg += f" (Response: {response.text[:200]})"
            raise RuntimeError(error_msg) from e
        
        return users
    
    def _get_plex_account_owner(self) -> Optional[MediaUser]:
        """Get the Plex account owner from /api/v2/user endpoint"""
        try:
            url = "https://plex.tv/api/v2/user"
            headers = {
                'X-Plex-Token': self.config.token,
                'X-Plex-Client-Identifier': str(uuid.uuid4()),
                'Accept': 'application/json'
            }
            
            response = self.session.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if isinstance(data, dict):
                username = data.get('username', '')
                email = data.get('email', '')
                if username:
                    return MediaUser(
                        username=username,
                        email=email if email else None,
                        source_server=self.config.name,
                        source_type='plex',
                        password_suffix=self.config.password_suffix,
                        request_limit=self.config.request_limit
                    )
        except requests.exceptions.RequestException:
            pass
        except (json.JSONDecodeError, ValueError):
            pass
        
        return None
    
    def _get_users_from_shared_servers(self) -> List[MediaUser]:
        """Get users shared with a specific server using the shared_servers endpoint"""
        users = []
        
        # If include_owner is True, fetch the account owner first
        if self.config.include_owner:
            owner = self._get_plex_account_owner()
            if owner:
                users.append(owner)
        
        try:
            url = f"https://plex.tv/api/servers/{self.config.machine_identifier}/shared_servers"
            headers = {
                'X-Plex-Token': self.config.token,
                'X-Plex-Client-Identifier': str(uuid.uuid4()),
                'Accept': 'application/json, application/xml'
            }
            
            response = self.session.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            content_type = response.headers.get('Content-Type', '').lower()
            
            if 'xml' in content_type or response.text.strip().startswith('<?xml') or response.text.strip().startswith('<'):
                root = ET.fromstring(response.content)
                media_container = root if root.tag == 'MediaContainer' else root.find('MediaContainer')
                if media_container is not None:
                    shared_server_elements = media_container.findall('SharedServer')
                    for shared_server_elem in shared_server_elements:
                        # Get user information from the shared server element
                        username = shared_server_elem.get('username', '')
                        email = shared_server_elem.get('email', '')
                        if username:
                            users.append(MediaUser(
                                username=username,
                                email=email if email else None,
                                source_server=self.config.name,
                                source_type='plex',
                                password_suffix=self.config.password_suffix,
                                request_limit=self.config.request_limit
                            ))
            else:
                data = response.json()
                
                if isinstance(data, dict):
                    if 'MediaContainer' in data and 'SharedServer' in data['MediaContainer']:
                        shared_server_list = data['MediaContainer']['SharedServer']
                        if not isinstance(shared_server_list, list):
                            shared_server_list = [shared_server_list]
                        for shared_server_data in shared_server_list:
                            username = shared_server_data.get('username', '')
                            email = shared_server_data.get('email', '')
                            if username:
                                users.append(MediaUser(
                                    username=username,
                                    email=email if email else None,
                                    source_server=self.config.name,
                                    source_type='plex',
                                    password_suffix=self.config.password_suffix,
                                    request_limit=self.config.request_limit
                                ))
                    elif 'SharedServer' in data:
                        shared_server_list = data['SharedServer']
                        if not isinstance(shared_server_list, list):
                            shared_server_list = [shared_server_list]
                        for shared_server_data in shared_server_list:
                            username = shared_server_data.get('username', '')
                            email = shared_server_data.get('email', '')
                            if username:
                                users.append(MediaUser(
                                    username=username,
                                    email=email if email else None,
                                    source_server=self.config.name,
                                    source_type='plex',
                                    password_suffix=self.config.password_suffix,
                                    request_limit=self.config.request_limit
                                ))
                elif isinstance(data, list):
                    for shared_server_data in data:
                        username = shared_server_data.get('username', '')
                        email = shared_server_data.get('email', '')
                        if username:
                            users.append(MediaUser(
                                username=username,
                                email=email if email else None,
                                source_server=self.config.name,
                                source_type='plex',
                                password_suffix=self.config.password_suffix,
                                request_limit=self.config.request_limit
                            ))
        except requests.exceptions.RequestException as e:
            error_msg = f"Error fetching Plex shared users from server {self.config.name}: {e}"
            if hasattr(e, 'response') and e.response is not None:
                error_msg += f" (Status: {e.response.status_code})"
            raise RuntimeError(error_msg) from e
        except (json.JSONDecodeError, ValueError) as e:
            error_msg = f"Error parsing JSON response from {self.config.name}: {e}"
            if 'response' in locals():
                error_msg += f" (Response: {response.text[:200]})"
            raise RuntimeError(error_msg) from e
        except ET.ParseError as e:
            error_msg = f"Error parsing XML response from {self.config.name}: {e}"
            if 'response' in locals():
                error_msg += f" (Response: {response.text[:200]})"
            raise RuntimeError(error_msg) from e
        
        return users


class JellyfinClient(MediaServerClient):
    """Client for Jellyfin Media Server"""
    
    def check_health(self) -> bool:
        """Check if Jellyfin server is available"""
        try:
            url = urljoin(self.config.url.rstrip('/') + '/', '/System/Info')
            headers = {
                'X-Emby-Authorization': f'MediaBrowser Client="OverseerrSync", Device="Script", DeviceId="sync-script", Token="{self.config.token}"',
                'Accept': 'application/json'
            }
            response = self.session.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException:
            return False
    
    def get_users(self) -> List[MediaUser]:
        """Fetch users from Jellyfin server"""
        users = []
        try:
            url = urljoin(self.config.url.rstrip('/') + '/', '/Users')
            headers = {
                'X-Emby-Authorization': f'MediaBrowser Client="OverseerrSync", Device="Script", DeviceId="sync-script", Token="{self.config.token}"',
                'Accept': 'application/json'
            }
            
            response = self.session.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            for user_data in data:
                username = user_data.get('Name', '')
                email = None
                if 'Configuration' in user_data and 'Email' in user_data['Configuration']:
                    email = user_data['Configuration'].get('Email')
                
                users.append(MediaUser(
                    username=username,
                    email=email if email else None,
                    source_server=self.config.name,
                    source_type='jellyfin',
                    password_suffix=self.config.password_suffix,
                    request_limit=self.config.request_limit
                ))
        except requests.exceptions.RequestException as e:
            error_msg = f"Error fetching Jellyfin users from {self.config.name}: {e}"
            if hasattr(e, 'response') and e.response is not None:
                error_msg += f" (Status: {e.response.status_code})"
            raise RuntimeError(error_msg) from e
        
        return users


class EmbyClient(MediaServerClient):
    """Client for Emby Media Server"""
    
    def check_health(self) -> bool:
        """Check if Emby server is available"""
        try:
            url = urljoin(self.config.url.rstrip('/') + '/', '/System/Info')
            params = {
                'api_key': self.config.token
            }
            response = self.session.get(url, params=params, timeout=5)
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException:
            return False
    
    def get_users(self) -> List[MediaUser]:
        """Fetch users from Emby server using /Users/Query endpoint"""
        users = []
        try:
            url = urljoin(self.config.url.rstrip('/') + '/', '/Users/Query')
            params = {
                'api_key': self.config.token,
                'IsDisabled': 'false'
            }
            # Only filter hidden users if include_owner is False
            if not self.config.include_owner:
                params['IsHidden'] = 'false'
            
            response = self.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            # QueryResult_UserDto contains Items array
            for user_data in data.get('Items', []):
                username = user_data.get('Name', '')
                email = None
                if 'Configuration' in user_data and 'Email' in user_data['Configuration']:
                    email = user_data['Configuration'].get('Email')
                
                users.append(MediaUser(
                    username=username,
                    email=email if email else None,
                    source_server=self.config.name,
                    source_type='emby',
                    password_suffix=self.config.password_suffix,
                    request_limit=self.config.request_limit
                ))
        except requests.exceptions.RequestException as e:
            error_msg = f"Error fetching Emby users from {self.config.name}: {e}"
            if hasattr(e, 'response') and e.response is not None:
                error_msg += f" (Status: {e.response.status_code})"
            raise RuntimeError(error_msg) from e
        
        return users


class OverseerrClient:
    """Client for Overseerr/Jellyseerr API"""
    
    def __init__(self, config: OverseerrConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            'X-Api-Key': config.api_key,
            'Content-Type': 'application/json'
        })
        self.base_url = urljoin(config.url.rstrip('/') + '/', '/api/v1')
    
    def get_users(self) -> List[Dict]:
        """Fetch all users from Overseerr"""
        users = []
        try:
            url = f"{self.base_url}/user"
            skip = 0
            take = 20
            
            while True:
                params = {'skip': skip, 'take': take}
                response = self.session.get(url, params=params, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                page_users = data.get('results', [])
                users.extend(page_users)
                
                # If we got fewer results than requested, we're on the last page
                if len(page_users) < take:
                    break
                
                page_info = data.get('pageInfo', {})
                current_page = page_info.get('page', 1)
                total_pages = page_info.get('pages', 1)
                
                # Check if there are more pages
                if current_page >= total_pages:
                    break
                
                skip += take
        except requests.exceptions.RequestException as e:
            print(f"Error fetching Overseerr users: {e}")
            sys.exit(1)
        
        return users
    
    def get_stats(self) -> Optional[Dict]:
        """Fetch stats from Overseerr /settings/about endpoint"""
        try:
            url = f"{self.base_url}/settings/about"
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching Overseerr stats: {e}")
            return None
    
    def get_missing_requests_count(self) -> Optional[int]:
        """Get count of missing/unavailable requests (status 7)"""
        try:
            url = f"{self.base_url}/request"
            all_requests = []
            skip = 0
            take = 20
            
            while True:
                params = {'skip': skip, 'take': take}
                response = self.session.get(url, params=params, timeout=10)
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
            
            # Count requests with status 7 (Unavailable)
            missing_count = sum(1 for req in all_requests if req.get('status') == 7)
            return missing_count
        except requests.exceptions.RequestException as e:
            print(f"Error fetching missing requests count: {e}")
            return None
    
    def create_user(self, username: str, password: Optional[str] = None, permissions: int = 0) -> Optional[Dict]:
        """Create a new user in Overseerr"""
        try:
            url = f"{self.base_url}/user"
            payload = {
                'username': username,
                'permissions': permissions
            }

            # Include password in creation payload to avoid needing email configured
            if password:
                payload['password'] = password

            response = self.session.post(url, json=payload, timeout=10)

            if response.status_code == 201:
                user_data = response.json()
                return user_data
            elif response.status_code == 409:
                print(f"User {username} already exists")
                return None
            else:
                try:
                    error_detail = response.json()
                    error_msg = error_detail.get('message', str(error_detail))
                    print(f"Error creating user {username}: {response.status_code} - {error_msg}")
                except:
                    print(f"Error creating user {username}: {response.status_code} - {response.text[:200]}")
                response.raise_for_status()
        except requests.exceptions.RequestException as e:
            print(f"Error creating user {username}: {e}")
            return None
    
    def set_user_password(self, user_id: int, password: str) -> bool:
        """Set password for a user"""
        try:
            url = f"{self.base_url}/user/{user_id}/settings/password"
            payload = {
                'currentPassword': '',
                'newPassword': password,
                'confirmPassword': password
            }
            response = self.session.post(url, json=payload, timeout=10)
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException as e:
            print(f"Error setting password for user ID {user_id}: {e}")
            return False
    
    def set_user_request_limit(self, user_id: int, movie_limit: Optional[int] = None, tv_limit: Optional[int] = None) -> bool:
        """Set request limits for a user"""
        try:
            # Try the quota settings endpoint
            url = f"{self.base_url}/user/{user_id}/settings/quota"
            payload = {}
            if movie_limit is not None:
                payload['movie'] = {'limit': movie_limit}
            if tv_limit is not None:
                payload['tv'] = {'limit': tv_limit}
            
            if not payload:
                return True  # Nothing to set
            
            response = self.session.post(url, json=payload, timeout=10)
            if response.status_code == 404:
                # Endpoint might not exist, try updating user directly
                url = f"{self.base_url}/user/{user_id}"
                response = self.session.put(url, json=payload, timeout=10)
            
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException as e:
            print(f"Error setting request limit for user ID {user_id}: {e}")
            return False
    
    def delete_user(self, user_id: int) -> bool:
        """Delete a user from Overseerr"""
        try:
            url = f"{self.base_url}/user/{user_id}"
            response = self.session.delete(url, timeout=10)
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException as e:
            print(f"Error deleting user ID {user_id}: {e}")
            return False


def create_media_server_client(config: MediaServerConfig) -> MediaServerClient:
    """Factory function to create appropriate media server client"""
    if config.type.lower() == 'plex':
        return PlexClient(config)
    elif config.type.lower() == 'jellyfin':
        return JellyfinClient(config)
    elif config.type.lower() == 'emby':
        return EmbyClient(config)
    else:
        raise ValueError(f"Unsupported media server type: {config.type}")


def load_config(config_file: str = 'config.json') -> Tuple[OverseerrConfig, List[MediaServerConfig], Optional[int]]:
    """Load configuration from JSON file. Returns (overseerr_config, media_servers, sync_interval_minutes)"""
    try:
        with open(config_file, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Config file {config_file} not found. Creating example config...")
        create_example_config(config_file)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing config file: {e}")
        sys.exit(1)
    
    seerr_config = data.get('seerr', {})
    
    if not seerr_config.get('url') or not seerr_config.get('api_key'):
        print("Error: Seerr configuration is missing or incomplete.")
        print("Please ensure 'seerr' section has 'url' and 'api_key' fields.")
        sys.exit(1)
    
    overseerr_config = OverseerrConfig(
        url=seerr_config['url'],
        api_key=seerr_config['api_key']
    )
    
    media_servers = []
    for server_data in data.get('media_servers', []):
        # Strip whitespace from URL to prevent connection issues
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
    
    sync_interval = data.get('sync_interval_minutes')
    
    return overseerr_config, media_servers, sync_interval




def add_manual_user(overseerr_client: OverseerrClient, username: str, password: Optional[str] = None,
                    permissions: int = 0, request_limit: Optional[int] = None,
                    blocked: bool = False, immune: bool = False,
                    config_file: str = 'config.json') -> bool:
    """Add a user manually to Overseerr and update user settings in config"""
    
    username_lower = username.lower()
    
    # Load existing config
    try:
        with open(config_file, 'r') as f:
            config_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Config file {config_file} not found")
        return False
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse config file: {e}")
        return False
    
    # Check if user already exists in Overseerr
    overseerr_users = overseerr_client.get_users()
    overseerr_usernames = {user['username'].lower(): user for user in overseerr_users if user.get('username')}
    
    user_exists = username_lower in overseerr_usernames
    
    if user_exists:
        print(f"User {username} already exists in Overseerr (ID: {overseerr_usernames[username_lower]['id']})")
        user_id = overseerr_usernames[username_lower]['id']
    else:
        # Create user in Overseerr
        if not password:
            print(f"Error: Password required to create new user {username}")
            return False
        
        print(f"Creating user {username} in Overseerr...")
        result = overseerr_client.create_user(
            username=username,
            password=password,
            permissions=permissions
        )
        
        if not result:
            print(f"Error: Failed to create user {username}")
            return False
        
        user_id = result.get('id')
        print(f"Successfully created user {username} (ID: {user_id})")
        
        # Set password if provided (already set during creation, but ensure it's set)
        if password and user_id:
            overseerr_client.set_user_password(user_id, password)
    
    # Set request limit if provided
    if request_limit is not None and user_id:
        print(f"Setting request limit: {request_limit}")
        overseerr_client.set_user_request_limit(
            user_id,
            movie_limit=request_limit,
            tv_limit=request_limit
        )
    
    # Update user settings in config
    if 'user_settings' not in config_data:
        config_data['user_settings'] = {}
    
    if username_lower not in config_data['user_settings']:
        config_data['user_settings'][username_lower] = {}
    
    # Update settings
    if blocked is not None:
        config_data['user_settings'][username_lower]['blocked'] = blocked
    if immune is not None:
        config_data['user_settings'][username_lower]['immune'] = immune
    
    # Save updated config
    try:
        with open(config_file, 'w') as f:
            json.dump(config_data, f, indent=2)
        print(f"Updated user settings in config file")
        if blocked:
            print(f"  - User {username} is now blocked from sync")
        if immune:
            print(f"  - User {username} is now immune from deletion")
    except Exception as e:
        print(f"Warning: Failed to update config file: {e}")
        return False
    
    return True


def create_example_config(config_file: str):
    """Create an example configuration file"""
    example_config = {
        "seerr": {
            "url": "http://localhost:5055",
            "api_key": "your-api-key-here"
        },
        "media_servers": [
            {
                "name": "Plex Server 1",
                "type": "plex",
                "url": "http://localhost:32400",
                "token": "your-plex-token-here",
                "enabled": True,
                "password_suffix": "2025",
                "request_limit": 10,
                "include_owner": True
            },
            {
                "name": "Jellyfin Server 1",
                "type": "jellyfin",
                "url": "http://localhost:8096",
                "token": "your-jellyfin-token-here",
                "enabled": True,
                "password_suffix": "2025",
                "request_limit": None,
                "include_owner": True
            },
            {
                "name": "Emby Server 1",
                "type": "emby",
                "url": "http://localhost:8096",
                "token": "your-emby-api-key-here",
                "enabled": True,
                "password_suffix": "2025",
                "request_limit": None,
                "include_owner": True
            }
        ],
        "sync_interval_minutes": 60
    }
    
    with open(config_file, 'w') as f:
        json.dump(example_config, f, indent=2)
    
    print(f"Example config created at {config_file}")
    print("Please edit the file with your actual server details.")


def sync_users(overseerr_client: OverseerrClient, media_servers: List[MediaServerConfig],
               remove_missing: bool = False, permissions: int = 0, config_file: str = 'config.json'):
    """Sync users from media servers to Overseerr"""
    
    # Load user settings from config
    user_settings = {}
    try:
        with open(config_file, 'r') as f:
            config_data = json.load(f)
            user_settings = config_data.get('user_settings', {})
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    
    print("Checking media server availability...")
    enabled_servers = [s for s in media_servers if s.enabled]

    if not enabled_servers:
        print("Error: No enabled media servers configured. Aborting sync.")
        return

    print(f"Found {len(enabled_servers)} enabled media server(s) to check")

    available_servers = []
    unavailable_server_names = set()
    for server_config in enabled_servers:
        try:
            client = create_media_server_client(server_config)
            if client.check_health():
                print(f"✓ {server_config.name} ({server_config.type}) is available")
                available_servers.append((server_config, client))
            else:
                print(f"✗ {server_config.name} ({server_config.type}) is not reachable")
                unavailable_server_names.add(server_config.name)
        except Exception as e:
            print(f"✗ {server_config.name} ({server_config.type}) health check failed: {e}")
            unavailable_server_names.add(server_config.name)

    if not available_servers:
        print("\nError: No media servers are available. Aborting sync.")
        return

    if unavailable_server_names:
        print(f"\nWarning: {len(unavailable_server_names)} server(s) unavailable: {', '.join(unavailable_server_names)}")
        print("Users from unavailable servers will be protected from removal.")

    print(f"\n{len(available_servers)} of {len(enabled_servers)} enabled media server(s) available. Proceeding with sync...")
    all_media_users: Dict[str, MediaUser] = {}
    
    for server_config, client in available_servers:
        print(f"Scanning {server_config.name} ({server_config.type})...")
        try:
            users = client.get_users()
            print(f"  Found {len(users)} users from {server_config.name}")
        except Exception as e:
            print(f"  Error fetching users from {server_config.name}: {e}")
            print(f"  Aborting sync due to error fetching users from {server_config.name}")
            return
        
        for user in users:
            key = user.username.lower()
            if key not in all_media_users:
                all_media_users[key] = user
            else:
                if not all_media_users[key].email and user.email:
                    all_media_users[key].email = user.email
                # Keep the first password_suffix encountered
                if not all_media_users[key].password_suffix and user.password_suffix:
                    all_media_users[key].password_suffix = user.password_suffix
                # Keep the first request_limit encountered
                if all_media_users[key].request_limit is None and user.request_limit is not None:
                    all_media_users[key].request_limit = user.request_limit
                all_media_users[key].source_server += f", {user.source_server}"
    
    print(f"\nFound {len(all_media_users)} unique users across all media servers")
    
    print("\nFetching existing Overseerr users...")
    overseerr_users = overseerr_client.get_users()
    overseerr_usernames = {user['username'].lower(): user for user in overseerr_users if user.get('username')}
    
    print(f"Found {len(overseerr_users)} existing users in Overseerr")
    
    print("\nCreating/updating users...")
    created_count = 0
    skipped_count = 0
    blocked_count = 0
    user_settings_changed = False

    for media_user in all_media_users.values():
        username_lower = media_user.username.lower()
        user_setting = user_settings.get(username_lower, {})

        # Track source servers for this user
        source_servers = set(s.strip() for s in media_user.source_server.split(','))
        existing_sources = set(user_setting.get('source_servers', []))
        if source_servers != existing_sources:
            user_setting['source_servers'] = list(source_servers)
            user_settings[username_lower] = user_setting
            user_settings_changed = True

        # Skip blocked users
        if user_setting.get('blocked', False):
            print(f"User {media_user.username} is blocked, skipping sync")
            blocked_count += 1
            skipped_count += 1
            continue

        if username_lower not in overseerr_usernames:
            username = media_user.username
            password = media_user.username + media_user.password_suffix

            print(f"Creating user: {username} (from {media_user.source_server})")
            if media_user.password_suffix:
                print(f"  Password: {media_user.username} + '{media_user.password_suffix}' = '{password}'")

            result = overseerr_client.create_user(
                username=username,
                password=password,
                permissions=permissions
            )

            if result:
                created_count += 1
                # Set request limit if configured
                if media_user.request_limit is not None and 'id' in result:
                    print(f"  Setting request limit: {media_user.request_limit}")
                    overseerr_client.set_user_request_limit(
                        result['id'],
                        movie_limit=media_user.request_limit,
                        tv_limit=media_user.request_limit
                    )
            else:
                skipped_count += 1
        else:
            print(f"User {media_user.username} already exists, skipping")
            skipped_count += 1
    
    print(f"\nCreated {created_count} new users")
    print(f"Skipped {skipped_count} existing users")
    if blocked_count > 0:
        print(f"Blocked {blocked_count} users from sync")
    
    if remove_missing:
        print("\nRemoving users not in media servers...")
        removed_count = 0
        skipped_immune_count = 0
        skipped_server_down_count = 0
        # Create a set of all usernames from enabled media servers
        media_usernames = {u.username.lower() for u in all_media_users.values()}

        if not media_usernames:
            print("  Warning: No users found in any enabled media server. All Overseerr users will be removed.")
        else:
            print(f"  Valid usernames from enabled media servers: {len(media_usernames)}")
            print(f"  Users in Overseerr: {len(overseerr_users)}")

        # Compare each Overseerr user against media server usernames
        blocked_removed_count = 0
        for overseerr_user in overseerr_users:
            if not overseerr_user.get('username'):
                continue

            overseerr_username_lower = overseerr_user['username'].lower()
            user_setting = user_settings.get(overseerr_username_lower, {})

            # Skip immune users
            if user_setting.get('immune', False):
                print(f"User {overseerr_user['username']} is immune from deletion, skipping")
                skipped_immune_count += 1
                continue

            # Remove blocked users from Overseerr (they'll still be visible in UI via config)
            if user_setting.get('blocked', False):
                user_id = overseerr_user['id']
                username = overseerr_user['username']
                print(f"Removing blocked user: {username} (ID: {user_id}) from Overseerr")
                if overseerr_client.delete_user(user_id):
                    blocked_removed_count += 1
                continue

            # Remove if Overseerr username doesn't match any media server username
            if overseerr_username_lower not in media_usernames:
                user_id = overseerr_user['id']
                username = overseerr_user['username']

                # Check if user's source servers include any unavailable server
                user_source_servers = set(user_setting.get('source_servers', []))
                if user_source_servers & unavailable_server_names:
                    print(f"Skipping removal of {username} - source server(s) unavailable: {user_source_servers & unavailable_server_names}")
                    skipped_server_down_count += 1
                    continue

                print(f"Removing user: {username} (ID: {user_id}) - not found in any enabled media server")
                if overseerr_client.delete_user(user_id):
                    removed_count += 1
                    # Clean up source_servers from user_settings for removed users
                    if overseerr_username_lower in user_settings:
                        if 'source_servers' in user_settings[overseerr_username_lower]:
                            del user_settings[overseerr_username_lower]['source_servers']
                            if not user_settings[overseerr_username_lower]:
                                del user_settings[overseerr_username_lower]
                            user_settings_changed = True

        print(f"Removed {removed_count} users")
        if blocked_removed_count > 0:
            print(f"Removed {blocked_removed_count} blocked users from Overseerr")
        if skipped_immune_count > 0:
            print(f"Skipped {skipped_immune_count} immune users from deletion")
        if skipped_server_down_count > 0:
            print(f"Skipped {skipped_server_down_count} users due to their source server being unavailable")

    # Save updated user_settings to config file
    if user_settings_changed:
        try:
            with open(config_file, 'r') as f:
                config_data = json.load(f)
            config_data['user_settings'] = user_settings
            with open(config_file, 'w') as f:
                json.dump(config_data, f, indent=2)
            print("\nUpdated user source server tracking in config")
        except Exception as e:
            print(f"\nWarning: Failed to save user_settings to config: {e}")


def main():
    """Main entry point"""
    import argparse
    import getpass
    
    parser = argparse.ArgumentParser(
        description='Sync users from multiple media servers to Overseerr/Jellyseerr'
    )
    parser.add_argument(
        '--config',
        default='config.json',
        help='Path to configuration file (default: config.json)'
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Sync command
    sync_parser = subparsers.add_parser('sync', help='Sync users from media servers')
    sync_parser.add_argument(
        '--keep-missing',
        action='store_true',
        help='Keep users in Overseerr that no longer exist in media servers (default: remove them)'
    )
    sync_parser.add_argument(
        '--permissions',
        type=int,
        default=0,
        help='Default permissions for new users (default: 0)'
    )
    sync_parser.add_argument(
        '--interval',
        type=int,
        default=None,
        help='Sync interval in minutes (overrides config file setting). Enables automatic sync mode.'
    )
    sync_parser.add_argument(
        '--daemon',
        action='store_true',
        help='Run in daemon mode with automatic sync (uses interval from config or --interval)'
    )
    
    # Add user command
    add_user_parser = subparsers.add_parser('add-user', help='Manually add a user to Overseerr and configure settings')
    add_user_parser.add_argument(
        'username',
        help='Username to add'
    )
    add_user_parser.add_argument(
        '--password',
        help='Password for the user (will prompt if not provided and user does not exist)'
    )
    add_user_parser.add_argument(
        '--permissions',
        type=int,
        default=0,
        help='Permissions for the user (default: 0)'
    )
    add_user_parser.add_argument(
        '--request-limit',
        type=int,
        default=None,
        help='Request limit for the user'
    )
    add_user_parser.add_argument(
        '--blocked',
        action='store_true',
        help='Mark user as blocked (will not be synced from media servers)'
    )
    add_user_parser.add_argument(
        '--immune',
        action='store_true',
        help='Mark user as immune (will not be deleted during sync)'
    )
    
    args = parser.parse_args()
    
    # Default to sync command if no command specified (backward compatibility)
    if args.command is None:
        args.command = 'sync'
    
    print("Overseerr/Jellyseerr User Sync Script")
    print("=" * 50)
    
    overseerr_config, media_servers, config_interval = load_config(args.config)
    overseerr_client = OverseerrClient(overseerr_config)
    
    if args.command == 'add-user':
        import getpass
        
        username = args.username
        password = args.password
        
        # If user doesn't exist and password not provided, prompt for it
        if not password:
            overseerr_users = overseerr_client.get_users()
            overseerr_usernames = {user['username'].lower(): user for user in overseerr_users if user.get('username')}
            if username.lower() not in overseerr_usernames:
                password = getpass.getpass(f"Enter password for new user {username}: ")
                if not password:
                    print("Error: Password required for new users")
                    sys.exit(1)
        
        success = add_manual_user(
            overseerr_client,
            username=username,
            password=password,
            permissions=args.permissions,
            request_limit=args.request_limit,
            blocked=args.blocked,
            immune=args.immune,
            config_file=args.config
        )
        
        if success:
            print(f"\nSuccessfully added/updated user {username}")
            sys.exit(0)
        else:
            print(f"\nFailed to add/update user {username}")
            sys.exit(1)
    
    elif args.command == 'sync':
        if not media_servers:
            print("No media servers configured!")
            sys.exit(1)
        
        sync_interval_minutes = args.interval if args.interval is not None else config_interval
        run_daemon = args.daemon or sync_interval_minutes is not None
        
        if run_daemon:
            if sync_interval_minutes is None:
                print("Error: Sync interval not specified. Use --interval or set sync_interval_minutes in config.")
                sys.exit(1)
            
            if sync_interval_minutes <= 0:
                print("Error: Sync interval must be greater than 0.")
                sys.exit(1)
            
            sync_interval_seconds = sync_interval_minutes * 60
            print(f"Running in daemon mode with {sync_interval_minutes} minute interval")
            print(f"Press Ctrl+C to stop\n")
            
            running = True
            
            def signal_handler(sig, frame):
                nonlocal running
                print("\n\nShutdown signal received. Finishing current sync...")
                running = False
            
            signal.signal(signal.SIGINT, signal_handler)
            signal.signal(signal.SIGTERM, signal_handler)
            
            sync_count = 0
            while running:
                sync_count += 1
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                print(f"\n[{timestamp}] Starting sync #{sync_count}")
                print("-" * 50)

                try:
                    # Reload config each sync to pick up changes
                    _, current_media_servers, _ = load_config(args.config)

                    sync_users(
                        overseerr_client,
                        current_media_servers,
                        remove_missing=not args.keep_missing,
                        permissions=args.permissions,
                        config_file=args.config
                    )
                    
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    print(f"\n[{timestamp}] Sync #{sync_count} completed successfully")
                except Exception as e:
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    print(f"\n[{timestamp}] Error during sync #{sync_count}: {e}")
                
                if running:
                    next_sync_time = datetime.now().timestamp() + sync_interval_seconds
                    next_sync_str = datetime.fromtimestamp(next_sync_time).strftime("%Y-%m-%d %H:%M:%S")
                    print(f"\nNext sync scheduled for: {next_sync_str}")
                    print(f"Waiting {sync_interval_minutes} minutes...")
                    
                    elapsed = 0
                    while running and elapsed < sync_interval_seconds:
                        time.sleep(min(1, sync_interval_seconds - elapsed))
                        elapsed += 1
        else:
            sync_users(
                overseerr_client,
                media_servers,
                remove_missing=not args.keep_missing,
                permissions=args.permissions,
                config_file=args.config
            )
        print("\nSync completed!")


if __name__ == '__main__':
    main()

