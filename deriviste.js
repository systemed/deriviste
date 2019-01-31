var map, mly;						// Leaflet and Mapillary objects
var markers = [];					// array of all new markers
var mapillaryMarkers = [] // array of all new Mapillary markers
var selectedMarker;					// currently selected marker
var currentMarketId = 0;    // current Mapillary marker
var presets;						// presets.json
var beamIcon,beamMarker,redIcon;	// custom icons
var clickTimer, swallowClick;		// double-click handling

// =========================================================================
// Initialise the app

function initialise() {

	// Standard layers
	map = L.map('map', { doubleClickZoom: false }).setView([30,20],2);
	var osm = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: "<a href='http://osm.org/copyright' target='_blank'>&copy; OpenStreetMap contributors</a>",
		maxNativeZoom: 19,
		maxZoom: 22 }).addTo(map);
	var bing = L.tileLayer.bing("Arzdiw4nlOJzRwOz__qailc8NiR31Tt51dN2D7cm57NrnceZnCpgOkmJhNpGoppU");
	var esri = L.tileLayer("https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
		attribution: "ESRI",
		maxNativeZoom: 18,
		maxZoom: 22 });

	// Add Mapillary overlay
	var mapillaryLayer = L.vectorGrid.protobuf("https://d25uarhxywzl1j.cloudfront.net/v0.1/{z}/{x}/{y}.mvt", {
		maxNativeZoom: 20,
		maxZoom: 22,
		rendererFactory: L.canvas.tile,
 		vectorTileLayerStyles: {
			'mapillary-sequences': {
				weight: 0.2,
				color: '#05CB63',
				opacity: 0.8,
				fill: true
			},
			'mapillary-images': function(zoom) {
				return {
					radius: zoom/3,
					color: '#05CB63',
					fillColor: '#05CB63',
					dashArray: '2, 6',
					fillOpacity: .1,
					opacity: 0.5,
					fill: true
				}
			}
		}
	})//.addTo(map); temporarily testing raster tile layer

	var mapillaryRaster = L.tileLayer('https://d6a1v2w10ny40.cloudfront.net/v0.1/{z}/{x}/{y}.png', {
		attribution: "<a href='http://mapillary.com/' target='_blank'>&copy; Mapillary</a>",
		maxNativeZoom: 18,
		maxzoom: 24 }).addTo(map);

	// Initialise Leaflet
	L.Control.geocoder({ expand: 'click',  }).addTo(map);
	L.control.layers({ "OSM": osm, "Bing aerial": bing, "ESRI Clarity": esri }, { "Mapillary": mapillaryLayer }).addTo(map);
	map.on('click', clickMap);
	map.on('dblclick', doubleClickMap);

	// Initialise icons
	beamIcon = L.icon({ iconUrl: 'images/location-0.png', iconSize: [48,48], iconAnchor: [24,24] });
	var opts = Object.assign({}, L.Icon.Default.prototype.options);
	redIcon = L.icon({ iconUrl: 'images/marker_red.png', iconRetinaUrl: 'images/marker_red_2x.png',
		shadowUrl: "images/marker-shadow.png", iconSize:[25,41], iconAnchor:[12,41],
		popupAnchor: [1,-34], tooltipAnchor: [16,-28], shadowSize:[41,41] });

	// Initialise Mapillary
  mly = new Mapillary.Viewer(
      'mapillary',
      'ZXZyTWZwdkg1WFBIZ2hGVEkySlFiUTpjZWJmMWU3MTViMGMwOTY3',
			null,
      {
          component: {
              marker: {
                  visibleBBoxSize: 100,
              },
              mouse: {
                  doubleClickZoom: false,
              },
          },
      }
	);
	// activate hover effect
	var hover = document.createElement("script");
	n = 0 // marker ID count
	hover.type = "text/javascript";
	hover.src = "hover.js";
	document.head.appendChild(hover);
	mly.setRenderMode(Mapillary.RenderMode.Letterbox);
  window.addEventListener("resize", function() { mly.resize(); });
	mly.on('dblclick', doubleClickMapillary);
	mly.on('nodechanged', mapillaryMoved);
	mly.on('bearingchanged', mapillaryRotated);

	// Initialise autocomplete
	autocomplete("#aa-search-input", { autoselect: true }, [{
		source: findPresets,
		name: 'tags',
		displayKey: getPresetValue
	}]).on('autocomplete:selected', choosePreset);
	fetch("presets/presets.json").then(parsePresets);
}

