/* Experimental vector tile layer for Leaflet
 * Uses D3 to render TopoJSON. Derived from a GeoJSON thing that was
 * Originally by Ziggy Jonsson: http://bl.ocks.org/ZJONSSON/5602552
 * Reworked by Nelson Minar: http://bl.ocks.org/NelsonMinar/5624141
 * Later reworked by Tristan Davies
 */

(function (root, factory) {
  if (typeof exports === 'object') {
    // CommonJS
    if(typeof window !== 'undefined' && window.L) {
			// If we've already imported leaflet in previously-executing code, *don't* do it again
			// Importing leaflet is not idempotent (bad them!)
			//
      module.exports = factory(window.L);
    } else {
      module.exports = factory(require('leaflet'));
    }
  } else {
    // Global Variables
    root.L.TileLayer.d3_topoJSON = factory(root.L);
  }
}(this, function (L) {
  return L.TileLayer.extend({
    initialize: function () {
      L.TileLayer.prototype.initialize.apply(this, arguments);
      this._visibility = {};
    },
    onAdd: function (map) {
      this.map = map;
      this.featureIds = {};

      var self = this;
      var adjustContainerVisibility = function () {
        var zoom = map.getZoom();
        if (self.options.zoomLimits && zoom >= self.options.zoomLimits[0] && zoom <= self.options.zoomLimits[1]) {
          self.visibleStatus('zoom', true);
        } else {
          self.visibleStatus('zoom', false);
        }
      };
      map.on('zoomend', adjustContainerVisibility);
      adjustContainerVisibility();

      L.TileLayer.prototype.onAdd.call(this, map);

      var projection = function (d) {
        var point = map.latLngToLayerPoint(new L.LatLng(d[1], d[0]));
        point = [point.x, point.y];
        return point;
      };
      this._basicpath = d3.geo.path().projection(projection);
      this._path = this._basicpath;

      if (this.options.renderer) {
        var p = this._path;
        this._path = function (d) {
          return self.options.renderer(p(d));
        };
      }

      this.on("tileunload", function (d) {
        if (d.tile.featureIds) {
          d.tile.featureIds.forEach(function (id) {
            delete self.featureIds[id];
          });
        }

        if (d.tile.xhr) d.tile.xhr.abort();
        if (d.tile.nodes) d.tile.nodes.remove();
        d.tile.nodes = null;
        d.tile.xhr = null;
      });
    },
    visibleStatus: function (namespace, visible) {
      this._visibility[namespace] = visible;
      var isVisible = true;
      var wasVisible = (this._visible === false) ? false : true;
      for (var i in this._visibility) {
        if (!this._visibility[i]) {
          isVisible = false;
          break;
        }
      }
      if (isVisible && !wasVisible) {
        this._visible = true;
        this.showContainer();
        this.redraw();
      }
      if (!isVisible && wasVisible) {
        this._visible = false;
        this.hideContainer();
        this.redraw();
      }
    },
    showTiles: function () {
      this._visible = true;
    },
    hideTiles: function () {
      this._visible = false;
      this.redraw();
    },
    showContainer: function () {
      d3.select(this.container).style('display', 'block');
    },
    hideContainer: function () {
      d3.select(this.container).style('display', 'none');
    },
    _xhrCache: {},
    _loadTile: function (tile, tilePoint) {
      var self = this;

      if (self._visible === false) return;
      if (self.options.zoomLimits && (tilePoint.z < self.options.zoomLimits[0] || tilePoint.z > self.options.zoomLimits[1])) {
        return;
      }

      this._adjustTilePoint(tilePoint);
      var cacheKey = tilePoint.x + ' ' + tilePoint.y + ' ' + tilePoint.z;
      tile.identifier = cacheKey;
      tile.featureIds = [];

      var gotTile = function (tjData) {
        var geoJson = topojson.feature(tjData, tjData.objects[self.options.layerName]);

        //anti-overlap
        geoJson.features = geoJson.features.filter(function (d) {
          return (typeof self.featureIds[d.properties.id] == 'undefined');
        });
        geoJson.features.forEach(function (d) {
          if (d.properties.id) {
            self.featureIds[d.properties.id] = true;
            tile.featureIds.push(d.properties.id);
          }
        });

        tile.xhr = null;
        var container = self.options.container || d3.select(self.map._container).select("svg");
        tile.nodes = container.append("g");
        var rangeList = [];
        var paths = tile.nodes.selectAll(self.options.elementName || "path")
            .data(geoJson.features).enter()
            .append(self.options.elementName || "path")
            .attr("d", self._path)
            .attr("transform", self.options.transform)
            .attr("class", self.options.class)
            .attr("style", self.options.style)
            .on("click", self.options.click || function (){})
            .each(self.options.each || function (){});
      };

      if (this._xhrCache[cacheKey] && this.options.cache) {
        gotTile(this._xhrCache[cacheKey]);
      } else {
        if (!tile.nodes && !tile.xhr) {
          if (typeof self.options.showLayer == 'function' && !self.options.showLayer()) return;
          var url = this.getTileUrl(tilePoint);
          var hasParams = (url.indexOf('?') != -1);
          if (self.options.query) {
            for (var field in self.options.query) {
              url += hasParams ? '&' : '?';
              hasParams = true;
              url += field;
              url += '=';
              url += self.options.query[field];
            }
          }

          tile.xhr = d3.json(url);
          if (self.options.headers) {
            for (var header in self.options.headers) {
              tile.xhr.header(header, self.options.headers[header]);
            }
          }
          tile.xhr.get(function (error, tjData) {
            if (error) {
              console.log(error);
            } else {
              if (self.options.cache) {
                self._xhrCache[cacheKey] = tjData;
              }
              gotTile(tjData);
            }
          });
        }
      }
    }
  });
}));