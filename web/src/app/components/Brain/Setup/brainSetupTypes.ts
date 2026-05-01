// Local subset of Brain-service types used by the Connect-Keyboard setup
// task. These mirror the Pydantic models in app/services/performance_brain/
// models.py — keeping a small typed surface here avoids pulling the entire
// 34k-line generated OpenAPI types module.

export type BrainAssetType = 'soundfont' | 'sfz' | 'sample' | 'kit' | 'patch'

export interface BrainLibraryAssetModel {
  asset_id: string
  name: string
  asset_type: BrainAssetType
  source: string
  path: string
  description: string
  default_slot_mode: 'chromatic' | 'drum' | 'hybrid'
  tags: string[]
  authored_with_devices: string[]
}

export interface BrainLibraryCollectionModel {
  collection_id: string
  label: string
  asset_count: number
  assets: BrainLibraryAssetModel[]
}

export interface BrainLibraryStateModel {
  collections: BrainLibraryCollectionModel[]
  featured_assets: string[]
  last_scan_iso: string
}

export type BrainSlotAssetType = BrainAssetType | 'empty'

export interface BrainSlotModel {
  slot_id: number
  name: string
  color: string
  asset_type: BrainSlotAssetType
  asset_path: string
  // The full BrainSlotModel has many more fields (mute, solo, gain, pan,
  // mod-matrix, etc.) but the wizard only round-trips asset_type +
  // asset_path + name through PATCH, so this is the minimum useful shape.
}

export interface BrainSlotUpdateModel {
  name?: string
  color?: string
  asset_type?: BrainSlotAssetType
  asset_path?: string
}
