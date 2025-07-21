// It appears there might be a scoping issue with how the 'map' object is being passed.
// This version removes the function wrapper to simplify the script and rely directly on the globally available transform script objects.
// It also adds a check to ensure the 'map' object exists before proceeding.

// Global variables to use in field map, onBefore and onComplete
TEST_RUN = false; // used by onBefore: if True, process only 20 rows for testing purposes
TEST_RUN_MAX_ROWS = 20;
SERIAL_NUMBER_SOURCE = 'u_serienr'; //name of field in import table for Serial Number
CATEGORY_SOURCE = 'u_computacenter_category';
SUB_CATEGORY_SOURCE = 'u_cmdb_cat_';
DESCRIPTION_SOURCE = 'u_omschrijving';
TAG_SOURCE = 'u_tagnr';

// Put all of the above global variables with source table field names in this array
SOURCE_FIELD_NAMES = [SERIAL_NUMBER_SOURCE, CATEGORY_SOURCE, SUB_CATEGORY_SOURCE, DESCRIPTION_SOURCE, TAG_SOURCE];

//*** DO NOT CHANGE ANYTHING BELOW ***//
DATE_TODAY = new GlideDateTime(); // used by onBefore
DATE_TODAY.setValue(gs.beginningOfToday());

// Set and check global vars for Transform Maps for Mutatielijst and Voorraadlijst
IMPORT_ROW_SOURCE = '';
IMPORT_TABLE = '';
TARGET_TABLE = '';
MODEL_ALREADY_CHECKED = [];
ATTENTION_FIELDS_EXIST = false;
MISCO_CATEGORIES_TO_IMPORT = [];
SERIAL_NUMBER = '';
NEW_APPLE_DEVICES = [];
REASON_ATTENTION_NOT_IN_STOCK = '';
DUPLICATE_ROWS_TO_IGNORE = []; // Initialize global variable

// This function will filter out the first occurrence of an item with a given key,
// leaving only the subsequent duplicates. Because the query is sorted, this means
// we keep the older import rows to be ignored.
function removeFirstOccurence(arr, key) {
    var processed = {};
    return arr.filter(function(item) {
        if (processed.hasOwnProperty(item[key])) {
            return true;
        }
        processed[item[key]] = true;
        return false;
    });
}


// Check if map object is defined before using it.
if (typeof map === 'undefined' || map === null) {
    log.error("The 'map' object is not available in the onStart transform script. Aborting transform.");
    error = true; // Abort the transform
} else {
    var assetManagement = new global.asrAssetManagement();
    assetManagement.performSharedOnStartTasks(map);

    if (assetManagement.error) {
        var errorMessage = assetManagement.getError();
        log.error("Error during onStart script execution: " + errorMessage);
        error = true; //abort import
    }

    // De-duplication logic only runs if there are no errors so far
    if (!error) {
        // GlideQuery all Rows in import table of current Import Set
        var duplicateSerialsGQ = new GlideQuery(IMPORT_TABLE)
            .where('sys_import_set', import_set.sys_id.toString());

        // Put in array: Serials that are found more than once
        var duplicateSerials = [];
        duplicateSerialsGQ
            .aggregate('count', SERIAL_NUMBER_SOURCE)
            .groupBy(SERIAL_NUMBER_SOURCE)
            .having('count', SERIAL_NUMBER_SOURCE, '>', 1)
            .select()
            .forEach(function(g) {
                duplicateSerials.push(g.group[SERIAL_NUMBER_SOURCE]);
            });

        // Put in array: object with these Serials and their import set Row
        var duplicateSerialsWithRow = [];
        if (duplicateSerials.length > 0) {
            var rowsGQ = new GlideQuery(IMPORT_TABLE)
                .where('sys_import_set', import_set.sys_id.toString())
                .orderByDesc(SERIAL_NUMBER_SOURCE)
                .orderByDesc(IMPORT_ROW_SOURCE)
                .where(SERIAL_NUMBER_SOURCE, 'IN', duplicateSerials)
                .select(SERIAL_NUMBER_SOURCE, IMPORT_ROW_SOURCE)
                .forEach(function(g) {
                    var obj = {
                        serial: g[SERIAL_NUMBER_SOURCE],
                        row: g[IMPORT_ROW_SOURCE]
                    };
                    duplicateSerialsWithRow.push(obj);
                });
        }

        // Remove the Serial/Row combination that we want to process: the objects containing Serials/Rows to ignore remain
        var serialsWithRowsToIgnore = removeFirstOccurence(duplicateSerialsWithRow, 'serial');

        // Put in global array to use in rest of transform scripts: the Rows to ignore
        var duplicateRowsToIgnoreArr = serialsWithRowsToIgnore.map(function(element) {
            return element.row;
        });

        if (duplicateRowsToIgnoreArr.length > 0) {
            var au = new ArrayUtil();
            DUPLICATE_ROWS_TO_IGNORE = au.convertArray(duplicateRowsToIgnoreArr);
        }
    }
}