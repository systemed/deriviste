// Show original latLon and latLon (if computed exist it will differ) of current
// viewer node on map. Show line linking the two points together
const mapNodePosition = {
    line: L.polyline([[0, 0], [0, 0]], {color: '#0ff', weight: 1, opacity: 0 }),
    originalPos: L.circleMarker([0, 0], { radius: 7, color: '#0ff', opacity: 0 }),
    pos: L.circleMarker([0, 0], { radius: 7, color: '#00f', opacity: 0 }),
};

mly.on(Mapillary.Viewer.nodechanged, function(node) {
    const latLon = [node.latLon.lat, node.latLon.lon];
    const originalLatLon = [node.originalLatLon.lat, node.originalLatLon.lon];

    mapNodePosition.line.setLatLngs([originalLatLon, latLon]);
    mapNodePosition.originalPos.setLatLng(originalLatLon);
    mapNodePosition.pos.setLatLng(latLon);

    map.setView(latLon);

    if (!map.hasLayer(mapNodePosition.line)) {
        mapNodePosition.line.addTo(map);
        mapNodePosition.originalPos.addTo(map);
        mapNodePosition.pos.addTo(map);
    }
});

// Get marker component
        const markerComponent = mly.getComponent('marker');


        // Show a flat circle marker in the viewer when hovering the map
        let mapHoverViewerMarker;

        const removeMapHoverViewerMarker = function() {
            if (!!mapHoverViewerMarker && markerComponent.has(mapHoverViewerMarker.id)) {
                markerComponent.remove([mapHoverViewerMarker.id]);
                mapHoverViewerMarker = null;
            }
        }

        const onMapMouseEvent = function(e) {
            mapHoverViewerMarker = new Mapillary.MarkerComponent.CircleMarker(
                'map-hover-viewer-marker-id',
                { lat: e.latlng.lat, lon: e.latlng.lng },
                { color: '#E05643' });

            markerComponent.add([mapHoverViewerMarker]);
        }

        map.on('mousemove', onMapMouseEvent);
        map.on('mouseover', onMapMouseEvent);
        map.on('mouseout', removeMapHoverViewerMarker);


        // Show a flat circle marker in the viewer and a corresponding map marker when hovering the viewer
        const indicator = {
            id: "indicator-id",
            mapLine: L.polyline([[0, 0], [0, 0]], { color: '#E05643', weight: 1, id: "indicator-id-line" }),
            mapMarker: L.circleMarker([0, 0], { radius: 5, color: '#E05643', id: "indicator-id-circle" }),
            viewerMarker: null,
            state: {
                dragging: false,
                lastPos: null,
                moving: false,
            },
        };

        const addMapIndicator = function() {
            if (!map.hasLayer(indicator.mapLine)) {
                indicator.mapLine.addTo(map);
            }

            if (!map.hasLayer(indicator.mapMarker)) {
                indicator.mapMarker.addTo(map);
            }
        }

        const removeMapIndicator = function() {
            if (map.hasLayer(indicator.mapLine)) {
                map.removeLayer(indicator.mapLine);
            }

            if (map.hasLayer(indicator.mapMarker)) {
                map.removeLayer(indicator.mapMarker);
            }
        }

        const removeViewerIndicator = function() {
            if (!!indicator.viewerMarker && markerComponent.has(indicator.viewerMarker.id)) {
                markerComponent.remove([indicator.viewerMarker.id]);
                indicator.viewerMarker = null;
            }
        }

        const setViewerIndicatorMarker = function(latLon) {
            const viewerMarker = new Mapillary.MarkerComponent.CircleMarker(
                indicator.id,
                latLon,
                { color: '#E05643' });

            markerComponent.add([viewerMarker]);

            indicator.viewerMarker = viewerMarker;
        }

        const moveIndicatorMarker = function(latLon) {
            if (indicator.state.dragging) { return; }

            if (latLon == null) {
                removeMapIndicator();
                removeViewerIndicator();
                return;
            }

            const posLatLng = mapNodePosition.pos.getLatLng();
            const lineString = [
                [posLatLng.lat, posLatLng.lng],
                [latLon.lat, latLon.lon],
                [
                    posLatLng.lat + 5 * (latLon.lat - posLatLng.lat),
                    posLatLng.lng + 5 * (latLon.lon - posLatLng.lng),
                ],
            ];

            indicator.mapLine.setLatLngs(lineString);
            indicator.mapMarker.setLatLng([latLon.lat, latLon.lon]);

            setViewerIndicatorMarker({ lat: latLon.lat, lon: latLon.lon });

            addMapIndicator();
        }

        const onViewerMouseEvent = function(event) {
            indicator.state.lastPos = event.pixelPoint;
            moveIndicatorMarker(event.latLon);
        }

        mly.on(Mapillary.Viewer.mouseup, onViewerMouseEvent);
        mly.on(Mapillary.Viewer.mouseover, onViewerMouseEvent);
        mly.on(Mapillary.Viewer.mousedown, onViewerMouseEvent);

        mly.on(Mapillary.Viewer.mousemove, function(event) {
            // Store last mouse position for later unprojection
            indicator.state.lastPos = event.pixelPoint;

            if (indicator.state.moving || indicator.state.dragging) { return; }

            moveIndicatorMarker(event.latLon);
        });


        mly.on(Mapillary.Viewer.mouseout, function(event) {
            indicator.state.lastPos = null;
            removeViewerIndicator();
            removeMapIndicator();
        });

        mly.on(Mapillary.Viewer.movestart, function(event) { indicator.state.moving = true; });
        mly.on(Mapillary.Viewer.moveend, function(event) {
            indicator.state.moving = false;

            if (!indicator.state.lastPos) { return; }

            // Unproject the last position and move indicator marker if latLon exist
            mly.unproject(indicator.state.lastPos).then(moveIndicatorMarker);
        });

        markerComponent.on(Mapillary.MarkerComponent.MarkerComponent.dragstart, function() {
            // Remove indicators when dragging marker in the viewer
            indicator.state.dragging = true;
            removeViewerIndicator();
            removeMapIndicator();
        });

        markerComponent.on(Mapillary.MarkerComponent.MarkerComponent.dragend, function() {
            indicator.state.dragging = false;

            if (!indicator.state.lastPos) { return; }

            // Unproject the last position and move indicator marker if latLon exist
            mly.unproject(indicator.state.lastPos).then(moveIndicatorMarker);
        });

        // drag events

        const addOrReplaceViewerMarker = function(id, latLon) {
            // Create an interactive marker to be able to drag it in viewer
            // and retrieve it with getMarkerIdAt method
            markerComponent.removeAll();
            const marker = new Mapillary.MarkerComponent.SimpleMarker(
                id,
                latLon,
                { interactive: true });
            markerComponent.add([marker]);
            mapillaryMarkers[currentMarkerId]._latLon = latLon;
        }

        const handleMapMarkerDrag = function(mapMarker) {
            // Listen to map events and act to move map and viewer markers accordingly
            mapMarker.on({
                mousedown: function(event) {
                    const onMouseMove = function(e) {
                        // Update both viewer marker and map marker on map marker drag
                        addOrReplaceViewerMarker(mapMarker.id, { lat: e.latlng.lat, lon: e.latlng.lng });
                        mapMarker.setLatLng(e.latlng);
                    };

                    const onMouseUp = function(e) {
                        map.off('mousemove', onMouseMove)
                        map.off('mouseup', onMouseUp);
                    }

                    map.on('mousemove', onMouseMove);
                    map.on('mouseup', onMouseUp);
                },
                mouseover: function(event) {
                    // Remove map hover viewer marker when hovering a map marker
                    removeMapHoverViewerMarker();

                    // Disable map dragging to ensure that only map marker is dragged
                    map.dragging.disable();
                    map.off('mousemove', onMapMouseEvent);
                    map.off('click', clickMap);
                },
                mouseout: function(event) {
                    map.dragging.enable();
                    map.on('mousemove', onMapMouseEvent);
                    map.off('click', clickMap);
                },
            });
        }

// Update map marker when latLon changes for a marker by dragging in the viewer

        markerComponent.on(Mapillary.MarkerComponent.MarkerComponent.changed, function(e) {
            const mapMarker = markers[e.marker.id];
            if (!mapMarker) {
                return;
            }

            mapMarker.setLatLng([e.marker.latLon.lat, e.marker.latLon.lon]);
        });