function flash(str) {
	u('#flash').first().innerHTML = str;
	u('#flash').first().style.display = 'block';
	setTimeout(function() {
		u('#flash').first().style.display = 'none';
	},700);
}

// =========================================================================
// Preset handling

// Parse presets
function parsePresets(response) {
	response.json().then(function(data) {
		presets = data.presets;
	});
}

// Find all matching results for search string
function findPresets(query,callback) {
	var results = [];
	var q = query.toLowerCase();
	for (var k in presets) {
		var p = presets[k];
		if (p.name.toLowerCase().indexOf(q)==0) {
			results.unshift(p);
		} else if (p.name.toLowerCase().includes(q) || k.includes(q) || (p.terms || []).some(v => v.includes(q))) {
			results.push(p);
		}
	}
	if (results.length>7) { results.splice(8); }
	callback(results);
}
// Format result object as string for display
function getPresetValue(obj) {
	return obj.name;
}
// User has selected a preset
// We don't currently support preset.fields, but we provide name as a convenience
function choosePreset(event,suggestion,dataset) {
	var tags = Object.assign({}, suggestion.tags);
	var f = suggestion.fields || [];
	if (f.includes('name') && !tags['name']) { tags['name']=''; }
	populateTagsTable(tags);
}
// Clear autocomplete input field
function clearAutocomplete() {
	document.getElementById('aa-search-input').value='';
}

// =========================================================================
// Click events

// User clicked the Leaflet map, so pan to that location in Mapillary
function clickMap(event) {
	u('#introduction').remove();
	clickTimer = setTimeout(function() {
		if (swallowClick) { swallowClick=false; return; }
		swallowClick = false;
		mly.moveCloseTo(event.latlng.lat, event.latlng.lng);
	},200);
}

// User double-clicked either the Leaflet map or Mapillary to add a marker
function doubleClickMap(event) {
	if (clickTimer) { clearTimeout(clickTimer); swallowClick = true; clickTimer = null; }
	createNewMarkerAt(event.latlng);
}
function doubleClickMapillary(event) {
	var ll = event.latLon;
	if (ll==null) {
		flash("Couldn't find position");
		console.log(event);
		return;
	}
	createNewMarkerAt([ll.lat,ll.lon]);
}
function createNewMarkerAt(ll) {
	var markerComponent = mly.getComponent('marker');
	currentMarkerId = n;
	var mapillaryMarker = new Mapillary.MarkerComponent.SimpleMarker(
			n,
			{ lat: ll[0], lon: ll[1] },
			{ interactive: true });
	var m = L.marker(ll, { draggable: true }).addTo(map);
	m.on('click', clickMarker);
	markers.push(m);
	mapillaryMarkers.push(mapillaryMarker);
	m.id = n;
	console.log(m.id);
	u('#changes').html(markers.length);
	clickMarker(m);
	clearAutocomplete();
	n += 1;
	handleMapMarkerDrag(m);
}

// User navigated somewhere on the Mapillary viewer
function mapillaryMoved(node) {
    var loc = node.computedLatLon ? [node.computedLatLon.lat, node.computedLatLon.lon] : [node.latLon.lat, node.latLon.lon];
	if (beamMarker) {
		beamMarker.setLatLng(loc);
	} else {
		beamMarker = L.marker(loc, { icon: beamIcon }).addTo(map);
	}
}
function mapillaryRotated(angle) {
	if (beamMarker) { beamMarker.setRotationAngle(angle); }
}

// =========================================================================
// Tag/marker editing

// User clicked a Leaflet marker, so open it for editing
// (open the tag table editor, plus a delete button)
function clickMarker(e) {
	deselectCurrentMarker();
	var markerComponent = mly.getComponent('marker');
	var marker = e.target || e;
	marker.options.tags = marker.options.tags || {};
	populateTagsTable(marker.options.tags);
	clearAutocomplete();
	selectedMarker = marker;
	marker.setIcon(redIcon);
	markerId = marker.id;
	currentMarkerId = markerId;
	markerComponent.add([mapillaryMarkers[currentMarkerId]]);
}

// Deselect currently selected marker
function deselectCurrentMarker() {
	if (!selectedMarker) return;
	applyTags();
	selectedMarker.setIcon(L.Icon.Default.prototype);
	selectedMarker = null;
	currentMarkerId = null;
	markerComponent.removeAll();
}

