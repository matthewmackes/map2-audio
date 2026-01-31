import { presetManager } from './presetManager';

describe('PresetManager - World-Class Features', () => {
  const pluginUri = 'test-plugin';
  const parameters = { param1: 0.5, param2: 0.8 };
  const presetName = 'Test Preset';

  beforeEach(() => {
    presetManager.clearAllPresets();
  });

  describe('Basic Functionality', () => {
    test('should save and recall plugin state', () => {
      const savedPreset = presetManager.savePluginState(pluginUri, parameters, presetName);
      expect(savedPreset).toBeDefined();
      expect(savedPreset.name).toBe(presetName);

      const recalledParameters = presetManager.recallPluginState(pluginUri, savedPreset.id);
      expect(recalledParameters).toEqual(parameters);
    });

    test('should handle invalid recall gracefully', () => {
      const recalledParameters = presetManager.recallPluginState(pluginUri, 'non-existent-id');
      expect(recalledParameters).toBeUndefined();
    });

    test('should integrate save and recall via unified method', () => {
      const savedPreset = presetManager.handlePresetOperation('save', pluginUri, parameters, presetName);
      expect(savedPreset).toBeDefined();

      const recalledParameters = presetManager.handlePresetOperation('recall', pluginUri, undefined, undefined, savedPreset.id);
      expect(recalledParameters).toEqual(parameters);
    });
  });

  describe('Version Control', () => {
    test('should track version history on updates', () => {
      const preset1 = presetManager.savePreset(pluginUri, presetName, parameters);
      expect(preset1.version).toBe(1);
      expect(preset1.versions?.length).toBe(0);

      const updatedParams = { param1: 0.7, param2: 0.9 };
      const preset2 = presetManager.savePreset(pluginUri, presetName, updatedParams, undefined, undefined, 'Increased values');
      
      expect(preset2.version).toBe(2);
      expect(preset2.versions?.length).toBe(1);
      expect(preset2.versions![0].parameters).toEqual(parameters);
    });

    test('should revert to previous version', () => {
      presetManager.savePreset(pluginUri, presetName, parameters);
      presetManager.savePreset(pluginUri, presetName, { param1: 0.7, param2: 0.9 });
      const preset = presetManager.savePreset(pluginUri, presetName, { param1: 0.9, param2: 1.0 });

      const reverted = presetManager.revertToVersion(preset.id, 1);
      expect(reverted).toBeDefined();
      expect(reverted!.parameters).toEqual(parameters);
    });
  });

  describe('Metadata and Ratings', () => {
    test('should add and update metadata', () => {
      const preset = presetManager.savePreset(pluginUri, presetName, parameters);
      
      const updated = presetManager.updateMetadata(preset.id, {
        author: 'Test Author',
        description: 'Test Description',
        category: 'Rock',
      });

      expect(updated?.metadata?.author).toBe('Test Author');
      expect(updated?.metadata?.category).toBe('Rock');
    });

    test('should rate presets', () => {
      const preset = presetManager.savePreset(pluginUri, presetName, parameters);
      
      const rated = presetManager.ratePreset(preset.id, 4.5);
      expect(rated?.metadata?.rating).toBe(4.5);
    });

    test('should toggle favorites', () => {
      const preset = presetManager.savePreset(pluginUri, presetName, parameters);
      
      let updated = presetManager.toggleFavorite(preset.id);
      expect(updated?.metadata?.favorite).toBe(true);

      updated = presetManager.toggleFavorite(preset.id);
      expect(updated?.metadata?.favorite).toBe(false);
    });

    test('should get favorites', () => {
      const preset1 = presetManager.savePreset(pluginUri, 'Preset 1', parameters);
      const preset2 = presetManager.savePreset(pluginUri, 'Preset 2', parameters);
      
      presetManager.toggleFavorite(preset1.id);
      
      const favorites = presetManager.getFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0].id).toBe(preset1.id);
    });
  });

  describe('Advanced Search and Filtering', () => {
    beforeEach(() => {
      presetManager.savePreset(pluginUri, 'Rock Lead', parameters, ['rock', 'lead'], 
        { category: 'Rock', rating: 4.5, author: 'John' });
      presetManager.savePreset(pluginUri, 'Jazz Clean', parameters, ['jazz', 'clean'], 
        { category: 'Jazz', rating: 3.5, author: 'Jane' });
      presetManager.savePreset(pluginUri, 'Metal Crunch', parameters, ['metal', 'distortion'], 
        { category: 'Metal', rating: 5.0, author: 'John' });
    });

    test('should search by name', () => {
      const results = presetManager.searchPresets('Rock');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Rock Lead');
    });

    test('should search by author', () => {
      const results = presetManager.searchPresets('John');
      expect(results.length).toBe(2);
    });

    test('should filter by category', () => {
      const results = presetManager.searchPresets('', { category: 'Jazz' });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Jazz Clean');
    });

    test('should filter by minimum rating', () => {
      const results = presetManager.searchPresets('', { minRating: 4.0 });
      expect(results.length).toBe(2);
    });

    test('should filter by tags', () => {
      const results = presetManager.searchPresets('', { tags: ['distortion'] });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Metal Crunch');
    });

    test('should get all categories', () => {
      const categories = presetManager.getCategories();
      expect(categories).toEqual(['Jazz', 'Metal', 'Rock']);
    });

    test('should get top rated presets', () => {
      const topRated = presetManager.getTopRated(2);
      expect(topRated.length).toBe(2);
      expect(topRated[0].name).toBe('Metal Crunch');
      expect(topRated[1].name).toBe('Rock Lead');
    });
  });

  describe('Preset Comparison', () => {
    test('should compare two presets', () => {
      const preset1 = presetManager.savePreset(pluginUri, 'Preset 1', { param1: 0.5, param2: 0.8 });
      const preset2 = presetManager.savePreset(pluginUri, 'Preset 2', { param1: 0.7, param2: 0.8 });

      const comparison = presetManager.comparePresets(preset1.id, preset2.id);
      expect(comparison).toBeDefined();
      expect(comparison!.differences.length).toBe(1);
      expect(comparison!.differences[0].parameter).toBe('param1');
      expect(comparison!.similarity).toBeGreaterThan(50);
    });
  });

  describe('Preset Validation', () => {
    test('should validate preset integrity', () => {
      const preset = presetManager.savePreset(pluginUri, presetName, parameters);
      
      const validation = presetManager.validatePreset(preset.id);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    test('should detect invalid preset', () => {
      const validation = presetManager.validatePreset('non-existent-id');
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Preset not found');
    });
  });

  describe('Preset Duplication', () => {
    test('should duplicate preset', () => {
      const original = presetManager.savePreset(pluginUri, 'Original', parameters);
      const duplicate = presetManager.duplicatePreset(original.id, 'Copy of Original');

      expect(duplicate).toBeDefined();
      expect(duplicate!.name).toBe('Copy of Original');
      expect(duplicate!.parameters).toEqual(original.parameters);
      expect(duplicate!.parentPreset).toBe(original.id);
    });
  });

  describe('Collections and Banks', () => {
    test('should create collection', () => {
      const collection = presetManager.createCollection('My Collection', 'Test description');
      expect(collection).toBeDefined();
      expect(collection.name).toBe('My Collection');
      expect(collection.presetIds.length).toBe(0);
    });

    test('should add presets to collection', () => {
      const preset1 = presetManager.savePreset(pluginUri, 'Preset 1', parameters);
      const preset2 = presetManager.savePreset(pluginUri, 'Preset 2', parameters);
      const collection = presetManager.createCollection('Test Collection');

      presetManager.addToCollection(collection.id, preset1.id);
      presetManager.addToCollection(collection.id, preset2.id);

      const collectionPresets = presetManager.getCollectionPresets(collection.id);
      expect(collectionPresets.length).toBe(2);
    });

    test('should remove preset from collection', () => {
      const preset = presetManager.savePreset(pluginUri, 'Preset', parameters);
      const collection = presetManager.createCollection('Test Collection');

      presetManager.addToCollection(collection.id, preset.id);
      expect(presetManager.getCollectionPresets(collection.id).length).toBe(1);

      presetManager.removeFromCollection(collection.id, preset.id);
      expect(presetManager.getCollectionPresets(collection.id).length).toBe(0);
    });

    test('should export and import collection', () => {
      const preset1 = presetManager.savePreset(pluginUri, 'Preset 1', parameters);
      const preset2 = presetManager.savePreset(pluginUri, 'Preset 2', parameters);
      const collection = presetManager.createCollection('Export Test');

      presetManager.addToCollection(collection.id, preset1.id);
      presetManager.addToCollection(collection.id, preset2.id);

      const exportedData = presetManager.exportCollection(collection.id);
      expect(exportedData).toBeDefined();

      const result = presetManager.importCollection(exportedData!);
      expect(result.collection).toBeDefined();
      expect(result.presetsImported).toBe(2);
      expect(result.errors.length).toBe(0);
    });

    test('should delete collection', () => {
      const collection = presetManager.createCollection('To Delete');
      expect(presetManager.getAllCollections().length).toBe(1);

      presetManager.deleteCollection(collection.id);
      expect(presetManager.getAllCollections().length).toBe(0);
    });
  });

  describe('History Tracking', () => {
    test('should track preset history', () => {
      const preset = presetManager.savePreset(pluginUri, presetName, parameters);
      presetManager.recallPluginState(pluginUri, preset.id);
      presetManager.deletePreset(preset.id);

      const history = presetManager.getHistory(preset.id);
      expect(history.length).toBeGreaterThan(0);
      expect(history.some(h => h.action === 'created')).toBe(true);
      expect(history.some(h => h.action === 'loaded')).toBe(true);
      expect(history.some(h => h.action === 'deleted')).toBe(true);
    });
  });
});