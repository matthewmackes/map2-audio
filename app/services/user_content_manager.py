"""
User Content Manager for MAP2 Audio Platform
Handles storage and indexing of user-generated drum packs and songbooks.
"""

import os
import json
from pathlib import Path
from typing import Dict, List

USER_PACKS_DIR = Path(os.path.dirname(__file__)) / '../../data/drums/generated/'

class UserContentManager:
    def __init__(self, packs_dir: Path = USER_PACKS_DIR):
        self.packs_dir = packs_dir
        self.packs_dir.mkdir(parents=True, exist_ok=True)

    def list_packs(self) -> List[Dict]:
        packs = []
        for pack_file in self.packs_dir.glob('*.json'):
            try:
                with pack_file.open('r') as f:
                    pack = json.load(f)
                    packs.append({
                        'pack_id': pack.get('pack_id'),
                        'name': pack.get('name'),
                        'description': pack.get('description'),
                        'source': pack.get('source'),
                        'filename': pack_file.name
                    })
            except Exception:
                continue
        return packs

    def save_pack(self, pack: Dict) -> str:
        pack_id = pack.get('pack_id') or 'user_pack'
        filename = f"{pack_id}.json"
        path = self.packs_dir / filename
        with path.open('w') as f:
            json.dump(pack, f, indent=2)
        return str(path)

    def get_pack(self, pack_id: str) -> Dict:
        for pack_file in self.packs_dir.glob('*.json'):
            with pack_file.open('r') as f:
                pack = json.load(f)
                if pack.get('pack_id') == pack_id:
                    return pack
        raise FileNotFoundError(f"Pack {pack_id} not found")