// Delete currently selected marker
function deleteCurrentMarker() {
	if (!selectedMarker) return;
	map.removeLayer(selectedMarker);
	var idx = markers.indexOf(selectedMarker);
	deselectCurrentMarker();
	markers.splice(idx,1);
	populateTagsTable({});
	u('#changes').html(markers.length);
	clearAutocomplete();
	var markerComponent = mly.getComponent('marker');
	try {
		markerComponent.remove(currentMarkerId);
		currentMarkerId = null;
	} catch(e) {
		// do nothing
	}
}

// Delete all markers
function deleteAllMarkers() {
	for (var i=0; i<markers.length; i++) {
		map.removeLayer(markers[i]);
	}
	markers = [];
	populateTagsTable({});
	u('#changes').html(0);
	clearAutocomplete();
	var markerComponent = mly.getComponent('marker');
	markerComponent.remove(currentMarkerId);
	currentMarkerId = null;
}

// Take tags (e.g. from currently selected marker) and populate table with them
function populateTagsTable(tags) {
	// Clear table
	u('#tags .key   input').each(function(node,i) { node.value=''; });
	u('#tags .value input').each(function(node,i) { node.value=''; });
	// Populate table
	var keys = Object.keys(tags).sort();
	u('#tags tr').each(function(node,i) {
		var k = keys.shift(); if (!k) return;
		u(node).find('.key   input').first().value = k;
		u(node).find('.value input').first().value = tags[k];
	});
}

// Apply tags from table to currently selected marker
function applyTags() {
	selectedMarker.options.tags = {};
	u('#tags tr').each(function(node,i) {
		var k = u(node).find('.key   input').first().value;
		var v = u(node).find('.value input').first().value;
		if (k && v) selectedMarker.options.tags[k] = v;
	});
}

// =========================================================================
// Upload data

var xml;

// Save - as .gpx, or .osm, or upload to OSM
// Not accessed yet...
function startUpload() {
	deselectCurrentMarker();
//	if (markers.length==0) return;
	var username = u('#username').first().value;
	var password = u('#password').first().value;
	if (!username || !password) return alert("You must enter an OSM username and password.");
	var comment = prompt("Enter a changeset comment.","");

	// Create changeset
	var str = '<osm><changeset><tag k="created_by" v="Deriviste" /><tag k="comment" v="" /><tag k="imagery_used" v="Mapillary Images" /><tag k="source" v="mapillary" /></changeset></osm>';
	xml = new DOMParser().parseFromString(str,"text/xml");
	xml.getElementsByTagName('tag')[1].setAttribute('v', comment);

	fetch("https://www.openstreetmap.org/api/0.6/changeset/create", {
		method: "PUT",
	    headers: { "Content-Type": "text/xml",
		           "Authorization": "Basic " + window.btoa(username + ":" + password) },
		body: new XMLSerializer().serializeToString(xml)
	}).then(response => {
		response.text().then(text => {
			if (isNaN(text)) {
				flash("Couldn't authenticate");
			} else {
				uploadData(text); // this is just the changeset ID
			}
		})
	});
}
function uploadData(changesetId) {
	// Create XML (bleurgh) document
	xml = document.implementation.createDocument(null,null);
	var osc = xml.createElement("osmChange");
	osc.setAttribute('version','0.6');
	osc.setAttribute('generator','Deriviste');
	var operation = xml.createElement("create");
	for (var i=0; i<markers.length; i++) {
		var marker = markers[i];
		var node = xml.createElement("node");
		node.setAttribute("id",-(i+1));
		node.setAttribute("changeset",changesetId);
		node.setAttribute("lat",marker.getLatLng().lat);
		node.setAttribute("lon",marker.getLatLng().lng);
		for (var k in marker.options.tags) {
			if (!k || !marker.options.tags[k]) continue;
			var tag = xml.createElement("tag");
			tag.setAttribute("k",k);
			tag.setAttribute("v",marker.options.tags[k]);
			node.appendChild(tag);
		}
		operation.appendChild(node);
	}
	osc.appendChild(operation);
	xml.appendChild(osc);
	console.log(new XMLSerializer().serializeToString(xml));

	// Upload
	fetch("https://www.openstreetmap.org/api/0.6/changeset/"+changesetId+"/upload", {
		method: "POST",
	    headers: { "Content-Type": "text/xml",
		           "Authorization": "Basic " + window.btoa(u('#username').first().value + ":" + u('#password').first().value) },
		body: new XMLSerializer().serializeToString(xml)
	}).then(response => {
		response.text().then(text => {
			// we could probably parse the diff result here and keep the markers around
			//   for editing (with new id/version), but for now, let's just delete them
			flash("Nodes uploaded.");
			console.log(text);
			deleteAllMarkers();
		})
	});
}
