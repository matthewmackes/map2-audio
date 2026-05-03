// Local subset of Brain-service types used by the Connect-Keyboard setup
// task. These mirror the Pydantic models in app/services/performance_brain/
// models.py — keeping a small typed surface here avoids pulling the entire
// 34k-line generated OpenAPI types module.

export type SequencerAssetType = 'soundfont' | 'sfz' | 'sample' | 'kit' | 'patch'

export interface SequencerLibraryAssetModel {
  asset_id: string
  name: string
  asset_type: SequencerAssetType
  source: string
  path: string
  description: string
  default_slot_mode: 'chromatic' | 'drum' | 'hybrid'
  tags: string[]
  authored_with_devices: string[]
}

export interface SequencerLibraryCollectionModel {
  collection_id: string
  label: string
  asset_count: number
  assets: SequencerLibraryAssetModel[]
}

export interface SequencerLibraryStateModel {
  collections: SequencerLibraryCollectionModel[]
  featured_assets: string[]
  last_scan_iso: string
}

export type SequencerSlotAssetType = SequencerAssetType | 'empty'

export interface SequencerSlotModel {
  slot_id: number
  name: string
  color: string
  asset_type: SequencerSlotAssetType
  asset_path: string
  // The full SequencerSlotModel has many more fields (mute, solo, gain, pan,
  // mod-matrix, etc.) but the wizard only round-trips asset_type +
  // asset_path + name through PATCH, so this is the minimum useful shape.
}

export interface SequencerSlotUpdateModel {
  name?: string
  color?: string
  asset_type?: SequencerSlotAssetType
  asset_path?: string
}
