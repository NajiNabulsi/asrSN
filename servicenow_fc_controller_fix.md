# ServiceNow Discovery: Fix for Empty Controller Field on IBM Fibre Channel Disks

## Problem Description
Controller field is empty for IBM Fibre Channel Disks during ServiceNow Cloud Discovery:
- IBM Fibre Channel Disk (naa.600507681382023e900000000000fcd4)
- IBM Fibre Channel Disk (naa.600507681382023e9000000000005082)
- IBM Fibre Channel Disk (naa.600507681382023e9000000000000dcf)
- IBM Fibre Channel Disk (naa.600507681382023e900000000000004a)
- IBM Fibre Channel Disk (naa.600507681382023e900000000000004b)

## Root Causes

### 1. Discovery Pattern Issues
- **Missing or Inactive Patterns**: Storage discovery patterns may not be active
- **Insufficient Permissions**: Discovery credentials lack proper storage access
- **Pattern Logic Gaps**: Existing patterns don't handle IBM FC disk controller mapping

### 2. Identification Rule Problems
- **Serial Number Conflicts**: Multiple devices with same/similar identifiers
- **Discovery Source Issues**: Invalid discovery source configuration
- **Missing OID Mappings**: SNMP OIDs not properly mapped for controller information

### 3. Infrastructure Issues
- **Multipath Configuration**: Incomplete multipath setup on target systems
- **HBA Driver Issues**: Outdated or missing Fibre Channel HBA drivers
- **Network Connectivity**: Blocked ports or network issues

## Solution Steps

### Step 1: Verify Discovery Configuration

#### Check Discovery Status
```sql
-- Check discovery status for storage devices
SELECT 
    sys_id,
    name,
    discovery_source,
    last_discovered,
    serial_number,
    model_number
FROM cmdb_ci_storage_device 
WHERE name LIKE '%IBM Fibre Channel%'
   OR serial_number LIKE '%naa.60050768%';
```

#### Verify Discovery Source
```sql
-- Check discovery source configuration
SELECT * FROM sys_properties 
WHERE name = 'glide.discovery.source_name';
```

**Fix**: If discovery source shows "Service-now", change it to "ServiceNow":
1. Navigate to **System Properties** > **System Properties**
2. Search for `glide.discovery.source_name`
3. Change value from "Service-now" to "ServiceNow"

### Step 2: Configure Storage Discovery Patterns

#### Enable Storage Discovery Patterns
1. Navigate to **Discovery** > **Discovery Patterns**
2. Search for and activate these patterns:
   - `IBM Storage`
   - `Storage Array`
   - `Fibre Channel`
   - `SAN Storage`

#### Check Pattern Configuration
```javascript
// Script to check active storage patterns
var gr = new GlideRecord('discovery_pattern');
gr.addQuery('active', true);
gr.addQuery('name', 'CONTAINS', 'storage');
gr.query();
while (gr.next()) {
    gs.print('Pattern: ' + gr.name + ' - Active: ' + gr.active);
}
```

### Step 3: Fix Identification Rules

#### Update Storage Device Identification Rules
1. Navigate to **Configuration** > **CI Class Manager**
2. Find `Storage Device` class
3. Check **Identification Rules**:
   - Ensure **Name** has higher priority than **Serial Number**
   - Add **NAA ID** as identification field if missing

#### Custom Identification Rule Script
```javascript
// Create custom identification rule for FC disks
var gr = new GlideRecord('cmdb_id_rule');
gr.initialize();
gr.ci_class = 'cmdb_ci_storage_device';
gr.name = 'FC Disk NAA Identifier';
gr.priority = 50;
gr.active = true;
gr.condition = 'nameSTARTSWITHIBM Fibre Channel';
gr.insert();
```

### Step 4: Enhance Discovery Probe/Sensor

#### Create Custom SNMP Probe for Controller Info
```javascript
// Custom probe to get FC controller information
var probe = new GlideRecord('discovery_probe');
probe.initialize();
probe.name = 'IBM FC Controller Info';
probe.type = 'SNMP';
probe.active = true;
probe.description = 'Retrieve IBM FC disk controller information';
probe.insert();
```

