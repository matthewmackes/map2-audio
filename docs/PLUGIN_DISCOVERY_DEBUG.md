# Debug: Plugin Discovery Issues

## Symptoms
- "Atom" and "Utility" appear in plugin browser but no actual plugins listed
- "Failed to add plugin" errors when trying to add plugins
- No clickable "Add" buttons appear

## Investigation

### Theory 1: Plugin Discovery Returns Empty/Invalid Data
Check what `/api/plugins/discover` actually returns:
```bash
curl -s "http://localhost:3000/api/plugins/discover" | python3 -m json.tool
```

Expected format:
```json
{
  "plugins": [
    {
      "uri": "urn:lv2:plugin-uri",
      "name": "Plugin Name",
      "category": "Category",
      "author": "Author",
      ...
    }
  ],
  "count": N
}
```

### Theory 2: Category Names Showing Instead of Plugins
The UI shows "Atom" and "Utility" which are category names. This might mean:
- Plugins array is empty
- The UI is displaying categories instead of plugins
- Plugin loader not finding actual LV2 plugins

### Theory 3: Plugin URIs Are Empty/Malformed
Even if plugins are discovered, their URIs might be:
- Empty string
- None/null
- Not matching expected format

## Debugging Steps

1. **Check plugin discovery response:**
   ```bash
   curl -s "http://172.20.234.234:3000/api/plugins/discover?refresh=true"
   ```

2. **Check recent backend logs for plugin discovery:**
   - Look for "Discovered X plugins" messages
   - Look for "Plugin URIs:" debug output
   - Look for any error messages

3. **Verify plugin loader is working:**
   - Check if `service_manager.get_plugin_loader()` returns valid object
   - Check if plugin_loader.discover_plugins() returns data

4. **Test add plugin with known URI:**
   - Create a chain first
   - Try manually POSTing to `/api/chains/1/plugins?plugin_uri=test-uri`
   - Check error response

## Solution Checklist

- [ ] Plugin discovery returns actual plugins (not just categories)
- [ ] Plugin URIs are valid and non-empty
- [ ] Backend add_plugin endpoint receives correct chain_id and plugin_uri
- [ ] Database session/chain verification works
- [ ] ChainPlugin record is successfully created
