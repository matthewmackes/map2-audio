from app.services.user_content_manager import UserContentManager
from fastapi import UploadFile, File

user_content_manager = UserContentManager()
# Drum Machine API endpoints for MAP2 Audio Platform
from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List
import os
import glob
import json

router = APIRouter()

DRUM_MACHINE_STATE = {
    "ui_mode": "practice",  # practice, advanced, backing_tracks
    "practice_style_id": None,
    "practice_variation": 0,
    "practice_change_quantization": 1,
    "practice_count_in_bars": 1,
    "practice_auto_fill": False,
    # ... add all other relevant fields
}

# Drum pack directories
FACTORY_PACKS_DIR = os.path.join(os.path.dirname(__file__), '../../data/drums/factory_packs')
GENERATED_PACKS_DIR = os.path.join(os.path.dirname(__file__), '../../data/drums/generated')

def index_packs(directory: str) -> List[Dict]:
    packs = []
    for pack_file in glob.glob(os.path.join(directory, '*.json')):
        try:
            with open(pack_file, 'r') as f:
                pack = json.load(f)
                packs.append({
                    'pack_id': pack.get('pack_id'),
                    'name': pack.get('name'),
                    'description': pack.get('description'),
                    'source': pack.get('source'),
                    'filename': os.path.basename(pack_file)
                })
        except Exception as e:
            continue
    return packs

@router.get("/api/engine/drums/state")
def get_drum_machine_state() -> Dict[str, Any]:
    return DRUM_MACHINE_STATE

@router.post("/api/engine/drums/state")
def set_drum_machine_state(state: Dict[str, Any]):
    DRUM_MACHINE_STATE.update(state)
    return {"status": "ok", "state": DRUM_MACHINE_STATE}

# Index factory packs
@router.get("/api/engine/drums/packs/factory")
def get_factory_packs() -> List[Dict]:
    return index_packs(FACTORY_PACKS_DIR)

# Index generated packs
# Index generated packs
@router.get("/api/engine/drums/packs/generated")
def get_generated_packs() -> List[Dict]:
    return user_content_manager.list_packs()

# Get pack details
@router.get("/api/engine/drums/packs/factory/{pack_id}")
def get_factory_pack_details(pack_id: str) -> Dict:
    for pack_file in glob.glob(os.path.join(FACTORY_PACKS_DIR, '*.json')):
        with open(pack_file, 'r') as f:
            pack = json.load(f)
            if pack.get('pack_id') == pack_id:
                return pack
    raise HTTPException(status_code=404, detail="Pack not found")

# Get pack details
@router.get("/api/engine/drums/packs/generated/{pack_id}")
def get_generated_pack_details(pack_id: str) -> Dict:
    try:
        return user_content_manager.get_pack(pack_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Pack not found")

# Upload user pack (JSON)
@router.post("/api/engine/drums/packs/upload")
async def upload_user_pack(file: UploadFile = File(...)):
    try:
        content = await file.read()
        pack = json.loads(content)
        path = user_content_manager.save_pack(pack)
        return {"status": "ok", "path": path, "pack_id": pack.get("pack_id")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