#### Add Controller OID Mapping
Common IBM Storage Controller OIDs:
- Controller Name: `1.3.6.1.4.1.2.6.190.3.1.1.1.3`
- Controller Status: `1.3.6.1.4.1.2.6.190.3.1.1.1.4`
- Controller Serial: `1.3.6.1.4.1.2.6.190.3.1.1.1.5`

### Step 5: Configure Credentials and Permissions

#### Storage Credentials Setup
1. Navigate to **Discovery** > **Credentials**
2. Create/verify credentials for:
   - **SNMP**: For storage array management
   - **SSH**: For host-level discovery
   - **Storage API**: If applicable

#### Required Permissions
Ensure discovery account has:
- Read access to storage management interface
- SNMP read community string
- Multipath command execution rights

### Step 6: Debug Discovery Process

#### Enable Debug Logging
```javascript
// Enable storage discovery debugging
gs.setProperty('glide.discovery.storage.debug', 'true');
gs.setProperty('glide.discovery.snmp.debug', 'true');
```

#### Check Discovery Logs
1. Navigate to **Discovery** > **Discovery Log**
2. Filter by:
   - **Source**: Target IP ranges
   - **Level**: Error/Warning
   - **Message**: Contains "controller" or "storage"

### Step 7: Manual Controller Mapping (Temporary Fix)

#### Update Records via Script
```javascript
// Manual update for FC disks with missing controller info
var gr = new GlideRecord('cmdb_ci_storage_device');
gr.addQuery('name', 'STARTSWITH', 'IBM Fibre Channel');
gr.addQuery('controller', '');
gr.query();

while (gr.next()) {
    var naaId = gr.serial_number.toString();
    
    // Extract controller info from NAA ID pattern
    if (naaId.indexOf('naa.600507681382023e9') == 0) {
        gr.controller = 'IBM SAN Volume Controller'; // Adjust as needed
        gr.manufacturer = 'IBM';
        gr.update();
        gs.print('Updated controller for: ' + gr.name);
    }
}
```

### Step 8: Verify Multipath Configuration

#### Check Host Multipath Setup
For Linux hosts being discovered:
```bash
# Verify multipath configuration
multipath -ll | grep -A 5 "600507681382023e9"

# Check FC HBA status
systool -c fc_host -v

# Verify device paths
ls -la /dev/disk/by-path/ | grep fc
```

## Validation Steps

### 1. Re-run Discovery
1. Navigate to **Discovery** > **Discovery Schedules**
2. Create targeted discovery for affected IP ranges
3. Monitor discovery progress and logs

### 2. Verify Results
```sql
-- Check if controller field is now populated
SELECT 
    name,
    controller,
    serial_number,
    last_discovered
FROM cmdb_ci_storage_device 
WHERE serial_number LIKE '%naa.60050768%'
  AND controller IS NOT NULL;
```

### 3. Validate Relationships
```sql
-- Check storage device relationships
SELECT 
    parent.name as controller_name,
    child.name as disk_name,
    rel.type as relationship_type
FROM cmdb_rel_ci rel
JOIN cmdb_ci parent ON rel.parent = parent.sys_id
JOIN cmdb_ci child ON rel.child = child.sys_id
WHERE child.name LIKE '%IBM Fibre Channel%';
```

## Prevention Measures

### 1. Regular Pattern Updates
- Keep discovery patterns updated
- Subscribe to ServiceNow pattern updates
- Test patterns in development environment

### 2. Monitoring Setup
- Create alerts for discovery failures
- Monitor controller field population rates
- Set up automated discovery health checks

### 3. Documentation
- Document custom patterns and probes
- Maintain inventory of storage devices
- Keep track of NAA ID to controller mappings

## Additional Resources

- **ServiceNow Docs**: [Storage Discovery](https://docs.servicenow.com/bundle/vancouver-it-operations-management/page/product/discovery/concept/storage-discovery.html)
- **Community**: [ServiceNow Community ITOM Forum](https://community.servicenow.com/community?id=community_forum&sys_id=9f2b5b6ddb98dbc01dcaf3231f96194b)
- **Knowledge Base**: Search for "storage discovery" and "controller field"

## Contact Information

If issues persist after following these steps:
1. Open ServiceNow support case
2. Reference this troubleshooting guide
3. Provide discovery logs and configuration details
4. Include specific NAA IDs and expected controller information

---

**Note**: Always test changes in a development environment before applying to production. Some solutions may require ServiceNow administrator privileges.