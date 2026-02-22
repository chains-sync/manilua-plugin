import os
import json
import urllib.request
import ssl
from typing import Dict, Any, List
import PluginUtils
from steam_utils import get_stplug_in_path

logger = PluginUtils.Logger()

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

class maniluaManager:
    def __init__(self, backend_path: str):
        self.backend_path = backend_path

    def _fetch_steamcmd_info(self, appid: int) -> Dict[str, Any]:
        try:
            req = urllib.request.Request(
                f"https://api.steamcmd.net/v1/info/{appid}",
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            )
            with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
                data = json.loads(response.read().decode('utf-8'))
                return data.get('data', {}).get(str(appid), {})
        except Exception as e:
            logger.error(f"Failed to fetch from SteamCMD: {e}")
            return {}

    def _fetch_manifesthub_keys(self) -> Dict[str, str]:
        try:
            req = urllib.request.Request(
                "https://raw.githubusercontent.com/SteamAutoCracks/ManifestHub/refs/heads/main/depotkeys.json",
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            )
            with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
                keys = json.loads(response.read().decode('utf-8'))
                return keys
        except Exception as e:
            logger.error(f"Failed to fetch keys from ManifestHub: {e}")
            return {}

    def fetch_depots_with_keys(self, appid: int) -> Dict[str, Any]:
        try:
            appid = int(appid)
        except (ValueError, TypeError):
            return {'success': False, 'error': 'Invalid appid'}

        app_info = self._fetch_steamcmd_info(appid)
        keys_data = self._fetch_manifesthub_keys()

        if not app_info or not app_info.get('depots'):
            return {'success': False, 'error': 'Failed to fetch depot info or top-level app has no depots.'}

        depots_data = app_info.get('depots', {})

        # Build list of depots
        parsed_depots = []
        for depot_id, info in depots_data.items():
            if not isinstance(info, dict) or not depot_id.isdigit():
                continue

            # Check if this depot is a game depot or DLC etc (some are just metadata)
            config = info.get('config', {})
            manifests = info.get('manifests', {})
            
            # Extract size from public manifest if available
            size = None
            if 'public' in manifests and isinstance(manifests['public'], dict):
                size = manifests['public'].get('size')
            
            # Find key
            has_key = str(depot_id) in keys_data

            parsed_depots.append({
                'id': depot_id,
                'name': info.get('name', 'Unknown'),
                'config': config,
                'size': size,
                'has_key': has_key
            })

        # Parse DLCs
        extended_data = app_info.get('extended', {})
        dlc_str = extended_data.get('listofdlc', '')
        parsed_dlcs = []
        if dlc_str:
            dlc_ids = [did.strip() for did in dlc_str.split(',') if did.strip().isdigit()]
            for did in dlc_ids:
                parsed_dlcs.append({
                    'id': did,
                    'has_key': str(did) in keys_data
                })

        return {
            'success': True,
            'depots': parsed_depots,
            'dlcs': parsed_dlcs
        }

    def install_depots(self, appid: int, selected_depots: List[str], selected_dlcs: List[str]) -> Dict[str, Any]:
        try:
            appid = int(appid)
        except (ValueError, TypeError):
            return {'success': False, 'error': 'Invalid data passed'}

        keys_data = self._fetch_manifesthub_keys()
        
        # Gather Depot keys
        missing_depot_keys = []
        depot_keys = {}
        if selected_depots:
            for dep in selected_depots:
                key = keys_data.get(str(dep))
                if key:
                    depot_keys[str(dep)] = key
                else:
                    missing_depot_keys.append(str(dep))
            if missing_depot_keys:
                logger.warn(f"Warning: Missing keys for depots: {missing_depot_keys}")

        # Gather DLC keys
        dlc_keys = {}
        if selected_dlcs:
            for dlc in selected_dlcs:
                key = keys_data.get(str(dlc))
                if key:
                    dlc_keys[str(dlc)] = key

        try:
            stplug_path = get_stplug_in_path()
            lua_file = os.path.join(stplug_path, f'{appid}.lua')
            
            with open(lua_file, 'w', encoding='utf-8') as f:
                f.write(f"addappid({appid})\n")
                
                # Write depots
                for dep_id, key in depot_keys.items():
                    f.write(f'addappid({dep_id},0,"{key}")\n')
                
                # Write DLCs
                if selected_dlcs:
                    for dlc_id in selected_dlcs:
                        key = dlc_keys.get(str(dlc_id))
                        if key:
                            f.write(f'addappid({dlc_id},0,"{key}")\n')
                        else:
                            f.write(f'addappid({dlc_id})\n')
                    
            logger.log(f"Successfully generated {lua_file} with {len(depot_keys)} depots and {len(selected_dlcs)} DLCs.")
            return {'success': True, 'message': f'Installed config for {len(depot_keys)} depots and {len(selected_dlcs)} DLCs.'}
        except Exception as e:
            logger.error(f"Failed to write lua file: {e}")
            return {'success': False, 'error': str(e)}

    def remove_via_lua(self, appid: int) -> Dict[str, Any]:
        try:
            appid = int(appid)
        except (ValueError, TypeError):
            return {'success': False, 'error': 'Invalid appid'}

        try:
            stplug_path = get_stplug_in_path()
            removed_files = []

            lua_file = os.path.join(stplug_path, f'{appid}.lua')
            if os.path.exists(lua_file):
                os.remove(lua_file)
                removed_files.append(f'{appid}.lua')
                logger.log(f"Removed {lua_file}")

            disabled_file = os.path.join(stplug_path, f'{appid}.lua.disabled')
            if os.path.exists(disabled_file):
                os.remove(disabled_file)
                removed_files.append(f'{appid}.lua.disabled')
                logger.log(f"Removed {disabled_file}")

            for filename in os.listdir(stplug_path):
                if filename.startswith(f'{appid}_') and filename.endswith('.manifest'):
                    manifest_file = os.path.join(stplug_path, filename)
                    os.remove(manifest_file)
                    removed_files.append(filename)
                    logger.log(f"Removed {manifest_file}")

            if removed_files:
                logger.log(f"Successfully removed {len(removed_files)} files for app {appid}: {removed_files}")
                return {'success': True, 'message': f'Removed {len(removed_files)} files', 'removed_files': removed_files}
            else:
                return {'success': False, 'error': f'No files found for app {appid}'}

        except Exception as e:
            logger.error(f"Error removing files for app {appid}: {e}")
            return {'success': False, 'error': str(e)}
