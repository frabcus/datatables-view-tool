// datatables-tool.js

// When there are errors call this
var showAlert = function(title, message, level) {
	var $div;
	level = level || 0;
	$div = $("<div>").addClass("alert").text(message);
	$div.prepend('<button type="button" class="close" data-dismiss="alert">×</button>');
	$div.prepend("<strong>" + title + "</strong> ");
	if (level) {
		$div.addClass("alert-error");
	}
	return $div.prependTo("body");
};

var escapeSQL = function(column_name) {
	return "`" + column_name + "`"
}

// Function to map JSON data between DataTables format and ScraperWiki's SQL endpoint format.
// It returns a function for the fnServerData parameter
var convertData = function(table_name, column_names) {
	// This is a wrapper round the GET request DataTables makes to get more data
	// sSource - the URL, we don't use it, we hard code it instead
	// aoData - contains the URL parameters, e.g. what page, what to filter, what order and so on
	// fnCallback - where to call with the data you get back
	// oSettings - settings object for the whole DataTables, see http://datatables.net/docs/DataTables/1.9.0/DataTable.models.oSettings.html
	return function ( sSource, aoData, fnCallback, oSettings ) {
		// convert aoData into a normal hash (called ps)
		var params = {}
		for (var i=0;i<aoData.length;i++) { 
			params[aoData[i].name] = aoData[i].value
		}
		console.log(params)

		// construct SQL query needed according to the parameters
		var columns  = _.map(column_names, escapeSQL).join(",")
		var order_by = ""
		if (params.iSortingCols == 1) {
			order_by = " order by " + escapeSQL(column_names[params.iSortCol_0])
			if (params.sSortDir_0 == 'desc') {
				order_by += " desc"
			} else if (params.sSortDir_0 != 'asc') {
				showAlert("Got unknown sSortDir_0 value in table " + table_name)
			}
		} else {
			showAlert("Got iSortingCols != 1 in table " + table_name)
		} 
		var where = ""
		if (params.sSearch) {
			// XXX no idea if this bog standard Javascript escape really does what we want with SQL databases.
			// There's no security risk (as endpoint is sandboxed). There could be user experience pain though.
			var search = "'%" + escape(params.sSearch.toLowerCase()) + "%'"
			where = " where " + _.map(column_names, function(n) { return "lower(" + escapeSQL(n) + ") like " + search }).join(" or ")
		}
		var query = "select " + columns + 
			     " from " + escapeSQL(table_name) + 
				 where + 
				 order_by + 
			     " limit " + params.iDisplayLength + 
			     " offset " + params.iDisplayStart 
		console.log("SQL query: ", query)

		// get column counts
		scraperwiki.sql("select (select count(*) from " + table_name + ") as total, (select count(*) from " + table_name + where + ") as display_total", function (data) {
			var counts = data[0]
			console.log("counts", data)

			oSettings.jqXHR = $.ajax( {
				"dataType": 'json',
				"type": "GET",
				"url": sqliteEndpoint,
				"data": { q: query },
				"success": function ( response ) {
					// ScraperWiki returns a list of dicts. This converts it to a list of lists.
					var rows = []
					for (var i=0;i<response.length;i++) { 
						var row = []
						for (k in response[i]) {
							row.push(response[i][k])
						}
						rows.push(row)
					}
					// Send the data to dataTables
					fnCallback({ 
						"aaData" : rows,
						"iTotalRecords": data[0].total, // without filtering
						"iTotalDisplayRecords": data[0].display_total // after filtering
					})
				}, 
				"error": function(jqXHR, textStatus, errorThrown) {
					showAlert(errorThrown, jqXHR.responseText, "error")
				}
			} );
		}, function(jqXHR, textStatus, errorThrown) {
			showAlert(errorThrown, jqXHR.responseText, "error")
		})
	}
}

// Find the column names
function getTableColumnNames(table_name, callback){
    scraperwiki.sql("select * from `" + table_name + "` limit 1", function(data) {
		callback(_.keys(data[0]))
	}, function(jqXHR, textStatus, errorThrown) {
		showAlert(errorThrown, jqXHR.responseText, "error")
	})
}

// Make one of the DataTables (in one tab)
var constructDataTable = function(table_name) {
	getTableColumnNames(table_name, function(column_names) {
		console.log("Columns", column_names)
		if (column_names.length == 0) {
			showAlert("No data in the table", jqXHR.responseText)
			return
		}

		var $t = $('#maintable')
		$t.empty()
        var thead = '<thead><tr>'
		_.each(column_names, function(column_name) {
			thead += '<th>' + column_name + '</th>'
		})
		thead += '</tr></thead>'
		$t.append(thead)

		$('#maintable').dataTable( {
			"bProcessing": true,
			"bServerSide": true,
			"bPaginate": true,
			"bFilter": true,
			"fnServerData": convertData(table_name, column_names)
		} );
	})
}

// Make all the DataTables (each tab)
var constructDataTables = function() {
	// XXX todo, make one for each tab
	var table_name = tables[0]
	constructDataTable(table_name)
}

// Main entry point, make the data table
var settings
var sqliteEndpoint
var tables
$(function(){
	settings = scraperwiki.readSettings()
	sqliteEndpoint = settings.target.url + '/sqlite'

	scraperwiki.sql("select name from sqlite_master where type = 'table'", function(data, textStatus, jqXHR) {
		tables = []
		$.each(data, function (i) {
			tables.push(data[i].name)
		})
		console.log("Tables are:", tables)
		constructDataTables()
	}, function(jqXHR, textStatus, errorThrown) {
		showAlert(errorThrown, jqXHR.responseText, "error")
	})

});



