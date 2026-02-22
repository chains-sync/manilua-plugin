import Millennium
import PluginUtils
import json
import os

from manilua import maniluaManager
from steam_utils import has_lua_for_app, list_lua_apps
from config import VERSION

logger = PluginUtils.Logger()

def json_response(data: dict) -> str:
    return json.dumps(data)

def success_response(**kwargs) -> str:
    return json_response({'success': True, **kwargs})

def error_response(error: str, **kwargs) -> str:
    return json_response({'success': False, 'error': error, **kwargs})

def GetPluginDir():
    current_file = os.path.realpath(__file__)

    if current_file.endswith('/main.py/main.py') or current_file.endswith('\\main.py\\main.py'):
        current_file = current_file[:-8]
    elif current_file.endswith('/main.py') or current_file.endswith('\\main.py'):
        current_file = current_file[:-8]

    if current_file.endswith('main.py'):
        backend_dir = os.path.dirname(current_file)
    else:
        backend_dir = current_file

    plugin_dir = os.path.dirname(backend_dir)
    return plugin_dir

class Plugin:
    def __init__(self):
        self.plugin_dir = None
        self.backend_path = None
        self.manilua_manager = None
        self._injected = False

    def _inject_webkit_files(self):
        if self._injected:
            return

        try:
            js_file_path = os.path.join(self.plugin_dir, '.millennium', 'Dist', 'index.js')
            if os.path.exists(js_file_path):
                Millennium.add_browser_js(js_file_path)
                self._injected = True
            else:
                logger.error(f"Bundle not found")
        except Exception as e:
            logger.error(f'Failed to inject: {e}')

    def _front_end_loaded(self):
        logger.log(f"v{VERSION} ready")

    def _load(self):
        global plugin
        plugin = self

        logger.log(f"backend loading (v{VERSION})")

        self.plugin_dir = GetPluginDir()
        self.backend_path = os.path.join(self.plugin_dir, 'backend')
        self.manilua_manager = maniluaManager(self.backend_path)

        self._inject_webkit_files()
        Millennium.ready()
        logger.log("backend ready")

    def _unload(self):
        logger.log("Unloading manilua plugin")

plugin = None

def get_plugin():
    return plugin

class Logger:
    @staticmethod
    def log(message: str) -> str:
        logger.log(f"[Frontend] {message}")
        return success_response()

def hasluaForApp(appid: int) -> str:
    try:
        exists = has_lua_for_app(appid)
        return success_response(exists=exists)
    except Exception as e:
        logger.error(f'hasluaForApp failed for {appid}: {e}')
        return error_response(str(e))

def FetchDepotsWithKeys(appid: int) -> str:
    try:
        result = plugin.manilua_manager.fetch_depots_with_keys(appid)
        return json_response(result)
    except Exception as e:
        logger.error(f'FetchDepotsWithKeys failed for {appid}: {e}')
        return error_response(str(e))

def InstallDepots(appid: int, selectedDepots: list) -> str:
    try:
        result = plugin.manilua_manager.install_depots(appid, selectedDepots)
        return json_response(result)
    except Exception as e:
        logger.error(f'InstallDepots failed for {appid}: {e}')
        return error_response(str(e))

def GetLocalLibrary() -> str:
    try:
        apps = list_lua_apps()
        return success_response(apps=apps)
    except Exception as e:
        logger.error(f'GetLocalLibrary failed: {e}')
        return error_response(str(e))

def removeViamanilua(appid: int) -> str:
    try:
        result = plugin.manilua_manager.remove_via_lua(appid)
        return json_response(result)
    except Exception as e:
        logger.error(f'removeViamanilua failed for {appid}: {e}')
        return error_response(str(e))
